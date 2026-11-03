[CmdletBinding()]
param(
    [string]$DonorPath = '',
    [string]$OutputPath = ''
)
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($DonorPath)){$DonorPath=Join-Path $PSScriptRoot 'runner-evidence\controlled-donor.btw'}
if([string]::IsNullOrWhiteSpace($OutputPath)){$OutputPath=Join-Path $PSScriptRoot 'runner-evidence\donor-text-automation-diagnostic.json'}
$DonorPath=[IO.Path]::GetFullPath($DonorPath);$OutputPath=[IO.Path]::GetFullPath($OutputPath)
$EvidenceDir=Split-Path -Parent $OutputPath
$CandidatePath=Join-Path $EvidenceDir 'donor-text-pool-contract-candidate.btw'
New-Item -ItemType Directory -Force -Path $EvidenceDir|Out-Null
if(Test-Path -LiteralPath $CandidatePath){Remove-Item -LiteralPath $CandidatePath -Force}
function Release-Com($v){if($null -ne $v -and [Runtime.InteropServices.Marshal]::IsComObject($v)){try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($v)}catch{}}}
function Get-Com($o,[string]$n){return ,([LabelWorkbench.ComBridge]::Get($o,$n,[object[]]@()))}
function Get-ComIndexed($o,[string]$n,[object[]]$a){return ,([LabelWorkbench.ComBridge]::Get($o,$n,$a))}
function Set-Com($o,[string]$n,$v){[LabelWorkbench.ComBridge]::Set($o,$n,[object[]]@($v))}
function Call-Com($o,[string]$n,[object[]]$a){return [LabelWorkbench.ComBridge]::Call($o,$n,$a)}
function Snapshot-Xml($o){return [string](Call-Com $o 'GetXML' ([object[]]@($true,$true)))}
function Xml-ReferencePoint([string]$text){$d=New-Object Xml.XmlDocument;$d.LoadXml($text);return [string]$d.DocumentElement.GetAttribute('ReferencePoint')}
function Set-XmlReferencePoint([string]$text,[string]$value){$d=New-Object Xml.XmlDocument;$d.PreserveWhitespace=$true;$d.LoadXml($text);$d.DocumentElement.SetAttribute('ReferencePoint',$value);return [string]$d.OuterXml}
function Near([double]$a,[double]$b,[double]$tol){return [math]::Abs($a-$b)-le$tol}
function Find-FirstText($objects){
    $count=[int](Get-Com $objects 'Count')
    for($index=1;$index -le $count;$index++){
        $candidate=$null
        try{
            $candidate=Get-ComIndexed $objects 'Item' ([object[]]@($index))
            if($null -ne $candidate -and [int](Get-Com $candidate 'Type') -eq 5){return ,@($candidate,$index)}
        }finally{
            if($null -ne $candidate -and [int](Get-Com $candidate 'Type') -ne 5){Release-Com $candidate}
        }
    }
    return $null
}
$result=[ordered]@{schema='lwb-donor-text-automation-v2';status='STARTED';contract='NOT_RUN';donor=$DonorPath;candidate=$CandidatePath;runtime=[ordered]@{};object=[ordered]@{};anchor=[ordered]@{};properties=[ordered]@{};reopen=[ordered]@{status='NOT_RUN';checks=[ordered]@{}};xmlBefore=$null;xmlAfterAnchor=$null;xmlAfter=$null;cleanup=@()}
$app=$null;$formats=$null;$format=$null;$objects=$null;$obj=$null;$reopenFormat=$null;$reopenObjects=$null;$reopenObj=$null;$ownedPid=$null;$pre=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
try{
 if(-not(Test-Path -LiteralPath $DonorPath -PathType Leaf)){throw ('Controlled donor missing: '+$DonorPath)}
 $bridge=Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\ComBridge.cs';if(-not('LabelWorkbench.ComBridge' -as [type])){Add-Type -Path ([IO.Path]::GetFullPath($bridge)) -ErrorAction Stop}
 $app=New-Object -ComObject BarTender.Application;$ownedPid=[int](Get-Com $app 'ProcessID');if($pre -contains $ownedPid){throw 'Diagnostic attached to a pre-existing BarTender process.'}
 foreach($p in @('FullVersion','Edition','BuildNumber')){$result.runtime[$p]=[string](Get-Com $app $p)};$result.runtime.ProcessID=$ownedPid
 $formats=Get-Com $app 'Formats';$format=Call-Com $formats 'Open' ([object[]]@($DonorPath,$false,''));if($null -eq $format){throw 'Formats.Open returned null.'}
 Set-Com $format 'MeasurementUnits' 3
 $objects=Get-Com $format 'Objects'
 $picked=Find-FirstText $objects;if($null -eq $picked){throw 'No Designer-authored native Text Type 5 object found in controlled donor.'}
 $obj=$picked[0];$index=[int]$picked[1]
 $name=[string](Get-Com $obj 'Name');$result.object.index=$index;$result.object.name=$name;$result.object.type=[int](Get-Com $obj 'Type')
 $result.xmlBefore=Snapshot-Xml $obj
 $result.anchor.before=Xml-ReferencePoint $result.xmlBefore
 $anchorRequest=Set-XmlReferencePoint $result.xmlBefore 'TopLeft'
 [void](Call-Com $obj 'SetXML' ([object[]]@($anchorRequest)))
 $result.xmlAfterAnchor=Snapshot-Xml $obj;$result.anchor.after=Xml-ReferencePoint $result.xmlAfterAnchor
 $result.anchor.status=if($result.anchor.after -ceq 'TopLeft'){'PASS'}else{'FAIL'}

 $specs=@(
  [ordered]@{name='X';target=[double]4.0;kind='double';tol=.02},
  [ordered]@{name='Y';target=[double]3.0;kind='double';tol=.02},
  [ordered]@{name='RotationAngle';target=[double]0.0;kind='double';tol=.01},
  [ordered]@{name='FontName';target='Arial';kind='string'},
  [ordered]@{name='FontSize';target=[double]9.0;kind='double';tol=.02},
  [ordered]@{name='FontBold';target=$false;kind='bool'},
  [ordered]@{name='FontItalic';target=$false;kind='bool'},
  [ordered]@{name='Value';target='LWB_POOL_TEXT_PROBE';kind='string'}
 )
 foreach($s in $specs){
  $row=[ordered]@{get='NOT_RUN';set='NOT_RUN';requested=$s.target;readback='NOT_RUN';status='FAIL';error=$null}
  try{
   $row.get=Get-Com $obj $s.name;Set-Com $obj $s.name $s.target;$row.set='SUCCESS';$read=Get-Com $obj $s.name;$row.readback=$read
   if($s.kind -eq 'double'){$row.status=if(Near ([double]$read) ([double]$s.target) ([double]$s.tol)){'PASS'}else{'FAIL'}}
   elseif($s.kind -eq 'bool'){$row.status=if([bool]$read -eq [bool]$s.target){'PASS'}else{'FAIL'}}
   else{$row.status=if([string]$read -ceq [string]$s.target){'PASS'}else{'FAIL'}}
  }catch{$row.set='FAILED';$row.error=$_.Exception.ToString()}
  $result.properties[$s.name]=$row
 }
 $printRow=[ordered]@{get='NOT_RUN';setTrue='NOT_RUN';readTrue='NOT_RUN';setFalse='NOT_RUN';readFalse='NOT_RUN';status='FAIL';error=$null}
 try{
  $printRow.get=[bool](Get-Com $obj 'DoNotPrint');Set-Com $obj 'DoNotPrint' $true;$printRow.setTrue='SUCCESS';$printRow.readTrue=[bool](Get-Com $obj 'DoNotPrint')
  Set-Com $obj 'DoNotPrint' $false;$printRow.setFalse='SUCCESS';$printRow.readFalse=[bool](Get-Com $obj 'DoNotPrint')
  if($printRow.readTrue -eq $true -and $printRow.readFalse -eq $false){$printRow.status='PASS'}
 }catch{$printRow.error=$_.Exception.ToString()}
 $result.properties.DoNotPrint=$printRow
 $result.xmlAfter=Snapshot-Xml $obj
 if((Xml-ReferencePoint $result.xmlAfter) -cne 'TopLeft'){throw 'ReferencePoint changed after Automation property writes.'}

 [void](Call-Com $format 'SaveAs' ([object[]]@($CandidatePath,$false)))
 Release-Com $obj;$obj=$null;Release-Com $objects;$objects=$null
 [void](Call-Com $format 'Close' ([object[]]@(1)));Release-Com $format;$format=$null
 if(-not(Test-Path -LiteralPath $CandidatePath -PathType Leaf)){throw 'SaveAs did not create pool contract candidate.'}
 $reopenFormat=Call-Com $formats 'Open' ([object[]]@($CandidatePath,$false,''));Set-Com $reopenFormat 'MeasurementUnits' 3
 $reopenObjects=Get-Com $reopenFormat 'Objects';$reopenObj=Call-Com $reopenObjects 'Find' ([object[]]@($name));if($null -eq $reopenObj){throw 'Reopen could not find selected Text slot.'}
 $rx=Snapshot-Xml $reopenObj
 $checks=[ordered]@{
  Type=([int](Get-Com $reopenObj 'Type') -eq 5)
  ReferencePoint=((Xml-ReferencePoint $rx) -ceq 'TopLeft')
  X=(Near ([double](Get-Com $reopenObj 'X')) 4.0 .02)
  Y=(Near ([double](Get-Com $reopenObj 'Y')) 3.0 .02)
  RotationAngle=(Near ([double](Get-Com $reopenObj 'RotationAngle')) 0.0 .01)
  FontName=([string](Get-Com $reopenObj 'FontName') -ceq 'Arial')
  FontSize=(Near ([double](Get-Com $reopenObj 'FontSize')) 9.0 .02)
  FontBold=(-not [bool](Get-Com $reopenObj 'FontBold'))
  FontItalic=(-not [bool](Get-Com $reopenObj 'FontItalic'))
  Value=([string](Get-Com $reopenObj 'Value') -ceq 'LWB_POOL_TEXT_PROBE')
  Printable=(-not [bool](Get-Com $reopenObj 'DoNotPrint'))
 }
 $result.reopen.checks=$checks
 $failed=@($checks.GetEnumerator()|Where-Object{-not [bool]$_.Value})
 $result.reopen.status=if($failed.Count -eq 0){'PASS'}else{'FAIL'}
 $propertyFailures=@($result.properties.GetEnumerator()|Where-Object{[string]$_.Value.status -cne 'PASS'})
 $result.contract=if($result.anchor.status -ceq 'PASS' -and $propertyFailures.Count -eq 0 -and $result.reopen.status -ceq 'PASS'){'PASS'}else{'FAIL'}
 $result.status='COMPLETE'
}catch{$result.status='FAILED';$result.contract='FAIL';$result.error=$_.Exception.ToString()}finally{
 Release-Com $reopenObj;Release-Com $reopenObjects
 if($null -ne $reopenFormat){try{[void](Call-Com $reopenFormat 'Close' ([object[]]@(1)))}catch{$result.cleanup+=('ReopenClose: '+$_.Exception.Message)};Release-Com $reopenFormat}
 Release-Com $obj;Release-Com $objects
 if($null -ne $format){try{[void](Call-Com $format 'Close' ([object[]]@(1)))}catch{$result.cleanup+=('Close: '+$_.Exception.Message)};Release-Com $format}
 Release-Com $formats
 if($null -ne $app){try{[void](Call-Com $app 'Quit' ([object[]]@(1)))}catch{$result.cleanup+=('Quit: '+$_.Exception.Message)};Release-Com $app}
 Start-Sleep -Milliseconds 400
 if($ownedPid -and -not($pre -contains $ownedPid)){if(Get-Process -Id $ownedPid -ErrorAction SilentlyContinue){try{Stop-Process -Id $ownedPid -Force -ErrorAction Stop;$result.cleanup+='Owned diagnostic BarTender process force-stopped after Quit.'}catch{$result.cleanup+=('Stop-Process: '+$_.Exception.Message)}}}
 $result|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
Write-Host ('Designer-authored donor Text pool contract diagnostic written: '+$OutputPath)
if($result.status -ne 'COMPLETE' -or $result.contract -ne 'PASS'){exit 1}
exit 0
