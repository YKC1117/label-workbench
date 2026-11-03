[CmdletBinding()]
param(
    [string]$RepositoryUrl = 'https://github.com/YKC1117/label-workbench',
    [string]$RunnerRoot = "$env:USERPROFILE\actions-runner-label-workbench",
    [string]$RunnerName = ("LWB-" + $env:COMPUTERNAME),
    [string]$RegistrationToken = '',
    [switch]$InstallNodeWithWinget,
    [switch]$NoRun
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Text) {
    Write-Host ("`n==> " + $Text) -ForegroundColor Cyan
}

function Fail([string]$Message) {
    throw $Message
}

function Get-CommandPath([string]$Name) {
    $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $cmd) { return $null }
    return $cmd.Source
}

function Ensure-Node {
    $node = Get-CommandPath 'node.exe'
    $npm = Get-CommandPath 'npm.cmd'
    if ($node -and $npm) {
        $version = (& $node --version).Trim()
        if ($version -notmatch '^v(\d+)\.') { Fail ('Cannot parse Node.js version: ' + $version) }
        if ([int]$Matches[1] -lt 20) { Fail ('Node.js 20+ is required. Actual: ' + $version) }
        Write-Host ('Node.js: ' + $version)
        Write-Host ('npm: ' + ((& $npm --version).Trim()))
        return
    }

    if (-not $InstallNodeWithWinget) {
        Fail 'Node.js 20+ / npm is missing. Re-run this script with -InstallNodeWithWinget, or install Node.js LTS first.'
    }

    $winget = Get-CommandPath 'winget.exe'
    if (-not $winget) { Fail 'winget.exe is unavailable; cannot install Node.js automatically.' }
    Write-Step 'Installing Node.js LTS with winget'
    & $winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Fail ('winget Node.js install failed with exit code ' + $LASTEXITCODE) }

    $env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')
    $node = Get-CommandPath 'node.exe'
    $npm = Get-CommandPath 'npm.cmd'
    if (-not $node -or -not $npm) { Fail 'Node.js installation completed but node.exe/npm.cmd is still not visible. Sign out/in once, then re-run this script.' }
    $version = (& $node --version).Trim()
    if ($version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 20) { Fail ('Node.js 20+ is required. Actual: ' + $version) }
}

Write-Step 'Checking Windows environment'
if ($env:OS -ne 'Windows_NT') { Fail 'This setup must run on Windows.' }
if (-not [Environment]::Is64BitOperatingSystem) { Fail 'Windows x64 is required.' }
if ($PSVersionTable.PSVersion.Major -ne 5) { Fail ('Run with Windows PowerShell 5.1. Actual: ' + $PSVersionTable.PSVersion) }
Write-Host ('Computer: ' + $env:COMPUTERNAME)
Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion)

Write-Step 'Checking BarTender 2022 COM registration'
$btType = [Type]::GetTypeFromProgID('BarTender.Application', $false)
if ($null -eq $btType) { Fail 'BarTender.Application COM ProgID is not registered. Confirm BarTender 2022 is installed for this Windows machine.' }
Write-Host 'BarTender.Application: REGISTERED'

$barTenderCandidates = @(
    "$env:ProgramFiles\Seagull\BarTender 2022\BarTend.exe",
    "${env:ProgramFiles(x86)}\Seagull\BarTender 2022\BarTend.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if ($barTenderCandidates.Count -gt 0) {
    Write-Host ('BarTender executable: ' + $barTenderCandidates[0])
} else {
    Write-Warning 'BarTender COM is registered, but the standard BarTend.exe path was not found. The runtime probe will still rely on COM registration.'
}

Write-Step 'Checking Node.js runtime used by renderer QA'
Ensure-Node

Write-Step 'Preparing dedicated GitHub Actions runner directory'
if (-not (Test-Path -LiteralPath $RunnerRoot)) {
    New-Item -ItemType Directory -Path $RunnerRoot -Force | Out-Null
}
$RunnerRoot = (Resolve-Path -LiteralPath $RunnerRoot).Path
Write-Host ('Runner root: ' + $RunnerRoot)

$runnerConfig = Join-Path $RunnerRoot '.runner'
$configCmd = Join-Path $RunnerRoot 'config.cmd'
$runCmd = Join-Path $RunnerRoot 'run.cmd'

if (-not (Test-Path -LiteralPath $configCmd) -or -not (Test-Path -LiteralPath $runCmd)) {
    Write-Step 'Downloading latest official GitHub Actions Runner for Windows x64'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ 'User-Agent' = 'LabelWorkbench-BarTender-Runner-Setup' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/actions/runner/releases/latest' -Headers $headers
    $tag = [string]$release.tag_name
    if ($tag -notmatch '^v\d+\.\d+\.\d+$') { Fail ('Unexpected GitHub Actions Runner release tag: ' + $tag) }
    $version = $tag.Substring(1)
    $assetName = 'actions-runner-win-x64-' + $version + '.zip'
    $asset = @($release.assets | Where-Object { $_.name -eq $assetName })
    if ($asset.Count -ne 1) { Fail ('Could not resolve exactly one runner asset: ' + $assetName) }

    $zip = Join-Path $env:TEMP $assetName
    Invoke-WebRequest -Uri $asset[0].browser_download_url -Headers $headers -OutFile $zip -UseBasicParsing
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $RunnerRoot)
    } finally {
        Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path -LiteralPath $configCmd) -or -not (Test-Path -LiteralPath $runCmd)) {
        Fail 'GitHub Actions Runner extraction did not produce config.cmd and run.cmd.'
    }
}

if (-not (Test-Path -LiteralPath $runnerConfig)) {
    if ([string]::IsNullOrWhiteSpace($RegistrationToken)) {
        $RegistrationToken = Read-Host 'Paste the one-time GitHub self-hosted runner registration token'
    }
    if ([string]::IsNullOrWhiteSpace($RegistrationToken)) { Fail 'A GitHub runner registration token is required.' }

    Write-Step 'Registering runner with guarded bartender label'
    Push-Location $RunnerRoot
    try {
        & $configCmd --unattended --url $RepositoryUrl --token $RegistrationToken --name $RunnerName --labels bartender --work _work
        if ($LASTEXITCODE -ne 0) { Fail ('config.cmd failed with exit code ' + $LASTEXITCODE) }
    } finally {
        Pop-Location
        $RegistrationToken = $null
    }
} else {
    Write-Host 'Runner is already configured; registration step skipped.'
}

Write-Step 'Final local readiness check'
$summary = [ordered]@{
    repository = $RepositoryUrl
    runnerRoot = $RunnerRoot
    runnerName = $RunnerName
    requiredLabels = @('self-hosted','windows','x64','bartender')
    powershell = $PSVersionTable.PSVersion.ToString()
    node = ((& (Get-CommandPath 'node.exe') --version).Trim())
    npm = ((& (Get-CommandPath 'npm.cmd') --version).Trim())
    bartenderCom = 'REGISTERED'
    configured = (Test-Path -LiteralPath $runnerConfig)
}
$summary | ConvertTo-Json -Depth 4 | Write-Host

if (-not $NoRun) {
    Write-Step 'Starting GitHub Actions Runner in an interactive window'
    Write-Host 'Keep that Runner window open during the first BarTender evidence run.'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', ('"' + $runCmd + '"') -WorkingDirectory $RunnerRoot
} else {
    Write-Host 'Runner configured. Start it later with run.cmd from the runner directory.'
}

Write-Host "`nREADY: Windows BarTender runner setup completed." -ForegroundColor Green
