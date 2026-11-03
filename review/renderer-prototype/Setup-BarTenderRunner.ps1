[CmdletBinding()]
param(
    [string]$RepositoryUrl = 'https://github.com/YKC1117/label-workbench',
    [string]$RunnerRoot = "$env:USERPROFILE\actions-runner-label-workbench",
    [string]$RunnerName = ("LWB-" + $env:COMPUTERNAME),
    [string]$RegistrationToken = '',
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

Write-Step 'Checking Windows host'
if ($env:OS -ne 'Windows_NT') { Fail 'This setup must run on Windows.' }
if (-not [Environment]::Is64BitOperatingSystem) { Fail 'Windows x64 is required.' }
if ($PSVersionTable.PSVersion.Major -ne 5) { Fail ('Run with Windows PowerShell 5.1. Actual: ' + $PSVersionTable.PSVersion) }
Write-Host ('Computer: ' + $env:COMPUTERNAME)
Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion)

Write-Step 'Checking BarTender 2022 COM registration'
$btType = [Type]::GetTypeFromProgID('BarTender.Application', $false)
if ($null -eq $btType) { Fail 'BarTender.Application COM ProgID is not registered. Confirm BarTender 2022 is installed for this Windows account.' }
Write-Host 'BarTender.Application: REGISTERED'

$programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$barTenderCandidates = @(
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Seagull\BarTender 2022\BarTend.exe' }),
    $(if ($programFilesX86) { Join-Path $programFilesX86 'Seagull\BarTender 2022\BarTend.exe' })
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if ($barTenderCandidates.Count -gt 0) {
    Write-Host ('BarTender executable: ' + $barTenderCandidates[0])
} else {
    Write-Warning 'BarTender COM is registered, but the standard BarTend.exe path was not found. Runtime validation will rely on COM registration.'
}

$existing = @(Get-Process -Name BarTend -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) {
    Write-Warning 'BarTender is currently open. Close it before triggering the renderer probe; the workflow intentionally refuses to take ownership of an existing BarTend.exe.'
}

Write-Step 'Preparing dedicated GitHub Actions Runner directory'
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
        Expand-Archive -LiteralPath $zip -DestinationPath $RunnerRoot -Force
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

    Write-Step 'Registering runner with the dedicated bartender label'
    Push-Location $RunnerRoot
    try {
        & $configCmd --unattended --url $RepositoryUrl --token $RegistrationToken --name $RunnerName --labels bartender --work _work
        if ($LASTEXITCODE -ne 0) { Fail ('config.cmd failed with exit code ' + $LASTEXITCODE) }
    } finally {
        Pop-Location
        $RegistrationToken = $null
    }
} else {
    Write-Host 'Runner is already configured in this dedicated directory; registration skipped.'
}

Write-Step 'Final local readiness check'
$summary = [ordered]@{
    repository = $RepositoryUrl
    runnerRoot = $RunnerRoot
    runnerName = $RunnerName
    requiredLabels = @('self-hosted','windows','x64','bartender')
    powershell = $PSVersionTable.PSVersion.ToString()
    bartenderCom = 'REGISTERED'
    configured = (Test-Path -LiteralPath $runnerConfig)
    nodeProvisioning = 'WORKFLOW_SETUP_NODE_22'
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
