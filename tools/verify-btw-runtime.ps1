param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$BtwPath,
  [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host "FAIL: $Message"
  exit 1
}

function Find-BarTenderExe {
  $registryPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\bartend.exe',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\bartend.exe'
  )
  foreach ($path in $registryPaths) {
    try {
      $value = (Get-ItemProperty -Path $path -ErrorAction Stop).'(default)'
      if ($value -and (Test-Path -LiteralPath $value)) { return $value }
    } catch {}
  }

  $roots = @()
  if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'Seagull') }
  if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Seagull') }
  foreach ($root in $roots | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $hit = Get-ChildItem -LiteralPath $root -Filter 'bartend.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return $null
}

try {
  $resolved = (Resolve-Path -LiteralPath $BtwPath -ErrorAction Stop).Path
} catch {
  Fail "找不到 BTW 檔案：$BtwPath"
}

if ([IO.Path]::GetExtension($resolved).ToLowerInvariant() -ne '.btw') {
  Fail '指定檔案不是 .btw'
}

# Avoid touching an engineer's already-open BarTender session because /CLOSE closes open documents.
if (Get-Process -Name 'bartend' -ErrorAction SilentlyContinue) {
  Fail 'BarTender 目前正在執行。請先儲存工作並關閉 BarTender，再執行實機驗證。'
}

$exe = Find-BarTenderExe
if (-not $exe) { Fail '找不到 bartend.exe，無法做真正的 BarTender runtime 驗證。' }

$bytes = [IO.File]::ReadAllBytes($resolved)
if ($bytes.Length -lt 1024) { Fail 'BTW 檔案大小異常。' }
$headLen = [Math]::Min(2048, $bytes.Length)
$head = [Text.Encoding]::GetEncoding(28591).GetString($bytes, 0, $headLen).Replace([char]0, '')
if ($head -notmatch 'Bar Tender Format File') { Fail '檔頭不是 BarTender Format File。' }
if ($head -notmatch 'Document:\s*CompatibleVersion=2022') { Fail 'BTW 不是目前鎖定的 BarTender 2022 相容格式。' }

$tempDir = Join-Path $env:TEMP ("LabelWorkbench-BTVerify-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$tempBtw = Join-Path $tempDir ([IO.Path]::GetFileName($resolved))
Copy-Item -LiteralPath $resolved -Destination $tempBtw -Force

$before = Get-Item -LiteralPath $tempBtw
$beforeTime = $before.LastWriteTimeUtc
$beforeLength = $before.Length
Start-Sleep -Milliseconds 1200

Write-Host "BarTender: $exe"
Write-Host "Testing:   $resolved"
Write-Host 'Runtime test: /F load -> /S save -> /CLOSE -> /X'

$arguments = @(
  "/F=`"$tempBtw`"",
  '/S',
  '/CLOSE',
  '/X'
)

$proc = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru
if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  Fail "BarTender 在 $TimeoutSeconds 秒內沒有完成開啟/儲存/關閉；可能跳出格式錯誤或相容性提示。"
}

if ($proc.ExitCode -ne 0) {
  Fail "BarTender 結束碼不是 0（ExitCode=$($proc.ExitCode)）。"
}

if (-not (Test-Path -LiteralPath $tempBtw)) { Fail 'BarTender 執行後驗證副本消失。' }
$after = Get-Item -LiteralPath $tempBtw
$afterBytes = [IO.File]::ReadAllBytes($tempBtw)
$afterHeadLen = [Math]::Min(2048, $afterBytes.Length)
$afterHead = [Text.Encoding]::GetEncoding(28591).GetString($afterBytes, 0, $afterHeadLen).Replace([char]0, '')
if ($afterHead -notmatch 'Bar Tender Format File') { Fail 'BarTender 儲存後檔頭異常。' }

# /S is documented as a forced save. A later LastWriteTime proves BarTender loaded the document far enough to save it.
if ($after.LastWriteTimeUtc -le $beforeTime) {
  Fail 'BarTender 程序正常結束，但 /S 沒有更新 BTW 副本；不能判定為實機讀取成功。'
}

Write-Host "PASS: BarTender 已實際載入並重新儲存此 BTW。"
Write-Host "Original bytes: $beforeLength"
Write-Host "Saved bytes:    $($after.Length)"
Write-Host "Runtime copy:   $tempBtw"
exit 0
