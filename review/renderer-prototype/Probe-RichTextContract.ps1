[CmdletBinding()]
param()
# RichText9 native contract discovery. Discovery only: NOT a renderer capability.
# Proven recipe (Run47/49): fixed-SHA Designer base -> delete unused objects ->
# Box3 + proven Code128 BTC peers -> Create(enum RichText) -> release/reacquire Find.
# Prohibited here: Create(5) Text primary, donor binary patching, BTC scans,
# guessed dynamic property names (SetProperty/GetProperty), and any write of
# unknown alignment / wrap / sizing-mode XML fields.
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$base=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
$out=Join-Path $PSScriptRoot 'runner-evidence\richtext-contract'
if(Test-Path -LiteralPath $out){Remove-Item -LiteralPath $out -Recurse -Force}
[void][IO.Directory]::CreateDirectory($out)
Import-Module (Join-Path $base 'Com.psm1') -Force
Import-Module (Join-Path $base 'NativeLayoutEngine.psm1') -Force
Import-Module (Join-Path $base 'HybridPayload.psm1') -Force
Add-Type -Path (Join-Path $base 'ComMetadata.cs')
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$verdictTool=Join-Path $PSScriptRoot 'richtext-contract-verdict.cjs'
$designerSha='73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B'
$getterNames=@('Type','Name','Value','X','Y','Width','Height','RotationAngle','FontName','FontSize','FontBold','FontItalic')

$result=[ordered]@{
 schema='lwb-richtext-contract-discovery-v1';commit=$env:GITHUB_SHA;runId=$env:GITHUB_RUN_ID
 status='STARTED';productAcceptance='NOT_COMPLETE'
 capability=[ordered]@{fixedFrame='NOT_CERTIFIED';nativeJustification='NOT_CERTIFIED';wrap='NOT_CERTIFIED'}
 policy='Discovery only. Documented typed setters only; no guessed dynamic property names; no unknown alignment/wrap/sizing XML writes.'
 runtime=[ordered]@{};enum=[ordered]@{};designerBase=[ordered]@{};ownership=[ordered]@{allOwned=$true;pids=@()}
 phases=[ordered]@{};peers=[ordered]@{};rich=[ordered]@{};setters=@();valueModel=[ordered]@{model='UNKNOWN'}
 payload=[ordered]@{status='NOT_RUN'};fontBoldRestore=[ordered]@{status='NOT_RUN'};cold=[ordered]@{status='NOT_RUN'}
 peerAudits=@();hardFailures=@();errors=@()
}
$app=$null;$formats=$null;$doc=$null;$objects=$null;$wd=$null
$script:ownedPids=@();$script:peerMap=@{};$script:richName=$null
$existing=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
$result.runtime['preExistingBarTendPids']=@($existing)

function Stage([string]$s){$s|Set-Content -LiteralPath (Join-Path $out 'LIVE_STAGE.txt') -Encoding UTF8;$result.phases[$s]='STARTED'}
function Done([string]$s){$result.phases[$s]='DONE'}
function Release-C($o){if($null -ne $o -and [Runtime.InteropServices.Marshal]::IsComObject($o)){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($o)}}
function Save-J($o,[string]$path){$o|ConvertTo-Json -Depth 40|Set-Content -LiteralPath $path -Encoding UTF8}
function Save-T([string]$text,[string]$name){[IO.File]::WriteAllText((Join-Path $out $name),$text,(New-Object Text.UTF8Encoding($false)))}
function Get-X($o){return [string](Com\Invoke-ComMethod $o 'GetXML' @($true,$true))}
function Get-Err($e){$x=$e;while($null -ne $x.InnerException){$x=$x.InnerException};return [ordered]@{message=$x.Message;hresult=('0x{0:X8}' -f $x.HResult);type=$x.GetType().FullName}}
function Hard([string]$code){$result.hardFailures+=,$code;throw ('HARD_FAIL_CLOSED: '+$code)}
function Hex-Prefix($s){if($null -eq $s){return $null};$n=[Math]::Min(64,$s.Length);return ((@($s.Substring(0,$n).ToCharArray())|ForEach-Object{([int]$_).ToString('X4')}) -join ' ')}
function File-Sha([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
function Export-Bmp($o,[string]$name){[void](Com\Invoke-ComMethod $o 'ExportToFile' @((Join-Path $out $name),'BMP',0,600,2));return $name}
function Find-O([string]$name){if([string]::IsNullOrEmpty($name)){throw 'Find requires a name.'};$o=Com\Invoke-ComMethod $script:objects 'Find' @($name);if($null -eq $o){throw ('Find returned null: '+$name)};return $o}
function Read-Getters($o){
 $g=[ordered]@{}
 foreach($k in $getterNames){try{$g[$k]=[ordered]@{ok=$true;value=(Com\Read-Property $o $k)}}catch{$g[$k]=[ordered]@{ok=$false;error=(Get-Err $_.Exception)}}}
 return $g
}
function Get-Names(){
 $names=@();$n=[int](Com\Read-Property $script:objects 'Count')
 for($i=1;$i -le $n;$i++){$o=Com\Invoke-ComMethod $script:objects 'Item' @($i);try{$names+=,[string](Com\Read-Property $o 'Name')}finally{Release-C $o}}
 return $names
}
function Reacquire-Objects(){Release-C $script:objects;$script:objects=$null;$script:objects=Com\Read-Property $script:doc 'Objects'}
function Snapshot-Peers($names){$m=@{};foreach($name in @($names)){$p=Find-O $name;try{$m[$name]=Get-X $p}finally{Release-C $p}};return $m}
function Audit-Peers([string]$tag){
 foreach($name in @($script:peerMap.Keys)){
  $p=Find-O $name
  try{
   $now=Get-X $p;$ok=($now -ceq [string]$script:peerMap[$name])
   $result.peerAudits+=,[ordered]@{tag=$tag;name=$name;status=$(if($ok){'EXACT'}else{'CHANGED'})}
   if(-not $ok){Save-T ([string]$script:peerMap[$name]) ('peer-'+$tag+'-before.xml');Save-T $now ('peer-'+$tag+'-after.xml');Hard ('PEER_CONTAMINATION:'+$tag+':'+$name)}
  }finally{Release-C $p}
 }
}
function Get-DsFacts([string]$xmlText){
 $d=New-Object Xml.XmlDocument;$d.PreserveWhitespace=$true;$d.LoadXml($xmlText)
 $rootAttrs=@($d.DocumentElement.Attributes|ForEach-Object{$_.Name})
 $ds=@();$node=$d.SelectSingleNode('/*/*[local-name()="DataSources"]')
 if($null -ne $node){foreach($c in $node.ChildNodes){if($c -is [Xml.XmlElement]){$v=$c.SelectSingleNode('./*[local-name()="Value"]');$ds+=,[ordered]@{localName=$c.LocalName;attributes=@($c.Attributes|ForEach-Object{$_.Name});valueText=$(if($null -ne $v){$v.InnerText}else{$null})}}}}
 $children=@($d.DocumentElement.ChildNodes|Where-Object{$_ -is [Xml.XmlElement]}|ForEach-Object{$_.LocalName})
 return [ordered]@{rootLocalName=$d.DocumentElement.LocalName;rootAttributeNames=$rootAttrs;childElementNames=$children;dataSourcesNodePresent=($null -ne $node);dataSources=$ds;transformCount=@($d.SelectNodes('//*[local-name()="Transforms"]')).Count}
}
function Get-ExportFacts([string]$name,[string]$file){
 $raw=[string](Com\Invoke-ComMethod $script:objects 'ExportDataSourceValuesToXML' @());Save-T $raw $file
 $f=[ordered]@{file=$file;rowCount=0;subStringCount=$null;valueCount=$null;literalOk=$false;literal=$null;encoding=$null;rowXml=$null}
 $d=New-Object Xml.XmlDocument;$d.LoadXml($raw)
 $rows=@($d.SelectNodes('/Command/DataMerge/Object')|Where-Object{$_.GetAttribute('Name') -ceq $name});$f.rowCount=$rows.Count
 if($rows.Count -eq 1){
  $f.rowXml=$rows[0].OuterXml;$subs=@($rows[0].SelectNodes('./SubString'));$f.subStringCount=$subs.Count
  if($subs.Count -eq 1 -and $subs[0].GetAttribute('Position') -ceq '0'){
   $vals=@($subs[0].SelectNodes('./Value'));$f.valueCount=$vals.Count
   if($vals.Count -eq 1){
    if($vals[0].HasAttribute('Encoding')){
     $f.encoding=$vals[0].GetAttribute('Encoding')
     if($f.encoding -ieq 'base64'){$bytes=[Convert]::FromBase64String($vals[0].InnerText);if(($bytes.Length % 2) -eq 0){$f.literal=(New-Object Text.UnicodeEncoding($false,$false,$true)).GetString($bytes);$f.literalOk=$true}}
    }else{$f.literal=$vals[0].InnerText;$f.literalOk=$true}
   }
  }
 }
 return $f
}
function Invoke-Classifier($classifierInput,[string]$tag){
 $in=Join-Path $out ('value-model-'+$tag+'-input.json');$res=Join-Path $out ('value-model-'+$tag+'.json');Save-J $classifierInput $in
 & $node $verdictTool '--classify' $in $res *> (Join-Path $out ('value-model-'+$tag+'.log'))
 if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $res)){return [pscustomobject]@{model='UNKNOWN';confirmed=$false;payloadPermitted=$false;signals=@();reasons=@('CLASSIFIER_FAILED')}}
 return (Get-Content -LiteralPath $res -Raw -Encoding UTF8|ConvertFrom-Json)
}
function Open-Owned {
 $script:app=New-Object -ComObject BarTender.Application;$pidBt=[int](Com\Read-Property $script:app 'ProcessID');$bt=Get-Process -Id $pidBt -ErrorAction Stop
 if($pidBt -in $existing -or $pidBt -in $script:ownedPids -or $bt.ProcessName -ine 'BarTend'){Release-C $script:app;$script:app=$null;$result.ownership.allOwned=$false;Hard ('NON_OWNED_OR_REUSED_PROCESS:'+$pidBt)}
 $script:ownedPids+=,$pidBt;$result.ownership.pids=@($script:ownedPids)
 Com\Write-Property $script:app 'Visible' $false
 foreach($key in @('FullVersion','Version','Edition','BuildNumber')){try{$result.runtime[$key]=Com\Read-Property $script:app $key}catch{$result.runtime[$key]=$null}}
 $result.runtime['powershell']=$PSVersionTable.PSVersion.ToString();$result.runtime['machine']=$env:COMPUTERNAME;$result.runtime['runnerName']=$env:RUNNER_NAME
 $script:formats=Com\Read-Property $script:app 'Formats'
 $exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $wdArgs='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $base 'Watchdog.ps1')+'" -MainPid '+$PID+' -BarTenderPid '+$pidBt+' -RunDir "'+$out+'" -BaseDirectory "'+$base+'" -StallSeconds 120 -MaxSeconds 300 -BarTenderStartTicks '+$bt.StartTime.ToUniversalTime().Ticks+' -MainStartTicks '+(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
 $script:wd=Start-Process -FilePath $exe -ArgumentList $wdArgs -PassThru -WindowStyle Hidden
 return [string]$bt.Path
}
function Close-Owned {
 Release-C $script:objects;$script:objects=$null
 if($null -ne $script:doc){[void](Com\Invoke-ComMethod $script:doc 'Close' @(1));Release-C $script:doc;$script:doc=$null}
 Release-C $script:formats;$script:formats=$null
 if($null -ne $script:app){[void](Com\Invoke-ComMethod $script:app 'Quit' @(1));Release-C $script:app;$script:app=$null}
 if($null -ne $script:wd){if(-not $script:wd.HasExited){$script:wd.Kill()};$script:wd=$null}
}
function Invoke-Setter([string]$label,[string]$property,$requested){
 Stage ('setter-'+$label)
 $o=Find-O $script:richName
 try{
  $row=[ordered]@{label=$label;property=$property;requested=$requested;status='NOT_RUN';actual=$null;error=$null}
  $xb=Get-X $o;Save-T $xb ('setter-'+$label+'-before.xml')
  $gb=Read-Getters $o;$row.gettersBefore=$gb
  $row.fontSizeBefore=$(if($gb['FontSize'].ok){$gb['FontSize'].value}else{$null})
  try{Com\Write-Property $o $property $requested;$row.status='WROTE'}catch{$row.status='WRITE_REFUSED';$row.error=Get-Err $_.Exception}
  $ga=Read-Getters $o;$row.gettersAfter=$ga
  if($ga[$property].ok){$row.actual=$ga[$property].value}
  $row.fontSizeAfter=$(if($ga['FontSize'].ok){$ga['FontSize'].value}else{$null})
  $xa=Get-X $o;Save-T $xa ('setter-'+$label+'-after.xml');$row.xmlChanged=($xa -cne $xb)
  $vb=$(if($gb['Value'].ok){[string]$gb['Value'].value}else{$null});$va=$(if($ga['Value'].ok){[string]$ga['Value'].value}else{$null})
  $row.valueMutated=($vb -cne $va)
  try{$row.bmp=Export-Bmp $o ('setter-'+$label+'.bmp')}catch{$row.bmp=$null;$row.bmpError=Get-Err $_.Exception}
 }finally{Release-C $o}
 $result.setters+=,$row;Save-J $result (Join-Path $out 'richtext-contract-report.json')
 Audit-Peers ('setter-'+$label)
 Done ('setter-'+$label)
 return $row
}

$btw=Join-Path $out 'richtext-contract.unverified.btw'
try{
 Stage 'open'
 # Run39 job log records the BarTender host as 'LWB-FTUSER5'. Inside Actions, any other runner fails closed.
 $result.runtime['expectedRunner']='LWB-FTUSER5'
 if(-not [string]::IsNullOrEmpty($env:RUNNER_NAME) -and $env:RUNNER_NAME -cne 'LWB-FTUSER5'){Hard ('UNEXPECTED_RUNNER:'+$env:RUNNER_NAME)}
 $exe=Open-Owned
 Stage 'enum'
 $enums=@([LabelWorkbench.ComMetadata]::ReadEnums($exe));Save-J $enums (Join-Path $out 'installed-enums.json')
 $groups=@($enums|Group-Object TypeName|Where-Object{@($_.Group|Where-Object{$_.Value -eq 4 -and $_.Name -match 'BarCode'}).Count -eq 1 -and @($_.Group|Where-Object{$_.Value -eq 5 -and $_.Name -match 'Text'}).Count -eq 1})
 if($groups.Count -ne 1){Hard 'NO_UNIQUE_CREATION_ENUM'}
 $types=@($groups[0].Group);Save-J $types (Join-Path $out 'creation-types.json')
 $rt=@($types|Where-Object{$_.Name -match 'RichText'});$bx=@($types|Where-Object{$_.Name -match 'Box$'})
 $result.enum['richTextMatches']=@($rt|ForEach-Object{[ordered]@{Name=$_.Name;Value=[int]$_.Value}});$result.enum['boxMatches']=@($bx|ForEach-Object{[ordered]@{Name=$_.Name;Value=[int]$_.Value}})
 if($rt.Count -ne 1 -or [int]$rt[0].Value -ne 9){Hard 'RICHTEXT_ENUM_NOT_UNIQUE_9'}
 if($bx.Count -ne 1 -or [int]$bx[0].Value -ne 3){Hard 'BOX_ENUM_NOT_UNIQUE_3'}
 Done 'enum'

 Stage 'designer-base'
 $pool=Join-Path $out 'designer-source.btw'
 & $node (Join-Path $root 'renderer\materialize-text-pool.cjs') $pool *> (Join-Path $out 'designer-materialize.log')
 $poolSha=$(if(Test-Path -LiteralPath $pool){File-Sha $pool}else{$null})
 $result.designerBase=[ordered]@{expected=$designerSha;actual=$poolSha;shaOk=($LASTEXITCODE -eq 0 -and $poolSha -ceq $designerSha)}
 if(-not $result.designerBase.shaOk){Hard 'DESIGNER_BASE_SHA'}
 $script:doc=Com\Invoke-ComMethod $script:formats 'Open' @($pool,$false,'')
 $script:objects=Com\Read-Property $script:doc 'Objects'
 $removed=@();foreach($name in @(Get-Names)){if(-not [bool](Com\Invoke-ComMethod $script:objects 'Delete' @($name))){Hard ('UNUSED_OBJECT_DELETE:'+$name)};$removed+=,$name}
 $result.designerBase['removedObjects']=$removed
 Com\Write-Property $script:doc 'MeasurementUnits' 3
 & (Get-Module NativeLayoutEngine) {param($d) [void](Set-NativePage $d ([pscustomobject]@{widthMm=100;heightMm=70;printerName=$null}))} $script:doc
 Reacquire-Objects
 if(@(Get-Names).Count -ne 0){Hard 'BASE_NOT_EMPTY_AFTER_DELETE'}
 Done 'designer-base'

 Stage 'peers'
 $o=Com\Invoke-ComMethod $script:objects 'Create' @([int]$bx[0].Value);$boxName=[string](Com\Read-Property $o 'Name');Release-C $o;Reacquire-Objects
 $o=Find-O $boxName
 try{
  if([int](Com\Read-Property $o 'Type') -ne 3){Hard 'BOX_PEER_TYPE'}
  $bp=[ordered]@{X=60.96;Y=45.72;Width=25.4;Height=12.7;RotationAngle=[double]0;LineThickness=0.508}
  foreach($k in $bp.Keys){Com\Write-Property $o $k $bp[$k]};Com\Write-Property $o 'DoNotPrint' $false
  $result.peers['box']=[ordered]@{name=$boxName;requested=$bp;bmp=(Export-Bmp $o 'peer-box.bmp')}
 }finally{Release-C $o}
 $before=@(Get-Names)
 [void](Com\Invoke-ComMethod $script:doc 'InsertComponent' @((Join-Path $base 'proven-code128.btc'),[double]5.08,[double]45.72))
 Reacquire-Objects;$new=@(@(Get-Names)|Where-Object{$_ -notin $before})
 if($new.Count -ne 1){Hard 'CODE128_INSERT_DELTA_NOT_ONE'}
 $o=Find-O $new[0];try{$result.peers['code128']=[ordered]@{name=$new[0];type=[int](Com\Read-Property $o 'Type');bmp=(Export-Bmp $o 'peer-code128.bmp')}}finally{Release-C $o}
 if($result.peers.code128.type -ne 4){Hard 'CODE128_PEER_TYPE'}
 Done 'peers'

 Stage 'create'
 $script:peerMap=Snapshot-Peers @(Get-Names)
 if($script:peerMap.Count -ne 2){Hard ('PEER_SET_NOT_TWO:'+$script:peerMap.Count)}
 foreach($name in @($script:peerMap.Keys)){Save-T ([string]$script:peerMap[$name]) ('peer-baseline-'+($name -replace '[^A-Za-z0-9_-]','_')+'.xml')}
 $o=Com\Invoke-ComMethod $script:objects 'Create' @([int]$rt[0].Value)
 if($null -eq $o){Hard 'RICHTEXT_CREATE_NULL'}
 $script:richName=[string](Com\Read-Property $o 'Name');Release-C $o;$o=$null;Reacquire-Objects
 $o=Find-O $script:richName
 try{
  $result.rich['name']=$script:richName;$result.rich['type']=[int](Com\Read-Property $o 'Type')
  $xf=Get-X $o;Save-T $xf 'rich-baseline-full.xml'
  try{Save-T ([string](Com\Invoke-ComMethod $o 'GetXML' @($false,$false))) 'rich-baseline-bare.xml';$result.rich['bareXml']='rich-baseline-bare.xml'}catch{$result.rich['bareXmlError']=Get-Err $_.Exception}
  $facts=Get-DsFacts $xf;foreach($k in $facts.Keys){$result.rich[$k]=$facts[$k]}
  $g=Read-Getters $o;$result.rich['getters']=$g
  $val=$(if($g['Value'].ok){[string]$g['Value'].value}else{$null})
  $result.rich['valueLength']=$(if($null -ne $val){$val.Length}else{$null});$result.rich['valueHexPrefix']=Hex-Prefix $val
  if($null -ne $val){Save-T $val 'rich-baseline-value.txt'}
  try{Com\Write-Property $o 'DoNotPrint' $false}catch{$result.rich['doNotPrintError']=Get-Err $_.Exception}
  $result.rich['baselineBmp']=Export-Bmp $o 'rich-baseline.bmp'
 }finally{Release-C $o}
 if($result.rich.type -ne 9){Hard ('RICHTEXT_TYPE_'+$result.rich.type)}
 $result.rich['export']=Get-ExportFacts $script:richName 'datasource-export-baseline.xml'
 Audit-Peers 'create'
 Done 'create'

 # Documented typed setters only. Mil-representable values (1.600 in, 0.600 in,
 # 0.400 in) keep API behaviour separate from the documented one-mil quantum.
 [void](Invoke-Setter 'X' 'X' 10.16)
 [void](Invoke-Setter 'Y' 'Y' 10.16)
 [void](Invoke-Setter 'Width' 'Width' 40.64)
 [void](Invoke-Setter 'Height' 'Height' 15.24)
 [void](Invoke-Setter 'FontName' 'FontName' 'Arial')
 [void](Invoke-Setter 'FontSize' 'FontSize' ([double]10))
 $o=Find-O $script:richName;try{$boldBefore=Get-X $o}finally{Release-C $o}
 $b1=Invoke-Setter 'FontBold-true' 'FontBold' $true
 $b2=Invoke-Setter 'FontBold-restore' 'FontBold' $false
 $o=Find-O $script:richName;try{$boldAfter=Get-X $o}finally{Release-C $o}
 $result.fontBoldRestore=[ordered]@{status=$(if($b1.status -eq 'WROTE' -and $b2.status -eq 'WROTE'){'DONE'}else{'NOT_RUN'});exact=($boldAfter -ceq $boldBefore);setStatus=$b1.status;restoreStatus=$b2.status}
 if($result.fontBoldRestore.status -eq 'DONE' -and -not $result.fontBoldRestore.exact){Save-T $boldBefore 'fontbold-restore-expected.xml';Save-T $boldAfter 'fontbold-restore-actual.xml';Hard 'FONTBOLD_RESTORE_NOT_EXACT'}

 Stage 'value-model'
 $o=Find-O $script:richName
 try{$xmlNow=Get-X $o;$gNow=Read-Getters $o}finally{Release-C $o}
 Save-T $xmlNow 'rich-after-setters-full.xml'
 $exNow=Get-ExportFacts $script:richName 'datasource-export-after-setters.xml'
 $dsNow=Get-DsFacts $xmlNow
 $cin=[ordered]@{origin='CREATE_DEFAULT';value=[ordered]@{ok=[bool]$gNow['Value'].ok;text=$(if($gNow['Value'].ok){[string]$gNow['Value'].value}else{$null})}
  xmlText=$xmlNow;dataSources=$dsNow.dataSources;transformCount=$dsNow.transformCount;export=$exNow
  valueAfterSetters=@($result.setters|ForEach-Object{[ordered]@{label=$_.label;mutated=[bool]$_.valueMutated}})}
 $cls=Invoke-Classifier $cin 'after-setters'
 $result.valueModel=[ordered]@{model=[string]$cls.model;confirmed=[bool]$cls.confirmed;payloadPermitted=[bool]$cls.payloadPermitted;signals=@($cls.signals);reasons=@($cls.reasons);evidence='value-model-after-setters-input.json'}
 Done 'value-model'

 Stage 'payload'
 if(-not $result.valueModel.payloadPermitted){
  $result.payload=[ordered]@{status='NOT_RUN';reason=('VALUE_MODEL_'+$result.valueModel.model+'_NOT_CONFIRMED_PLAIN');detail=@($result.valueModel.reasons)}
 }else{
  # Reachable only after a confirmed plain model (never from Create default content).
  $o=Find-O $script:richName
  try{
   $orig=[string](Com\Read-Property $o 'Value');$origXml=Get-X $o;$steps=@();$prev=$orig
   $plan=@(@('single','PARA TEST'),@('two-line',('PARA LINE 1'+[char]13+[char]10+'PARA LINE 2')),@('long-single',('PARAGRAPH WRAP OBSERVATION '*6).Trim()),@('restore',$orig))
   foreach($p in $plan){
    $exp=New-Object Xml.XmlDocument;$exp.LoadXml([string](Com\Invoke-ComMethod $script:objects 'ExportDataSourceValuesToXML' @()))
    $sparse=New-HybridPayloadImport $exp $script:richName $prev ([string]$p[1]);Save-T $sparse.OuterXml ('payload-'+$p[0]+'-import.xml')
    if(-not [bool](Com\Invoke-ComMethod $script:objects 'ImportDataSourceValuesFromXML' @($sparse.OuterXml))){Hard ('PAYLOAD_IMPORT_FALSE:'+$p[0])}
    $rb=[string](Com\Read-Property $o 'Value');$x=Get-X $o;Save-T $x ('payload-'+$p[0]+'-readback.xml')
    $steps+=,[ordered]@{label=$p[0];readbackExact=($rb -ceq [string]$p[1]);fontSize=$(try{Com\Read-Property $o 'FontSize'}catch{$null});bmp=(Export-Bmp $o ('payload-'+$p[0]+'.bmp'))}
    Audit-Peers ('payload-'+$p[0]);$prev=$rb
   }
   $finalXml=Get-X $o
   $result.payload=[ordered]@{status='DONE';steps=$steps;restoreExact=($finalXml -ceq $origXml -and $prev -ceq $orig)}
   if(-not $result.payload.restoreExact){Hard 'PAYLOAD_RESTORE_NOT_EXACT'}
  }finally{Release-C $o}
 }
 Done 'payload'

 Stage 'save'
 $o=Find-O $script:richName;try{Save-T (Get-X $o) 'rich-hot-presave.xml'}finally{Release-C $o}
 [void](Com\Invoke-ComMethod $script:doc 'SaveAs' @($btw,$false))
 $shaBefore=File-Sha $btw
 $o=Find-O $script:richName
 try{$hotXml=Get-X $o;$hotVal=[string](Com\Read-Property $o 'Value');Save-T $hotXml 'rich-hot-postsave.xml';[void](Export-Bmp $o 'rich-hot-postsave.bmp')}finally{Release-C $o}
 [void](Com\Invoke-ComMethod $script:doc 'ExportToFile' @((Join-Path $out 'format-hot-postsave.bmp'),'BMP',0,600,2))
 $hotPeers=Snapshot-Peers @($script:peerMap.Keys)
 Audit-Peers 'post-save'
 $buildPid=$script:ownedPids[-1]
 Done 'save'

 Stage 'cold'
 Close-Owned
 for($w=0;$w -lt 25;$w++){if($null -eq (Get-Process -Id $buildPid -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 200}
 $buildExited=($null -eq (Get-Process -Id $buildPid -ErrorAction SilentlyContinue))
 [void](Open-Owned);$coldPid=$script:ownedPids[-1]
 $script:doc=Com\Invoke-ComMethod $script:formats 'Open' @($btw,$false,'');Com\Write-Property $script:doc 'MeasurementUnits' 3;$script:objects=Com\Read-Property $script:doc 'Objects'
 $o=Find-O $script:richName
 try{$coldXml=Get-X $o;$coldVal=[string](Com\Read-Property $o 'Value');$coldType=[int](Com\Read-Property $o 'Type');Save-T $coldXml 'rich-cold.xml';[void](Export-Bmp $o 'rich-cold.bmp')}finally{Release-C $o}
 [void](Com\Invoke-ComMethod $script:doc 'ExportToFile' @((Join-Path $out 'format-cold.bmp'),'BMP',0,600,2))
 $coldPeers=Snapshot-Peers @($script:peerMap.Keys)
 $peerEq=$true;foreach($k in @($hotPeers.Keys)){if(-not $coldPeers.ContainsKey($k) -or [string]$coldPeers[$k] -cne [string]$hotPeers[$k]){$peerEq=$false;Save-T ([string]$hotPeers[$k]) ('cold-peer-hot-'+($k -replace '[^A-Za-z0-9_-]','_')+'.xml');if($coldPeers.ContainsKey($k)){Save-T ([string]$coldPeers[$k]) ('cold-peer-cold-'+($k -replace '[^A-Za-z0-9_-]','_')+'.xml')}}}
 $result.cold=[ordered]@{status='DONE';buildPid=$buildPid;coldPid=$coldPid;buildProcessExited=$buildExited;distinctPid=($coldPid -ne $buildPid -and $buildExited)
  richType=$coldType;richXmlEqual=($coldXml -ceq $hotXml);richValueEqual=($coldVal -ceq $hotVal)
  richBmpEqual=((File-Sha (Join-Path $out 'rich-cold.bmp')) -ceq (File-Sha (Join-Path $out 'rich-hot-postsave.bmp')))
  formatBmpEqual=((File-Sha (Join-Path $out 'format-cold.bmp')) -ceq (File-Sha (Join-Path $out 'format-hot-postsave.bmp')))
  peerXmlEqual=$peerEq;shaBefore=$shaBefore;shaAfter=$null}
 Close-Owned
 $result.cold.shaAfter=File-Sha $btw
 $c=$result.cold
 if(-not ($c.distinctPid -and $c.richType -eq 9 -and $c.richXmlEqual -and $c.richValueEqual -and $c.richBmpEqual -and $c.formatBmpEqual -and $c.peerXmlEqual -and $c.shaBefore -ceq $c.shaAfter)){Hard 'COLD_REOPEN_OR_SHA_MISMATCH'}
 Done 'cold'
 $result.status='DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE'
}catch{
 $result.status='DISCOVERY_FAILED_CLOSED';$result.errors+=,(Get-Err $_.Exception);$result.errors+=,$_.ScriptStackTrace
}finally{
 try{Close-Owned}catch{$result.errors+=,(Get-Err $_.Exception)}
 $result.ownership.pids=@($script:ownedPids)
 # Reproducible materialized Text pool is not evidence (same policy as Run49 package); SHA is recorded.
 $poolCopy=Join-Path $out 'designer-source.btw';if(Test-Path -LiteralPath $poolCopy){Remove-Item -LiteralPath $poolCopy -Force}
 Save-J $result (Join-Path $out 'richtext-contract-report.json')
}
& $node $verdictTool '--verdict' $out *> (Join-Path $out 'richtext-verdict.log')
$verdictCode=$LASTEXITCODE
if($result.status -ne 'DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE' -or $verdictCode -ne 0){
 if(Test-Path -LiteralPath $btw){Move-Item -LiteralPath $btw -Destination ($btw+'.FAIL_CLOSED') -Force}
 Write-Host ('RichText9 contract probe: FAIL_CLOSED status='+$result.status+' verdictExit='+$verdictCode)
 exit 1
}
Write-Host 'RichText9 contract probe: DISCOVERY_COMPLETE (capabilities NOT_CERTIFIED)'
exit 0
