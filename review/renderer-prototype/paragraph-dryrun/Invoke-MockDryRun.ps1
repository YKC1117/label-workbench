# OFFLINE LOGIC DRY-RUN ONLY. Mock COM objects; NOT BarTender evidence. Requires pwsh + node.exe on PATH.
param([string]$Scenario='normal',[string]$RepoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,[string]$WorkRoot=[IO.Path]::GetTempPath())
$ErrorActionPreference='Stop'
$repo=Join-Path $WorkRoot ('lwb-paragraph-dryrun-'+$Scenario)
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
$global:PMock=@{widthRefused=$false;heightRefused=$true;autofit=$false;contaminate=$false;restoreDrift=$false}
switch($Scenario){'width-refused'{$global:PMock.widthRefused=$true}'autofit'{$global:PMock.autofit=$true}'contaminate'{$global:PMock.contaminate=$true}'restore-drift'{$global:PMock.restoreDrift=$true}'height-clip'{$global:PMock.heightRefused=$false}}
& (Join-Path $repo 'review/renderer-prototype/Probe-NativeParagraph.ps1')
"EXIT=$LASTEXITCODE"
$d=Join-Path $repo 'review/renderer-prototype/runner-evidence/native-paragraph'
$r=Get-Content (Join-Path $d 'paragraph-contract-report.json') -Raw|ConvertFrom-Json
"status=$($r.status) hard=$($r.hardFailures -join ',') inventory=$($r.installedTemplateInventory.status)"
if($r.errors){"errors=$(($r.errors|ConvertTo-Json -Compress -Depth 3))"}
$v=Get-Content (Join-Path $d 'paragraph-verdict.json') -Raw|ConvertFrom-Json
"verdict=$($v.overall) wrap=$($v.axes.P3_wrap.result) misses=$($v.axes.P3_wrap.misses -join ',') align=$($v.axes.P4_alignment.default) height=$($v.axes.P5_fixedHeight.result) edit=$($v.axes.P6_editChallenge.result) cold=$($v.axes.P7_coldReopen) cap=$($v.capability|ConvertTo-Json -Compress)"
