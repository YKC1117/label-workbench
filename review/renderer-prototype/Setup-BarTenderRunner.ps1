[CmdletBinding()]
param(
    [string]$RepositoryUrl = 'https://github.com/YKC1117/label-workbench',
    [string]$RunnerRoot = "$env:USERPROFILE\actions-runner-label-workbench",
    [string]$RunnerName = ("LWB-" + $env:COMPUTERNAME),
    [string]$RegistrationToken = '',
    [switch]$NoRun
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$SetupRevision = '20261103.5'

function Write-Step([string]$Text) {
    Write-Host ("`n==> " + $Text) -ForegroundColor Cyan
}

function Fail([string]$Message) {
    throw $Message
}

function Read-HiddenLine([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        if ($ptr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }
    }
}

function Normalize-RegistrationToken([string]$InputText) {
    if ([string]::IsNullOrWhiteSpace($InputText)) { return '' }
    $value = $InputText.Trim()

    # Accept either the raw token or the entire GitHub-generated config.cmd line.
    $match = [regex]::Match($value, '(?i)(?:^|\s)--token\s+["'']?([^\s"'']+)')
    if ($match.Success) {
        $value = $match.Groups[1].Value.Trim()
    }

    # A registration token must be one opaque value, never a command line.
    if ($value -match '\s' -or $value -match '^(?:\.|\\|/)?config\.cmd$' -or $value -match '--(?:url|token|name|labels)') {
        Fail 'Could not isolate a GitHub runner registration token from the pasted text. Generate a fresh token and paste either the token itself or the complete config.cmd line.'
    }
    if ($value.Length -lt 20 -or $value.Length -gt 512) {
        Fail 'The parsed GitHub runner registration token has an unexpected length. Generate a fresh token and try again.'
    }
    return $value
}

Write-Host ('Label Workbench Runner Setup ' + $SetupRevision) -ForegroundColor Green

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

$standardBtPath = $null
if ($env:ProgramFiles) {
    $candidate = Join-Path $env:ProgramFiles 'Seagull\BarTender 2022\BarTend.exe'
    if (Test-Path -LiteralPath $candidate) { $standardBtPath = $candidate }
}
if ($null -eq $standardBtPath) {
    $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($pf86) {
        $candidate = Join-Path $pf86 'Seagull\BarTender 2022\BarTend.exe'
        if (Test-Path -LiteralPath $candidate) { $standardBtPath = $candidate }
    }
}
if ($standardBtPath) {
    Write-Host ('BarTender executable: ' + $standardBtPath)
} else {
    Write-Warning 'BarTender COM is registered, but the standard BarTend.exe path was not found. Runtime validation will rely on COM registration.'
}

$existingBt = Get-Process -Name BarTend -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $existingBt) {
    Write-Warning 'BarTender is currently open. Close it before triggering the renderer probe; the workflow refuses to take ownership of an existing BarTend.exe.'
}

Write-Step 'Preparing dedicated GitHub Actions Runner directory'
if (-not (Test-Path -LiteralPath $RunnerRoot)) {
    New-Item -ItemType Directory -Path $RunnerRoot -Force | Out-Null
}
$resolvedRoot = Resolve-Path -LiteralPath $RunnerRoot
if ($null -eq $resolvedRoot) { Fail 'Could not resolve runner directory.' }
$RunnerRoot = [string]$resolvedRoot.Path
Write-Host ('Runner root: ' + $RunnerRoot)

$runnerConfig = Join-Path $RunnerRoot '.runner'
$configCmd = Join-Path $RunnerRoot 'config.cmd'
$runCmd = Join-Path $RunnerRoot 'run.cmd'

if (-not (Test-Path -LiteralPath $configCmd) -or -not (Test-Path -LiteralPath $runCmd)) {
    Write-Step 'Downloading latest official GitHub Actions Runner for Windows x64'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ 'User-Agent' = 'LabelWorkbench-BarTender-Runner-Setup' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/actions/runner/releases/latest' -Headers $headers
    if ($null -eq $release -or [string]::IsNullOrWhiteSpace([string]$release.tag_name)) { Fail 'GitHub Runner release metadata was empty.' }
    $tag = [string]$release.tag_name
    if ($tag -notmatch '^v\d+\.\d+\.\d+$') { Fail ('Unexpected GitHub Actions Runner release tag: ' + $tag) }
    $version = $tag.Substring(1)
    $assetName = 'actions-runner-win-x64-' + $version + '.zip'
    $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    if ($null -eq $asset -or [string]::IsNullOrWhiteSpace([string]$asset.browser_download_url)) { Fail ('Could not resolve runner asset: ' + $assetName) }

    $zip = Join-Path $env:TEMP $assetName
    Invoke-WebRequest -Uri ([string]$asset.browser_download_url) -Headers $headers -OutFile $zip -UseBasicParsing
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
        $RegistrationToken = Read-HiddenLine 'Paste a NEW GitHub runner token OR the complete config.cmd line (input is hidden)'
    }
    $RegistrationToken = Normalize-RegistrationToken $RegistrationToken
    if ([string]::IsNullOrWhiteSpace($RegistrationToken)) { Fail 'A GitHub runner registration token is required.' }

    Write-Step 'Registering runner with the dedicated bartender label'
    Push-Location $RunnerRoot
    try {
        & $configCmd --unattended --url $RepositoryUrl --token $RegistrationToken --name $RunnerName --labels bartender --work _work
        if ($LASTEXITCODE -ne 0) { Fail ('config.cmd failed with exit code ' + $LASTEXITCODE) }
    } finally {
        Pop-Location
        $RegistrationToken = ''
    }
} else {
    Write-Host 'Runner is already configured in this dedicated directory; registration skipped.'
}

Write-Step 'Final local readiness check'
$summary = [ordered]@{
    setupRevision = $SetupRevision
    repository = $RepositoryUrl
    runnerRoot = $RunnerRoot
    runnerName = $RunnerName
    requiredLabels = @('self-hosted','windows','x64','bartender')
    powershell = $PSVersionTable.PSVersion.ToString()
    bartenderCom = 'REGISTERED'
    configured = [bool](Test-Path -LiteralPath $runnerConfig)
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
