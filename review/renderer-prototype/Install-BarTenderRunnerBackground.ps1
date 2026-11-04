[CmdletBinding()]
param(
    [string]$RunnerRoot = "$env:USERPROFILE\actions-runner-label-workbench",
    [switch]$NoStart,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Revision = '20261103.1'

function Write-Step([string]$Text) {
    Write-Host ("`n==> " + $Text) -ForegroundColor Cyan
}

function Fail([string]$Message) {
    throw $Message
}

function Get-RunnerProcesses([string]$Root) {
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $rows = @(Get-CimInstance Win32_Process -Filter "Name='Runner.Listener.exe'" -ErrorAction SilentlyContinue)
    $matches = @()
    foreach ($row in $rows) {
        $path = [string]$row.ExecutablePath
        if (-not [string]::IsNullOrWhiteSpace($path)) {
            $full = [IO.Path]::GetFullPath($path)
            if ($full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
                $matches += $row
            }
        }
    }
    return @($matches)
}

Write-Host ('Label Workbench Background Runner ' + $Revision) -ForegroundColor Green

if ($env:OS -ne 'Windows_NT') { Fail 'Windows is required.' }
if ($PSVersionTable.PSVersion.Major -lt 5) { Fail ('Windows PowerShell 5+ required. Actual: ' + $PSVersionTable.PSVersion) }

$RunnerRoot = [IO.Path]::GetFullPath($RunnerRoot)
$runCmd = Join-Path $RunnerRoot 'run.cmd'
$runnerConfig = Join-Path $RunnerRoot '.runner'

$startup = [Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
if ([string]::IsNullOrWhiteSpace($startup)) { Fail 'Could not resolve the current user Startup folder.' }
$launcherPath = Join-Path $startup 'LabelWorkbench-BarTender-Runner.vbs'

if ($Remove) {
    Write-Step 'Removing hidden auto-start launcher'
    Remove-Item -LiteralPath $launcherPath -Force -ErrorAction SilentlyContinue
    Write-Host ('Removed: ' + $launcherPath)
    Write-Host 'Existing runner registration was not changed.'
    exit 0
}

Write-Step 'Checking existing registered runner'
if (-not (Test-Path -LiteralPath $RunnerRoot -PathType Container)) { Fail ('Runner directory not found: ' + $RunnerRoot) }
if (-not (Test-Path -LiteralPath $runCmd -PathType Leaf)) { Fail ('run.cmd not found: ' + $runCmd) }
if (-not (Test-Path -LiteralPath $runnerConfig -PathType Leaf)) { Fail ('Existing runner registration (.runner) not found: ' + $RunnerRoot) }
Write-Host ('Runner root: ' + $RunnerRoot)
Write-Host 'Existing .runner registration: FOUND'

Write-Step 'Installing hidden current-user auto-start launcher'
# Use WScript so no console window is created. Keep the official run.cmd intact;
# it already owns runner restart behavior and diagnostics under _diag.
$escapedRoot = $RunnerRoot.Replace('"', '""')
$escapedRun = $runCmd.Replace('"', '""')
$vbs = @"
Option Explicit
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$escapedRoot"
shell.Run "cmd.exe /d /c """ & "$escapedRun" & """", 0, False
"@
Set-Content -LiteralPath $launcherPath -Value $vbs -Encoding ASCII
if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) { Fail 'Failed to create Startup launcher.' }
Write-Host ('Startup launcher: ' + $launcherPath)

$running = @(Get-RunnerProcesses $RunnerRoot)
if ($running.Length -gt 0) {
    Write-Host ('Runner already active in background. PID(s): ' + (($running | ForEach-Object { $_.ProcessId }) -join ', ')) -ForegroundColor Green
} elseif (-not $NoStart) {
    Write-Step 'Starting runner hidden now'
    Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + $launcherPath + '"') -WindowStyle Hidden
    Start-Sleep -Seconds 3
    $running = @(Get-RunnerProcesses $RunnerRoot)
    if ($running.Length -eq 0) {
        Fail ('Hidden launcher was installed, but Runner.Listener.exe was not observed. Check ' + (Join-Path $RunnerRoot '_diag') + ' for runner diagnostics.')
    }
    Write-Host ('Runner started hidden. PID(s): ' + (($running | ForEach-Object { $_.ProcessId }) -join ', ')) -ForegroundColor Green
} else {
    Write-Host 'Auto-start installed. Current runner was not started because -NoStart was supplied.'
}

Write-Step 'Result'
[ordered]@{
    revision = $Revision
    runnerRoot = $RunnerRoot
    existingRegistrationPreserved = $true
    startupLauncher = $launcherPath
    hidden = $true
    startsAtUserLogon = $true
    currentlyRunning = (@(Get-RunnerProcesses $RunnerRoot).Length -gt 0)
    registrationTokenRequired = $false
    serviceReconfigurationRequired = $false
} | ConvertTo-Json -Depth 4 | Write-Host

Write-Host "`nREADY: existing GitHub Runner will run hidden without occupying a CMD window." -ForegroundColor Green
