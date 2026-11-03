[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RunDirectory)
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'));$base=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
Import-Module (Join-Path $base 'Com.psm1') -Force
$report=Get-Content (Join-Path $RunDirectory 'native-build-report.json') -Raw -Encoding UTF8|ConvertFrom-Json
$old=Get-Content (Join-Path $RunDirectory 'runtime.json') -Raw -Encoding UTF8|ConvertFrom-Json
$target=Join-Path $RunDirectory 'native-output.btw';$before=(Get-FileHash $target -Algorithm SHA256).Hash
$result=[ordered]@{schema='lwb-primitive-cold-reopen-v1';status='STARTED';candidateShaBefore=$before;candidateShaAfter=$null;buildProcessID=$old.barTender.ProcessID;coldProcessID=$null;sourceFilesHidden=@();objects=@();wholeFormatSame=$false;error=$null}
$app=$null;$formats=$null;$doc=$null;$objects=$null;$wd=$null;$owns=$false
$existing=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
function Release-C($o){if($null -ne $o -and [Runtime.InteropServices.Marshal]::IsComObject($o)){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($o)}}
try{
 foreach($image in @($report.objects|Where-Object{$_.type -ceq 'image'})){
  if(-not(Test-Path -LiteralPath $image.assetPath)){throw 'Expected original image asset missing before cold verification.'}
  Move-Item -LiteralPath $image.assetPath -Destination ($image.assetPath+'.hidden') -Force
  $result.sourceFilesHidden+=,[string]$image.assetPath
 }
 # Also hide the challenge source so neither image path can satisfy a link.
 foreach($challenge in @(Get-ChildItem -LiteralPath $RunDirectory -Filter 'image-challenge-*.png' -File)){Move-Item -LiteralPath $challenge.FullName -Destination ($challenge.FullName+'.hidden') -Force}
 $app=New-Object -ComObject BarTender.Application;$pidBt=[int](Com\Read-Property $app 'ProcessID');$bt=Get-Process -Id $pidBt
 if($pidBt -in $existing -or $pidBt -eq [int]$old.barTender.ProcessID){throw 'Cold verifier did not acquire a new distinct COM process.'};$owns=$true;$result.coldProcessID=$pidBt
 $done=Join-Path $RunDirectory 'WATCHDOG_DONE.txt';if(Test-Path -LiteralPath $done){Move-Item -LiteralPath $done -Destination ($done+'.build') -Force}
 'Cold verification'|Set-Content -LiteralPath (Join-Path $RunDirectory 'LIVE_STAGE.txt')
 $exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe';$args='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $base 'Watchdog.ps1')+'" -MainPid '+$PID+' -BarTenderPid '+$pidBt+' -RunDir "'+$RunDirectory+'" -BaseDirectory "'+$base+'" -StallSeconds 120 -MaxSeconds 300 -BarTenderStartTicks '+$bt.StartTime.ToUniversalTime().Ticks+' -MainStartTicks '+(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
 $wd=Start-Process -FilePath $exe -ArgumentList $args -PassThru -WindowStyle Hidden
 Com\Write-Property $app 'Visible' $false;$formats=Com\Read-Property $app 'Formats';$doc=Com\Invoke-ComMethod $formats 'Open' @($target,$false,'');Com\Write-Property $doc 'MeasurementUnits' 3;$objects=Com\Read-Property $doc 'Objects'
 foreach($entry in $report.objects){
  $o=Com\Invoke-ComMethod $objects 'Find' @([string]$entry.physicalName)
  try{
   if([int](Com\Read-Property $o 'Type') -ne [int]$entry.nativeType -or [bool](Com\Read-Property $o 'DoNotPrint')){throw 'Cold native type/visibility mismatch.'}
   $file=Join-Path $RunDirectory ('cold-'+$entry.id+'.bmp');[void](Com\Invoke-ComMethod $o 'ExportToFile' @($file,'BMP',0,600,2))
   $same=((Get-FileHash $file -Algorithm SHA256).Hash -ceq (Get-FileHash (Join-Path $RunDirectory ('visual-'+$entry.id+'.bmp')) -Algorithm SHA256).Hash)
   if(-not $same){throw ('Cold native bitmap changed: '+$entry.id)}
   $result.objects+=,[ordered]@{id=$entry.id;type=$entry.type;nativeType=$entry.nativeType;exactNativeBmpEqual=$same;status='PASS'}
  }finally{Release-C $o}
 }
 $whole=Join-Path $RunDirectory 'cold-format.bmp';[void](Com\Invoke-ComMethod $doc 'ExportToFile' @($whole,'BMP',0,600,2));$result.wholeFormatSame=((Get-FileHash $whole -Algorithm SHA256).Hash -ceq (Get-FileHash (Join-Path $RunDirectory 'native-format-preview.bmp') -Algorithm SHA256).Hash)
 if(-not $result.wholeFormatSame){throw 'Cold whole-format bitmap changed.'}
 $result.status='PASS'
}catch{$result.status='FAIL';$result.error=$_.Exception.ToString()}
finally{
 Release-C $objects;if($null -ne $doc){try{[void](Com\Invoke-ComMethod $doc 'Close' @(1))}catch{$result.status='FAIL';$result.error=$_.Exception.ToString()};Release-C $doc};Release-C $formats
 if($null -ne $app){if($owns){try{[void](Com\Invoke-ComMethod $app 'Quit' @(1))}catch{$result.status='FAIL';$result.error=$_.Exception.ToString()}};Release-C $app}
 if($null -ne $wd -and -not $wd.HasExited){$wd.Kill()}
 $result.candidateShaAfter=(Get-FileHash $target -Algorithm SHA256).Hash;if($result.candidateShaAfter -cne $before){$result.status='FAIL';$result.error='Cold proof altered candidate BTW.'}
 $result|ConvertTo-Json -Depth 16|Set-Content -LiteralPath (Join-Path $RunDirectory 'cold-reopen.json') -Encoding UTF8
}
Write-Host ('Primitive cold-process proof: '+$result.status)
if($result.status -cne 'PASS'){exit 1}
exit 0
