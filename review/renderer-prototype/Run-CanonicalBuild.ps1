# Run52+ canonical-build: vector-minimal.pdf -> committed canonical -> existing Build-NativeLayout
# + Verify-PrimitiveColdReopen (unchanged core) -> source PDF comparison. One Windows acceptance.
[CmdletBinding()]
param()
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'));$base=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
$evidence=Join-Path $base 'native-results\D';[void][IO.Directory]::CreateDirectory($evidence)
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# Fail before launching BarTender if the PDF raster comparator cannot load its
# platform-native canvas module. npm CI installs it as pdfjs-dist's optional dep.
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
& $node -e "require('@napi-rs/canvas');require('bwip-js-site')"
if($LASTEXITCODE -ne 0){throw 'Canonical comparator prerequisites unavailable (@napi-rs/canvas or bwip-js-site); BarTender was not started.'}
foreach($file in @((Join-Path $base 'HybridPool.psm1'),(Join-Path $base 'NativeLayoutEngine.psm1'),(Join-Path $base 'Build-NativeLayout.ps1'),(Join-Path $PSScriptRoot 'Verify-PrimitiveColdReopen.ps1'))){
 $tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){throw ('PS5.1 parser: '+$file+' '+($errors -join '; '))}
}
& $ps -STA -NoProfile -ExecutionPolicy Bypass -File (Join-Path $base 'Build-NativeLayout.ps1') -LayoutPath (Join-Path $root 'tests\fixtures\vector-minimal.canonical.json') -ResultRoot $evidence -CaptureVisualEvidence -RendererMode Hybrid
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$run=@(Get-ChildItem -LiteralPath $evidence -Directory|Where-Object{$_.Name -like 'r-*'}|Sort-Object LastWriteTime -Descending)[0].FullName
# A no-image canonical build can publish native-output.btw immediately, unlike
# Run49's image-containing cold-pending candidate. The established verifier
# always promotes from a separate pending path, so explicitly stage the hot
# candidate and retract the early LATEST aliases before starting cold proof.
$reportPath=Join-Path $run 'native-build-report.json'
$report=Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8|ConvertFrom-Json
$hot=[IO.Path]::GetFullPath([string]$report.output)
$pending=Join-Path $run 'candidate.cold-pending.btw'
if(-not(Test-Path -LiteralPath $hot -PathType Leaf)){throw ('Hot candidate missing: '+$hot)}
if($hot -ine [IO.Path]::GetFullPath($pending)){
 if(Test-Path -LiteralPath $pending){throw ('Unexpected prior pending candidate: '+$pending)}
 Move-Item -LiteralPath $hot -Destination $pending -ErrorAction Stop
 $report.output=$pending
 $report.status='HOT_VERIFIED_COLD_AND_SOURCE_PENDING'
 $report|ConvertTo-Json -Depth 24|Set-Content -LiteralPath $reportPath -Encoding UTF8
}
foreach($alias in @('LATEST_NATIVE_OUTPUT.btw','LATEST_NATIVE_REPORT.json')){
 $aliasPath=Join-Path $base $alias
 if(Test-Path -LiteralPath $aliasPath){Remove-Item -LiteralPath $aliasPath -Force}
}
# The build child has Quit its owned COM process; cold verifier must own a new one.
& $ps -STA -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Verify-PrimitiveColdReopen.ps1') -RunDirectory $run
$coldCode=$LASTEXITCODE
if($coldCode -ne 0){
 foreach($alias in @('LATEST_NATIVE_OUTPUT.btw','LATEST_NATIVE_REPORT.json')){$p=Join-Path $base $alias;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
 foreach($name in @('native-output.btw','candidate.cold-pending.btw')){$file=Join-Path $run $name;if(Test-Path -LiteralPath $file){Move-Item -LiteralPath $file -Destination ($file+'.COLD_FAILED') -Force}}
 Compress-Archive -Path (Join-Path $run '*') -DestinationPath (Join-Path $base 'NATIVE_BUILD_RESULT.zip') -CompressionLevel Optimal -Force
 exit 1
}
# Source comparison: original PDF vs the cold-reopened BarTender whole-format raster.
$fmt=Join-Path $run 'cold-format.bmp';if(-not (Test-Path -LiteralPath $fmt)){$fmt=Join-Path $run 'native-format-preview.bmp'}
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
& $node (Join-Path $root 'tools\compare-source-native.cjs') (Join-Path $root 'tests\fixtures\vector-minimal.pdf') (Join-Path $root 'tests\fixtures\vector-minimal.canonical.json') $fmt (Join-Path $run 'source-comparison.json')
$cmpCode=$LASTEXITCODE
Copy-Item -LiteralPath (Join-Path $root 'tests\fixtures\vector-minimal.canonical.json') -Destination (Join-Path $run 'input.canonical.json') -Force
if($cmpCode -ne 0){
 foreach($alias in @('LATEST_NATIVE_OUTPUT.btw','LATEST_NATIVE_REPORT.json')){
  $aliasPath=Join-Path $base $alias
  if(Test-Path -LiteralPath $aliasPath){Remove-Item -LiteralPath $aliasPath -Force}
 }
 $accepted=Join-Path $run 'native-output.btw'
 if(Test-Path -LiteralPath $accepted){
  $quarantine=$accepted+'.SOURCE_COMPARE_FAILED'
  Move-Item -LiteralPath $accepted -Destination $quarantine -Force
  $report=Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8|ConvertFrom-Json
  $report.output=$quarantine
  $report.status='SOURCE_COMPARE_FAILED_CLOSED'
  $report|ConvertTo-Json -Depth 24|Set-Content -LiteralPath $reportPath -Encoding UTF8
 }
 Compress-Archive -Path (Join-Path $run '*') -DestinationPath (Join-Path $base 'NATIVE_BUILD_RESULT.zip') -CompressionLevel Optimal -Force
 Write-Host ('Canonical build: native/cold PASS but source comparison exit '+$cmpCode)
 exit 3
}
$report=Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8|ConvertFrom-Json
$report.status='VERIFIED_COLD_AND_SOURCE_NOT_PRODUCT_ACCEPTANCE'
$report|ConvertTo-Json -Depth 24|Set-Content -LiteralPath $reportPath -Encoding UTF8
Copy-Item -LiteralPath $reportPath -Destination (Join-Path $base 'LATEST_NATIVE_REPORT.json') -Force
Compress-Archive -Path (Join-Path $run '*') -DestinationPath (Join-Path $base 'NATIVE_BUILD_RESULT.zip') -CompressionLevel Optimal -Force
exit 0
