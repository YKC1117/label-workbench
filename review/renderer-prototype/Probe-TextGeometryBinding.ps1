[CmdletBinding()]
param([string]$OutputPath='')
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($OutputPath)){$OutputPath=Join-Path $PSScriptRoot 'runner-evidence\text-geometry-binding-diagnostic.json'}
$OutputPath=[IO.Path]::GetFullPath($OutputPath);New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath)|Out-Null
function Release-Com($v){if($null -ne $v -and [Runtime.InteropServices.Marshal]::IsComObject($v)){try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($v)}catch{}}}
function New-Text($objects){$c=$null;try{$c=[LabelWorkbench.ComBridge]::Call($objects,'Create',[object[]]@(5));if($null -eq $c){throw 'Create(5) returned null.'};$n=[string][LabelWorkbench.ComBridge]::Get($c,'Name',[object[]]@())}finally{Release-Com $c};$o=[LabelWorkbench.ComBridge]::Call($objects,'Find',[object[]]@($n));if($null -eq $o){throw ('Find failed: '+$n)};return ,$o}
function Get-Font([string]$xml){$d=New-Object Xml.XmlDocument;$d.LoadXml($xml);$f=$d.SelectSingleNode('/*/*[local-name()="Font"]');return [ordered]@{FontName=[string]$f.GetAttribute('FontName');PointSize=[string]$f.GetAttribute('PointSize');CharacterSet=[string]$f.GetAttribute('CharacterSet');Height=[string]$f.GetAttribute('Height')}}
function Set-Font([string]$xml,[string]$name,[double]$size){$d=New-Object Xml.XmlDocument;$d.PreserveWhitespace=$true;$d.LoadXml($xml);$f=$d.SelectSingleNode('/*/*[local-name()="Font"]');$f.SetAttribute('FontName',$name);$f.SetAttribute('PointSize',$size.ToString('0.000',[Globalization.CultureInfo]::InvariantCulture));return [string]$d.OuterXml}
$result=[ordered]@{schema='lwb-text-geometry-binding-v1';status='STARTED';runtime=[ordered]@{};properties=[ordered]@{};combined=$null;cleanup=@()}
$app=$null;$formats=$null;$format=$null;$objects=$null;$ownedPid=$null;$pre=@(Get-Process BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
try{
 $bridge=Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\ComBridge.cs';if(-not('LabelWorkbench.ComBridge' -as [type])){Add-Type -Path ([IO.Path]::GetFullPath($bridge)) -ErrorAction Stop}
 $app=New-Object -ComObject BarTender.Application;$ownedPid=[int][LabelWorkbench.ComBridge]::Get($app,'ProcessID',[object[]]@());if($pre -contains $ownedPid){throw 'Diagnostic attached to pre-existing BarTender process.'}
 foreach($p in @('FullVersion','Edition','BuildNumber')){$result.runtime[$p]=[string][LabelWorkbench.ComBridge]::Get($app,$p,[object[]]@())};$result.runtime.ProcessID=$ownedPid
 $formats=[LabelWorkbench.ComBridge]::Get($app,'Formats',[object[]]@());$format=[LabelWorkbench.ComBridge]::Call($formats,'Add',[object[]]@());$objects=[LabelWorkbench.ComBridge]::Get($format,'Objects',[object[]]@())
 foreach($spec in @(@{name='X';value=4.0},@{name='Y';value=3.0},@{name='RotationAngle';value=0.0})){
  $o=$null;$row=[ordered]@{get='NOT_RUN';set='NOT_RUN';readback='NOT_RUN';error=$null}
  try{$o=New-Text $objects;try{$row.get=[double][LabelWorkbench.ComBridge]::Get($o,$spec.name,[object[]]@())}catch{$row.get='FAILED';$row.getError=$_.Exception.ToString()};try{[LabelWorkbench.ComBridge]::Set($o,$spec.name,[object[]]@([double]$spec.value));$row.set='SUCCESS';$row.readback=[double][LabelWorkbench.ComBridge]::Get($o,$spec.name,[object[]]@())}catch{$row.set='FAILED';$row.error=$_.Exception.ToString()}}finally{Release-Com $o};$result.properties[$spec.name]=$row
 }
 $o=$null;$c=[ordered]@{status='STARTED';error=$null}
 try{
  $o=New-Text $objects;$before=[string][LabelWorkbench.ComBridge]::Call($o,'GetXML',[object[]]@($true,$true));$request=Set-Font $before 'Arial' 9.0;[void][LabelWorkbench.ComBridge]::Call($o,'SetXML',[object[]]@($request));$c.fontAfterCandidate=Get-Font ([string][LabelWorkbench.ComBridge]::Call($o,'GetXML',[object[]]@($true,$true))
  [LabelWorkbench.ComBridge]::Set($o,'X',[object[]]@([double]4.0));[LabelWorkbench.ComBridge]::Set($o,'Y',[object[]]@([double]3.0));$c.X=[double][LabelWorkbench.ComBridge]::Get($o,'X',[object[]]@());$c.Y=[double][LabelWorkbench.ComBridge]::Get($o,'Y',[object[]]@());$c.fontAfterXY=Get-Font ([string][LabelWorkbench.ComBridge]::Call($o,'GetXML',[object[]]@($true,$true));$c.status='COMPLETE'
 }catch{$c.status='FAILED';$c.error=$_.Exception.ToString()}finally{Release-Com $o};$result.combined=$c;$result.status='COMPLETE'
}catch{$result.status='FAILED';$result.error=$_.Exception.ToString()}finally{
 Release-Com $objects;if($null -ne $format){try{[void][LabelWorkbench.ComBridge]::Call($format,'Close',[object[]]@(1))}catch{};Release-Com $format};Release-Com $formats;if($null -ne $app){try{[void][LabelWorkbench.ComBridge]::Call($app,'Quit',[object[]]@(1))}catch{};Release-Com $app};Start-Sleep -Milliseconds 400
 if($ownedPid -and -not($pre -contains $ownedPid)){if(Get-Process -Id $ownedPid -ErrorAction SilentlyContinue){try{Stop-Process -Id $ownedPid -Force}catch{}}}
 $result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
Write-Host ('Text geometry diagnostic written: '+$OutputPath)
if($result.status -ne 'COMPLETE'){exit 1};exit 0
