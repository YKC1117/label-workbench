# Single Windows entrypoint. The user selects the BTW FIRST, before preflight or BarTender activation.
# Child preflight stdout/stderr are redirected to files so an Add-Type error cannot abort the parent
# before the full diagnostic log is packaged.
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$returnZip=Join-Path $root 'RETURN_TO_CHATGPT.zip'
$preflight=Join-Path $root 'PREFLIGHT_LOG.txt'
$selectionLog=Join-Path $root 'SELECTED_TEMPLATE.txt'
$stdoutPath=Join-Path $root 'PREFLIGHT_STDOUT.tmp'
$stderrPath=Join-Path $root 'PREFLIGHT_STDERR.tmp'
foreach($stale in @($returnZip,$preflight,$selectionLog,$stdoutPath,$stderrPath)){
 if(Test-Path -LiteralPath $stale){Remove-Item -LiteralPath $stale -Force -ErrorAction SilentlyContinue}
}
$rc=1
$templatePath=$null
try {
 Add-Type -AssemblyName System.Windows.Forms
 $picker=New-Object System.Windows.Forms.OpenFileDialog
 try {
  $picker.Filter='BarTender (*.btw)|*.btw'
  $picker.Title='Select the original BarTender BTW to test (the original will not be modified)'
  $picker.CheckFileExists=$true
  $picker.Multiselect=$false
  $picker.RestoreDirectory=$true
  $dialogResult=$picker.ShowDialog()
  if($dialogResult -ne [System.Windows.Forms.DialogResult]::OK){
   throw 'No BTW was selected. Test cancelled before preflight and before BarTender was started.'
  }
  $templatePath=$picker.FileName
 } finally { $picker.Dispose() }
 if([string]::IsNullOrWhiteSpace($templatePath) -or -not(Test-Path -LiteralPath $templatePath -PathType Leaf)){
  throw 'Selected BTW path is missing or invalid.'
 }
 if([IO.Path]::GetExtension($templatePath) -ine '.btw'){throw 'Selected file must be a .btw file.'}
 $templateHash=(Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash
 @(
  'launcherRevision=deep-review-final-win51-2',
  ('path='+$templatePath),
  ('sha256='+$templateHash)
 ) | Set-Content -LiteralPath $selectionLog -Encoding UTF8
 Write-Host ('Selected BTW: '+$templatePath) -ForegroundColor Green
 Write-Host 'Running target-machine runtime preflight before starting BarTender...' -ForegroundColor Cyan

 $psExe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 if(-not(Test-Path -LiteralPath $psExe -PathType Leaf)){$psExe='powershell.exe'}
 $selfCheck=Join-Path $root 'SELF_CHECK.ps1'
 $argLine='-NoProfile -ExecutionPolicy Bypass -File "'+$selfCheck+'"'
 $child=Start-Process -FilePath $psExe -ArgumentList $argLine -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
 $out='';$err=''
 if(Test-Path -LiteralPath $stdoutPath){$out=Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue}
 if(Test-Path -LiteralPath $stderrPath){$err=Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue}
 @(
  '=== STDOUT ===',
  $out,
  '=== STDERR ===',
  $err,
  ('=== EXIT CODE: '+$child.ExitCode+' ===')
 ) | Set-Content -LiteralPath $preflight -Encoding UTF8
 if(-not [string]::IsNullOrWhiteSpace($out)){Write-Host $out}
 if(-not [string]::IsNullOrWhiteSpace($err)){Write-Host $err -ForegroundColor Red}
 if($child.ExitCode -ne 0){throw ('SELF_CHECK failed after BTW selection. BarTender was not started. Exit='+$child.ExitCode+'. See PREFLIGHT_LOG.txt.')}

 Write-Host 'SELF_CHECK passed. Starting bounded BarTender core test...' -ForegroundColor Cyan
 & $psExe -NoProfile -STA -ExecutionPolicy Bypass -File (Join-Path $root 'Run.ps1') -BaseDirectory $root -TemplatePath $templatePath -CoreTest
 $rc=$LASTEXITCODE
 if(-not(Test-Path -LiteralPath $returnZip)){throw ('Runner ended without a return ZIP. Exit='+$rc)}
}catch{
 $dir=Join-Path $root ('results/launch-'+[guid]::NewGuid().ToString('N'))
 [void][IO.Directory]::CreateDirectory($dir)
 if(Test-Path -LiteralPath $preflight){Copy-Item -LiteralPath $preflight -Destination $dir}
 if(Test-Path -LiteralPath $selectionLog){Copy-Item -LiteralPath $selectionLog -Destination $dir}
 $_.Exception.ToString() | Set-Content -LiteralPath (Join-Path $dir 'LAUNCH_ERROR.txt') -Encoding UTF8
 if(Test-Path -LiteralPath $returnZip){Remove-Item -LiteralPath $returnZip -Force -ErrorAction SilentlyContinue}
 Compress-Archive -Path (Join-Path $dir '*') -DestinationPath $returnZip -Force
 $rc=1
}finally{
 foreach($temp in @($stdoutPath,$stderrPath)){
  if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}
 }
}
Write-Host ('Return: '+$returnZip)
exit $rc
