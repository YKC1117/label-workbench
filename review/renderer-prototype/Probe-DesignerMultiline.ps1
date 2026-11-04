[CmdletBinding()]
param()
# Run52: Designer-authored multi-line / alignment contract (discovery only).
# Root cause (NATIVE_PARAGRAPH_HANDOFF.md s.9): the SHA-locked Designer base already
# contains two Designer-authored multi-line Text objects ("<TEXT> 30" = RoHS/COMPLIANT,
# "<TEXT> 33" = 120824/C.K. QA ACC) whose Designer preview suggests native CENTER and
# RIGHT alignment. They were never read because earlier probes kept only the first
# clean slots. This probe:
#  A. read-only harvest of every object's GetXML in two SHA-locked Designer documents,
#     with an all-object before/after snapshot and file SHA proof (nothing saved);
#  B. edit challenge on the Designer object itself via the proven sparse payload import,
#     to see whether BarTender's own alignment survives text edits; exact restore,
#     all-object peer audit, Save, distinct-PID cold reopen.
# Prohibited and not used: SetXML, GetProperty/SetProperty, Create(5), binary patching,
# BTC/BTW scanning, typed Width/Height writes on Text.
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$base=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
$out=Join-Path $PSScriptRoot 'runner-evidence\designer-multiline'
if(Test-Path -LiteralPath $out){Remove-Item -LiteralPath $out -Recurse -Force}
[void][IO.Directory]::CreateDirectory($out)
Import-Module (Join-Path $base 'Com.psm1') -Force
Import-Module (Join-Path $base 'HybridPayload.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ParagraphXmlValue.psm1') -Force
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$verdictTool=Join-Path $PSScriptRoot 'multiline-contract-verdict.cjs'
$designerSha='73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B'
$originalPath=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\evidence\original-template.btw'
$originalSha='4CF9FDAD67CB27AA79AA57FF2BFF5912463608D8F509067112EB940BDEE49612'
# Object names are built from code points so the file stays ASCII (PS 5.1 ANSI read).
$TX=[string][char]0x6587+[char]0x5B57+' '
$targetNames=@(($TX+'30'),($TX+'33'))
$referenceNames=@(($TX+'1'),($TX+'29'),($TX+'31'),($TX+'32'))
$editTarget=$TX+'33'
$crlf=[string][char]13+[char]10
$editPlan=@(@('short-first',('A'+$crlf+'LONGER SECOND LINE TEXT')),@('long-first',('LONGER FIRST LINE TEXT'+$crlf+'B')))
$getterNames=@('Type','Name','Value','X','Y','Width','Height','RotationAngle','FontName','FontSize','FontScale','FontBold','FontItalic','DoNotPrint')

$result=[ordered]@{
 schema='lwb-designer-multiline-discovery-v1';commit=$env:GITHUB_SHA;runId=$env:GITHUB_RUN_ID
 status='STARTED';productAcceptance='NOT_COMPLETE';rendererCertified=$false
 policy='Read-only harvest plus proven sparse payload import on an existing Designer object. No SetXML, no dynamic property names, no typed geometry writes on Text, no Create(5), no scanning.'
 runtime=[ordered]@{};ownership=[ordered]@{allOwned=$true;pids=@()};phases=[ordered]@{}
 harvest=@();edit=[ordered]@{status='NOT_RUN'};cold=[ordered]@{status='NOT_RUN'};peerAudits=@();hardFailures=@();errors=@()
}
$app=$null;$formats=$null;$doc=$null;$objects=$null;$wd=$null
$script:ownedPids=@();$script:peerMap=@{};$script:lastCleanReason=$null
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
function Read-Getters($o){$g=[ordered]@{};foreach($k in $getterNames){try{$g[$k]=[ordered]@{ok=$true;value=(Com\Read-Property $o $k)}}catch{$g[$k]=[ordered]@{ok=$false;error=(Get-Err $_.Exception)}}};return $g}
function Test-HasName($list,[string]$name){foreach($x in @($list)){if(Test-OrdinalEqual ([string]$x) $name){return $true}};return $false}
function Get-Names(){$names=@();$n=[int](Com\Read-Property $script:objects 'Count');for($i=1;$i -le $n;$i++){$o=Com\Invoke-ComMethod $script:objects 'Item' @($i);try{$names+=,[string](Com\Read-Property $o 'Name')}finally{Release-C $o}};return $names}
function Read-State([string]$name){$p=Find-O $name;try{$v=$null;try{$v=[string](Com\Read-Property $p 'Value')}catch{$v='<VALUE_UNREADABLE>'};return [ordered]@{xml=(Get-X $p);value=$v}}finally{Release-C $p}}
function Snapshot([string[]]$names){$m=New-Object System.Collections.Hashtable ([StringComparer]::Ordinal);foreach($n in @($names)){$m[$n]=Read-State $n};return $m}
function Compare-Snapshots($a,$b){
 if($a.Count -ne $b.Count){return $false}
 foreach($k in @($a.Keys)){if(-not $b.ContainsKey($k)){return $false};if(-not (Test-OrdinalEqual ([string]$a[$k].xml) ([string]$b[$k].xml)) -or -not (Test-OrdinalEqual ([string]$a[$k].value) ([string]$b[$k].value))){return $false}}
 return $true
}
function Audit-Peers([string]$tag){
 foreach($name in @($script:peerMap.Keys)){
  $now=Read-State $name;$was=$script:peerMap[$name]
  $ok=((Test-OrdinalEqual ([string]$now.xml) ([string]$was.xml)) -and (Test-OrdinalEqual ([string]$now.value) ([string]$was.value)))
  $result.peerAudits+=,[ordered]@{tag=$tag;name=$name;status=$(if($ok){'EXACT'}else{'CHANGED'})}
  if(-not $ok){$i=[array]::IndexOf(@($script:peerMap.Keys),$name);Save-T ([string]$was.xml) ('peer-'+$tag+'-'+$i+'-before.xml');Save-T ([string]$now.xml) ('peer-'+$tag+'-'+$i+'-after.xml');Hard ('PEER_CONTAMINATION:'+$tag+':'+$i)}
 }
}
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
function Get-ExportLiteral([string]$exportText,[string]$name){
 $set=New-Object Xml.XmlReaderSettings;$set.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$set.XmlResolver=$null
 $rd=[Xml.XmlReader]::Create((New-Object IO.StringReader($exportText)),$set)
 try{$d=New-Object Xml.XmlDocument;$d.XmlResolver=$null;$d.PreserveWhitespace=$true;$d.Load($rd)}finally{$rd.Dispose()}
 $rows=@($d.SelectNodes('/Command/DataMerge/Object')|Where-Object{Test-OrdinalEqual $_.GetAttribute('Name') $name})
 if($rows.Count -ne 1){return $null};$subs=@($rows[0].SelectNodes('./SubString'));if($subs.Count -ne 1){return $null}
 $v=@($subs[0].SelectNodes('./Value'));if($v.Count -ne 1){return $null}
 if($v[0].HasAttribute('Encoding')){if($v[0].GetAttribute('Encoding') -ine 'base64'){return $null};$b=[Convert]::FromBase64String($v[0].InnerText);return [ordered]@{encoding='base64';literal=(New-Object Text.UnicodeEncoding($false,$false,$true)).GetString($b)}}
 return [ordered]@{encoding='raw';literal=$v[0].InnerText}
}
function Set-TargetPayload([string]$name,[string]$text,[string]$tag){
 $o=Find-O $name
 try{
  $before=Get-X $o;$why=$null;$state=Test-CleanTextXml $before ([ref]$why);if($null -eq $state){Hard ('TARGET_NOT_CLEAN_TEXT:'+$tag+':'+$why)}
  $com=[string](Com\Read-Property $o 'Value')
  if(-not (Test-OrdinalEqual ([string]$state.value) $com)){Hard ('XML_VALUE_DIFFERS_FROM_COM_VALUE:'+$tag)}
  $exportText=[string](Com\Invoke-ComMethod $script:objects 'ExportDataSourceValuesToXML' @())
  $lit=Get-ExportLiteral $exportText $name;if($null -eq $lit){Hard ('EXPORT_LITERAL_NOT_ONE:'+$tag)}
  $note='EXPORT_LITERAL_EQUALS_VALUE'
  if(-not (Test-OrdinalEqual ([string]$lit.literal) $com)){
   if($lit.encoding -ceq 'raw' -and (Test-OrdinalEqual ([string]$lit.literal) ($com -replace "`r`n","`n"))){$note='EXPORT_RAW_NEWLINE_NORMALIZED_BY_XML_PARSER'}else{Hard ('EXPORT_LITERAL_DIFFERS_FROM_VALUE:'+$tag)}
  }
  $exp=New-Object Xml.XmlDocument;$exp.LoadXml($exportText)
  $sparse=New-HybridPayloadImport $exp $name ([string]$lit.literal) $text
  Save-T $sparse.OuterXml ($tag+'-import.xml')
  if(-not [bool](Com\Invoke-ComMethod $script:objects 'ImportDataSourceValuesFromXML' @($sparse.OuterXml))){Hard ('PAYLOAD_IMPORT_FALSE:'+$tag)}
  $after=Get-X $o;$read=[string](Com\Read-Property $o 'Value');$why2=$null;$st=Test-CleanTextXml $after ([ref]$why2)
  $exact=((Test-OrdinalEqual $read $text) -and $null -ne $st -and (Test-OrdinalEqual ([string]$st.value) $text) -and (Test-OrdinalEqual ([string]$st.sourceId) ([string]$state.sourceId)))
  return [ordered]@{xmlAfter=$after;readback=$read;readbackExact=$exact;exportEncoding=$lit.encoding;exportNote=$note;afterReason=$why2}
 }finally{Release-C $o}
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
 $wdArgs='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $base 'Watchdog.ps1')+'" -MainPid '+$PID+' -BarTenderPid '+$pidBt+' -RunDir "'+$out+'" -BaseDirectory "'+$base+'" -StallSeconds 120 -MaxSeconds 480 -BarTenderStartTicks '+$bt.StartTime.ToUniversalTime().Ticks+' -MainStartTicks '+(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
 $script:wd=Start-Process -FilePath $exe -ArgumentList $wdArgs -PassThru -WindowStyle Hidden
 return [string]$bt.Path
}
function Close-Doc {Release-C $script:objects;$script:objects=$null;if($null -ne $script:doc){[void](Com\Invoke-ComMethod $script:doc 'Close' @(1));Release-C $script:doc;$script:doc=$null}}
function Close-Owned {
 Close-Doc;Release-C $script:formats;$script:formats=$null
 if($null -ne $script:app){[void](Com\Invoke-ComMethod $script:app 'Quit' @(1));Release-C $script:app;$script:app=$null}
 if($null -ne $script:wd){if(-not $script:wd.HasExited){$script:wd.Kill()};$script:wd=$null}
}
function Open-Doc([string]$path){$script:doc=Com\Invoke-ComMethod $script:formats 'Open' @($path,$false,'');Com\Write-Property $script:doc 'MeasurementUnits' 3;$script:objects=Com\Read-Property $script:doc 'Objects'}
function Invoke-Harvest([string]$label,[string]$path,[string]$expectedSha){
 Stage ('harvest-'+$label)
 $sha=File-Sha $path
 $h=[ordered]@{label=$label;sha256=$sha;expectedSha256=$expectedSha;shaOk=(Test-OrdinalEqual $sha $expectedSha);targetNames=$targetNames;referenceNames=$referenceNames;objects=@();integrity=[ordered]@{}}
 if(-not $h.shaOk){$result.harvest+=,$h;Hard ('SOURCE_SHA:'+$label)}
 Open-Doc $path
 try{
  $names=@(Get-Names);$before=Snapshot $names;$i=0
  foreach($n in $names){
   $i++;$o=Find-O $n
   try{
    $x=Get-X $o;$file='harvest-'+$label+'-obj-'+$i.ToString('00')+'.xml';Save-T $x $file
    $d=New-Object Xml.XmlDocument;$d.LoadXml($x);$ds=$d.SelectSingleNode('/*/*[local-name()="DataSources"]')
    $row=[ordered]@{index=$i;name=$n;root=$d.DocumentElement.LocalName;type=[int](Com\Read-Property $o 'Type');xml=$file;value=([string]$before[$n].value)
     dataSourceCount=$(if($null -ne $ds){@($ds.ChildNodes|Where-Object{$_ -is [Xml.XmlElement]}).Count}else{0});fieldMap=(Get-FieldMap $x)}
    $why=$null;$clean=Test-CleanTextXml $x ([ref]$why);$row['cleanText']=($null -ne $clean);$row['cleanReason']=$why
    if(Test-HasName @($targetNames+$referenceNames) $n){$row['getters']=Read-Getters $o;$row['bmp']=Export-Bmp $o ('harvest-'+$label+'-obj-'+$i.ToString('00')+'.bmp')}
    $h.objects+=,$row
   }finally{Release-C $o}
  }
  $after=Snapshot @(Get-Names)
  $h.integrity=[ordered]@{snapshotEqual=(Compare-Snapshots $before $after);objectCount=$names.Count;shaBefore=$sha;shaAfter=$null}
 }finally{Close-Doc}
 $h.integrity.shaAfter=File-Sha $path
 $result.harvest+=,$h;Save-J $result (Join-Path $out 'multiline-contract-report.json')
 if(-not ($h.integrity.snapshotEqual -and (Test-OrdinalEqual $h.integrity.shaBefore $h.integrity.shaAfter))){Hard ('READ_ONLY_HARVEST_NOT_PROVEN:'+$label)}
 Done ('harvest-'+$label)
}

$btw=Join-Path $out 'designer-multiline.unverified.btw'
try{
 Stage 'open'
 $result.runtime['expectedRunner']='LWB-FTUSER5'
 if(-not [string]::IsNullOrEmpty($env:RUNNER_NAME) -and $env:RUNNER_NAME -cne 'LWB-FTUSER5'){Hard ('UNEXPECTED_RUNNER:'+$env:RUNNER_NAME)}
 [void](Open-Owned)
 $pool=Join-Path $out 'designer-source.btw'
 & $node (Join-Path $root 'renderer\materialize-text-pool.cjs') $pool *> (Join-Path $out 'designer-materialize.log')
 if($LASTEXITCODE -ne 0){Hard 'DESIGNER_BASE_MATERIALIZE'}
 # Read-only copies: the repository file and the materialized base are never opened.
 $harvestBase=Join-Path $out 'harvest-designer-base.btw';Copy-Item -LiteralPath $pool -Destination $harvestBase -Force
 $harvestOrig=Join-Path $out 'harvest-original-template.btw';Copy-Item -LiteralPath $originalPath -Destination $harvestOrig -Force
 Invoke-Harvest 'designer-base' $harvestBase $designerSha
 Invoke-Harvest 'original-template' $harvestOrig $originalSha

 Stage 'edit'
 $work=Join-Path $out 'edit-work.btw';Copy-Item -LiteralPath $pool -Destination $work -Force
 if(-not (Test-OrdinalEqual (File-Sha $work) $designerSha)){Hard 'EDIT_WORK_SHA'}
 Open-Doc $work
 $names=@(Get-Names)
 if(-not (Test-HasName $names $editTarget)){$result.edit=[ordered]@{status='NOT_RUN';reason='EDIT_TARGET_ABSENT'}}
 else{
  $o=Find-O $editTarget;try{$tx=Get-X $o;$why=$null;$eligible=Test-CleanTextXml $tx ([ref]$why)}finally{Release-C $o}
  if($null -eq $eligible){$result.edit=[ordered]@{status='NOT_RUN';reason=('EDIT_TARGET_NOT_CLEAN:'+$why)}}
  else{
   $script:peerMap=Snapshot @($names|Where-Object{-not (Test-OrdinalEqual $_ $editTarget)})
   $o=Find-O $editTarget;try{$orig=[string](Com\Read-Property $o 'Value');$preXml=Get-X $o;Save-T $preXml 'edit-baseline.xml';$steps=@(,[ordered]@{label='baseline';readbackExact=$true;getters=(Read-Getters $o);bmp=(Export-Bmp $o 'edit-baseline.bmp')})}finally{Release-C $o}
   $result.edit=[ordered]@{status='STARTED';target=$editTarget;originalValueLength=$orig.Length;steps=$steps}
   foreach($p in @($editPlan+@(,@('restore',$orig)))){
    $r=Set-TargetPayload $editTarget ([string]$p[1]) ('edit-'+$p[0])
    Save-T $r.xmlAfter ('edit-'+$p[0]+'.xml')
    $o=Find-O $editTarget;try{$g=Read-Getters $o;$bmp=Export-Bmp $o ('edit-'+$p[0]+'.bmp')}finally{Release-C $o}
    $label=$(if($p[0] -ceq 'restore'){'restore'}else{'edit-'+[string]$p[0]})
    $steps+=,[ordered]@{label=$label;readbackExact=$r.readbackExact;exportEncoding=$r.exportEncoding;exportNote=$r.exportNote;getters=$g;bmp=$bmp}
    $result.edit.steps=$steps;Save-J $result (Join-Path $out 'multiline-contract-report.json')
    if(-not $r.readbackExact){Hard ('EDIT_READBACK_MISMATCH:'+$p[0])}
    Audit-Peers ('edit-'+$p[0])
   }
   $o=Find-O $editTarget;try{$postXml=Get-X $o}finally{Release-C $o}
   $result.edit.restoreXmlExact=(Test-OrdinalEqual $postXml $preXml)
   $result.edit.restoreBmpExact=(Test-OrdinalEqual (File-Sha (Join-Path $out 'edit-restore.bmp')) (File-Sha (Join-Path $out 'edit-baseline.bmp')))
   $result.edit.status='DONE'
   if(-not ($result.edit.restoreXmlExact -and $result.edit.restoreBmpExact)){Save-T $postXml 'edit-post-restore.xml';Hard 'EDIT_RESTORE_NOT_EXACT'}
   Done 'edit'

   Stage 'save'
   [void](Com\Invoke-ComMethod $script:doc 'SaveAs' @($btw,$false));$shaBefore=File-Sha $btw
   $o=Find-O $editTarget;try{$hotXml=Get-X $o;$hotVal=[string](Com\Read-Property $o 'Value');[void](Export-Bmp $o 'target-hot-postsave.bmp')}finally{Release-C $o}
   [void](Com\Invoke-ComMethod $script:doc 'ExportToFile' @((Join-Path $out 'format-hot-postsave.bmp'),'BMP',0,600,2))
   $hotPeers=Snapshot @($script:peerMap.Keys);Audit-Peers 'post-save'
   $buildPid=$script:ownedPids[-1];Done 'save'

   Stage 'cold'
   Close-Owned
   for($w=0;$w -lt 25;$w++){if($null -eq (Get-Process -Id $buildPid -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 200}
   $buildExited=($null -eq (Get-Process -Id $buildPid -ErrorAction SilentlyContinue))
   [void](Open-Owned);$coldPid=$script:ownedPids[-1];Open-Doc $btw
   $o=Find-O $editTarget;try{$coldXml=Get-X $o;$coldVal=[string](Com\Read-Property $o 'Value');$coldType=[int](Com\Read-Property $o 'Type');[void](Export-Bmp $o 'target-cold.bmp')}finally{Release-C $o}
   [void](Com\Invoke-ComMethod $script:doc 'ExportToFile' @((Join-Path $out 'format-cold.bmp'),'BMP',0,600,2))
   $coldPeers=Snapshot @($script:peerMap.Keys)
   $result.cold=[ordered]@{status='DONE';buildPid=$buildPid;coldPid=$coldPid;buildProcessExited=$buildExited;distinctPid=($coldPid -ne $buildPid -and $buildExited)
    targetType=$coldType;targetXmlEqual=(Test-OrdinalEqual $coldXml $hotXml);targetValueEqual=(Test-OrdinalEqual $coldVal $hotVal)
    targetBmpEqual=(Test-OrdinalEqual (File-Sha (Join-Path $out 'target-cold.bmp')) (File-Sha (Join-Path $out 'target-hot-postsave.bmp')))
    formatBmpEqual=(Test-OrdinalEqual (File-Sha (Join-Path $out 'format-cold.bmp')) (File-Sha (Join-Path $out 'format-hot-postsave.bmp')))
    peerXmlEqual=(Compare-Snapshots $hotPeers $coldPeers);shaBefore=$shaBefore;shaAfter=$null}
   Close-Owned
   $result.cold.shaAfter=File-Sha $btw
   $c=$result.cold
   if(-not ($c.distinctPid -and $c.targetType -eq 5 -and $c.targetXmlEqual -and $c.targetValueEqual -and $c.targetBmpEqual -and $c.formatBmpEqual -and $c.peerXmlEqual -and (Test-OrdinalEqual $c.shaBefore $c.shaAfter))){Hard 'COLD_REOPEN_OR_SHA_MISMATCH'}
   Done 'cold'
  }
 }
 $result.status='DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE'
}catch{
 $result.status='DISCOVERY_FAILED_CLOSED';$result.errors+=,(Get-Err $_.Exception);$result.errors+=,$_.ScriptStackTrace
}finally{
 try{Close-Owned}catch{$result.errors+=,(Get-Err $_.Exception)}
 $result.ownership.pids=@($script:ownedPids)
 # Reproducible copies of committed inputs are not evidence; their SHA is recorded.
 foreach($n in @('designer-source.btw','harvest-designer-base.btw','harvest-original-template.btw','edit-work.btw')){$p=Join-Path $out $n;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
 Save-J $result (Join-Path $out 'multiline-contract-report.json')
}
& $node $verdictTool '--verdict' $out *> (Join-Path $out 'multiline-verdict.log')
$verdictCode=$LASTEXITCODE
if($result.status -ne 'DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE' -or $verdictCode -ne 0){
 if(Test-Path -LiteralPath $btw){Move-Item -LiteralPath $btw -Destination ($btw+'.FAIL_CLOSED') -Force}
 Write-Host ('Designer multiline probe: FAIL_CLOSED status='+$result.status+' verdictExit='+$verdictCode)
 exit 1
}
Write-Host 'Designer multiline probe: DISCOVERY_COMPLETE (renderer capabilities NOT_CERTIFIED)'
exit 0
