param(
  [int]$TimeoutSeconds = 45,
  [switch]$PrintToFile,
  [string]$ReportPath = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Generator = Join-Path $PSScriptRoot 'create-btw-runtime-fixture.cjs'
$FixtureVerifier = Join-Path $PSScriptRoot 'verify-btw-runtime-fixture.cjs'
$RuntimeVerifier = Join-Path $PSScriptRoot 'verify-btw-runtime.ps1'
$Node = (Get-Command node -ErrorAction Stop).Source
$PowerShellExe = try { (Get-Process -Id $PID -ErrorAction Stop).Path } catch { $null }
if (-not $PowerShellExe -or -not (Test-Path -LiteralPath $PowerShellExe)) {
  $PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
}
if (-not (Test-Path -LiteralPath $PowerShellExe)) { throw '找不到可用的 PowerShell 執行檔。' }

$RunDir = Join-Path $env:TEMP ("LabelWorkbench-BTRuntimeSuite-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
$Fixture = Join-Path $RunDir 'LabelWorkbench_Runtime_Acceptance.btw'
if (-not $ReportPath) { $ReportPath = Join-Path $RunDir 'runtime-acceptance-report.json' }
$ReportPath = [IO.Path]::GetFullPath($ReportPath)

function Invoke-NodeChecked([string[]]$Arguments) {
  & $Node @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Node 驗證失敗（ExitCode=$LASTEXITCODE）：$($Arguments -join ' ')" }
}

function Invoke-RuntimeSave([string]$InputBtw) {
  $lines = @(& $PowerShellExe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $RuntimeVerifier -BtwPath $InputBtw -TimeoutSeconds $TimeoutSeconds 2>&1 | ForEach-Object { [string]$_ })
  foreach ($line in $lines) { Write-Host $line }
  if ($LASTEXITCODE -ne 0) { throw "BarTender runtime verifier 失敗（ExitCode=$LASTEXITCODE）。" }
  $copyLine = $lines | Where-Object { $_ -match '^Runtime copy:\s+(.+)$' } | Select-Object -Last 1
  $btLine = $lines | Where-Object { $_ -match '^BarTender:\s+(.+)$' } | Select-Object -Last 1
  if (-not $copyLine) { throw '找不到 runtime copy 路徑。' }
  $null = $copyLine -match '^Runtime copy:\s+(.+)$'; $runtimeCopy = $Matches[1].Trim()
  $bartender = $null
  if ($btLine) { $null = $btLine -match '^BarTender:\s+(.+)$'; $bartender = $Matches[1].Trim() }
  if (-not (Test-Path -LiteralPath $runtimeCopy)) { throw "runtime copy 不存在：$runtimeCopy" }
  return [pscustomobject]@{ RuntimeCopy=$runtimeCopy; BarTender=$bartender; Output=$lines }
}

function Invoke-PrintToFile([string]$BartenderExe,[string]$InputBtw,[string]$OutputFile) {
  if (-not $BartenderExe -or -not (Test-Path -LiteralPath $BartenderExe)) { throw '無法取得 bartend.exe，不能執行列印至檔案驗收。' }
  if (Get-Process -Name 'bartend' -ErrorAction SilentlyContinue) { throw 'BarTender 目前仍在執行，無法進行列印至檔案驗收。' }
  if (Test-Path -LiteralPath $OutputFile) { Remove-Item -LiteralPath $OutputFile -Force }
  $args = @(
    "/F=`"$InputBtw`"",
    '/P',
    '/C=1',
    "/PRNFILE=`"$OutputFile`"",
    '/X'
  )
  Write-Host 'Print pipeline test: /F -> /P -> /C=1 -> /PRNFILE -> /X'
  $proc = Start-Process -FilePath $BartenderExe -ArgumentList $args -PassThru
  if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    throw "BarTender 列印至檔案在 $TimeoutSeconds 秒內沒有完成。"
  }
  if ($proc.ExitCode -ne 0) { throw "BarTender 列印至檔案 ExitCode=$($proc.ExitCode)" }
  if (-not (Test-Path -LiteralPath $OutputFile)) { throw 'BarTender 結束正常，但沒有建立列印輸出檔。' }
  $length = (Get-Item -LiteralPath $OutputFile).Length
  if ($length -le 0) { throw 'BarTender 列印輸出檔為空。' }
  return $length
}

$report = [ordered]@{
  schema = 'label-workbench-btw-runtime-acceptance-v1'
  startedUtc = [DateTime]::UtcNow.ToString('o')
  host = $env:COMPUTERNAME
  repoRoot = $RepoRoot
  node = $Node
  fixture = $Fixture
  generated = $false
  preflight = $false
  firstBarTenderSave = $false
  firstPostSaveParse = $false
  secondBarTenderReopenSave = $false
  secondPostSaveParse = $false
  printToFileRequested = [bool]$PrintToFile
  printToFilePassed = $false
  printFile = $null
  printBytes = $null
  barTenderExe = $null
  barTenderProductVersion = $null
  hashes = [ordered]@{}
}

try {
  Write-Host '=== Label Workbench BarTender 2022 native BTW runtime acceptance ==='
  Write-Host "Work dir: $RunDir"

  Invoke-NodeChecked @($Generator,$Fixture)
  $report.generated = $true
  $report.hashes.generated = (Get-FileHash -Algorithm SHA256 -LiteralPath $Fixture).Hash

  Invoke-NodeChecked @($FixtureVerifier,$Fixture)
  $report.preflight = $true

  Write-Host '--- BarTender pass 1: open + forced save + close ---'
  $pass1 = Invoke-RuntimeSave $Fixture
  $report.firstBarTenderSave = $true
  $report.barTenderExe = $pass1.BarTender
  if ($pass1.BarTender -and (Test-Path -LiteralPath $pass1.BarTender)) {
    $report.barTenderProductVersion = (Get-Item -LiteralPath $pass1.BarTender).VersionInfo.ProductVersion
  }
  $report.hashes.afterFirstSave = (Get-FileHash -Algorithm SHA256 -LiteralPath $pass1.RuntimeCopy).Hash
  Invoke-NodeChecked @($FixtureVerifier,$pass1.RuntimeCopy)
  $report.firstPostSaveParse = $true

  Write-Host '--- BarTender pass 2: reopen saved BTW + forced save + close ---'
  $pass2 = Invoke-RuntimeSave $pass1.RuntimeCopy
  $report.secondBarTenderReopenSave = $true
  $report.hashes.afterSecondSave = (Get-FileHash -Algorithm SHA256 -LiteralPath $pass2.RuntimeCopy).Hash
  Invoke-NodeChecked @($FixtureVerifier,$pass2.RuntimeCopy)
  $report.secondPostSaveParse = $true

  if ($PrintToFile) {
    Write-Host '--- Optional print pipeline: print one copy to file ---'
    $printFile = Join-Path $RunDir 'LabelWorkbench_Runtime_Acceptance.prn'
    $printBytes = Invoke-PrintToFile $pass2.BarTender $pass2.RuntimeCopy $printFile
    $report.printToFilePassed = $true
    $report.printFile = $printFile
    $report.printBytes = $printBytes
    $report.hashes.printFile = (Get-FileHash -Algorithm SHA256 -LiteralPath $printFile).Hash
  }

  $report.completedUtc = [DateTime]::UtcNow.ToString('o')
  $report.result = 'PASS'
  $report.runtimeCopyAfterFirstSave = $pass1.RuntimeCopy
  $report.runtimeCopyAfterSecondSave = $pass2.RuntimeCopy
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
  Write-Host "PASS: BarTender 已連續兩次開啟/儲存 BTW，且重存後 5 Code128 + 1 Data Matrix + Text/位置/尺寸/header 均重新解析通過。"
  if ($PrintToFile) { Write-Host "PASS: BarTender 列印管線已輸出檔案（$printBytes bytes）。" }
  Write-Host "Report: $ReportPath"
  exit 0
} catch {
  $report.completedUtc = [DateTime]::UtcNow.ToString('o')
  $report.result = 'FAIL'
  $report.error = $_.Exception.Message
  try { $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding UTF8 } catch {}
  Write-Host "FAIL: $($_.Exception.Message)"
  Write-Host "Report: $ReportPath"
  exit 1
}
