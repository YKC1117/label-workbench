# Human-observed Designer regression, not a parser/header/timestamp smoke test.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true,Position=0)][string]$BtwPath,
  [Parameter(Mandatory=$true)][ValidateSet('A','B','C')][string]$Fixture,
  [Parameter(Mandatory=$true)][string]$BarTenderExe,
  [Parameter(Mandatory=$true)][string]$Operator,
  [Parameter(Mandatory=$true)][ValidateSet('Automation','Enterprise')][string]$Edition,
  [string]$EvidenceRoot = (Join-Path $PSScriptRoot '../runtime-evidence'),
  [int]$TimeoutSeconds = 600
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Hash($p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }
function Require-Yes($message) {
  if ((Read-Host "$message [type YES only after observing it]") -cne 'YES') { throw "Not verified: $message" }
}
function Open-Designer($path) {
  if (Get-Process bartend -ErrorAction SilentlyContinue) { throw 'Save and close existing BarTender windows before continuing.' }
  $p = Start-Process -FilePath $script:exe -ArgumentList @("/F=`"$path`"") -PassThru
  return $p
}
function Wait-Closed($process) {
  if (!$process.WaitForExit($TimeoutSeconds * 1000)) { throw 'Designer is still running. Evidence is incomplete; no process was killed.' }
  if ($process.ExitCode -ne 0) { throw "Designer exit code $($process.ExitCode)" }
}
try {
  if ($env:OS -ne 'Windows_NT') { throw 'Windows BarTender runtime is required.' }
  if ([string]::IsNullOrWhiteSpace($Operator)) { throw 'Operator identity is required.' }
  $repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $exe = (Resolve-Path -LiteralPath $BarTenderExe).Path
  $source = (Resolve-Path -LiteralPath $BtwPath).Path
  if ([IO.Path]::GetFileName($exe) -ine 'bartend.exe' -or [IO.Path]::GetExtension($source) -ine '.btw') { throw 'Use bartend.exe and a native BTW candidate.' }
  $fingerprint = & node (Join-Path $repo 'tools/btw-release-gate.cjs') --fingerprint
  if ($LASTEXITCODE -ne 0 -or $fingerprint -notmatch '^[a-f0-9]{64}$') { throw 'Node.js is required to bind evidence to the current source tree.' }
  $fixturePath = Join-Path $repo "tests/fixtures/btw/$Fixture.btjob.json"
  $expected = Get-Content -LiteralPath $fixturePath -Raw -Encoding UTF8 | ConvertFrom-Json
  $label = $expected.labels[0]
  $dir = [IO.Path]::GetFullPath((Join-Path $EvidenceRoot $Fixture))
  if(Test-Path -LiteralPath $dir) { throw "Evidence directory exists: $dir. Archive the previous run first; never overwrite evidence." }
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $original = Join-Path $dir 'original.btw'; $working = Join-Path $dir 'working.btw'; $saved = Join-Path $dir 'edited-save-as.btw'
  Copy-Item -LiteralPath $source -Destination $original
  Copy-Item -LiteralPath $source -Destination $working
  $checks = [ordered]@{}
  $p = Open-Designer $working
  Require-Yes 'Help > About shows BarTender 2022, the specified licensed edition, not trial. Record an About screenshot.'
  $checks.runtime2022 = $true; $checks.license = $true
  Require-Yes 'Document opens with no damaged-format, repair, missing-resource or compatibility dialog.'
  $checks.open = $true; $checks.noCorruption = $true
  Write-Host ($label | ConvertTo-Json -Depth 10)
  Require-Yes 'Compare with this fixture: exact page width/height/orientation, exact object count, names and native types. No pictures, hidden donor objects, extra templates or unrelated content. Check text and barcode values and top-left anchor positions.'
  $checks.exactObjects = $true; $checks.dimensions = $true; $checks.noSeedResidue = $true
  foreach ($item in $label.objects) {
    Write-Host "Select $($item.id) alone; change its value to EDIT-$($item.id) and move X and Y by +1 mm."
    Require-Yes "Only $($item.id) changes; all other objects remain independent. Barcode symbology is $($item.type)."
  }
  $checks.select = $true; $checks.editText = $true; $checks.editBarcode = $true; $checks.move = $true
  Require-Yes 'Use Save (Ctrl+S), then verify all changes remain in Designer.'
  if ((Hash $working) -eq (Hash $original)) { throw 'Save did not change the working file.' }
  $checks.save = $true
  Write-Host "Use Save As: $saved"
  Require-Yes 'Save As succeeded. Close all Designer windows normally.'
  Wait-Closed $p
  if (!(Test-Path -LiteralPath $saved) -or (Hash $saved) -eq (Hash $original)) { throw 'Missing or unchanged Save As output.' }
  $checks.saveAs = $true
  $p = Open-Designer $saved
  Require-Yes 'Reopened without warnings. Select every object again: each value is EDIT-<object ID>, each X/Y increased by 1 mm, native types and page settings remain correct.'
  $checks.reopen = $true; $checks.editsPersist = $true
  $printer = Read-Host 'Enter actual printer model, driver version, DPI and label stock'
  if ([string]::IsNullOrWhiteSpace($printer)) { throw 'Physical print information required.' }
  Require-Yes 'Manually print one label. All text is legible, all objects fit, physical dimensions are correct; scan EVERY barcode and compare exact EDIT-<ID> values and symbologies. For A, inspect printed text. Photograph the result.'
  $checks.print = $true
  Require-Yes 'Close all Designer windows normally.'
  Wait-Closed $p
  $attachments = @()
  foreach ($name in @('about','objects','reopened','printed-label')) {
    $path = (Resolve-Path -LiteralPath (Read-Host "Path to $name screenshot/photo (PNG/JPG)")).Path
    $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($ext -notin @('.png','.jpg','.jpeg')) { throw 'PNG/JPG evidence required.' }
    $dest = "$name$ext"; Copy-Item -LiteralPath $path -Destination (Join-Path $dir $dest)
    $attachments += @{file=$dest; sha256=(Hash (Join-Path $dir $dest))}
  }
  $report = [ordered]@{
    schema=1; fixture=$Fixture; status='passed'; verification='human-observed-designer'; operator=$Operator;
    edition=$Edition; runtime='BarTender 2022'; executableVersion=(Get-Item -LiteralPath $exe).VersionInfo.FileVersion;
    sourceFingerprint=$fingerprint; fixtureSha256=(Hash $fixturePath); completedAt=[DateTime]::UtcNow.ToString('o'); printer=$printer;
    checks=$checks; attachments=$attachments;
    artifacts=@(@{file='original.btw';sha256=(Hash $original)},@{file='working.btw';sha256=(Hash $working)},@{file='edited-save-as.btw';sha256=(Hash $saved)})
  }
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $dir 'report.json') -Encoding UTF8
  Write-Host "RECORDED: $Fixture human-observed Designer regression. All A/B/C reports and independent review are still required."
  exit 0
} catch {
  Write-Error $_
  exit 1
}
