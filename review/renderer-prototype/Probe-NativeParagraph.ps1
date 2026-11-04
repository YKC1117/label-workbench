[CmdletBinding()]
param()
# Text5 native paragraph contract probe (Run51 candidate). Discovery only.
# Root cause (see PARAGRAPH_CONTRACT.md section 10): no Designer-authored paragraph
# Text5 XML exists in any evidence; the only documented, never-tested lever is the
# typed DesignObject.Width on a Text object (documented to apply to paragraph text).
# Recipe: fixed-SHA Designer Text pool base -> keep two clean Designer Text slots
# (target + Text peer) -> delete all other objects -> Box3 + proven Code128 BTC peers.
# Prohibited: Create(5), donor binary patching, opening/scanning unknown BTC/BTW,
# GetProperty/SetProperty names, any SetXML write. Only documented typed setters
# and the proven sparse DataMerge payload import are used.
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$base=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
$out=Join-Path $PSScriptRoot 'runner-evidence\native-paragraph'
if(Test-Path -LiteralPath $out){Remove-Item -LiteralPath $out -Recurse -Force}
[void][IO.Directory]::CreateDirectory($out)
Import-Module (Join-Path $base 'Com.psm1') -Force
Import-Module (Join-Path $base 'NativeLayoutEngine.psm1') -Force
Import-Module (Join-Path $base 'HybridPayload.psm1') -Force
# Strict object-XML Value decoding (Run51 Base64 UTF-8) and ordinal equality.
Import-Module (Join-Path $PSScriptRoot 'ParagraphXmlValue.psm1') -Force
Add-Type -Path (Join-Path $base 'ComMetadata.cs')
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$verdictTool=Join-Path $PSScriptRoot 'paragraph-contract-verdict.cjs'
$designerSha='73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B'
$getterNames=@('Type','Name','Value','X','Y','Width','Height','RotationAngle','FontName','FontSize','FontScale','FontBold','FontItalic','DoNotPrint')
# ASCII words only: no font fallback, deterministic break opportunities.
# ~46 chars: about 80 mm single line at Arial 8 pt, inside the proven 100 mm page.
$longText='PARAGRAPH WRAP PROBE ALPHA BRAVO CHARLIE DELTA'
$shortText='SHORT LABEL'
$twoParagraph='FIRST PARAGRAPH LINE'+[char]13+[char]10+'SECOND PARAGRAPH LINE'

$result=[ordered]@{
 schema='lwb-native-paragraph-discovery-v1';commit=$env:GITHUB_SHA;runId=$env:GITHUB_RUN_ID
 status='STARTED';productAcceptance='NOT_COMPLETE';rendererCertified=$false
 policy='Documented typed setters and proven sparse payload import only. No SetXML, no GetProperty/SetProperty, no Create(5), no BTC/BTW scan.'
 longText=$longText;runtime=[ordered]@{};enum=[ordered]@{};designerBase=[ordered]@{};ownership=[ordered]@{allOwned=$true;pids=@()}
 phases=[ordered]@{};peers=[ordered]@{};target=[ordered]@{};steps=@();challenge=[ordered]@{status='NOT_RUN'};cold=[ordered]@{status='NOT_RUN'}
 installedTemplateInventory=[ordered]@{status='NOT_RUN'};peerAudits=@();hardFailures=@();errors=@()
}
$app=$null;$formats=$null;$doc=$null;$objects=$null;$wd=$null
$script:ownedPids=@();$script:peerMap=@{};$script:targetName=$null;$script:lastCleanReason=$null
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
function Read-PeerState([string]$name){$p=Find-O $name;try{$v=$null;try{$v=[string](Com\Read-Property $p 'Value')}catch{$v='<VALUE_UNREADABLE>'};return [ordered]@{xml=(Get-X $p);value=$v}}finally{Release-C $p}}
function Snapshot-Peers($names){$m=@{};foreach($name in @($names)){$m[$name]=Read-PeerState $name};return $m}
function Audit-Peers([string]$tag){
 foreach($name in @($script:peerMap.Keys)){
  $now=Read-PeerState $name;$was=$script:peerMap[$name]
  $ok=((Test-OrdinalEqual ([string]$now.xml) ([string]$was.xml)) -and (Test-OrdinalEqual ([string]$now.value) ([string]$was.value)))
  $result.peerAudits+=,[ordered]@{tag=$tag;name=$name;status=$(if($ok){'EXACT'}else{'CHANGED'})}
  if(-not $ok){$safe=($name -replace '[^A-Za-z0-9_-]','_');Save-T ([string]$was.xml) ('peer-'+$tag+'-'+$safe+'-before.xml');Save-T ([string]$now.xml) ('peer-'+$tag+'-'+$safe+'-after.xml');Hard ('PEER_CONTAMINATION:'+$tag+':'+$name)}
 }
}
# Clean-text rule now lives in ParagraphXmlValue.psm1 (strict Base64 UTF-8 decode).
function Test-CleanText([string]$xmlText){$why=$null;$r=Test-CleanTextXml $xmlText ([ref]$why);if($null -eq $r){$script:lastCleanReason=$why};return $r}
# Flatten XML into path -> value to report exactly which native fields appeared.
function Get-FieldMap([string]$xmlText){
 $d=New-Object Xml.XmlDocument;$d.LoadXml($xmlText);$m=New-Object System.Collections.Hashtable ([StringComparer]::Ordinal)
 function Visit($n,[string]$p){
  foreach($a in @($n.Attributes)){$m[$p+'/@'+$a.Name]=$a.Value}
  $seen=@{}
  foreach($c in @($n.ChildNodes)){
   if($c -is [Xml.XmlElement]){$k=$c.LocalName;if(-not $seen.ContainsKey($k)){$seen[$k]=0};$seen[$k]++;Visit $c ($p+'/'+$k+'['+$seen[$k]+']')}
   elseif($c -is [Xml.XmlText]){$m[$p+'/#text']=$c.Value}
  }
 }
 Visit $d.DocumentElement ('/'+$d.DocumentElement.LocalName)
 return $m
}
function Get-FieldDiff([string]$a,[string]$b){
 $x=Get-FieldMap $a;$y=Get-FieldMap $b;$added=@();$removed=@();$changed=@()
 foreach($k in @($y.Keys|Sort-Object)){if(-not $x.ContainsKey($k)){$added+=,[ordered]@{field=$k;value=$y[$k]}}elseif(-not (Test-OrdinalEqual ([string]$x[$k]) ([string]$y[$k]))){$changed+=,[ordered]@{field=$k;before=$x[$k];after=$y[$k]}}}
 foreach($k in @($x.Keys|Sort-Object)){if(-not $y.ContainsKey($k)){$removed+=,[ordered]@{field=$k;value=$x[$k]}}}
 return [ordered]@{added=$added;removed=$removed;changed=$changed}
}
function Invoke-Setter([string]$label,[string]$property,$requested){
 Stage ('step-'+$label)
 $o=Find-O $script:targetName
 try{
  $row=[ordered]@{label=$label;kind='setter';property=$property;requested=$requested;status='NOT_RUN';actual=$null;error=$null}
  $xb=Get-X $o;Save-T $xb ('step-'+$label+'-before.xml');$row.gettersBefore=Read-Getters $o
  try{Com\Write-Property $o $property $requested;$row.status='WROTE'}catch{$row.status='WRITE_REFUSED';$row.error=Get-Err $_.Exception}
  $row.gettersAfter=Read-Getters $o
  if($row.gettersAfter[$property].ok){$row.actual=$row.gettersAfter[$property].value}
  $xa=Get-X $o;Save-T $xa ('step-'+$label+'-after.xml');$row.xmlDiff=Get-FieldDiff $xb $xa
  $row.bmp=Export-Bmp $o ('step-'+$label+'.bmp')
 }finally{Release-C $o}
 $result.steps+=,$row;Save-J $result (Join-Path $out 'paragraph-contract-report.json')
 Audit-Peers ('step-'+$label);Done ('step-'+$label)
 return $row
}
# Exported literal decoded with the same reader settings as HybridPayload.psm1
# (XmlReader.Create normalizes raw CRLF to LF per XML spec; base64 is exact).
function Get-ExportLiteral([string]$exportText,[string]$name){
 $set=New-Object Xml.XmlReaderSettings;$set.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$set.XmlResolver=$null
 $rd=[Xml.XmlReader]::Create((New-Object IO.StringReader($exportText)),$set)
 try{$d=New-Object Xml.XmlDocument;$d.XmlResolver=$null;$d.PreserveWhitespace=$true;$d.Load($rd)}finally{$rd.Dispose()}
 $rows=@($d.SelectNodes('/Command/DataMerge/Object')|Where-Object{Test-OrdinalEqual $_.GetAttribute('Name') $name})
 if($rows.Count -ne 1){return $null};$v=@($rows[0].SelectNodes('./SubString/Value'));if($v.Count -ne 1){return $null}
 if($v[0].HasAttribute('Encoding')){if($v[0].GetAttribute('Encoding') -ine 'base64'){return $null};$b=[Convert]::FromBase64String($v[0].InnerText);return [ordered]@{encoding='base64';literal=(New-Object Text.UnicodeEncoding($false,$false,$true)).GetString($b)}}
 return [ordered]@{encoding='raw';literal=$v[0].InnerText}
}
function Set-TargetPayload([string]$text,[string]$tag){
 $o=Find-O $script:targetName
 try{
  $before=Get-X $o;$state=Test-CleanText $before;if($null -eq $state){Hard ('TARGET_NOT_CLEAN_TEXT:'+$tag+':'+$script:lastCleanReason)}
  $com=[string](Com\Read-Property $o 'Value')
  $exportText=[string](Com\Invoke-ComMethod $script:objects 'ExportDataSourceValuesToXML' @())
  $lit=Get-ExportLiteral $exportText $script:targetName;if($null -eq $lit){Hard ('EXPORT_LITERAL_NOT_ONE:'+$tag)}
  $note='EXPORT_LITERAL_EQUALS_VALUE'
  if(-not (Test-OrdinalEqual ([string]$lit.literal) $com)){
   if($lit.encoding -ceq 'raw' -and (Test-OrdinalEqual ([string]$lit.literal) ($com -replace "`r`n","`n"))){$note='EXPORT_RAW_NEWLINE_NORMALIZED_BY_XML_PARSER'}
   else{Hard ('EXPORT_LITERAL_DIFFERS_FROM_VALUE:'+$tag)}
  }
  $exp=New-Object Xml.XmlDocument;$exp.LoadXml($exportText)
  $sparse=New-HybridPayloadImport $exp $script:targetName ([string]$lit.literal) $text
  Save-T $sparse.OuterXml ($tag+'-import.xml')
  if(-not [bool](Com\Invoke-ComMethod $script:objects 'ImportDataSourceValuesFromXML' @($sparse.OuterXml))){Hard ('PAYLOAD_IMPORT_FALSE:'+$tag)}
  $after=Get-X $o;$read=[string](Com\Read-Property $o 'Value');$st=Test-CleanText $after
  $exact=((Test-OrdinalEqual $read $text) -and $null -ne $st -and (Test-OrdinalEqual ([string]$st.value) $text) -and (Test-OrdinalEqual ([string]$st.sourceId) ([string]$state.sourceId)))
  return [ordered]@{xmlBefore=$before;xmlAfter=$after;readback=$read;readbackExact=$exact;exportEncoding=$lit.encoding;exportNote=$note}
 }finally{Release-C $o}
}
function Invoke-Payload([string]$label,[string]$text){
 Stage ('step-'+$label)
 $o=Find-O $script:targetName;try{$gb=Read-Getters $o}finally{Release-C $o}
 $p=Set-TargetPayload $text ('step-'+$label)
 Save-T $p.xmlBefore ('step-'+$label+'-before.xml');Save-T $p.xmlAfter ('step-'+$label+'-after.xml')
 $o=Find-O $script:targetName;try{$ga=Read-Getters $o;$bmp=Export-Bmp $o ('step-'+$label+'.bmp')}finally{Release-C $o}
 $row=[ordered]@{label=$label;kind='payload';property='Value';requested=$text;status='WROTE';actual=$p.readback;readbackExact=$p.readbackExact;gettersBefore=$gb;gettersAfter=$ga;xmlDiff=(Get-FieldDiff $p.xmlBefore $p.xmlAfter);bmp=$bmp}
 $result.steps+=,$row;Save-J $result (Join-Path $out 'paragraph-contract-report.json')
 if(-not $p.readbackExact){Hard ('PAYLOAD_READBACK_MISMATCH:'+$label)}
 Audit-Peers ('step-'+$label);Done ('step-'+$label)
 return $row
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
 $wdArgs='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $base 'Watchdog.ps1')+'" -MainPid '+$PID+' -BarTenderPid '+$pidBt+' -RunDir "'+$out+'" -BaseDirectory "'+$base+'" -StallSeconds 120 -MaxSeconds 420 -BarTenderStartTicks '+$bt.StartTime.ToUniversalTime().Ticks+' -MainStartTicks '+(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
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

$btw=Join-Path $out 'native-paragraph.unverified.btw'
$btExe=$null
try{
 Stage 'open'
 $result.runtime['expectedRunner']='LWB-FTUSER5'
 if(-not [string]::IsNullOrEmpty($env:RUNNER_NAME) -and $env:RUNNER_NAME -cne 'LWB-FTUSER5'){Hard ('UNEXPECTED_RUNNER:'+$env:RUNNER_NAME)}
 $btExe=Open-Owned
 Stage 'enum'
 $enums=@([LabelWorkbench.ComMetadata]::ReadEnums($btExe));Save-J $enums (Join-Path $out 'installed-enums.json')
 $groups=@($enums|Group-Object TypeName|Where-Object{@($_.Group|Where-Object{$_.Value -eq 4 -and $_.Name -match 'BarCode'}).Count -eq 1 -and @($_.Group|Where-Object{$_.Value -eq 5 -and $_.Name -match 'Text'}).Count -eq 1})
 if($groups.Count -ne 1){Hard 'NO_UNIQUE_CREATION_ENUM'}
 $bx=@($groups[0].Group|Where-Object{$_.Name -match 'Box$'})
 $result.enum['boxMatches']=@($bx|ForEach-Object{[ordered]@{Name=$_.Name;Value=[int]$_.Value}})
 if($bx.Count -ne 1 -or [int]$bx[0].Value -ne 3){Hard 'BOX_ENUM_NOT_UNIQUE_3'}
 Done 'enum'

 Stage 'designer-base'
 $pool=Join-Path $out 'designer-source.btw'
 & $node (Join-Path $root 'renderer\materialize-text-pool.cjs') $pool *> (Join-Path $out 'designer-materialize.log')
 $poolSha=$(if(Test-Path -LiteralPath $pool){File-Sha $pool}else{$null})
 $result.designerBase=[ordered]@{expected=$designerSha;actual=$poolSha;shaOk=($LASTEXITCODE -eq 0 -and (Test-OrdinalEqual $poolSha $designerSha))}
 if(-not $result.designerBase.shaOk){Hard 'DESIGNER_BASE_SHA'}
 $script:doc=Com\Invoke-ComMethod $script:formats 'Open' @($pool,$false,'')
 $script:objects=Com\Read-Property $script:doc 'Objects'
 # Keep the first two clean Designer Text slots in document order; delete all else.
 $keep=@();$inventory=@()
 foreach($name in @(Get-Names)){
  $o=Find-O $name
  try{$t=[int](Com\Read-Property $o 'Type');$clean=$false;if($t -eq 5 -and $keep.Count -lt 2){$clean=($null -ne (Test-CleanText (Get-X $o)))}}finally{Release-C $o}
  $inventory+=,[ordered]@{name=$name;type=$t;kept=($clean -and $keep.Count -lt 2)}
  if($clean -and $keep.Count -lt 2){$keep+=,$name}
 }
 $result.designerBase['objectInventory']=$inventory
 if($keep.Count -ne 2){Hard ('CLEAN_TEXT_SLOTS_NOT_TWO:'+$keep.Count)}
 foreach($name in @(Get-Names)){if($name -notin $keep){if(-not [bool](Com\Invoke-ComMethod $script:objects 'Delete' @($name))){Hard ('UNUSED_OBJECT_DELETE:'+$name)}}}
 Com\Write-Property $script:doc 'MeasurementUnits' 3
 & (Get-Module NativeLayoutEngine) {param($d) [void](Set-NativePage $d ([pscustomobject]@{widthMm=100;heightMm=70;printerName=$null}))} $script:doc
 Reacquire-Objects
 $left=@(Get-Names);if($left.Count -ne 2 -or @($left|Where-Object{$_ -notin $keep}).Count -ne 0){Hard 'BASE_NOT_REDUCED_TO_TWO_TEXT_SLOTS'}
 $script:targetName=$keep[0];$textPeer=$keep[1]
 Done 'designer-base'

 Stage 'peers'
 $o=Find-O $textPeer
 try{foreach($kv in @(@('X',10.16),@('Y',50.8))){Com\Write-Property $o $kv[0] $kv[1]};Com\Write-Property $o 'DoNotPrint' $false;$result.peers['textPeer']=[ordered]@{name=$textPeer;bmp=(Export-Bmp $o 'peer-text.bmp')}}finally{Release-C $o}
 $o=Com\Invoke-ComMethod $script:objects 'Create' @([int]$bx[0].Value);$boxName=[string](Com\Read-Property $o 'Name');Release-C $o;Reacquire-Objects
 $o=Find-O $boxName
 try{
  if([int](Com\Read-Property $o 'Type') -ne 3){Hard 'BOX_PEER_TYPE'}
  $bp=[ordered]@{X=60.96;Y=40.64;Width=25.4;Height=12.7;RotationAngle=[double]0;LineThickness=0.508}
  foreach($k in $bp.Keys){Com\Write-Property $o $k $bp[$k]};Com\Write-Property $o 'DoNotPrint' $false
  $result.peers['box']=[ordered]@{name=$boxName;requested=$bp;bmp=(Export-Bmp $o 'peer-box.bmp')}
 }finally{Release-C $o}
 $before=@(Get-Names)
 [void](Com\Invoke-ComMethod $script:doc 'InsertComponent' @((Join-Path $base 'proven-code128.btc'),[double]60.96,[double]55.88))
 Reacquire-Objects;$new=@(@(Get-Names)|Where-Object{$_ -notin $before})
 if($new.Count -ne 1){Hard 'CODE128_INSERT_DELTA_NOT_ONE'}
 $o=Find-O $new[0];try{$result.peers['code128']=[ordered]@{name=$new[0];type=[int](Com\Read-Property $o 'Type');bmp=(Export-Bmp $o 'peer-code128.bmp')}}finally{Release-C $o}
 if($result.peers.code128.type -ne 4){Hard 'CODE128_PEER_TYPE'}
 # Target placement uses the typed setters already proven on Designer Text slots.
 $o=Find-O $script:targetName
 try{
  Com\Write-Property $o 'X' 10.16;Com\Write-Property $o 'Y' 10.16;Com\Write-Property $o 'DoNotPrint' $false;Com\Write-Property $o 'RotationAngle' ([double]0)
  $tx=Get-X $o;Save-T $tx 'target-baseline.xml'
  $result.target=[ordered]@{name=$script:targetName;type=[int](Com\Read-Property $o 'Type');getters=(Read-Getters $o);clean=(Test-CleanText $tx);bmp=(Export-Bmp $o 'target-baseline.bmp')}
 }finally{Release-C $o}
 if($result.target.type -ne 5 -or $null -eq $result.target.clean){Hard 'TARGET_NOT_CLEAN_TEXT5'}
 $script:peerMap=Snapshot-Peers @($textPeer,$boxName,$new[0])
 foreach($name in @($script:peerMap.Keys)){Save-T ([string]$script:peerMap[$name].xml) ('peer-baseline-'+($name -replace '[^A-Za-z0-9_-]','_')+'.xml')}
 Done 'peers'

 # Font contract: typed setters proven on Designer Text slots (Run45/49).
 [void](Invoke-Setter 'font-name' 'FontName' 'Arial')
 [void](Invoke-Setter 'font-size' 'FontSize' ([double]8))
 [void](Invoke-Setter 'font-bold' 'FontBold' $false)
 [void](Invoke-Setter 'font-italic' 'FontItalic' $false)
 # Single-line reference: same text before any Width write.
 [void](Invoke-Payload 'payload-long' $longText)
 # Documented lever: DesignObject.Width (documented to apply to paragraph text).
 # Mil-representable values: 2.000 in, 1.200 in, 0.200 in.
 [void](Invoke-Setter 'width-1' 'Width' 50.8)
 [void](Invoke-Setter 'width-2' 'Width' 30.48)
 # Documented as not applicable to Text; recorded to separate fixed-frame evidence.
 [void](Invoke-Setter 'height-1' 'Height' 5.08)

 Stage 'challenge'
 $o=Find-O $script:targetName;try{$preXml=Get-X $o;Save-T $preXml 'challenge-pre.xml';[void](Export-Bmp $o 'challenge-pre.bmp')}finally{Release-C $o}
 $csteps=@()
 foreach($p in @(@('edit-short',$shortText),@('edit-two-paragraph',$twoParagraph),@('edit-restore',$longText))){
  $r=Set-TargetPayload ([string]$p[1]) ('challenge-'+$p[0])
  Save-T $r.xmlAfter ('challenge-'+$p[0]+'.xml')
  $o=Find-O $script:targetName;try{$fs=$(try{Com\Read-Property $o 'FontSize'}catch{$null});$bmp=Export-Bmp $o ($p[0]+'.bmp')}finally{Release-C $o}
  $csteps+=,[ordered]@{label=$p[0];readbackExact=$r.readbackExact;readback=$r.readback;exportEncoding=$r.exportEncoding;exportNote=$r.exportNote;fontSize=$fs;bmp=$bmp}
  if(-not $r.readbackExact){
   $restoreTry=$null;try{$restoreTry=Set-TargetPayload $longText 'challenge-emergency-restore'}catch{$result.errors+=,(Get-Err $_.Exception)}
   $o=Find-O $script:targetName;try{$emXml=Get-X $o}finally{Release-C $o}
   $result.challenge=[ordered]@{status='DONE';preBmp='challenge-pre.bmp';steps=$csteps;restoreXmlExact=(Test-OrdinalEqual $emXml $preXml);restoreBmpExact=$false;emergencyRestoreAttempted=$true}
   Hard ('CHALLENGE_READBACK_MISMATCH:'+$p[0])
  }
  Audit-Peers ('challenge-'+$p[0])
 }
 $o=Find-O $script:targetName;try{$postXml=Get-X $o}finally{Release-C $o}
 $result.challenge=[ordered]@{status='DONE';preBmp='challenge-pre.bmp';steps=$csteps;restoreXmlExact=(Test-OrdinalEqual $postXml $preXml)
  restoreBmpExact=(Test-OrdinalEqual (File-Sha (Join-Path $out 'edit-restore.bmp')) (File-Sha (Join-Path $out 'challenge-pre.bmp')))}
 if(-not ($result.challenge.restoreXmlExact -and $result.challenge.restoreBmpExact)){Save-T $postXml 'challenge-post.xml';Hard 'CHALLENGE_RESTORE_NOT_EXACT'}
 Done 'challenge'

 Stage 'save'
 [void](Com\Invoke-ComMethod $script:doc 'SaveAs' @($btw,$false))
 $shaBefore=File-Sha $btw
 $o=Find-O $script:targetName
 try{$hotXml=Get-X $o;$hotVal=[string](Com\Read-Property $o 'Value');Save-T $hotXml 'target-hot-postsave.xml';[void](Export-Bmp $o 'target-hot-postsave.bmp')}finally{Release-C $o}
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
 $o=Find-O $script:targetName
 try{$coldXml=Get-X $o;$coldVal=[string](Com\Read-Property $o 'Value');$coldType=[int](Com\Read-Property $o 'Type');$coldGetters=Read-Getters $o;Save-T $coldXml 'target-cold.xml';[void](Export-Bmp $o 'target-cold.bmp')}finally{Release-C $o}
 [void](Com\Invoke-ComMethod $script:doc 'ExportToFile' @((Join-Path $out 'format-cold.bmp'),'BMP',0,600,2))
 $coldPeers=Snapshot-Peers @($script:peerMap.Keys)
 $peerEq=$true
 foreach($k in @($hotPeers.Keys)){
  if(-not $coldPeers.ContainsKey($k) -or -not (Test-OrdinalEqual ([string]$coldPeers[$k].xml) ([string]$hotPeers[$k].xml)) -or -not (Test-OrdinalEqual ([string]$coldPeers[$k].value) ([string]$hotPeers[$k].value))){
   $peerEq=$false;$safe=($k -replace '[^A-Za-z0-9_-]','_');Save-T ([string]$hotPeers[$k].xml) ('cold-peer-hot-'+$safe+'.xml');if($coldPeers.ContainsKey($k)){Save-T ([string]$coldPeers[$k].xml) ('cold-peer-cold-'+$safe+'.xml')}
  }
 }
 $result.cold=[ordered]@{status='DONE';buildPid=$buildPid;coldPid=$coldPid;buildProcessExited=$buildExited;distinctPid=($coldPid -ne $buildPid -and $buildExited)
  targetType=$coldType;targetGetters=$coldGetters;targetXmlEqual=(Test-OrdinalEqual $coldXml $hotXml);targetValueEqual=(Test-OrdinalEqual $coldVal $hotVal)
  targetBmpEqual=(Test-OrdinalEqual (File-Sha (Join-Path $out 'target-cold.bmp')) (File-Sha (Join-Path $out 'target-hot-postsave.bmp')))
  formatBmpEqual=(Test-OrdinalEqual (File-Sha (Join-Path $out 'format-cold.bmp')) (File-Sha (Join-Path $out 'format-hot-postsave.bmp')))
  peerXmlEqual=$peerEq;shaBefore=$shaBefore;shaAfter=$null}
 Close-Owned
 $result.cold.shaAfter=File-Sha $btw
 $c=$result.cold
 if(-not ($c.distinctPid -and $c.targetType -eq 5 -and $c.targetXmlEqual -and $c.targetValueEqual -and $c.targetBmpEqual -and $c.formatBmpEqual -and $c.peerXmlEqual -and (Test-OrdinalEqual $c.shaBefore $c.shaAfter))){Hard 'COLD_REOPEN_OR_SHA_MISMATCH'}
 Done 'cold'
 $result.status='DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE'
}catch{
 $result.status='DISCOVERY_FAILED_CLOSED';$result.errors+=,(Get-Err $_.Exception);$result.errors+=,$_.ScriptStackTrace
}finally{
 try{Close-Owned}catch{$result.errors+=,(Get-Err $_.Exception)}
 $result.ownership.pids=@($script:ownedPids)
 $poolCopy=Join-Path $out 'designer-source.btw';if(Test-Path -LiteralPath $poolCopy){Remove-Item -LiteralPath $poolCopy -Force}
 Save-J $result (Join-Path $out 'paragraph-contract-report.json')
}
# Read-only file listing of vendor-installed BarTender documents/components for a
# future Designer-authored paragraph ground truth. Nothing is opened, parsed or
# loaded into BarTender; only path, size and SHA-256 are recorded (bounded).
try{
 $roots=@();if($btExe){$roots+=,(Split-Path -Parent $btExe)}
 foreach($r in @((Join-Path ([string]$env:ProgramData) 'Seagull Scientific'),(Join-Path ([string]$env:PUBLIC) 'Documents\BarTender'))){if($r -and (Test-Path -LiteralPath $r)){$roots+=,$r}}
 $files=@();$bytes=[long]0
 foreach($r in $roots){foreach($f in @(Get-ChildItem -LiteralPath $r -Recurse -File -ErrorAction SilentlyContinue|Where-Object{$_.Extension -in @('.btw','.btc')}|Select-Object -First 400)){
  if($files.Count -ge 400){break};$h=$null;if($bytes+$f.Length -le 209715200){$h=File-Sha $f.FullName;$bytes+=$f.Length}
  $files+=,[ordered]@{path=$f.FullName;bytes=$f.Length;sha256=$h}}}
 $result.installedTemplateInventory=[ordered]@{status='LISTED_NOT_OPENED';roots=$roots;count=$files.Count;files=$files}
}catch{$result.installedTemplateInventory=[ordered]@{status='FAILED';error=(Get-Err $_.Exception)}}
Save-J $result (Join-Path $out 'paragraph-contract-report.json')
& $node $verdictTool '--verdict' $out *> (Join-Path $out 'paragraph-verdict.log')
$verdictCode=$LASTEXITCODE
if($result.status -ne 'DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE' -or $verdictCode -ne 0){
 if(Test-Path -LiteralPath $btw){Move-Item -LiteralPath $btw -Destination ($btw+'.FAIL_CLOSED') -Force}
 Write-Host ('Native paragraph probe: FAIL_CLOSED status='+$result.status+' verdictExit='+$verdictCode)
 exit 1
}
Write-Host 'Native paragraph probe: DISCOVERY_COMPLETE (renderer capabilities NOT_CERTIFIED)'
exit 0
