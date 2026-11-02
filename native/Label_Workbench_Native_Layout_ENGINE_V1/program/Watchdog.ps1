[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][int]$MainPid,
 [Parameter(Mandatory=$true)][int]$BarTenderPid,
 [Parameter(Mandatory=$true)][string]$RunDir,
 [Parameter(Mandatory=$true)][string]$BaseDirectory,
 [Parameter(Mandatory=$true)][string]$BarTenderStartTicks,
 [Parameter(Mandatory=$true)][string]$MainStartTicks,
 [int]$StallSeconds=120,[int]$MaxSeconds=600,
 [ValidateSet("RETURN_TO_CHATGPT.zip","NATIVE_BUILD_RESULT.zip")][string]$ReturnZipName="RETURN_TO_CHATGPT.zip"
)
$ErrorActionPreference='Stop'
function Get-OwnedProcess([int]$id,[string]$ticks){
 $p=Get-Process -Id $id -ErrorAction SilentlyContinue
 if($null -ne $p -and [string]$p.StartTime.ToUniversalTime().Ticks -ceq $ticks){return $p}
 return $null
}
$start=Get-Date;$stagePath=Join-Path $RunDir 'LIVE_STAGE.txt';$done=Join-Path $RunDir 'WATCHDOG_DONE.txt'
while($null -ne (Get-OwnedProcess $MainPid $MainStartTicks)){
 if(Test-Path -LiteralPath $done){exit 0}
 Start-Sleep -Seconds 5
 if(Test-Path -LiteralPath $done){exit 0}
 $last=$start;if(Test-Path -LiteralPath $stagePath){$last=(Get-Item -LiteralPath $stagePath).LastWriteTime}
 $now=Get-Date
 if(($now-$last).TotalSeconds -lt $StallSeconds -and ($now-$start).TotalSeconds -lt $MaxSeconds){continue}
 $stage=if(Test-Path -LiteralPath $stagePath){Get-Content -LiteralPath $stagePath -Raw}else{'unknown'}
 ('TIMEOUT: '+$stage) | Set-Content -LiteralPath (Join-Path $RunDir 'WATCHDOG_TIMEOUT.txt') -Encoding UTF8
 $bt=Get-OwnedProcess $BarTenderPid $BarTenderStartTicks
 if($null -ne $bt -and $bt.ProcessName -ieq 'BarTend'){Stop-Process -InputObject $bt -Force -ErrorAction SilentlyContinue}
 Start-Sleep -Seconds 8
 if(Test-Path -LiteralPath $done){exit 2}
 # Stop the owned runner first, then package: no competing Compress-Archive writers.
 $main=Get-OwnedProcess $MainPid $MainStartTicks
 if($null -ne $main){Stop-Process -InputObject $main -Force -ErrorAction SilentlyContinue}
 if($ReturnZipName -eq 'NATIVE_BUILD_RESULT.zip'){
  foreach($n in @('candidate.unverified.btw','native-output.btw')){
   $f=Join-Path $RunDir $n;if(Test-Path -LiteralPath $f){Move-Item -LiteralPath $f -Destination ($f+'.FAILED_UNVERIFIED') -Force}
  }
 }
 $temp=Join-Path $BaseDirectory ($ReturnZipName+'.timeout.tmp.zip')
 Compress-Archive -Path (Join-Path $RunDir '*') -DestinationPath $temp -CompressionLevel Optimal -Force
 Move-Item -LiteralPath $temp -Destination (Join-Path $BaseDirectory $ReturnZipName) -Force
 exit 2
}
