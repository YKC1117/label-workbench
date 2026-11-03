[CmdletBinding()]
param()
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'));$base=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
$evidence=Join-Path $base 'native-results\D';[void][IO.Directory]::CreateDirectory($evidence)
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
foreach($file in @((Join-Path $base 'HybridPool.psm1'),(Join-Path $base 'NativeLayoutEngine.psm1'),(Join-Path $base 'Build-NativeLayout.ps1'),(Join-Path $PSScriptRoot 'Verify-PrimitiveColdReopen.ps1'))){
 $tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){throw ('PS5.1 parser: '+$file+' '+($errors -join '; '))}
}
& $ps -STA -NoProfile -ExecutionPolicy Bypass -File (Join-Path $base 'Build-NativeLayout.ps1') -LayoutPath (Join-Path $PSScriptRoot 'primitive-candidate\mixed.json') -ResultRoot $evidence -CaptureVisualEvidence -RendererMode Hybrid
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$run=@(Get-ChildItem -LiteralPath $evidence -Directory|Where-Object{$_.Name -like 'r-*'}|Sort-Object LastWriteTime -Descending)[0].FullName
# The build child has Quit its owned COM process; cold verifier must own a new one.
& $ps -STA -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Verify-PrimitiveColdReopen.ps1') -RunDirectory $run
$coldCode=$LASTEXITCODE
if($coldCode -ne 0){
 foreach($alias in @('LATEST_NATIVE_OUTPUT.btw','LATEST_NATIVE_REPORT.json')){$p=Join-Path $base $alias;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
 $file=Join-Path $run 'native-output.btw';if(Test-Path -LiteralPath $file){Move-Item -LiteralPath $file -Destination ($file+'.COLD_FAILED') -Force}
 Compress-Archive -Path (Join-Path $run '*') -DestinationPath (Join-Path $base 'NATIVE_BUILD_RESULT.zip') -CompressionLevel Optimal -Force
 exit 1
}
Compress-Archive -Path (Join-Path $run '*') -DestinationPath (Join-Path $base 'NATIVE_BUILD_RESULT.zip') -CompressionLevel Optimal -Force
exit 0
