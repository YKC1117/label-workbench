# OFFLINE LOGIC DRY-RUN ONLY. Mock COM objects; NOT BarTender evidence. Requires pwsh + node.exe on PATH.
param([string]$Scenario='normal',[string]$RepoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,[string]$WorkRoot=[IO.Path]::GetTempPath())
$ErrorActionPreference='Stop'
$repo=Join-Path $WorkRoot ('lwb-multiline-dryrun-'+$Scenario)
if(Test-Path $repo){Remove-Item $repo -Recurse -Force}
New-Item -ItemType Directory -Path $repo|Out-Null
foreach($d in @('native','renderer','review','assets','node_modules')){Copy-Item (Join-Path $RepoRoot $d) (Join-Path $repo $d) -Recurse}
$prog=Join-Path $repo 'native/Label_Workbench_Native_Layout_ENGINE_V1/program'
Copy-Item (Join-Path $PSScriptRoot 'MockCom.psm1') (Join-Path $prog 'Com.psm1') -Force
'function Set-NativePage($document,$plan){return @{ok=$true}}; Export-ModuleMember -Function Set-NativePage'|Set-Content (Join-Path $prog 'NativeLayoutEngine.psm1')
@'
namespace LabelWorkbench { public class E { public string TypeName; public string Name; public int Value; public E(string n,int v){TypeName="BtObjectType";Name=n;Value=v;} }
public static class ComMetadata { public static object[] ReadEnums(string p){ return new object[]{ new E("btObjectLine",2),new E("btObjectBox",3),new E("btObjectBarcode",4),new E("btObjectText",5),new E("btObjectPicture",6),new E("btObjectRichText",9)}; } } }
'@|Set-Content (Join-Path $prog 'ComMetadata.cs')
$env:SystemRoot='/tmp/sysroot';$env:GITHUB_SHA='mock';$env:ProgramData='/tmp/mock-programdata';$env:PUBLIC='/tmp/mock-public'
$global:LivePids=New-Object System.Collections.ArrayList;$global:NextPid=9000;$global:PDocs=@();$global:PSeenShort=$false
function global:New-Object{param([Parameter(Position=0)][string]$TypeName,[Parameter(Position=1)][object[]]$ArgumentList,[string]$ComObject)
 if($ComObject){$global:NextPid++;[void]$global:LivePids.Add($global:NextPid);return [pscustomobject]@{Kind='App';Pid=$global:NextPid}}
 if($null -ne $ArgumentList){return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName -ArgumentList $ArgumentList};return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName}
function global:Get-Process{param([string]$Name,[int]$Id,$ErrorAction)
 if($Name){return @()};if($Id -eq $PID){return [pscustomobject]@{StartTime=(Get-Date);ProcessName='pwsh'}}
 if($global:LivePids -contains $Id){return [pscustomobject]@{Id=$Id;ProcessName='BarTend';StartTime=(Get-Date);Path='/tmp/mock-bt/BarTend.exe'}};if($ErrorAction -eq 'Stop'){throw "no proc $Id"};return $null}
function global:Start-Process{return [pscustomobject]@{HasExited=$true}}
$global:MMock=@{alignOnEdit=$null;contaminate=$false;restoreDrift=$false;transform33=$false;harvestMutate=$false};$global:MCount=0
switch($Scenario){'align-lost'{$global:MMock.alignOnEdit='Left'}'contaminate'{$global:MMock.contaminate=$true}'restore-drift'{$global:MMock.restoreDrift=$true}'transform33'{$global:MMock.transform33=$true}'harvest-mutates'{$global:MMock.harvestMutate=$true}'source-sha'{$f=Join-Path $repo 'native/Label_Workbench_Native_Layout_ENGINE_V1/evidence/original-template.btw';$b=[IO.File]::ReadAllBytes($f);$b[$b.Length-1]=$b[$b.Length-1] -bxor 1;[IO.File]::WriteAllBytes($f,$b)}}
& (Join-Path $repo 'review/renderer-prototype/Probe-DesignerMultiline.ps1')
"EXIT=$LASTEXITCODE"
$d=Join-Path $repo 'review/renderer-prototype/runner-evidence/designer-multiline'
$r=Get-Content (Join-Path $d 'multiline-contract-report.json') -Raw|ConvertFrom-Json
"status=$($r.status) hard=$($r.hardFailures -join ',') edit=$($r.edit.status) $($r.edit.reason)"
if($r.errors){"errors=$(($r.errors|ConvertTo-Json -Compress -Depth 3))"}
$v=Get-Content (Join-Path $d 'multiline-verdict.json') -Raw|ConvertFrom-Json
$h=$v.harvest.'designer-base'.targets
"verdict=$($v.overall) edit=$($v.edit.result) cold=$($v.cold) peers=$($v.peerIsolation) just=$($v.capability.nativeJustification|ConvertTo-Json -Compress) multiline=$($v.capability.nativeExplicitMultiline)"
"harvest30=$($h.PSObject.Properties|Select-Object -First 1|%{$_.Value.alignment.class}) harvest33=$($h.PSObject.Properties|Select-Object -Last 1|%{$_.Value.alignment.class}) observed=$(($v.observedReadOnlyAlignment|%{$_.source+':'+$_.class}) -join ',')"
