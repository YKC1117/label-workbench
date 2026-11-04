# OFFLINE LOGIC DRY-RUN ONLY. Mock COM objects; NOT BarTender evidence. Requires pwsh + node.exe on PATH.
param([string]$Scenario='normal',[string]$RepoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,[string]$WorkRoot=[IO.Path]::GetTempPath())
$ErrorActionPreference='Stop'
$repo=Join-Path $WorkRoot ('lwb-richtext-dryrun-'+$Scenario)
if(Test-Path $repo){Remove-Item $repo -Recurse -Force}
Copy-Item $RepoRoot $repo -Recurse
$prog=Join-Path $repo 'native/Label_Workbench_Native_Layout_ENGINE_V1/program'
Copy-Item (Join-Path $PSScriptRoot 'MockCom.psm1') (Join-Path $prog 'Com.psm1') -Force
'function Set-NativePage($document,$plan){return @{ok=$true}}; Export-ModuleMember -Function Set-NativePage'|Set-Content (Join-Path $prog 'NativeLayoutEngine.psm1')
@'
namespace LabelWorkbench { public class E { public string TypeName; public string Name; public int Value; public E(string n,int v){TypeName="BtObjectType";Name=n;Value=v;} }
public static class ComMetadata { public static object[] ReadEnums(string p){ return new object[]{ new E("btObjectLine",2),new E("btObjectBox",3),new E("btObjectBarcode",4),new E("btObjectText",5),new E("btObjectPicture",6),new E("btObjectRichText",9)}; } } }
'@|Set-Content (Join-Path $prog 'ComMetadata.cs')
$env:SystemRoot='/tmp/sysroot';$env:GITHUB_SHA='mock'
$global:LivePids=New-Object System.Collections.ArrayList;$global:NextPid=9000;$global:MockDocs=@()
function global:New-Object{param([Parameter(Position=0)][string]$TypeName,[Parameter(Position=1)][object[]]$ArgumentList,[string]$ComObject)
 if($ComObject){$global:NextPid++;[void]$global:LivePids.Add($global:NextPid);return [pscustomobject]@{Kind='App';Pid=$global:NextPid}}
 if($null -ne $ArgumentList){return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName -ArgumentList $ArgumentList};return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName}
function global:Get-Process{param([string]$Name,[int]$Id,$ErrorAction)
 if($Name){return @()};if($Id -eq $PID){return [pscustomobject]@{StartTime=(Get-Date);ProcessName='pwsh'}}
 if($global:LivePids -contains $Id){return [pscustomobject]@{Id=$Id;ProcessName='BarTend';StartTime=(Get-Date);Path='C:\mock\BarTend.exe'}};if($ErrorAction -eq 'Stop'){throw "no proc $Id"};return $null}
function global:Start-Process{return [pscustomobject]@{HasExited=$true}}
$global:MockCfg=@{heightRefused=$false;boldContaminatesBox=$false;richValue='Rich Text';boldRestoreInexact=$false}
switch($Scenario){'height-refused'{$global:MockCfg.heightRefused=$true}'contaminate'{$global:MockCfg.boldContaminatesBox=$true}'rtf'{$global:MockCfg.richValue='{\rtf1\ansi Rich}'}'bold-inexact'{$global:MockCfg.boldRestoreInexact=$true}}
& (Join-Path $repo 'review/renderer-prototype/Probe-RichTextContract.ps1')
"EXIT=$LASTEXITCODE"
$d=Join-Path $repo 'review/renderer-prototype/runner-evidence/richtext-contract'
$r=Get-Content (Join-Path $d 'richtext-contract-report.json') -Raw|ConvertFrom-Json
"status=$($r.status) model=$($r.valueModel.model) payload=$($r.payload.status) hard=$($r.hardFailures -join ',')"
"errors=$(($r.errors|ConvertTo-Json -Compress -Depth 3))"
$v=Get-Content (Join-Path $d 'richtext-verdict.json') -Raw|ConvertFrom-Json
"verdict=$($v.overall) axes=$($v.axes|ConvertTo-Json -Compress)"
