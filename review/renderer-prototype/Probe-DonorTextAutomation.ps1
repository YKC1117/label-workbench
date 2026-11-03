[CmdletBinding()]
param(
    [string]$DonorPath = '',
    [string]$OutputPath = ''
)
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($DonorPath)){$DonorPath=Join-Path $PSScriptRoot 'runner-evidence\controlled-donor.btw'}
if([string]::IsNullOrWhiteSpace($OutputPath)){$OutputPath=Join-Path $PSScriptRoot 'runner-evidence\donor-text-automation-diagnostic.json'}
$DonorPath=[IO.Path]::GetFullPath($DonorPath);$OutputPath=[IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath)|Out-Null
function Release-Com($v){if($null -ne $v -and [Runtime.InteropServices.Marshal]::IsComObject($v)){try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($v)}catch{}}}
# Preserve COM collection objects as single pipeline values. Without the unary
# comma, an empty Formats collection becomes $null and a populated Objects
# collection is flattened into its members by Windows PowerShell 5.1.
function Get-Com($o,[string]$n){return ,([LabelWorkbench.ComBridge]::Get($o,$n,[object[]]@()))}
function Get-ComIndexed($o,[string]$n,[object[]]$a){return ,([LabelWorkbench.ComBridge]::Get($o,$n,$a))}
function Set-Com($o,[string]$n,$v){[LabelWorkbench.ComBridge]::Set($o,$n,[object[]]@($v))}
function Call-Com($o,[string]$n,[object[]]$a){return [LabelWorkbench.ComBridge]::Call($o,$n,$a)}
function Snapshot-Xml($o){return [string](Call-Com $o 'GetXML' ([object[]]@($true,$true)))}
$result=[ordered]@{schema='lwb-donor-text-automation-v1';status='STARTED';donor=$DonorPath;runtime=[ordered]@{};object=[ordered]@{};properties=[ordered]@{};xmlBefore=$null;xmlAfter=$null;cleanup=@()}
$app=$null;$formats=$null;$format=$null;$objects=$null;$obj=$null;$ownedPid=$null;$pre=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
try{
 if(-not(Test-Path -LiteralPath $DonorPath -PathType Leaf)){throw ('Controlled donor missing: '+$DonorPath)}
 $bridge=Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\ComBridge.cs';if(-not('LabelWorkbench.ComBridge' -as [type])){Add-Type -Path ([IO.Path]::GetFullPath($bridge)) -ErrorAction Stop}
 $app=New-Object -ComObject BarTender.Application;$ownedPid=[int](Get-Com $app 'ProcessID');if($pre -contains $ownedPid){throw 'Diagnostic attached to a pre-existing BarTender process.'}
 foreach($p in @('FullVersion','Edition','BuildNumber')){$result.runtime[$p]=[string](Get-Com $app $p)};$result.runtime.ProcessID=$ownedPid
 $formats=Get-Com $app 'Formats';$format=Call-Com $formats 'Open' ([object[]]@($DonorPath,$false,''));if($null -eq $format){throw 'Formats.Open returned null.'}
 Set-Com $format 'MeasurementUnits' 3
 $objects=Get-Com $format 'Objects'
 $count=[int](Get-Com $objects 'Count')
 for($i=1;$i -le $count;$i++){
  $candidate=$null
  try{
   $candidate=Get-ComIndexed $objects 'Item' ([object[]]@($i))
   if($null -ne $candidate -and [int](Get-Com $candidate 'Type') -eq 5){$obj=$candidate;$candidate=$null;break}
  }finally{Release-Com $candidate}
 }
 if($null -eq $obj){throw 'No Designer-authored native Text Type 5 object found in controlled donor.'}
 $result.object.index=$i;$result.object.name=[string](Get-Com $obj 'Name');$result.object.type=[int](Get-Com $obj 'Type')
 $result.xmlBefore=Snapshot-Xml $obj
 $specs=@(
  [ordered]@{name='X';kind='double';delta=1.0},
  [ordered]@{name='Y';kind='double';delta=1.0},
  [ordered]@{name='RotationAngle';kind='double';absolute=0.0},
  [ordered]@{name='FontName';kind='string';absolute='Arial'},
  [ordered]@{name='FontSize';kind='double';delta=1.0}
 )
 foreach($s in $specs){
  $row=[ordered]@{get='NOT_RUN';set='NOT_RUN';requested=$null;readback='NOT_RUN';error=$null}
  try{
   $before=Get-Com $obj $s.name;$row.get=$before
   if($s.Contains('absolute')){$target=$s.absolute}elseif($s.kind -eq 'double'){$target=[double]$before+[double]$s.delta}else{$target=$before}
   $row.requested=$target;Set-Com $obj $s.name $target;$row.set='SUCCESS';$row.readback=Get-Com $obj $s.name
  }catch{$row.set='FAILED';$row.error=$_.Exception.ToString()}
  $result.properties[$s.name]=$row
 }
 $result.xmlAfter=Snapshot-Xml $obj
 $result.status='COMPLETE'
}catch{$result.status='FAILED';$result.error=$_.Exception.ToString()}finally{
 Release-Com $obj;Release-Com $objects
 if($null -ne $format){try{[void](Call-Com $format 'Close' ([object[]]@(1)))}catch{$result.cleanup+=('Close: '+$_.Exception.Message)};Release-Com $format}
 Release-Com $formats
 if($null -ne $app){try{[void](Call-Com $app 'Quit' ([object[]]@(1)))}catch{$result.cleanup+=('Quit: '+$_.Exception.Message)};Release-Com $app}
 Start-Sleep -Milliseconds 400
 if($ownedPid -and -not($pre -contains $ownedPid)){if(Get-Process -Id $ownedPid -ErrorAction SilentlyContinue){try{Stop-Process -Id $ownedPid -Force -ErrorAction Stop;$result.cleanup+='Owned diagnostic BarTender process force-stopped after Quit.'}catch{$result.cleanup+=('Stop-Process: '+$_.Exception.Message)}}}
 $result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
Write-Host ('Designer-authored donor Text automation diagnostic written: '+$OutputPath)
if($result.status -ne 'COMPLETE'){exit 1}
exit 0
