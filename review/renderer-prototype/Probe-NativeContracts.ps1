[CmdletBinding()]
param([switch]$DesignerBase)
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$base=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
$out=Join-Path $PSScriptRoot $(if($DesignerBase){'runner-evidence\contracts-designer'}else{'runner-evidence\contracts'})
[void][IO.Directory]::CreateDirectory($out)
Import-Module (Join-Path $base 'Com.psm1') -Force
Import-Module (Join-Path $base 'NativeLayoutEngine.psm1') -Force
Import-Module (Join-Path $base 'HybridPayload.psm1') -Force
Add-Type -Path (Join-Path $base 'ComMetadata.cs')
$result=[ordered]@{schema='lwb-native-contract-discovery-v2';designerBase=[bool]$DesignerBase;commit=$env:GITHUB_SHA;productAcceptance='NOT_RUN';status='STARTED';runtime=[ordered]@{};enum=@();objects=@();hri=@();persistence=@();errors=@()}
$app=$null;$formats=$null;$doc=$null;$objects=$null;$wd=$null
$script:ownedPids=@()
$existing=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
function Release-C($o){if($null -ne $o -and [Runtime.InteropServices.Marshal]::IsComObject($o)){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($o)}}
function Get-X($o){return [string](Com\Invoke-ComMethod $o 'GetXML' @($true,$true))}
function Save-J($o,[string]$path){$o|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $path -Encoding UTF8}
function Get-Peers($objs,[string]$name){$map=@{};$n=[int](Com\Read-Property $objs 'Count');for($i=1;$i -le $n;$i++){$o=Com\Invoke-ComMethod $objs 'Item' @($i);try{$key=[string](Com\Read-Property $o 'Name');if($key -cne $name){$map[$key]=Get-X $o}}finally{Release-C $o}};return $map}
function Assert-Peers($objs,$map,[string]$tag){foreach($name in $map.Keys){$p=Com\Invoke-ComMethod $objs 'Find' @($name);try{if((Get-X $p) -cne [string]$map[$name]){[string]$map[$name]|Set-Content (Join-Path $out ($tag+'-peer-before.xml')) -Encoding UTF8;(Get-X $p)|Set-Content (Join-Path $out ($tag+'-peer-after.xml')) -Encoding UTF8;throw ('Strict contract peer XML changed: '+$name)}}finally{Release-C $p}}}
function Set-Payload($objs,$o,[string]$value,[string]$tag){
 $name=[string](Com\Read-Property $o 'Name');$peers=Get-Peers $objs $name
 $d=New-Object Xml.XmlDocument;$d.LoadXml([string](Com\Invoke-ComMethod $objs 'ExportDataSourceValuesToXML' @()))
 $sparse=New-HybridPayloadImport $d $name ([string](Com\Read-Property $o 'Value')) $value
 if(-not [bool](Com\Invoke-ComMethod $objs 'ImportDataSourceValuesFromXML' @($sparse.OuterXml))){throw 'Sparse payload import returned false.'}
 if([string](Com\Read-Property $o 'Value') -cne $value){throw 'Contract payload readback mismatch.'}
 Assert-Peers $objs $peers $tag
}
function Capture($o,[string]$stem){(Get-X $o)|Set-Content -LiteralPath (Join-Path $out ($stem+'.xml')) -Encoding UTF8;[void](Com\Invoke-ComMethod $o 'ExportToFile' @((Join-Path $out ($stem+'.bmp')),'BMP',0,600,2))}
function Open-Owned {
 $script:app=New-Object -ComObject BarTender.Application;$pidBt=[int](Com\Read-Property $script:app 'ProcessID');$bt=Get-Process -Id $pidBt -ErrorAction Stop
 if($pidBt -in $existing -or $pidBt -in $script:ownedPids -or $bt.ProcessName -ine 'BarTend'){Release-C $script:app;$script:app=$null;throw 'Refusing pre-existing COM process.'}
 $script:ownedPids+=,$pidBt
 Com\Write-Property $script:app 'Visible' $false
 foreach($key in @('FullVersion','Version','Edition','BuildNumber')){$result.runtime[$key]=Com\Read-Property $script:app $key}
 $result.runtime['powershell']=$PSVersionTable.PSVersion.ToString()
 $script:formats=Com\Read-Property $script:app 'Formats'
 $exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $args='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $base 'Watchdog.ps1')+'" -MainPid '+$PID+' -BarTenderPid '+$pidBt+' -RunDir "'+$out+'" -BaseDirectory "'+$base+'" -StallSeconds 120 -MaxSeconds 300 -BarTenderStartTicks '+$bt.StartTime.ToUniversalTime().Ticks+' -MainStartTicks '+(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
 $script:wd=Start-Process -FilePath $exe -ArgumentList $args -PassThru -WindowStyle Hidden
 return [string]$bt.Path
}
function Close-Owned {
 Release-C $script:objects;$script:objects=$null
 if($null -ne $script:doc){[void](Com\Invoke-ComMethod $script:doc 'Close' @(1));Release-C $script:doc;$script:doc=$null}
 Release-C $script:formats;$script:formats=$null
 if($null -ne $script:app){[void](Com\Invoke-ComMethod $script:app 'Quit' @(1));Release-C $script:app;$script:app=$null}
 if($null -ne $script:wd){if(-not $script:wd.HasExited){$script:wd.Kill()};$script:wd=$null}
}
try{
 $exe=Open-Owned
 $enums=@([LabelWorkbench.ComMetadata]::ReadEnums($exe));$result.enum=$enums;Save-J $enums (Join-Path $out 'installed-enums.json')
 # Require the enum containing both historically proven type values, not guessed constants.
 $groups=@($enums|Group-Object TypeName|Where-Object{@($_.Group|Where-Object{$_.Value -eq 4 -and $_.Name -match 'BarCode'}).Count -eq 1 -and @($_.Group|Where-Object{$_.Value -eq 5 -and $_.Name -match 'Text'}).Count -eq 1})
 if($groups.Count -ne 1){throw 'No unique installed creation enum matches proven Barcode=4 / Text=5.'}
 $types=@($groups[0].Group);Save-J $types (Join-Path $out 'creation-types.json')
 if($DesignerBase){
  $pool=Join-Path $out 'designer-source.btw';$node=(Get-Command node.exe -CommandType Application).Source
  & $node (Join-Path $root 'renderer\materialize-text-pool.cjs') $pool
  if($LASTEXITCODE -ne 0 -or (Get-FileHash $pool -Algorithm SHA256).Hash -cne '73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B'){throw 'Designer source materialization/hash failed.'}
  $doc=Com\Invoke-ComMethod $formats 'Open' @($pool,$false,'')
  $objs=Com\Read-Property $doc 'Objects';try{foreach($name in @((Get-Peers $objs '').Keys)){if(-not [bool](Com\Invoke-ComMethod $objs 'Delete' @($name))){throw 'Could not remove unused source object.'}}}finally{Release-C $objs}
 }else{$doc=Com\Invoke-ComMethod $formats 'Add' @()}
 Com\Write-Property $doc 'MeasurementUnits' 3
 # Use the existing page implementation, without modifying renderer core.
 & (Get-Module NativeLayoutEngine) {param($doc) [void](Set-NativePage $doc ([pscustomobject]@{widthMm=100;heightMm=70;printerName=$null}))} $doc
 $objects=Com\Read-Property $doc 'Objects'
 $offset=5
 foreach($kind in @('line','box','image')){
  $pattern=if($kind -eq 'line'){'Line$'}elseif($kind -eq 'box'){'Box$|Rectangle$'}else{'Picture$|Image$'}
  $matches=@($types|Where-Object{$_.Name -match $pattern});$row=[ordered]@{kind=$kind;status='NOT_RUN';enum=$null;name=$null;properties=@();error=$null}
  $o=$null
  try{
   if($matches.Count -ne 1){throw ('No unique deterministic creation type for '+$kind)}
   $row.enum=$matches[0];$o=Com\Invoke-ComMethod $objects 'Create' @([int]$matches[0].Value);if($null -eq $o){throw 'Create returned null.'}
   $row.name=[string](Com\Read-Property $o 'Name');Release-C $o;$o=$null;Release-C $objects;$objects=Com\Read-Property $doc 'Objects';$o=Com\Invoke-ComMethod $objects 'Find' @([string]$row.name);$row.type=[int](Com\Read-Property $o 'Type');if($row.type -ne $matches[0].Value){throw 'Created type differs from installed enum.'}
   (Get-X $o)|Set-Content -LiteralPath (Join-Path $out ($kind+'-baseline.xml')) -Encoding UTF8
   $peers=Get-Peers $objects $row.name
   $props=[ordered]@{}
   if($kind -eq 'line'){$props.LineStartX=5.08;$props.LineStartY=55.88;$props.LineEndX=35.56;$props.LineEndY=60.96;$props.LineThickness=0.508}
   else{
    if($kind -eq 'image'){
     $image=Join-Path $out 'source.png';Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'primitive-candidate\asymmetric.png') -Destination $image -Force
     $props.PicturePath=$image;$props.PreserveAspectRatio=$false
    }
    $props.X=[double]$offset;$props.Y=10.16;$props.Width=25.4;$props.Height=12.7;$props.RotationAngle=0
    if($kind -eq 'box'){$props.LineThickness=0.508}
   }
   foreach($key in $props.Keys){
    $p=[ordered]@{name=$key;requested=$props[$key];status='NOT_RUN';actual=$null;error=$null}
    try{Com\Write-Property $o $key $props[$key];$p.actual=Com\Read-Property $o $key;$p.status='READBACK_CAPTURED'}catch{
     $p.status='FAIL';$p.error=$_.Exception.ToString()
     try{
      $value=if($props[$key] -is [double]){([double]$props[$key]).ToString('R',[Globalization.CultureInfo]::InvariantCulture)}else{[string]$props[$key]}
      [void](Com\Invoke-ComMethod $o 'SetProperty' @([string]$key,$value));$p.actual=Com\Invoke-ComMethod $o 'GetProperty' @([string]$key);$p.status='DYNAMIC_READBACK_CAPTURED'
     }catch{$p['dynamicError']=$_.Exception.ToString()}
    }
    $row.properties+=,$p
   }
   try{Com\Write-Property $o 'DoNotPrint' $false}catch{$row['doNotPrintError']=$_.Exception.ToString()};Capture $o ($kind+'-presave');Assert-Peers $objects $peers $kind
   $row.status=if(@($row.properties|Where-Object{$_.status -eq 'FAIL'}).Count){'PROPERTY_CAPABILITY_FAILURE'}else{'WRITES_AND_RENDER_CAPTURED_NOT_CERTIFIED'}
  }catch{$row.status='FAIL_OR_UNAVAILABLE';$row.error=$_.Exception.ToString()}finally{Release-C $o;$result.objects+=,$row;$offset+=32;Save-J $result (Join-Path $out 'contract-report.json')}
 }
 # One proven Code128 BTC only. HRI default and transform-free experiment are separated.
 $beforeNames=Get-Peers $objects ''
 [void](Com\Invoke-ComMethod $doc 'InsertComponent' @((Join-Path $base 'proven-code128.btc'),[double]5,[double]30))
 Release-C $objects;$objects=Com\Read-Property $doc 'Objects';$afterNames=Get-Peers $objects ''; $new=@($afterNames.Keys|Where-Object{-not $beforeNames.ContainsKey($_)})
 if($new.Count -ne 1){throw 'Code128 insertion delta not exactly one.'}
 $barcodeName=$new[0];$o=Com\Invoke-ComMethod $objects 'Find' @($barcodeName)
 try{
  foreach($mode in @('default-visible','without-caption-transform')){
   $row=[ordered]@{mode=$mode;status='NOT_RUN';values=@();error=$null}
   try{
    $d=New-Object Xml.XmlDocument;$d.PreserveWhitespace=$true;$d.LoadXml((Get-X $o));$h=$d.SelectSingleNode('/*/HumanReadable');if($null -eq $h){throw 'HRI node absent.'};$h.RemoveAttribute('Visibility')
    if($mode -eq 'without-caption-transform'){$t=$h.SelectSingleNode('./Transforms');if($null -ne $t){[void]$h.RemoveChild($t)}}
    $peers=Get-Peers $objects $barcodeName;[void](Com\Invoke-ComMethod $o 'SetXML' @($d.OuterXml));Assert-Peers $objects $peers ('hri-'+$mode)
    foreach($value in @('AB12','987654321012')){
     Set-Payload $objects $o $value ('hri-'+$mode);$hr=[string](Com\Read-Property $o 'HumanReadableValue')
     $row.values+=,[ordered]@{value=$value;humanReadableValue=$hr;matches=($hr -ceq $value)}
     try{Com\Write-Property $o 'Height' ([double]9)}catch{$row['heightError']=$_.Exception.ToString()};Capture $o ('hri-'+$mode+'-'+$value)
    }
    $row.status=if(@($row.values|Where-Object{-not $_.matches}).Count){'CAPTION_NOT_BOUND_TO_MAIN_VALUE'}else{'PAYLOAD_AND_HRI_MATCHED_RENDER_PENDING'}
   }catch{$row.status='FAIL';$row.error=$_.Exception.ToString()}finally{$result.hri+=,$row;Save-J $result (Join-Path $out 'contract-report.json')}
  }
 }finally{Release-C $o}
 $btw=Join-Path $out 'native-contracts.unverified.btw';[void](Com\Invoke-ComMethod $doc 'ExportToFile' @((Join-Path $out 'presave-format.bmp'),'BMP',0,600,2));[void](Com\Invoke-ComMethod $doc 'SaveAs' @($btw,$false));$savedHash=(Get-FileHash $btw -Algorithm SHA256).Hash
 # Cold reopen after quitting owned process; remove image file from its original path.
 Close-Owned
 for($wait=0;$wait -lt 10;$wait++){if($null -eq (Get-Process -Id $script:ownedPids[-1] -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 200}
 $source=Join-Path $out 'source.png';if(Test-Path -LiteralPath $source){Move-Item -LiteralPath $source -Destination (Join-Path $out 'source.hidden') -Force}
 [void](Open-Owned);$doc=Com\Invoke-ComMethod $formats 'Open' @($btw,$false,'');Com\Write-Property $doc 'MeasurementUnits' 3;$objects=Com\Read-Property $doc 'Objects'
 [void](Com\Invoke-ComMethod $doc 'ExportToFile' @((Join-Path $out 'cold-reopen-format.bmp'),'BMP',0,600,2))
 foreach($row in $result.objects){
  if([string]::IsNullOrWhiteSpace([string]$row.name)){continue};$o=Com\Invoke-ComMethod $objects 'Find' @([string]$row.name)
  try{Capture $o ($row.kind+'-cold-reopen');$result.persistence+=,[ordered]@{name=$row.name;kind=$row.kind;type=Com\Read-Property $o 'Type';sourceFileExists=Test-Path -LiteralPath (Join-Path $out 'source.png');status='READBACK_AND_RENDER_CAPTURED_NOT_CERTIFIED'}}catch{$result.persistence+=,[ordered]@{name=$row.name;kind=$row.kind;status='FAIL';error=$_.Exception.ToString()}}finally{Release-C $o}
 }
 $result['candidateShaBefore']=$savedHash;$result['candidateShaAfter']=(Get-FileHash $btw -Algorithm SHA256).Hash;if($result.candidateShaBefore -cne $result.candidateShaAfter){throw 'Contract evidence changed BTW file.'}
 $result['ownedProcessIDs']=$script:ownedPids
 $result.status='DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE'
}catch{$result.status='DISCOVERY_FAILED';$result.errors+=,$_.Exception.ToString()}
finally{try{Close-Owned}catch{$result.errors+=,$_.Exception.ToString()};Save-J $result (Join-Path $out 'contract-report.json')}
Write-Host ('Native contract discovery: '+$result.status)
if($result.status -ne 'DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE'){exit 1}
exit 0
