# OFFLINE LOGIC DRY-RUN ONLY. Simulated objects; this is NOT BarTender behaviour
# and is never evidence. Scenario switches exercise the probe/verdict branches.
if($null -eq $global:PMock){$global:PMock=@{widthRefused=$false;heightRefused=$true;autofit=$false;contaminate=$false;restoreDrift=$false;lowerBase64=$false;widthIgnored=$false}}
function New-PObj($type,$name,$value){[pscustomobject]@{Kind='Obj';Props=[ordered]@{Type=$type;Name=$name;Value=$value;X=0.0;Y=0.0;Width=46.99;Height=5.0;RotationAngle=0.0;FontName='Arial';FontSize=12.0;FontScale=100.0;FontBold=$false;FontItalic=$false;DoNotPrint=$true;LineThickness=0.25;Paragraph=$false;HeightSet=$false;Extra='';Sid=[guid]::NewGuid().ToString('B').ToUpper()}}}
# Mirrors the Run51 observation: object GetXML stores CR/LF values as
# <Value Encoding="Base64"> with UTF-8 bytes. Scenario 'xml-base64-lower' emits an
# unobserved spelling to prove the probe fails closed.
function Value-Xml([string]$v){if($v -match "[`r`n]"){$enc=$(if($global:PMock.lowerBase64){'base64'}else{'Base64'});return '<Value Encoding="'+$enc+'">'+[Convert]::ToBase64String((New-Object Text.UTF8Encoding($false)).GetBytes($v))+'</Value>'};return '<Value>'+[Security.SecurityElement]::Escape($v)+'</Value>'}
function Xml-Of($o){$p=$o.Props;$t=[int]$p.Type
 if($t -eq 3){return '<Box Name="'+$p.Name+'" Width="'+$p.Width+'"/>'}
 $root=$(if($t -eq 5){'Text'}else{'BarCode-Code-128'})
 $para=$(if($p.Paragraph){' MockWrapWidth="'+$p.Width+'"'}else{''})
 '<'+$root+' Name="'+$p.Name+'" Width="1.850 in" Position.X="'+$p.X+'" Position.Y="'+$p.Y+'"'+$para+$p.Extra+'><Tabs/><Font PointSize="'+$p.FontSize+'" FontName="'+$p.FontName+'"/><AutoFit MinAdjustment="0.00" MaxAdjustment="0.00"/><DataSources><EmbeddedDataSource ID="'+$p.Sid+'" SubStringListStringID="4294967295">'+(Value-Xml ([string]$p.Value))+'</EmbeddedDataSource></DataSources></'+$root+'>'}
function Write-Bmp($path,[int]$w,[int]$h,$rects){$stride=[int]([math]::Ceiling($w*3/4.0)*4);$b=New-Object byte[] (54+$stride*$h);for($i=54;$i -lt $b.Length;$i++){$b[$i]=255};$b[0]=66;$b[1]=77
 [BitConverter]::GetBytes([int]$b.Length).CopyTo($b,2);[BitConverter]::GetBytes(54).CopyTo($b,10);[BitConverter]::GetBytes(40).CopyTo($b,14);[BitConverter]::GetBytes($w).CopyTo($b,18);[BitConverter]::GetBytes(-$h).CopyTo($b,22);[BitConverter]::GetBytes([int16]1).CopyTo($b,26);[BitConverter]::GetBytes([int16]24).CopyTo($b,28)
 foreach($r in $rects){for($y=$r[1];$y -lt $r[1]+$r[3] -and $y -lt $h;$y++){$o=54+$y*$stride+$r[0]*3;$n=[math]::Min($r[2],$w-$r[0])*3;if($n -gt 0){[Array]::Clear($b,$o,$n)}}};[IO.File]::WriteAllBytes($path,$b)}
function Render-Text($o,$path){$p=$o.Props;$px=600/25.4;$cw=0.2*$p.FontSize;$lh=0.42*$p.FontSize;$pitch=1.3*$lh
 $lines=@();foreach($para in ([string]$p.Value -split "`r`n")){
  if($p.Paragraph){$cur='';foreach($word in ($para -split ' ')){$try=$(if($cur){$cur+' '+$word}else{$word});if($try.Length*$cw -le $p.Width -or -not $cur){$cur=$try}else{$lines+=,$cur;$cur=$word}};$lines+=,$cur}else{$lines+=,$para}}
 if($p.HeightSet -and $p.Paragraph){$max=[math]::Max(1,[math]::Floor($p.Height/$pitch));$lines=@($lines|Select-Object -First $max)}
 $wmm=$(if($p.Paragraph){$p.Width}else{(($lines|%{$_.Length}|Measure-Object -Maximum).Maximum)*$cw+0.5})
 $rects=@();$i=0;foreach($l in $lines){$rects+=,@(0,[int]($i*$pitch*$px),[int]($l.Length*$cw*$px),[int]($lh*$px));$i++}
 Write-Bmp $path ([int]([math]::Ceiling($wmm*$px))+2) ([int]([math]::Ceiling($lines.Count*$pitch*$px))+2) $rects}
function Read-Property($t,[string]$name,[object[]]$arguments=@()){
 switch($t.Kind){
  'App'{switch($name){'ProcessID'{return $t.Pid};'Formats'{return [pscustomobject]@{Kind='Formats';App=$t}};default{return 'mock'}}}
  'Doc'{if($name -eq 'Objects'){return [pscustomobject]@{Kind='Objects';Doc=$t}};throw "doc prop $name"}
  'Objects'{if($name -eq 'Count'){return $t.Doc.Objects.Count};throw "objs prop $name"}
  'Obj'{if(-not $t.Props.Contains($name)){throw "no prop $name"};return $t.Props[$name]}}}
function Write-Property($t,[string]$name,$value,[object[]]$indices=@()){
 if($t.Kind -ne 'Obj'){return};$p=$t.Props
 if([int]$p.Type -eq 5 -and $name -eq 'Width'){if($global:PMock.widthRefused){throw (New-Object Runtime.InteropServices.COMException('Catastrophic failure',-2147418113))}
  if($global:PMock.autofit){$p.FontSize=[math]::Round($p.FontSize*0.6,2);return};if($global:PMock.widthIgnored){return};$p.Paragraph=$true;$p.Width=[math]::Round([double]$value/0.0254,0)*0.0254;return}
 if([int]$p.Type -eq 5 -and $name -eq 'Height'){if($global:PMock.heightRefused){throw (New-Object Runtime.InteropServices.COMException('Catastrophic failure',-2147418113))};$p.Height=[double]$value;$p.HeightSet=$true;return}
 $p[$name]=$value}
function Invoke-ComMethod($t,[string]$name,[object[]]$arguments=@()){
 switch($t.Kind){
  'Formats'{if($name -eq 'Open'){$path=[string]$arguments[0]
    if($path -like '*.unverified.btw'){$objs=@((Get-Content $path -Raw|ConvertFrom-Json)|%{$o=New-PObj 0 '' '';foreach($pp in $_.PSObject.Properties){$o.Props[$pp.Name]=$pp.Value};$o})}
    else{$objs=@((New-PObj 4 'Bar Code 1' '123'),(New-PObj 5 'Text 1' 'POOL ONE'),(New-PObj 5 'Text 2' 'POOL TWO'),(New-PObj 5 'Text 3' 'POOL THREE'))}
    $d=[pscustomobject]@{Kind='Doc';Objects=[System.Collections.ArrayList]@($objs)};$global:PDocs+=,$d;return $d};throw}
  'Doc'{switch($name){'InsertComponent'{$o=New-PObj 4 ('Bar Code '+($t.Objects.Count+10)) '12345678';[void]$t.Objects.Add($o);return $true}
    'SaveAs'{($t.Objects|%{$_.Props})|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $arguments[0];return}
    'ExportToFile'{Write-Bmp $arguments[0] 40 20 @(,@(1,1,(5+($t.Objects.Count)),3));return};'Close'{return};default{throw "doc $name"}}}
  'Objects'{$objs=$t.Doc.Objects;switch($name){
    'Item'{return $objs[[int]$arguments[0]-1]};'Find'{return @($objs|?{$_.Props.Name -ceq [string]$arguments[0]})[0]}
    'Delete'{$x=@($objs|?{$_.Props.Name -ceq [string]$arguments[0]})[0];$objs.Remove($x);return $true}
    'Create'{$o=New-PObj ([int]$arguments[0]) ('Box '+($objs.Count+20)) '';[void]$objs.Add($o);return $o}
    'ExportDataSourceValuesToXML'{return '<Command><DataMerge>'+(($objs|?{[int]$_.Props.Type -in 4,5}|%{'<Object Name="'+$_.Props.Name+'"><SubString Position="0"><Value>'+[Security.SecurityElement]::Escape([string]$_.Props.Value)+'</Value></SubString></Object>'}) -join '')+'</DataMerge></Command>'}
    'ImportDataSourceValuesFromXML'{$d=New-Object Xml.XmlDocument;$d.LoadXml([string]$arguments[0]);foreach($row in $d.SelectNodes('/Command/DataMerge/Object')){$o=@($objs|?{$_.Props.Name -ceq $row.GetAttribute('Name')})[0];$o.Props.Value=$row.SelectSingleNode('./SubString/Value').InnerText
      if($global:PMock.restoreDrift -and $o.Props.Value -like 'PARAGRAPH WRAP*' -and $global:PSeenShort){$o.Props.Extra=' Drift="1"'};if($o.Props.Value -eq 'SHORT LABEL'){$global:PSeenShort=$true}
      if($global:PMock.contaminate){@($objs|?{[int]$_.Props.Type -eq 5 -and $_ -ne $o})[0].Props.Value='HIT'}};return $true}
    default{throw "objs $name"}}}
  'Obj'{switch($name){'GetXML'{return Xml-Of $t};'ExportToFile'{if([int]$t.Props.Type -eq 5){Render-Text $t $arguments[0]}else{Write-Bmp $arguments[0] 30 20 @(,@(2,2,20,10))};return};default{throw "obj $name"}}}
  'App'{if($name -eq 'Quit'){[void]$global:LivePids.Remove($t.Pid);return};throw}}}
Export-ModuleMember -Function Read-Property,Write-Property,Invoke-ComMethod
