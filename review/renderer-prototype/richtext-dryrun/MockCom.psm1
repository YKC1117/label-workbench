# Mock COM layer for offline logic dry-run ONLY. Not BarTender behaviour.
if($null -eq $global:MockCfg){$global:MockCfg=@{heightRefused=$false;boldContaminatesBox=$false;richValue='Rich Text';boldRestoreInexact=$false}}
function New-MockObj($type,$name){[pscustomobject]@{Kind='Obj';Props=[ordered]@{Type=$type;Name=$name;X=0.0;Y=0.0;Width=10.0;Height=5.0;RotationAngle=0.0;FontName='Arial';FontSize=12.0;FontBold=$false;FontItalic=$false;Value=$(if($type -eq 9){$global:MockCfg.richValue}elseif($type -eq 4){'12345678'}else{''});LineThickness=0.25;DoNotPrint=$false;Extra=''}}}
function New-MockDoc($objs){[pscustomobject]@{Kind='Doc';Objects=[System.Collections.ArrayList]@($objs);Units=0}}
function Xml-Of($o){$p=$o.Props;$root=@{2='Line';3='Box';4='BarCode-Code-128';9='RichText'}[[int]$p.Type]
 $ds=$(if([int]$p.Type -in 4,9){'<DataSources><EmbeddedDataSource ID="{X}"><Value>'+[Security.SecurityElement]::Escape([string]$p.Value)+'</Value></EmbeddedDataSource></DataSources>'}else{''})
 '<'+$root+' Name="'+$p.Name+'" Width="'+$p.Width+'" Height="'+$p.Height+'" Position.X="'+$p.X+'" Position.Y="'+$p.Y+'"'+$(if($p.FontBold){' Bold="1"'}else{''})+$p.Extra+'>'+$ds+'</'+$root+'>'}
function Bmp($path,$seed){$w=40;$h=20;$stride=120;$b=New-Object byte[] (54+$stride*$h);for($i=54;$i -lt $b.Length;$i++){$b[$i]=255};[byte[]][char[]]'BM'|%{};$b[0]=66;$b[1]=77
 [BitConverter]::GetBytes([int]$b.Length).CopyTo($b,2);[BitConverter]::GetBytes(54).CopyTo($b,10);[BitConverter]::GetBytes(40).CopyTo($b,14);[BitConverter]::GetBytes($w).CopyTo($b,18);[BitConverter]::GetBytes(-$h).CopyTo($b,22);[BitConverter]::GetBytes([int16]1).CopyTo($b,26);[BitConverter]::GetBytes([int16]24).CopyTo($b,28)
 $row=3+([math]::Abs($seed.GetHashCode()) % 10);for($x=3;$x -lt 30;$x++){$o=54+$row*$stride+$x*3;$b[$o]=0;$b[$o+1]=0;$b[$o+2]=0};[IO.File]::WriteAllBytes($path,$b)}
function Read-Property($t,[string]$name,[object[]]$arguments=@()){
 switch($t.Kind){
  'App'{switch($name){'ProcessID'{return $t.Pid};'Formats'{return [pscustomobject]@{Kind='Formats';App=$t}};default{return 'mock'}}}
  'Doc'{if($name -eq 'Objects'){return [pscustomobject]@{Kind='Objects';Doc=$t}};throw "doc prop $name"}
  'Objects'{if($name -eq 'Count'){return $t.Doc.Objects.Count};throw "objs prop $name"}
  'Obj'{if(-not $t.Props.Contains($name)){throw "no prop $name"};return $t.Props[$name]}
 }
}
function Write-Property($t,[string]$name,$value,[object[]]$indices=@()){
 if($t.Kind -eq 'App'){return};if($t.Kind -eq 'Doc'){$t.Units=$value;return}
 if($name -eq 'Height' -and [int]$t.Props.Type -eq 9 -and $global:MockCfg.heightRefused){throw (New-Object Runtime.InteropServices.COMException('Catastrophic failure',-2147418113))}
 if($name -eq 'FontBold' -and $global:MockCfg.boldContaminatesBox){$global:MockDocs[-1].Objects|?{[int]$_.Props.Type -eq 3}|%{$_.Props.Extra=' Hacked="1"'}}
 if($name -eq 'FontBold' -and -not $value -and $global:MockCfg.boldRestoreInexact){$t.Props.Extra=' Weight="400"'}
 if($name -eq 'Width'){$value=[math]::Round([double]$value/0.0254,0)*0.0254}
 $t.Props[$name]=$value}
function Invoke-ComMethod($t,[string]$name,[object[]]$arguments=@()){
 switch($t.Kind){
  'Formats'{if($name -eq 'Open'){$p=[string]$arguments[0];if($p -like '*.unverified.btw'){$objs=@((Get-Content $p -Raw|ConvertFrom-Json)|%{$o=New-MockObj 0 '';foreach($pp in $_.PSObject.Properties){$o.Props[$pp.Name]=$pp.Value};$o})}else{$objs=@((New-MockObj 5 'Text 1'),(New-MockObj 5 'Text 2'))};$d=New-MockDoc $objs;$global:MockDocs+=,$d;return $d};throw}
  'Doc'{switch($name){'InsertComponent'{$o=New-MockObj 4 ('Bar Code '+($t.Objects.Count+1));[void]$t.Objects.Add($o);return $true}
    'SaveAs'{($t.Objects|%{$_.Props})|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $arguments[0];return}
    'ExportToFile'{Bmp $arguments[0] ('doc'+(($t.Objects|%{Xml-Of $_}) -join ''));return};'Close'{return};default{throw "doc $name"}}}
  'Objects'{$objs=$t.Doc.Objects;switch($name){
    'Item'{return $objs[[int]$arguments[0]-1]};'Find'{return @($objs|?{$_.Props.Name -ceq [string]$arguments[0]})[0]}
    'Delete'{$x=@($objs|?{$_.Props.Name -ceq [string]$arguments[0]})[0];$objs.Remove($x);return $true}
    'Create'{$n=@{3='Box';9='RichText'}[[int]$arguments[0]]+' '+($objs.Count+1);$o=New-MockObj ([int]$arguments[0]) $n;[void]$objs.Add($o);return $o}
    'ExportDataSourceValuesToXML'{return '<Command><DataMerge>'+(($objs|?{[int]$_.Props.Type -in 4,9}|%{'<Object Name="'+$_.Props.Name+'"><SubString Position="0"><Value>'+[Security.SecurityElement]::Escape([string]$_.Props.Value)+'</Value></SubString></Object>'}) -join '')+'</DataMerge></Command>'}
    default{throw "objs $name"}}}
  'Obj'{switch($name){'GetXML'{return Xml-Of $t};'ExportToFile'{Bmp $arguments[0] (Xml-Of $t);return};default{throw "obj $name"}}}
  'App'{if($name -eq 'Quit'){[void]$global:LivePids.Remove($t.Pid);return};throw}
 }
}
Export-ModuleMember -Function Read-Property,Write-Property,Invoke-ComMethod
