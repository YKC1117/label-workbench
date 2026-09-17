# Runtime investigation tool, NOT a released production companion.
# Uses the documented legacy ActiveX API for testing only. Never patches BTW bytes.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$JobPath,
  [Parameter(Mandatory=$true)][string]$TemplatePath,
  [Parameter(Mandatory=$true)][string]$ManifestPath,
  [Parameter(Mandatory=$true)][string]$InteropPath,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Hash($p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }
function Near($a,$b) { [Math]::Abs([double]$a - [double]$b) -le 0.05 }
$app = $null; $format = $null
try {
  if ($env:OS -ne 'Windows_NT') { throw 'Windows with BarTender 2022 is required.' }
  if (Get-Process bartend -ErrorAction SilentlyContinue) { throw 'Save your work and close BarTender before testing.' }
  $job = Get-Content -LiteralPath $JobPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($job.schema -ne 1 -or $job.producer -ne 'label-workbench-template-job' -or @($job.labels).Count -ne 1) { throw 'UNSUPPORTED: this test helper accepts exactly one confirmed label.' }
  if ($manifest.schema -ne 1 -or $manifest.templateSha256 -notmatch '^[a-f0-9]{64}$' -or (Hash $TemplatePath) -ne $manifest.templateSha256) { throw 'TEMPLATE_HASH_MISMATCH: pin an actual Designer-created template.' }
  $label = $job.labels[0]
  if ($label.orientation -notin @('portrait','landscape')) { throw 'Invalid orientation.' }
  if ($label.widthMm -lt 5 -or $label.heightMm -lt 5 -or $label.widthMm -gt 1000 -or $label.heightMm -gt 1000) { throw 'Invalid label dimensions.' }
  if (!(Near $label.widthMm $manifest.widthMm) -or !(Near $label.heightMm $manifest.heightMm) -or $label.orientation -ne $manifest.orientation) { throw 'UNSUPPORTED_LAYOUT: use a matching Designer template. No automatic resizing.' }
  if (@($label.objects).Count -ne @($manifest.objects).Count -or @($label.objects).Count -eq 0) { throw 'UNSUPPORTED_OBJECT_COUNT: exact template required.' }
  $ids = @{}
  foreach ($item in $label.objects) {
    if ($item.id -notmatch '^(TEXT|BARCODE)_[1-9][0-9]*$' -or $ids.ContainsKey($item.id)) { throw 'Invalid/duplicate object ID.' }
    $ids[$item.id] = $true
    if ($item.type -notin @('Text','Code 128','Data Matrix')) { throw "UNSUPPORTED: $($item.type)" }
    if ($item.value -isnot [string] -or $item.value.Length -eq 0) { throw 'Empty/non-string object value.' }
    $spec = @($manifest.objects | Where-Object { $_.id -ceq $item.id })
    if ($spec.Count -ne 1 -or $spec[0].type -cne $item.type -or $spec[0].anchor -ne 'top-left') { throw "UNSUPPORTED_OBJECT: $($item.id)" }
    foreach ($key in @('xMm','yMm','widthMm','heightMm')) {
      if (!(Near $item.$key $spec[0].$key)) { throw "UNSUPPORTED_LAYOUT: $($item.id).$key needs another Designer template." }
    }
  }
  Add-Type -Path (Resolve-Path -LiteralPath $InteropPath).Path
  $app = New-Object -ComObject BarTender.Application
  $app.Visible = $true
  $edition = [string]$app.Edition; $version = [string]$app.FullVersion
  if ($version -notmatch '\b2022\b') { throw "Wrong runtime: $version. No 2022 release evidence possible." }
  if ($edition -notmatch '^(Automation|Enterprise)( Edition)?$') { throw "LICENSE_UNSUPPORTED_OR_UNKNOWN: $edition. Do not infer API rights from file headers." }
  $outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
  New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
  $run = Join-Path $outputRoot ([guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $run | Out-Null
  $copy = Join-Path $run 'template-copy.btw'
  $output = Join-Path $run 'candidate.btw'
  Copy-Item -LiteralPath $TemplatePath -Destination $copy
  $format = $app.Formats.Open($copy, $false, '')
  $format.MeasurementUnits = [BarTender.BtUnits]::btUnitsMillimeters
  if ($format.Objects.Count -ne @($label.objects).Count -or $format.NamedSubStrings.Count -ne @($label.objects).Count) { throw 'Template has extra/missing objects or named data sources.' }
  if (!(Near $format.PageSetup.LabelWidth $label.widthMm) -or !(Near $format.PageSetup.LabelHeight $label.heightMm)) { throw 'Runtime template dimensions differ.' }
  $orientation = if($label.orientation -eq 'portrait') { [BarTender.BtOrientation]::btPortrait } else { [BarTender.BtOrientation]::btLandscape }
  if ($format.PageSetup.Orientation -ne $orientation) { throw 'Runtime orientation differs.' }
  foreach ($item in $label.objects) {
    $object = $format.Objects.Find($item.id)
    $type = if($item.type -eq 'Text') { [BarTender.BtObjectType]::btObjectText } else { [BarTender.BtObjectType]::btObjectBarcode }
    if (!$object -or $object.Type -ne $type) { throw "Wrong native object type: $($item.id)" }
    if (!(Near $object.X $item.xMm) -or !(Near $object.Y $item.yMm)) { throw "Runtime position differs: $($item.id)" }
    # Symbology, anchor, styling and dimensions require Designer/scan verification.
    $format.SetNamedSubStringValue($item.id, $item.value)
    if ($format.GetNamedSubStringValue($item.id) -cne $item.value -or [string]$object.Value -cne $item.value) { throw "Value binding mismatch: $($item.id)" }
  }
  $format.SaveAs($output, $false)
  $format.Close([BarTender.BtSaveOptions]::btDoNotSaveChanges); $format = $null
  $format = $app.Formats.Open($output, $false, '')
  foreach ($item in $label.objects) {
    if ($format.GetNamedSubStringValue($item.id) -cne $item.value) { throw "Reopen value mismatch: $($item.id)" }
  }
  $report = [ordered]@{schema=1; status='candidate-only'; edition=$edition; version=$version; jobSha256=(Hash $JobPath); templateSha256=(Hash $TemplatePath); outputSha256=(Hash $output); manualDesignerChecksRequired=$true}
  $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $run 'candidate-report.json') -Encoding UTF8
  Write-Host "CANDIDATE ONLY: $output"
  Write-Host 'Run tools/verify-btw-runtime.ps1. API save/reopen is not release approval.'
} catch {
  Write-Error $_
  exit 1
} finally {
  if($format) { try { $format.Close([BarTender.BtSaveOptions]::btDoNotSaveChanges) } catch {} }
  if($app) { try { $app.Quit([BarTender.BtSaveOptions]::btDoNotSaveChanges) } catch {}; [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) }
}
