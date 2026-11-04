# OFFLINE LOGIC DRY-RUN ONLY. Simulated objects; NOT BarTender behaviour, never evidence.
# Formats mirror real observations: object GetXML uses <Value Encoding="Base64"> (UTF-8)
# for CR/LF values (Run51); DataMerge export uses Encoding="base64" UTF-16LE (repo evidence).
if($null -eq $global:MMock){$global:MMock=@{alignOnEdit=$null;contaminate=$false;restoreDrift=$false;transform33=$false;harvestMutate=$false}}
$TX=[string][char]0x6587+[char]0x5B57+' '
function New-MObj($type,$name,$values,$align){[pscustomobject]@{Kind='Obj';Props=[ordered]@{Type=$type;Name=$name;Values=@($values);Align=$align;FontSize=8.0;FontName='Arial';X=0.0;Y=0.0;Width=40.0;Height=5.0;RotationAngle=0.0;FontScale=100.0;FontBold=$false;FontItalic=$false;DoNotPrint=$false;Extra='';Sid=@($values|%{[guid]::NewGuid().ToString('B').ToUpper()})}}}
function Get-Pool(){
 $o=@();for($i=1;$i -le 33;$i++){$v=@('T'+$i);$a='Left';if($i -eq 30){$v=@(('RoHS'+[char]13),'COMPLIANT');$a='Center'};if($i -eq 33){$v=@((' '*12)+'120824'+[char]13+'C.K.   QA  ACC');$a='Right'};$o+=,(New-MObj 5 ($TX+$i) $v $a)}
 for($i=1;$i -le 6;$i++){$o+=,(New-MObj 4 ([string][char]0x689D+[char]0x78BC+' '+$i) @('123') 'Left')};return $o}
function Joined($p){return (@($p.Values) -join '')}
function Value-Xml([string]$v){if($v -match "[`r`n]"){return '<Value Encoding="Base64">'+[Convert]::ToBase64String((New-Object Text.UTF8Encoding($false)).GetBytes($v))+'</Value>'};return '<Value>'+[Security.SecurityElement]::Escape($v)+'</Value>'}
function Xml-Of($o){$p=$o.Props;$root=$(if([int]$p.Type -eq 5){'Text'}else{'BarCode-Code-128'})
 $al=$(if($p.Align -ne 'Left'){' MockAlign="'+$p.Align+'"'}else{''})
 $ds=(@(0..(@($p.Values).Count-1))|%{$tr=$(if($global:MMock.transform33 -and $p.Name -eq ($TX+'33')){'<Transforms><PrefixTransform/></Transforms>'}else{''});'<EmbeddedDataSource ID="'+$p.Sid[$_]+'" SubStringListStringID="4294967295">'+$tr+(Value-Xml ([string]$p.Values[$_]))+'</EmbeddedDataSource>'}) -join ''
 '<'+$root+' Name="'+$p.Name+'" Width="1.850 in"'+$al+$p.Extra+'><Tabs/><Font PointSize="'+$p.FontSize+'" FontName="Arial"/><AutoFit MinAdjustment="0.00" MaxAdjustment="0.00"/><DataSources>'+$ds+'</DataSources></'+$root+'>'}
function Write-Bmp($path,[int]$w,[int]$h,$rects){$stride=[int]([math]::Ceiling($w*3/4.0)*4);$b=New-Object byte[] (54+$stride*$h);for($i=54;$i -lt $b.Length;$i++){$b[$i]=255};$b[0]=66;$b[1]=77
 [BitConverter]::GetBytes([int]$b.Length).CopyTo($b,2);[BitConverter]::GetBytes(54).CopyTo($b,10);[BitConverter]::GetBytes(40).CopyTo($b,14);[BitConverter]::GetBytes($w).CopyTo($b,18);[BitConverter]::GetBytes(-$h).CopyTo($b,22);[BitConverter]::GetBytes([int16]1).CopyTo($b,26);[BitConverter]::GetBytes([int16]24).CopyTo($b,28)
 foreach($r in $rects){for($y=$r[1];$y -lt $r[1]+$r[3] -and $y -lt $h;$y++){$o=54+$y*$stride+$r[0]*3;$n=[math]::Min($r[2],$w-$r[0])*3;if($n -gt 0){[Array]::Clear($b,$o,$n)}}};[IO.File]::WriteAllBytes($path,$b)}
function Render($o,$path){$p=$o.Props;$px=600/25.4;$cw=1.6;$lh=3.0;$pitch=4.0
 $lines=@((Joined $p) -split "`r`n|`r|`n"|%{$_.Trim()});$align=$p.Align;if($global:MMock.alignOnEdit -and $p.Name -eq ($TX+'33') -and (Joined $p) -notmatch '120824'){$align=$global:MMock.alignOnEdit}
 $wmm=(($lines|%{$_.Length}|Measure-Object -Maximum).Maximum)*$cw;$W=[int]([math]::Ceiling($wmm*$px))+2;$rects=@();$i=0
 foreach($l in $lines){$lw=[int]($l.Length*$cw*$px);$x=$(switch($align){'Center'{[int](($W-2-$lw)/2)}'Right'{$W-2-$lw}default{0}});$rects+=,@([math]::Max(0,$x),[int]($i*$pitch*$px),$lw,[int]($lh*$px));$i++}
 Write-Bmp $path $W ([int]([math]::Ceiling($lines.Count*$pitch*$px))+2) $rects}
function Read-Property($t,[string]$name,[object[]]$arguments=@()){
 switch($t.Kind){'App'{switch($name){'ProcessID'{return $t.Pid};'Formats'{return [pscustomobject]@{Kind='Formats'}};default{return 'mock'}}}
  'Doc'{if($name -eq 'Objects'){return [pscustomobject]@{Kind='Objects';Doc=$t}};throw "doc prop $name"}
  'Objects'{if($name -eq 'Count'){return $t.Doc.Objects.Count};throw}
  'Obj'{if($name -eq 'Value'){return (Joined $t.Props)};if(-not $t.Props.Contains($name)){throw "no prop $name"};return $t.Props[$name]}}}
function Write-Property($t,[string]$name,$value,[object[]]$indices=@()){if($t.Kind -eq 'Obj'){$t.Props[$name]=$value}}
function Invoke-ComMethod($t,[string]$name,[object[]]$arguments=@()){
 switch($t.Kind){
  'Formats'{$path=[string]$arguments[0]
    if($path -like '*.unverified.btw'){$objs=@((Get-Content $path -Raw|ConvertFrom-Json)|%{$o=New-MObj 0 '' @('') 'Left';foreach($pp in $_.PSObject.Properties){$o.Props[$pp.Name]=$pp.Value};$o.Props.Values=@($o.Props.Values);$o.Props.Sid=@($o.Props.Sid);$o})}else{$objs=Get-Pool}
    foreach($o in $objs){$o.Props['DocPath']=$path};return [pscustomobject]@{Kind='Doc';Objects=[System.Collections.ArrayList]@($objs)}}
  'Doc'{switch($name){'SaveAs'{($t.Objects|%{$_.Props})|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $arguments[0];return};'ExportToFile'{Write-Bmp $arguments[0] 30 10 @(,@(1,1,($t.Objects.Count),3));return};'Close'{return};default{throw "doc $name"}}}
  'Objects'{$objs=$t.Doc.Objects;switch($name){
    'Item'{return $objs[[int]$arguments[0]-1]};'Find'{return @($objs|?{$_.Props.Name -ceq [string]$arguments[0]})[0]}
    'ExportDataSourceValuesToXML'{$u=New-Object Text.UnicodeEncoding($false,$false);return '<Command><DataMerge>'+(($objs|%{$p=$_.Props;'<Object Name="'+$p.Name+'">'+((@(0..(@($p.Values).Count-1))|%{'<SubString Position="'+$_+'"><Value Encoding="base64">'+[Convert]::ToBase64String($u.GetBytes([string]$p.Values[$_]))+'</Value></SubString>'}) -join '')+'</Object>'}) -join '')+'</DataMerge></Command>'}
    'ImportDataSourceValuesFromXML'{$d=New-Object Xml.XmlDocument;$d.LoadXml([string]$arguments[0]);$u=New-Object Text.UnicodeEncoding($false,$false,$true)
      foreach($row in $d.SelectNodes('/Command/DataMerge/Object')){$o=@($objs|?{$_.Props.Name -ceq $row.GetAttribute('Name')})[0];$v=$row.SelectSingleNode('./SubString/Value');$o.Props.Values=@($u.GetString([Convert]::FromBase64String($v.InnerText)))
       if($global:MMock.restoreDrift -and (Joined $o.Props) -match '120824'){$o.Props.Extra=' Drift="1"'}
       if($global:MMock.contaminate){@($objs|?{$_ -ne $o})[0].Props.Values=@('HIT')}};return $true}
    default{throw "objs $name"}}}
  'Obj'{switch($name){'GetXML'{if($global:MMock.harvestMutate -and [string]$t.Props.DocPath -like '*harvest-designer-base*' -and $t.Props.Name -eq ($TX+'5')){$global:MCount++;$t.Props.Extra=' Mut="'+$global:MCount+'"'};return Xml-Of $t};'ExportToFile'{if([int]$t.Props.Type -eq 5){Render $t $arguments[0]}else{Write-Bmp $arguments[0] 30 20 @(,@(2,2,20,10))};return};default{throw "obj $name"}}}
  'App'{if($name -eq 'Quit'){[void]$global:LivePids.Remove($t.Pid);return};throw}}}
Export-ModuleMember -Function Read-Property,Write-Property,Invoke-ComMethod
