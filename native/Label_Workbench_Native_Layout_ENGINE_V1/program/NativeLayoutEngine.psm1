Set-StrictMode -Version 2
# Own the compiled dependency and private wrappers; do not force-reimport the
# caller's Com module into another session state.
if (-not ('LabelWorkbench.ComBridge' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'ComBridge.cs') -ErrorAction Stop
}
# These commands belong to this module, independent of caller imports.
function script:Read-Property($target,[string]$name,[object[]]$arguments=@()) {
    if($null -eq $target){throw "Cannot read $name from a null object."}
    $value=[LabelWorkbench.ComBridge]::Get($target,$name,$arguments)
    return ,$value
}
function script:Write-Property($target,[string]$name,$value,[object[]]$indices=@()) {
    if($null -eq $target){throw "Cannot write $name on a null object."}
    [LabelWorkbench.ComBridge]::Set($target,$name,([object[]]@($indices+@($value))))
}
function script:Invoke-ComMethod($target,[string]$name,[object[]]$arguments=@()) {
    if($null -eq $target){throw "Cannot invoke $name on a null object."}
    if($name -eq 'Open' -and $arguments.Count -eq 3){
        $value=[LabelWorkbench.ComBridge]::OpenFormat($target,[string]$arguments[0],[bool]$arguments[1],[string]$arguments[2])
    }else{
        $value=[LabelWorkbench.ComBridge]::Call($target,$name,$arguments)
    }
    return ,$value
}
$script:InvariantCulture=[Globalization.CultureInfo]::InvariantCulture

function Release-NativeCom($target) {
    if ($null -ne $target -and [Runtime.InteropServices.Marshal]::IsComObject($target)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($target) }
}
function Assert-NativeFinite([double]$value,[string]$name) {
    if([double]::IsNaN($value) -or [double]::IsInfinity($value)){throw ($name+' is not finite.')}
}
function Assert-NativeNear([double]$actual,[double]$expected,[double]$tolerance,[string]$name) {
    Assert-NativeFinite $actual $name
    Assert-NativeFinite $expected ($name+' expected')
    if([math]::Abs($actual-$expected) -gt $tolerance){throw ($name+' mismatch: '+$actual+' expected '+$expected)}
}
function Assert-NativeNames($names) {
    $set=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($n in @($names)){
        if($n -isnot [string] -or [string]::IsNullOrWhiteSpace($n) -or -not $set.Add($n)){throw 'Empty, non-flat or duplicate native object name.'}
    }
}
function Assert-NativeNameSet($expected,$actual) {
    Assert-NativeNames $expected;Assert-NativeNames $actual
    if(@($expected).Count -ne @($actual).Count -or @(Get-NativeNameDelta $expected $actual).Count -or @(Get-NativeNameDelta $actual $expected).Count){throw 'Native object identity set changed.'}
}
function Get-NativeXmlKey($node) {
    if($node -is [System.Xml.XmlDocument]){return Get-NativeXmlKey $node.DocumentElement}
    if($node -is [System.Xml.XmlElement]){
        $parts=@('E',$node.NamespaceURI,$node.LocalName)
        foreach($a in @($node.Attributes|Sort-Object NamespaceURI,LocalName)){$parts+=@('A',$a.NamespaceURI,$a.LocalName,$a.Value)}
        foreach($child in @($node.ChildNodes)){if($child -isnot [System.Xml.XmlWhitespace]){$parts+=,(Get-NativeXmlKey $child)}}
        return (($parts|ForEach-Object{[string]$_.Length+':'+$_}) -join '')
    }
    return ([string]$node.NodeType+':'+[string]$node.Value)
}
function Assert-NativePayload($obj,$xml,[string]$root,[string]$payload) {
    $state=Get-NativeLiteralState $xml $root
    if($state.value -cne $payload -or [string](Read-Property $obj 'Value') -cne $payload){throw 'Literal/effective payload mismatch.'}
}
function Restore-NativeXml($obj,[string]$text,[string]$prefix) {
    [void](Invoke-ComMethod $obj 'SetXML' @($text))
    $backText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    if($prefix){$backText|Set-Content -LiteralPath ($prefix+'-rollback.xml') -Encoding UTF8}
    $original=Read-NativeXml $text;$back=Read-NativeXml $backText
    if((Get-NativeXmlKey $original) -cne (Get-NativeXmlKey $back)){throw 'Rollback XML differs from baseline.'}
    $state=Get-NativeLiteralState $original $original.DocumentElement.LocalName
    Assert-NativePayload $obj $back $state.root $state.value
}
function Assert-NativeRaster($r) {
    if($null -eq $r -or $r.physicalMmTrust -cne 'TRUSTED'){throw 'Raster DPI is untrusted.'}
    Assert-NativeFinite ([double]$r.inkWidthMm) 'inkWidthMm';Assert-NativeFinite ([double]$r.inkHeightMm) 'inkHeightMm'
    if($r.inkWidthPx -le 0 -or $r.inkHeightPx -le 0){throw 'Raster has no ink.'}
}
function Assert-NativeSourceIsolation($objects) {
    $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($name in @(Get-NativeObjectNames $objects)){
        $obj=Find-NativeObject $objects $name
        try{
            $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
            $state=Get-NativeLiteralState $xml $xml.DocumentElement.LocalName
            if(-not $seen.Add([string]$state.sourceId)){throw 'Different objects share an EmbeddedDataSource ID.'}
        }finally{Release-NativeCom $obj}
    }
}
function Get-NativePageState($document) {
    if([int](Read-Property $document 'MeasurementUnits') -ne 3){throw 'MeasurementUnits is not millimeters.'}
    $r=[ordered]@{printer=[string](Read-Property $document 'Printer');LabelColumns=$null;LabelRows=$null}
    if([string]::IsNullOrWhiteSpace($r.printer)){throw 'Generation printer is unknown.'}
    $page=Read-Property $document 'PageSetup'
    try{
        foreach($k in @('LabelColumns','LabelRows')){$r[$k]=[int](Read-Property $page $k);if($r[$k] -ne 1){throw ('Page grid mismatch: '+$k)}}
        foreach($k in @('PaperWidth','PaperHeight','LabelWidth','LabelHeight','MarginLeft','MarginRight','MarginTop','MarginBottom')){
            $r[$k]=[double](Read-Property $page $k @(3));Assert-NativeFinite $r[$k] $k
        }
    }finally{Release-NativeCom $page}
    return $r
}
function Save-NativeJson($value,[string]$path) {
    ConvertTo-Json -InputObject $value -Depth 24 | Set-Content -LiteralPath $path -Encoding UTF8
}
function Read-NativeXml([string]$value) {
    $settings=New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver=$null
    $reader=[System.Xml.XmlReader]::Create((New-Object System.IO.StringReader($value)),$settings)
    try { $doc=New-Object System.Xml.XmlDocument; $doc.XmlResolver=$null; $doc.PreserveWhitespace=$true; $doc.Load($reader); return ,$doc } finally { $reader.Dispose() }
}
function Parse-NativeDouble([string]$value,[string]$name) {
    $number=0.0
    if (-not [double]::TryParse($value,[Globalization.NumberStyles]::Float,$script:InvariantCulture,[ref]$number)) { throw ("Invalid numeric XML value for ${name}: $value") }
    return $number
}
function Test-NativeNumber($value,[double]$min,[double]$max,[string]$name) {
    if ($null -eq $value -or $value -is [bool] -or $value -is [string]) { throw ($name+' must be a JSON number.') }
    $n=[double]$value
    if ([double]::IsNaN($n) -or [double]::IsInfinity($n) -or $n -lt $min -or $n -gt $max) { throw ($name+' out of range.') }
    return $n
}
function Get-NativeObjectNames($objects) {
    $count=[int](Read-Property $objects 'Count')
    $names=@()
    for($i=1;$i -le $count;$i++){
        $obj=Invoke-ComMethod $objects 'Item' @($i)
        try{$names += [string](Read-Property $obj 'Name')}finally{Release-NativeCom $obj}
    }
    Assert-NativeNames $names
    if([int](Read-Property $objects 'Count') -ne $count){throw 'Object collection changed while enumerating.'}
    return @($names)
}
function Get-NativeNameDelta($before,$after) {
    Assert-NativeNames $before;Assert-NativeNames $after
    $set=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach($n in @($before)){if(-not [string]::IsNullOrWhiteSpace([string]$n)){[void]$set.Add([string]$n)}}
    $delta=@()
    foreach($n in @($after)){if(-not $set.Contains([string]$n)){$delta += [string]$n}}
    return @($delta)
}
function Find-NativeObject($objects,[string]$name) {
    $obj=Invoke-ComMethod $objects 'Find' @($name)
    if($null -eq $obj){throw ('Object missing: '+$name)}
    if([string](Read-Property $obj 'Name') -cne $name){Release-NativeCom $obj;throw ('Object identity mismatch: '+$name)}
    return ,$obj
}
function Get-NativeDataSourceState($xml) {
    $container=$xml.SelectSingleNode('/*/*[local-name()="DataSources"]')
    if($null -eq $container){throw 'Object XML has no direct DataSources element.'}
    $sources=@($container.ChildNodes | Where-Object {$_ -is [System.Xml.XmlElement]})
    $kinds=@($sources | ForEach-Object {$_.LocalName})
    return [ordered]@{count=$sources.Count;kinds=$kinds;embeddedCount=@($sources|Where-Object{$_.LocalName -eq 'EmbeddedDataSource'}).Count;objectValueCount=@($sources|Where-Object{$_.LocalName -eq 'ObjectValueDataSource'}).Count}
}
function Get-NativeLiteralState($xml,[string]$expectedRoot) {
    if($xml.DocumentElement.LocalName -cne $expectedRoot){throw ('Unexpected object XML root: '+$xml.DocumentElement.LocalName+' expected '+$expectedRoot)}
    $state=Get-NativeDataSourceState $xml
    if($state.count -ne 1 -or $state.embeddedCount -ne 1 -or $state.objectValueCount -ne 0){throw 'Object must contain exactly one EmbeddedDataSource and no ObjectValueDataSource.'}
    $source=$xml.SelectSingleNode('/*/*[local-name()="DataSources"]/*')
    $transforms=@($source.SelectNodes('.//*[local-name()="Transforms"]/* | .//*[contains(local-name(),"Transform") and local-name()!="Transforms"]'))
    if($transforms.Count -ne 0){throw ('Data source transforms are not supported: '+(($transforms|ForEach-Object{$_.LocalName}) -join ', '))}
    foreach($attribute in @('Name','DataSourceName')){if($source.HasAttribute($attribute) -and $source.GetAttribute($attribute)){throw 'Named/shared source is not supported.'}}
    if([string]::IsNullOrWhiteSpace($source.GetAttribute('ID'))){throw 'Missing source ID.'}
    if($source.HasAttribute('SubStringListStringID') -and $source.GetAttribute('SubStringListStringID') -cne '4294967295'){throw 'Shared source ID is not supported.'}
    $values=@($source.SelectNodes('./*[local-name()="Value"]'))
    if($values.Count -ne 1){throw 'Embedded source does not expose one literal Value.'}
    return [ordered]@{root=$expectedRoot;sourceId=$source.GetAttribute('ID');value=$values[0].InnerText;sourceCount=$state.count;transforms=0}
}
function Get-NativeExportedValue($node) {
    if($node -is [System.Xml.XmlElement] -and $node.HasAttribute('Encoding')){
        if($node.GetAttribute('Encoding') -ine 'base64'){throw 'Unsupported exported value encoding.'}
        $bytes=[Convert]::FromBase64String($node.InnerText)
        if($bytes.Length % 2 -ne 0){throw 'Invalid UTF-16LE byte count.'}
        $enc=New-Object System.Text.UnicodeEncoding($false,$false,$true)
        return $enc.GetString($bytes)
    }
    return $node.InnerText
}
function Set-NativeExportedValue($node,[string]$value) {
    if($node -is [System.Xml.XmlElement] -and $node.HasAttribute('Encoding')){
        if($node.GetAttribute('Encoding') -ine 'base64'){throw 'Unsupported exported value encoding.'}
        $enc=New-Object System.Text.UnicodeEncoding($false,$false,$true)
        $node.InnerText=[Convert]::ToBase64String($enc.GetBytes($value))
    }else{$node.InnerText=$value}
}
function Set-NativeObjectPayload($objects,$obj,[string]$payload,[string]$expectedRoot,[string]$prefix) {
    Assert-NativeSourceIsolation $objects
    $name=[string](Read-Property $obj 'Name')
    $peerStates=@{}
    foreach($peerName in @(Get-NativeObjectNames $objects)){
        if($peerName -ceq $name){continue}
        $peer=Find-NativeObject $objects $peerName
        try{$peerStates[$peerName]=Get-NativeXmlKey (Read-NativeXml ([string](Invoke-ComMethod $peer 'GetXML' @($true,$true))))}finally{Release-NativeCom $peer}
    }
    $beforeText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $before=Read-NativeXml $beforeText
    [void](Get-NativeLiteralState $before $expectedRoot)
    $export=Read-NativeXml ([string](Invoke-ComMethod $objects 'ExportDataSourceValuesToXML' @()))
    $source=$before.SelectSingleNode('/*/*[local-name()="DataSources"]/*')
    $id=[string]$source.GetAttribute('ID')
    if([string]::IsNullOrWhiteSpace($id)){throw 'Embedded data source has no ID.'}
    $matches=@($export.SelectNodes('//*') | Where-Object {$node=$_; @($node.Attributes | Where-Object {$_.Value -ieq $id}).Count -gt 0})
    $target=$null
    if($matches.Count -eq 1){
        if($matches[0].HasAttribute('Value')){$target=$matches[0].GetAttributeNode('Value')}
        else{$values=@($matches[0].SelectNodes('./*[local-name()="Value"]'));if($values.Count -eq 1){$target=$values[0]}}
    }
    if($null -eq $target){
        $named=@($export.SelectNodes('//*') | Where-Object {$_.HasAttribute('Name') -and $_.GetAttribute('Name') -ceq $name})
        if($named.Count -ne 1){throw ('Cannot map exported data source for '+$name)}
        $values=@($named[0].SelectNodes('.//*[local-name()="Value"] | .//@Value'))
        if($values.Count -ne 1){throw ('Cannot find one exported literal value for '+$name)}
        if((Get-NativeExportedValue $values[0]) -cne [string](Get-NativeLiteralState $before $expectedRoot).value){throw 'Exported source order/value mismatch.'}
        $target=$values[0]
    }
    Set-NativeExportedValue $target $payload
    if($prefix){$beforeText|Set-Content -LiteralPath ($prefix+'-before.xml') -Encoding UTF8;$export.OuterXml|Set-Content -LiteralPath ($prefix+'-import-request.xml') -Encoding UTF8}
    $ok=Invoke-ComMethod $objects 'ImportDataSourceValuesFromXML' @($export.OuterXml)
    if(-not [bool]$ok){throw 'ImportDataSourceValuesFromXML returned false.'}
    $readText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    if($prefix){$readText|Set-Content -LiteralPath ($prefix+'-readback.xml') -Encoding UTF8}
    $read=Read-NativeXml $readText
    $state=Get-NativeLiteralState $read $expectedRoot
    if($state.value -cne $payload -or [string](Read-Property $obj 'Value') -cne $payload){throw 'Literal/effective payload readback mismatch.'}
    if($state.sourceId -cne $id){throw 'Payload import changed source identity.'}
    foreach($peerName in @($peerStates.Keys)){
        $peer=Find-NativeObject $objects $peerName
        try{if((Get-NativeXmlKey (Read-NativeXml ([string](Invoke-ComMethod $peer 'GetXML' @($true,$true))))) -cne $peerStates[$peerName]){throw 'Payload import modified another object.'}}finally{Release-NativeCom $peer}
    }
    return $state
}
function Get-NativeHumanReadableVisibility($xml) {
    $nodes=@($xml.SelectNodes('/*/*[local-name()="HumanReadable"]'))
    if($nodes.Count -ne 1){return 'UNKNOWN'}
    $v=[string]$nodes[0].GetAttribute('Visibility')
    if([string]::IsNullOrWhiteSpace($v)){return 'VISIBLE_DEFAULT_OR_UNSPECIFIED'}
    return $v
}
function Hide-NativeCode128HumanReadable($obj,[string]$prefix,[string]$root='BarCode-Code-128') {
    $baselineText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$baseline=Read-NativeXml $baselineText
    $state=Get-NativeLiteralState $baseline $root;Assert-NativePayload $obj $baseline $root $state.value
    $before=Get-NativeHumanReadableVisibility $baseline
    $baselineText|Set-Content -LiteralPath ($prefix+'-baseline.xml') -Encoding UTF8
    if($before -ceq 'None'){return [ordered]@{status='ALREADY_HIDDEN';before=$before;after='None'}}
    $nodes=@($baseline.SelectNodes('/*/*[local-name()="HumanReadable"]'))
    if($nodes.Count -ne 1){throw 'Barcode HumanReadable node is missing or ambiguous; ink sizing is blocked.'}
    try{
        $write=Read-NativeXml $baselineText;$write.SelectSingleNode('/*/*[local-name()="HumanReadable"]').SetAttribute('Visibility','None')
        $write.OuterXml|Set-Content -LiteralPath ($prefix+'-request.xml') -Encoding UTF8
        [void](Invoke-ComMethod $obj 'SetXML' @($write.OuterXml))
        $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$text|Set-Content -LiteralPath ($prefix+'-readback.xml') -Encoding UTF8
        $read=Read-NativeXml $text;Assert-NativePayload $obj $read $root $state.value
        if((Get-NativeXmlKey ($baseline.SelectSingleNode('/*/*[local-name()="DataSources"]'))) -cne (Get-NativeXmlKey ($read.SelectSingleNode('/*/*[local-name()="DataSources"]')))){throw 'Caption write changed DataSources.'}
        if((Get-NativeHumanReadableVisibility $read) -cne 'None'){throw 'HumanReadable hide was not accepted.'}
        return [ordered]@{status='HIDDEN_BY_SETXML';before=$before;after='None'}
    }catch{
        $failure=$_.Exception.Message
        try{Restore-NativeXml $obj $baselineText $prefix}catch{throw ($failure+' | rollback: '+$_.Exception.Message)}
        throw $failure
    }
}
function Get-NativeXDimension($xml) {
    $nodes=@($xml.SelectNodes('/*/*[local-name()="XDimension"]'))
    if($nodes.Count -ne 1){throw 'Missing/ambiguous XDimension.'}
    $n=$nodes[0]
    foreach($key in @('Index','Mils','Millimeters')){if(-not $n.HasAttribute($key)){throw ('XDimension missing '+$key)}}
    $index=[int]$n.GetAttribute('Index');$mils=Parse-NativeDouble $n.GetAttribute('Mils') 'Mils';$mm=Parse-NativeDouble $n.GetAttribute('Millimeters') 'Millimeters'
    Assert-NativeFinite $mils 'XDimension Mils';Assert-NativeFinite $mm 'XDimension Millimeters'
    if($index -lt 0 -or $index -gt 255 -or $mils -le 0 -or $mm -le 0 -or [math]::Abs($mm-$mils*0.0254) -gt 0.011){throw 'Inconsistent XDimension values.'}
    return [ordered]@{index=$index;mils=$mils;millimeters=$mm;indexMeaning='UNVERIFIED_ENUM_INDEX_NOT_DOTS'}
}
function Export-NativeMeasurement($obj,[string]$path,[int]$dpi) {
    if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
    [void](Invoke-ComMethod $obj 'ExportToFile' @($path,'BMP',[int]0,$dpi,[int]2))
    $r=[LabelWorkbench.RasterEvidence]::Read($path)
    $tol=[math]::Max(1.0,[double]$dpi*0.01)
    $valid=($r.HeaderDpiX -gt 0 -and $r.HeaderDpiY -gt 0 -and -not [double]::IsNaN($r.HeaderDpiX) -and -not [double]::IsNaN($r.HeaderDpiY) -and -not [double]::IsInfinity($r.HeaderDpiX) -and -not [double]::IsInfinity($r.HeaderDpiY))
    $trust='UNTRUSTED_HEADER_DPI_INVALID'
    if($valid){if([math]::Abs($r.HeaderDpiX-$dpi) -le $tol -and [math]::Abs($r.HeaderDpiY-$dpi) -le $tol){$trust='TRUSTED_HEADER_MATCH'}else{$trust='UNTRUSTED_HEADER_DPI_MISMATCH'}}
    $trusted=($trust -ceq 'TRUSTED_HEADER_MATCH')
    return [ordered]@{file=[IO.Path]::GetFileName($path);requestedDpi=$dpi;headerDpiX=$r.HeaderDpiX;headerDpiY=$r.HeaderDpiY;dpiTrust=$trust;physicalMmTrust=if($trusted){'TRUSTED'}else{'UNTRUSTED'};canvasWidthPx=$r.CanvasWidth;canvasHeightPx=$r.CanvasHeight;inkWidthPx=$r.InkWidth;inkHeightPx=$r.InkHeight;inkWidthMm=if($trusted){$r.InkWidth*25.4/$dpi}else{$null};inkHeightMm=if($trusted){$r.InkHeight*25.4/$dpi}else{$null};sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash;symbolBounds='NOT_DECODER_CONFIRMED'}
}
function Get-NativeInkError($m,$request) {
    if($null -eq $m -or $m.physicalMmTrust -cne 'TRUSTED'){throw 'Raster physical-mm measurement is untrusted.'}
    $err=[math]::Abs([double]$m.inkWidthMm-[double]$request.widthMm)
    if($request.type -eq 'datamatrix'){$err=[math]::Max($err,[math]::Abs([double]$m.inkHeightMm-[double]$request.heightMm))}
    return $err
}
function Fit-NativeXDimensionNearest($obj,$request,[string]$prefix,[int]$dpi) {
    $result=[ordered]@{status='NOT_RUN';targetWidthMm=[double]$request.widthMm;targetHeightMm=[double]$request.heightMm;samples=@();selected=$null;errorMm=$null;approximation='NOT_RUN';warning='Raster ink is a layout approximation, not decoder-confirmed symbol bounds.'}
    if($null -ne $request.PSObject.Properties['moduleIndex']){
        $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
        $node=$xml.SelectSingleNode('/*/*[local-name()="XDimension"]')
        if($null -eq $node){throw 'No XDimension for explicit module request.'}
        $node.SetAttribute('Index',[string]$request.moduleIndex)
        [void](Invoke-ComMethod $obj 'SetXML' @($xml.OuterXml))
        $actual=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
        $x=Get-NativeXDimension $actual
        if($x.index -ne $request.moduleIndex){throw 'Module index ignored.'}
        Assert-NativeNear ($x.mils*0.0254) $request.moduleMm 0.001 'Printer module profile'
        $bmp=Export-NativeMeasurement $obj ($prefix+'-module.bmp') $dpi
        Assert-NativeRaster $bmp
        $result.selected=[ordered]@{xDimension=$x;raster=$bmp}
        $result.status='EXPLICIT_MODULE_READBACK';return $result
    }
    $originalText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$original=Read-NativeXml $originalText
    $root=if($request.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
    $payload=[string]$request.value
    $literal=Get-NativeLiteralState $original $root;if($literal.value -cne $payload){throw 'Payload mismatch before XDimension fitting.'}
    Assert-NativePayload $obj $original $root $payload
    if((Get-NativeHumanReadableVisibility $original) -cne 'None'){throw 'Code128 HumanReadable must be None before raster width fitting.'}
    $originalText|Set-Content -LiteralPath ($prefix+'-baseline.xml') -Encoding UTF8
    Assert-NativeNear ([double](Read-Property $obj 'RotationAngle')) 0 0.001 'Sizing rotation'
    $initial=Get-NativeXDimension $original
    $base=Export-NativeMeasurement $obj ($prefix+'-baseline.bmp') $dpi
    if($base.physicalMmTrust -cne 'TRUSTED'){throw 'Baseline raster DPI is untrusted.'}
    $result.samples+=,[ordered]@{requestedIndex=$initial.index;readback=$initial;raster=$base}
    $best=[ordered]@{x=$initial;raster=$base;xml=$originalText;error=(Get-NativeInkError $base $request)}
    $queue=New-Object 'System.Collections.Generic.List[int]';$queue.Add($initial.index+1);if($initial.index -gt 0){$queue.Add($initial.index-1)}
    $tried=@{};$tried[[string]$initial.index]=$true
    $responded=$false
    try{
    for($i=0;$i -lt $queue.Count -and $i -lt 5;$i++){
        $idx=[int]$queue[$i];if($idx -lt 0 -or $idx -gt 255 -or $tried.ContainsKey([string]$idx)){continue};$tried[[string]$idx]=$true
        $write=Read-NativeXml $originalText;$write.SelectSingleNode('/*/*[local-name()="XDimension"]').SetAttribute('Index',[string]$idx)
        $write.OuterXml|Set-Content -LiteralPath ($prefix+'-index-'+$idx+'-request.xml') -Encoding UTF8
        [void](Invoke-ComMethod $obj 'SetXML' @($write.OuterXml))
        $readText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$read=Read-NativeXml $readText
        $readText|Set-Content -LiteralPath ($prefix+'-index-'+$idx+'-readback.xml') -Encoding UTF8
        $state=Get-NativeLiteralState $read $root;if($state.value -cne $payload -or [string](Read-Property $obj 'Value') -cne $payload){throw 'Payload changed during XDimension fitting.'}
        if((Get-NativeHumanReadableVisibility $read) -cne 'None'){throw 'HumanReadable reappeared during fitting.'}
        if((Get-NativeXmlKey ($original.SelectSingleNode('/*/*[local-name()="DataSources"]'))) -cne (Get-NativeXmlKey ($read.SelectSingleNode('/*/*[local-name()="DataSources"]')))){throw 'XDimension write changed DataSources.'}
        $x=Get-NativeXDimension $read;$r=Export-NativeMeasurement $obj ($prefix+'-index-'+$idx+'.bmp') $dpi
        $result.samples+=,[ordered]@{requestedIndex=$idx;readback=$x;raster=$r}
        if($r.physicalMmTrust -cne 'TRUSTED'){throw 'Raster DPI became untrusted during fitting.'}
        if($x.index -ne $idx -or [math]::Abs($x.mils-$initial.mils) -lt 0.001 -or [math]::Abs($r.inkWidthPx-$base.inkWidthPx) -lt 1){continue}
        $responded=$true
        $err=Get-NativeInkError $r $request;if($err -lt $best.error){$best=[ordered]@{x=$x;raster=$r;xml=$readText;error=$err}}
        if($i -eq 0){$slope=([double]$r.inkWidthMm-[double]$base.inkWidthMm)/($x.index-$initial.index);if($slope -gt 0){$est=$initial.index+([double]$request.widthMm-[double]$base.inkWidthMm)/$slope;$queue.Add([int][math]::Floor($est));$queue.Add([int][math]::Ceiling($est))}}
    }
    if(-not $responded){throw 'XDimension write/raster response not proven; nearest selection rejected.'}
    [void](Invoke-ComMethod $obj 'SetXML' @([string]$best.xml))
    $final=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));$fx=Get-NativeXDimension $final;$fr=Export-NativeMeasurement $obj ($prefix+'-selected.bmp') $dpi
    $final.OuterXml|Set-Content -LiteralPath ($prefix+'-selected.xml') -Encoding UTF8
    Assert-NativePayload $obj $final $root $payload
    if((Get-NativeXmlKey $final) -cne (Get-NativeXmlKey (Read-NativeXml ([string]$best.xml)))){throw 'Selected XML did not restore completely.'}
    Assert-NativeRaster $fr
    Assert-NativeNear $fr.inkWidthPx $best.raster.inkWidthPx 1 'Selected raster width'
    Assert-NativeNear $fr.inkHeightPx $best.raster.inkHeightPx 1 'Selected raster height'
    if($fx.index -ne $best.x.index -or $fr.physicalMmTrust -cne 'TRUSTED'){throw 'Selected XDimension state did not persist in-memory.'}
    $result.selected=[ordered]@{xDimension=$fx;raster=$fr};$result.errorMm=Get-NativeInkError $fr $request;$result.status='BEST_OBSERVED_TRUSTED_XDIMENSION_SELECTED';$result.approximation='BEST_OF_BOUNDED_SAMPLES_NOT_GLOBAL_OPTIMUM'
    return $result
    }catch{
        $failure=$_.Exception.Message
        Save-NativeJson $result ($prefix+'-failed-samples.json')
        try{Restore-NativeXml $obj $originalText $prefix}catch{throw ($failure+' | rollback: '+$_.Exception.Message)}
        throw $failure
    }
}
function Get-NativeInstallRoot {
    $root=[Microsoft.Win32.Registry]::ClassesRoot;$clsidKey=$root.OpenSubKey('BarTender.Application\CLSID');if($null -eq $clsidKey){return $null}
    try{$clsid=[string]$clsidKey.GetValue('')}finally{$clsidKey.Dispose()}
    $serverKey=$root.OpenSubKey("CLSID\$clsid\LocalServer32");if($null -eq $serverKey){return $null}
    try{$command=[string]$serverKey.GetValue('')}finally{$serverKey.Dispose()}
    $exe=$null;if($command -match '^\s*"([^"]+\.exe)"'){$exe=$Matches[1]}elseif($command -match '^\s*(.+?\.exe)(?:\s|$)'){$exe=$Matches[1]}
    if([string]::IsNullOrWhiteSpace($exe)){return $null};return [IO.Path]::GetDirectoryName($exe)
}
function Resolve-NativeDataMatrixComponent([string]$runDir) {
    $root=Get-NativeInstallRoot
    if(-not [string]::IsNullOrWhiteSpace($root)){
        $exact=Join-Path $root 'Barcodes\Common Bar Codes\Data Matrix.btc'
        if(Test-Path -LiteralPath $exact -PathType Leaf){return $exact}
    }
    throw 'CAPABILITY_UNAVAILABLE_DATAMATRIX_BTC: expected Barcodes\Common Bar Codes\Data Matrix.btc under registered installation; no scan performed.'
}
function Insert-NativeComponent($document,[ref]$objectsRef,[string]$path,[string]$expectedRoot,$request,[string]$prefix) {
    $objects=$objectsRef.Value;$before=@(Get-NativeObjectNames $objects)
    $ok=[bool](Invoke-ComMethod $document 'InsertComponent' @($path,[double]$request.xMm,[double]$request.yMm))
    if(-not $ok){throw ('InsertComponent returned false: '+$path)}
    $objectsRef.Value=$null;Release-NativeCom $objects;$objects=$null;$objects=Read-Property $document 'Objects';$objectsRef.Value=$objects
    $after=@(Get-NativeObjectNames $objects);$delta=@(Get-NativeNameDelta $before $after)
    if($delta.Count -ne 1 -or $after.Count -ne $before.Count+1){throw 'InsertComponent did not add exactly one object.'}
    if(@(Get-NativeNameDelta $after $before).Count){throw 'Existing object disappeared during creation.'}
    Assert-NativeSourceIsolation $objects
    $name=[string]$delta[0];$obj=Find-NativeObject $objects $name
    try{
        if([int](Read-Property $obj 'Type') -ne 4){throw 'Inserted component is not a barcode object.'}
        $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));[void](Get-NativeLiteralState $xml $expectedRoot)
        [void](Set-NativeObjectPayload $objects $obj ([string]$request.value) $expectedRoot ($prefix+'-payload'))
    }finally{Release-NativeCom $obj}
    return $name
}
function Create-NativeText($document,[ref]$objectsRef,$request,[string]$prefix) {
    $objects=$objectsRef.Value;$before=@(Get-NativeObjectNames $objects);$created=$null;$createdName=$null
    try{$created=Invoke-ComMethod $objects 'Create' @([int]5);if($null -eq $created){throw 'DesignObjects.Create(5) returned null.'};$createdName=[string](Read-Property $created 'Name')}finally{Release-NativeCom $created}
    $objectsRef.Value=$null;Release-NativeCom $objects;$objects=$null;$objects=Read-Property $document 'Objects';$objectsRef.Value=$objects
    $after=@(Get-NativeObjectNames $objects);$delta=@(Get-NativeNameDelta $before $after)
    if($delta.Count -ne 1 -or $after.Count -ne $before.Count+1 -or $delta[0] -cne $createdName){throw 'Create(5) did not return the one newly added text object.'}
    if(@(Get-NativeNameDelta $after $before).Count){throw 'Existing object disappeared during creation.'}
    Assert-NativeSourceIsolation $objects
    $name=[string]$delta[0];$obj=Find-NativeObject $objects $name
    try{
        if([int](Read-Property $obj 'Type') -ne 5){throw ('Create(5) produced unexpected Type '+[string](Read-Property $obj 'Type'))}
        $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));[void](Get-NativeLiteralState $xml 'Text')
        [void](Set-NativeObjectPayload $objects $obj ([string]$request.value) 'Text' ($prefix+'-payload'))
    }finally{Release-NativeCom $obj}
    return $name
}
function Test-NativeLayoutInput($layout) {
    if($null -eq $layout){throw 'Layout is null.'}
    foreach($k in @('schema','widthMm','heightMm','objects')){if($null -eq $layout.PSObject.Properties[$k]){throw ('Missing layout.'+$k)}}
    if($layout.schema -ceq 'renderer-probe-v1'){
        # Reuse existing scalar/type validation, then retain the canonical targets intact.
        $candidateProfile=($null -ne $layout.PSObject.Properties['runtimeProfile'] -and $layout.runtimeProfile -ceq 'candidate-general-v1')
        $converted=@()
        foreach($o in $layout.objects){
            if($o.referencePoint -cne 'TopLeft' -or ($o.rotationDeg -ne 0 -and (-not $candidateProfile -or $o.rotationDeg -notin @(90,180,270)))){throw 'Unsupported prototype anchor or angle.'}
            $v=[ordered]@{id=$o.id;type=$o.type;value=$o.value;xMm=$o.xMm;yMm=$o.yMm;rotationDeg=$o.rotationDeg}
            [void](Test-NativeNumber $o.widthMm 0.01 1000 'frame width')
            [void](Test-NativeNumber $o.heightMm 0.01 1000 'frame height')
            if($o.type -eq 'text'){
                if($o.alignment -cne 'left' -and (-not $candidateProfile -or $o.alignment -cnotin @('center','right'))){throw 'Unsupported text alignment.'}
                if($candidateProfile){foreach($flag in @('bold','italic')){if($o.$flag -isnot [bool]){throw ('Invalid Text '+$flag)}}}
                $v.fontName=$o.fontName;$v.fontSizePt=$o.fontSizePt
            }else{
                if($o.humanReadable -cne 'none'){throw 'Unsupported caption mode.'}
                [void](Test-NativeNumber $o.moduleMm 0.001 10 'moduleMm')
                [void](Test-NativeNumber $o.moduleIndex 0 255 'moduleIndex')
                if([int]$o.moduleIndex -ne $o.moduleIndex){throw 'Invalid module index.'}
                $v.widthMm=$o.widthMm
                if($o.type -eq 'code128'){$v.heightMm=$o.heightMm}
            }
            $converted+=,[pscustomobject]$v
        }
        $legacy=[pscustomobject]@{schema='lwb-native-layout-v1';widthMm=$layout.widthMm;heightMm=$layout.heightMm;objects=$converted}
        $checked=Test-NativeLayoutInput $legacy
        $checked.objects=$layout.objects
        $checked|Add-Member -NotePropertyName runtimeProfile -NotePropertyValue $(if($candidateProfile){'candidate-general-v1'}else{'upright-v1'})
        return $checked
    }
    if([string]$layout.schema -cne 'lwb-native-layout-v1'){throw 'Unsupported layout schema.'}
    foreach($prop in @($layout.PSObject.Properties)){if($prop.Name -cnotin @('schema','widthMm','heightMm','objects','printerName')){throw ('Unknown layout field: '+$prop.Name)}}
    $width=Test-NativeNumber $layout.widthMm 5 1000 'widthMm';$height=Test-NativeNumber $layout.heightMm 5 1000 'heightMm'
    if($layout.objects -isnot [array] -or $layout.objects.Count -lt 1 -or $layout.objects.Count -gt 200){throw 'objects must contain 1..200 entries.'}
    $ids=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    $items=@()
    foreach($o in @($layout.objects)){
        foreach($k in @('id','type','value','xMm','yMm')){if($null -eq $o.PSObject.Properties[$k]){throw ('Missing object.'+$k)}}
        $id=[string]$o.id;if($o.id -isnot [string] -or $id -cnotmatch '^[A-Z0-9_\-]{1,64}$' -or -not $ids.Add($id)){throw ('Invalid/duplicate object id: '+$id)}
        $type=[string]$o.type;if($o.type -isnot [string] -or $type -cnotin @('text','code128','datamatrix')){throw ('Unsupported object type: '+$type)}
        $allowed=@('id','type','value','xMm','yMm','rotationDeg')
        if($type -eq 'text'){$allowed+=@('fontSizePt','fontName')}elseif($type -eq 'code128'){$allowed+=@('widthMm','heightMm')}else{$allowed+=@('sizeMm','widthMm')}
        foreach($prop in @($o.PSObject.Properties)){if($prop.Name -cnotin $allowed){throw ($id+'.unknown field: '+$prop.Name)}}
        if($o.value -isnot [string]){throw ($id+'.value must be a string.')}
        if($o.value -match '[\x00-\x08\x0B\x0C\x0E-\x1F]' -or ($type -eq 'text' -and $o.value -match '[\r\n]')){throw ($id+'.value contains unsupported control characters or multiple lines.')}
        $x=Test-NativeNumber $o.xMm 0 $width ($id+'.xMm');$y=Test-NativeNumber $o.yMm 0 $height ($id+'.yMm')
        $rotation=0.0;if($null -ne $o.PSObject.Properties['rotationDeg']){$rotation=Test-NativeNumber $o.rotationDeg -360 360 ($id+'.rotationDeg')}
        $item=[ordered]@{id=$id;type=$type;value=[string]$o.value;xMm=$x;yMm=$y;rotationDeg=$rotation}
        if($type -eq 'text'){
            if($null -eq $o.PSObject.Properties['fontSizePt']){throw ($id+'.fontSizePt required.')};$item.fontSizePt=Test-NativeNumber $o.fontSizePt 0.5 3600 ($id+'.fontSizePt')
            if($null -ne $o.PSObject.Properties['fontName'] -and $o.fontName -isnot [string]){throw 'fontName must be a string.'}
            $item.fontName=if($null -ne $o.PSObject.Properties['fontName']){[string]$o.fontName}else{'Arial'};if([string]::IsNullOrWhiteSpace($item.fontName)){throw ($id+'.fontName invalid.')}
        }elseif($type -eq 'code128'){
            if($null -eq $o.PSObject.Properties['widthMm'] -or $null -eq $o.PSObject.Properties['heightMm']){throw ($id+' requires widthMm and heightMm.')}
            $item.widthMm=Test-NativeNumber $o.widthMm 1 500 ($id+'.widthMm');$item.heightMm=Test-NativeNumber $o.heightMm 1 100 ($id+'.heightMm');$item.humanReadable='none'
        }else{
            if($null -ne $o.PSObject.Properties['sizeMm'] -and $null -ne $o.PSObject.Properties['widthMm']){throw 'DataMatrix must specify sizeMm or widthMm, not both.'}
            $size=$null;if($null -ne $o.PSObject.Properties['sizeMm']){$size=Test-NativeNumber $o.sizeMm 1 500 ($id+'.sizeMm')}elseif($null -ne $o.PSObject.Properties['widthMm']){$size=Test-NativeNumber $o.widthMm 1 500 ($id+'.widthMm')}else{throw ($id+'.sizeMm required.')}
            $item.widthMm=$size;$item.heightMm=$size
        }
        $items += [pscustomobject]$item
    }
    $printerName=$null;if($null -ne $layout.PSObject.Properties['printerName']){if($layout.printerName -isnot [string]){throw 'printerName must be a string.'};$printerName=[string]$layout.printerName;if([string]::IsNullOrWhiteSpace($printerName)){$printerName=$null}}
    return [pscustomobject]@{schema='lwb-native-layout-v1';widthMm=$width;heightMm=$height;printerName=$printerName;objects=$items}
}
function Set-NativePage($document,$plan) {
    Write-Property $document 'MeasurementUnits' 3
    if([int](Read-Property $document 'MeasurementUnits') -ne 3){throw 'MeasurementUnits did not read back as millimeters.'}
    if($plan.printerName){Write-Property $document 'Printer' ([string]$plan.printerName);if([string](Read-Property $document 'Printer') -cne [string]$plan.printerName){throw 'Requested printer did not read back exactly.'}}
    $page=Read-Property $document 'PageSetup'
    try{
        Write-Property $page 'LabelColumns' 1;Write-Property $page 'LabelRows' 1
        foreach($k in @('MarginLeft','MarginRight','MarginTop','MarginBottom')){Write-Property $page $k ([single]0) @(3)}
        Write-Property $page 'PaperWidth' ([single]$plan.widthMm) @(3);Write-Property $page 'PaperHeight' ([single]$plan.heightMm) @(3)
        Write-Property $page 'LabelWidth' ([single]$plan.widthMm) @(3);Write-Property $page 'LabelHeight' ([single]$plan.heightMm) @(3)
        $rw=[double](Read-Property $page 'LabelWidth' @(3));$rh=[double](Read-Property $page 'LabelHeight' @(3))
        if([math]::Abs($rw-$plan.widthMm) -gt 0.05 -or [math]::Abs($rh-$plan.heightMm) -gt 0.05){throw ('Label size readback mismatch: '+$rw+' x '+$rh)}
        $state=Get-NativePageState $document
        foreach($k in @('PaperWidth','LabelWidth')){Assert-NativeNear $state[$k] $plan.widthMm 0.05 $k}
        foreach($k in @('PaperHeight','LabelHeight')){Assert-NativeNear $state[$k] $plan.heightMm 0.05 $k}
        foreach($k in @('MarginLeft','MarginRight','MarginTop','MarginBottom')){Assert-NativeNear $state[$k] 0 0.05 $k}
        return $state
    }finally{Release-NativeCom $page}
}
function Get-NativeTextFontNode($xml) {
    if($xml.DocumentElement.LocalName -cne 'Text'){throw 'Font edit requires native Text XML.'}
    $nodes=@($xml.SelectNodes('/*/*[local-name()="Font"]'))
    if($nodes.Count -ne 1 -or -not $nodes[0].HasAttribute('FontName')){throw 'Text XML must expose exactly one direct Font with an existing FontName attribute; no node will be invented.'}
    return ,$nodes[0]
}
function Get-NativeFontComState($obj) {
    $state=[ordered]@{name=[string](Read-Property $obj 'Name');type=[int](Read-Property $obj 'Type');fontName=[string](Read-Property $obj 'FontName');X=0.0;Y=0.0;RotationAngle=0.0;FontSize=0.0}
    if($state.type -ne 5){throw 'Font edit requires a native Type 5 Text object.'}
    foreach($key in @('X','Y','RotationAngle','FontSize')){
        $state[$key]=[double](Read-Property $obj $key);Assert-NativeFinite $state[$key] $key
    }
    return $state
}
function Assert-NativeFontState($obj,$expectedXml,$baselineCom,[string]$expectedFontName) {
    $actual=Get-NativeFontComState $obj
    if($actual.name -cne $baselineCom.name -or $actual.type -ne $baselineCom.type){throw 'Font write changed object identity/type.'}
    foreach($key in @('X','Y','RotationAngle','FontSize')){Assert-NativeNear $actual[$key] $baselineCom[$key] 0.001 ('Font write '+$key)}
    if($actual.fontName -cne $expectedFontName){throw 'Font write COM readback mismatch.'}
    $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$xml=Read-NativeXml $text
    $literal=Get-NativeLiteralState $expectedXml 'Text'
    Assert-NativePayload $obj $xml 'Text' $literal.value
    if((Get-NativeTextFontNode $xml).GetAttribute('FontName') -cne $expectedFontName){throw 'Font write XML readback mismatch.'}
    if((Get-NativeXmlKey $xml) -cne (Get-NativeXmlKey $expectedXml)){throw 'Font write changed protected XML outside FontName.'}
    return $text
}
function Restore-NativeFontBaseline($obj,[string]$baselineText,$baselineCom,[string]$prefix) {
    # Restore-NativeXml performs complete canonical XML and effective payload
    # readback. This is required even if the failed setter already mutated state.
    Restore-NativeXml $obj $baselineText $prefix
    [void](Assert-NativeFontState $obj (Read-NativeXml $baselineText) $baselineCom $baselineCom.fontName)
}
function Set-NativeTextFontName($obj,[string]$fontName,[string]$prefix='') {
    # Snapshot BEFORE either setter; a throwing setter is not assumed atomic.
    $baselineText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $baseline=Read-NativeXml $baselineText
    $literal=Get-NativeLiteralState $baseline 'Text';Assert-NativePayload $obj $baseline 'Text' $literal.value
    $baselineCom=Get-NativeFontComState $obj
    $result=[ordered]@{requested=$fontName;before=$baselineCom.fontName;actual=$baselineCom.fontName;writeMode='NOT_RUN';comError=$null;error=$null;rollback='NOT_NEEDED';protectedXmlPolicy='STRICT_ONLY_FONTNAME_CHANGE'}
    if($prefix){$baselineText|Set-Content -LiteralPath ($prefix+'-baseline.xml') -Encoding UTF8}
    $mutationAttempted=$false
    try{
        if($baselineCom.fontName -ceq $fontName){$result.writeMode='ALREADY_MATCHED';return $result}
        $font=Get-NativeTextFontNode $baseline
        if($font.GetAttribute('FontName') -cne $baselineCom.fontName){throw 'Baseline COM/XML FontName disagree; font mutation blocked.'}
        $request=Read-NativeXml $baselineText
        (Get-NativeTextFontNode $request).SetAttribute('FontName',$fontName)
        # Prove request construction changed exactly one existing attribute.
        $proof=Read-NativeXml $request.OuterXml
        (Get-NativeTextFontNode $proof).SetAttribute('FontName',$baselineCom.fontName)
        if((Get-NativeXmlKey $proof) -cne (Get-NativeXmlKey $baseline)){throw 'Font request changed XML outside FontName.'}
        if($prefix){$request.OuterXml|Set-Content -LiteralPath ($prefix+'-request.xml') -Encoding UTF8}
        $mutationAttempted=$true
        try{
            Write-Property $obj 'FontName' $fontName
            $readback=Assert-NativeFontState $obj $request $baselineCom $fontName
            if($prefix){$readback|Set-Content -LiteralPath ($prefix+'-com-readback.xml') -Encoding UTF8}
            $result.actual=$fontName;$result.writeMode='COM_SET';return $result
        }catch{$result.comError=$_.Exception.ToString()}

        # A failed COM setter may have partially changed the object. Record that
        # state; if different, restore and verify the original before fallback.
        $postCom=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
        if($prefix){$postCom|Set-Content -LiteralPath ($prefix+'-after-com-failure.xml') -Encoding UTF8}
        # Do not use XML equality alone to decide whether the failed COM setter
        # was atomic. A COM-only partial mutation may leave GetXML unchanged.
        # Verify the complete pre-call state; if any COM/XML/geometry/identity
        # readback differs, restore the full baseline and verify it before the
        # XML fallback is allowed to run.
        $baselineIntact=$true
        try{[void](Assert-NativeFontState $obj $baseline $baselineCom $baselineCom.fontName)}
        catch{$baselineIntact=$false;$result['postComStateError']=$_.Exception.ToString()}
        if(-not $baselineIntact){
            Restore-NativeFontBaseline $obj $baselineText $baselineCom $(if($prefix){$prefix+'-com'}else{''})
            $result.rollback='COM_BASELINE_RESTORED'
        }
        # Mutation flag was set BEFORE the call, so partial SetXML exceptions
        # also reach the outer rollback. Always use the pre-COM snapshot.
        [void](Invoke-ComMethod $obj 'SetXML' @($request.OuterXml))
        $readback=Assert-NativeFontState $obj $request $baselineCom $fontName
        if($prefix){$readback|Set-Content -LiteralPath ($prefix+'-xml-readback.xml') -Encoding UTF8}
        $result.actual=$fontName;$result.writeMode='XML_FONT_ATTRIBUTE_FALLBACK'
        return $result
    }catch{
        $failure=$_.Exception.ToString();$result.error=$failure;$result.writeMode='FAILED';$result.actual=$null
        if($mutationAttempted){
            if($prefix){try{[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))|Set-Content -LiteralPath ($prefix+'-failure-state.xml') -Encoding UTF8}catch{$result['failureSnapshotError']=$_.Exception.ToString()}}
            try{Restore-NativeFontBaseline $obj $baselineText $baselineCom $(if($prefix){$prefix+'-failure'}else{''});$result.rollback='BASELINE_RESTORED'}
            catch{$result.rollback='FAILED';$result.error=$failure+' | ROLLBACK_FAILED: '+$_.Exception.ToString()}
        }
        throw ('FontName transaction failed. COM: '+$result.comError+' | '+$result.error)
    }finally{if($prefix){Save-NativeJson $result ($prefix+'-result.json')}}
}
function Set-NativeGeometry($obj,$request,[string]$prefix='') {
    $targets=[ordered]@{}
    $result=[ordered]@{status='TARGET_GEOMETRY_WITHIN_TOLERANCE';properties=[ordered]@{};anchorContract='CANONICAL_UNROTATED_TOP_LEFT_TO_TOPLEFT_REFERENCE_POINT'}
    if($null -ne $request.PSObject.Properties['referencePoint']){
        $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
        $xml.DocumentElement.SetAttribute('ReferencePoint',[string]$request.referencePoint)
        [void](Invoke-ComMethod $obj 'SetXML' @($xml.OuterXml))
        $back=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
        if($back.DocumentElement.GetAttribute('ReferencePoint') -cne $request.referencePoint){throw 'REFERENCE_POINT_UNPROVEN'}
    }
    if($request.type -eq 'text'){
        $result['textFrame']=[ordered]@{widthMm=if($null -ne $request.PSObject.Properties['widthMm']){$request.widthMm}else{$null};heightMm=if($null -ne $request.PSObject.Properties['heightMm']){$request.heightMm}else{$null};mode='NORMAL_TEXT_CONTAINMENT_NOT_FORCED_DIMENSIONS'}
        $result.properties['FontName']=(Set-NativeTextFontName $obj ([string]$request.fontName) $(if($prefix){$prefix+'-font'}else{''}))
        $targets['FontSize']=[double]$request.fontSizePt
        foreach($flag in @('bold','italic')){
            if($null -ne $request.PSObject.Properties[$flag]){
                $property=if($flag -eq 'bold'){'FontBold'}else{'FontItalic'}
                $targets[$property]=[bool]$request.$flag
            }
        }
    }elseif($request.type -eq 'code128'){$targets['Height']=[double]$request.heightMm}
    $targets['RotationAngle']=[double]$request.rotationDeg;$targets['X']=[double]$request.xMm;$targets['Y']=[double]$request.yMm
    foreach($key in $targets.Keys){Write-Property $obj $key $targets[$key]}
    foreach($key in $targets.Keys){
        $actual=Read-Property $obj $key;$target=$targets[$key]
        $tol=if($key -in @('X','Y')){0.20}elseif($key -eq 'Height'){0.10}else{0.05}
        Assert-NativeNear ([double]$actual) ([double]$target) $tol ($request.id+'.'+$key)
        $result.properties[$key]=[ordered]@{requested=$target;actual=[double]$actual;error=[math]::Abs([double]$actual-$target);tolerance=$tol}
    }
    if($request.type -eq 'text'){
        $finalFont=[string](Read-Property $obj 'FontName')
        $finalFontXml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
        if($finalFont -cne [string]$request.fontName -or (Get-NativeTextFontNode $finalFontXml).GetAttribute('FontName') -cne [string]$request.fontName){throw 'FontName changed after final geometry writes.'}
        $result.properties['FontName'].actual=$finalFont
    }
    return $result
}
function Invoke-NativeLayoutBuild($formats,$layout,[string]$runDir,[string]$baseDirectory) {
    $plan=Test-NativeLayoutInput $layout
    $report=[ordered]@{schema='lwb-native-layout-build-report-v1';status='STARTED';layoutSchema=$plan.schema;page=$null;objects=@();warnings=@('Barcode raster ink dimensions are layout approximations, not decoder-confirmed symbol bounds.','Code128 width uses the nearest trusted XDimension observed on the active BarTender printer; exact target width may be physically unreachable.','Barcode sizing is tied to the printer active during generation; changing printer can change XDimension quantization.');output=$null;outputSha256=$null;reopen='NOT_RUN'}
    $document=$null;$objects=$null;$candidate=Join-Path $runDir 'candidate.unverified.btw';$accepted=Join-Path $runDir 'native-output.btw'
    try{
        'Create blank format'|Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
        $document=Invoke-ComMethod $formats 'Add' @()
        if($null -eq $document){throw 'Formats.Add returned null.'}
        $report['coordinateSemantics']='NATIVE_REFERENCE_POINT_NOT_TOP_LEFT_CERTIFIED'
        $report['productAcceptance']='NOT_RUN'
        $report.page=Set-NativePage $document $plan
        $objects=Read-Property $document 'Objects'
        if([int](Read-Property $objects 'Count') -ne 0){throw 'New Formats.Add document is not blank; generation stopped rather than deleting unknown objects.'}
        $dmComponent=$null
        if(@($plan.objects|Where-Object{$_.type -eq 'datamatrix'}).Count -gt 0){$dmComponent=Resolve-NativeDataMatrixComponent $runDir;$report['dataMatrixComponent']=$dmComponent;$report['dataMatrixComponentSha256']=(Get-FileHash -LiteralPath $dmComponent -Algorithm SHA256).Hash;Copy-Item -LiteralPath $dmComponent -Destination (Join-Path $runDir 'selected-datamatrix.btc')}
        $codeComponent=Join-Path $baseDirectory 'proven-code128.btc'
        if(@($plan.objects|Where-Object{$_.type -eq 'code128'}).Count -gt 0){if(-not(Test-Path -LiteralPath $codeComponent -PathType Leaf)){throw 'Bundled proven-code128.btc is missing.'};$report['code128ComponentSha256']=(Get-FileHash -LiteralPath $codeComponent -Algorithm SHA256).Hash;if($report.code128ComponentSha256 -cne '0B1E2481BCDE6E5CF1D084599F822DC3027AB19215530B7776296B40A59899F2'){throw 'Code128 component hash mismatch.'}}
        if(-not ('LabelWorkbench.RasterEvidence' -as [type])){Add-Type -Path (Join-Path $baseDirectory 'RasterEvidence.cs') -ErrorAction Stop}
        $dpi=600
        $physicalMap=@()
        $i=0
        foreach($request in @($plan.objects)){
            ('Build '+$request.id)|Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
            $i++;$prefix=Join-Path $runDir ('native-'+('{0:D3}' -f $i)+'-'+$request.id);$name=$null;$obj=$null
            $entry=[ordered]@{id=$request.id;type=$request.type;physicalName=$null;payload='NOT_RUN';geometry=$null;sizing='NOT_APPLICABLE';persistence='NOT_RUN';errors=@()}
            $report.objects+=,$entry
            try{
                if($request.type -eq 'text'){$name=Create-NativeText $document ([ref]$objects) $request $prefix}
                elseif($request.type -eq 'code128'){$name=Insert-NativeComponent $document ([ref]$objects) $codeComponent 'BarCode-Code-128' $request $prefix}
                else{$name=Insert-NativeComponent $document ([ref]$objects) $dmComponent 'BarCode-DataMatrix' $request $prefix}
                $entry.physicalName=$name;$obj=Find-NativeObject $objects $name
                $entry.payload='EMBEDDED_LITERAL_READBACK_OK'
                if($request.type -eq 'code128'){
                    $entry['humanReadable']=Hide-NativeCode128HumanReadable $obj ($prefix+'-human-readable')
                    Write-Property $obj 'RotationAngle' ([double]0)
                    Write-Property $obj 'Height' ([double]$request.heightMm)
                    $entry.sizing=Fit-NativeXDimensionNearest $obj $request ($prefix+'-size') $dpi
                    # XDimension may change object bounds, so position/height are re-applied after sizing.
                    $entry.geometry=Set-NativeGeometry $obj $request $prefix
                }elseif($request.type -eq 'datamatrix'){
                    $entry['humanReadable']=Hide-NativeCode128HumanReadable $obj ($prefix+'-human-readable') 'BarCode-DataMatrix'
                    Write-Property $obj 'RotationAngle' ([double]0)
                    $entry.sizing=Fit-NativeXDimensionNearest $obj $request ($prefix+'-size') $dpi
                    $entry.geometry=Set-NativeGeometry $obj $request $prefix
                }else{$entry.geometry=Set-NativeGeometry $obj $request $prefix}
                Write-Property $obj 'DoNotPrint' $false
                if([bool](Read-Property $obj 'DoNotPrint')){throw 'DoNotPrint write was ignored.'}
                $presaveText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
                $presaveText|Set-Content -LiteralPath ($prefix+'-presave.xml') -Encoding UTF8
                $presaveXml=Read-NativeXml $presaveText
                $nativeRoot=if($request.type -eq 'text'){'Text'}elseif($request.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
                Assert-NativePayload $obj $presaveXml $nativeRoot $request.value
                $entry['referencePointXml']=$presaveXml.DocumentElement.GetAttribute('ReferencePoint')
                $entry['nativeType']=[int](Read-Property $obj 'Type')
                if($entry.nativeType -ne $(if($request.type -eq 'text'){5}else{4})){throw 'Native Type changed after geometry.'}

                $expectedState=[ordered]@{X=[double](Read-Property $obj 'X');Y=[double](Read-Property $obj 'Y');RotationAngle=[double](Read-Property $obj 'RotationAngle');DoNotPrint=[bool](Read-Property $obj 'DoNotPrint');FontSize=$null;FontName=$null;Height=$null;XDimension=$null;raster=$null}
                if($request.type -eq 'text'){
                    $expectedState.FontSize=[double](Read-Property $obj 'FontSize');$expectedState.FontName=[string](Read-Property $obj 'FontName')
                    if($expectedState.FontName -cne [string]$request.fontName -or (Get-NativeTextFontNode $presaveXml).GetAttribute('FontName') -cne [string]$request.fontName){throw 'Presave FontName differs from requested font.'}
                    Assert-NativeNear $expectedState.FontSize $request.fontSizePt 0.05 'Presave FontSize'
                }
                elseif($request.type -eq 'code128'){$expectedState.Height=[double](Read-Property $obj 'Height')}
                if($request.type -ne 'text'){
                    $finalXml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));$expectedState.XDimension=Get-NativeXDimension $finalXml
                    if((Get-NativeHumanReadableVisibility $finalXml) -cne 'None'){throw 'Caption reappeared before SaveAs.'}
                    if($expectedState.XDimension.index -ne $entry.sizing.selected.xDimension.index){throw 'Geometry changed the selected XDimension.'}
                    Assert-NativeNear $expectedState.XDimension.mils $entry.sizing.selected.xDimension.mils 0.02 'Final XDimension'
                    $expectedState.raster=Export-NativeMeasurement $obj ($prefix+'-presave.bmp') $dpi
                    Assert-NativeRaster $expectedState.raster
                    $entry['presaveRaster']=$expectedState.raster
                    if([math]::Abs($request.rotationDeg) -lt 0.001){Assert-NativeNear $expectedState.raster.inkWidthPx $entry.sizing.selected.raster.inkWidthPx 1 'Presave sizing width'}
                }
                foreach($flag in @('bold','italic')){
                    if($null -ne $request.PSObject.Properties[$flag]){
                        $prop=if($flag -eq 'bold'){'FontBold'}else{'FontItalic'}
                        if([bool](Read-Property $obj $prop) -ne [bool]$request.$flag){throw ('Style readback mismatch: '+$prop)}
                    }
                }
                $expectedState['xmlKey']=Get-NativeXmlKey $presaveXml
                $physicalMap+=,[ordered]@{id=$request.id;name=$name;type=$request.type;request=$request;expected=$expectedState}
            }catch{$entry.errors+=$_.Exception.Message;throw}
            finally{Release-NativeCom $obj;Save-NativeJson $report (Join-Path $runDir 'native-build-report.json')}
        }
        Assert-NativeSourceIsolation $objects
        Assert-NativeNameSet @($physicalMap|ForEach-Object{$_.name}) @(Get-NativeObjectNames $objects)
        [void](Invoke-ComMethod $document 'SaveAs' @($candidate,$false))
        Release-NativeCom $objects;$objects=$null;[void](Invoke-ComMethod $document 'Close' @(1));Release-NativeCom $document;$document=$null
        if(-not(Test-Path -LiteralPath $candidate) -or (Get-Item -LiteralPath $candidate).Length -le 0){throw 'SaveAs produced no native-output.btw.'}
        $savedHash=(Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
        $document=Invoke-ComMethod $formats 'Open' @($candidate,$false,'');Write-Property $document 'MeasurementUnits' 3
        $reopenState=Get-NativePageState $document
        if($reopenState.printer -cne $report.page.printer){throw 'Reopen printer changed; XDimension quantization is not comparable.'}
        foreach($k in @('PaperWidth','PaperHeight','LabelWidth','LabelHeight','MarginLeft','MarginRight','MarginTop','MarginBottom')){Assert-NativeNear $reopenState[$k] $report.page[$k] 0.05 ('Reopen '+$k)}
        $report['reopenPage']=$reopenState
        $objects=Read-Property $document 'Objects'
        $reopenNames=@(Get-NativeObjectNames $objects);Assert-NativeNameSet @($physicalMap|ForEach-Object{$_.name}) $reopenNames
        Assert-NativeSourceIsolation $objects
        foreach($m in @($physicalMap)){
            ('Verify/edit '+$m.id)|Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
            $obj=Find-NativeObject $objects ([string]$m.name)
            try{
                $expectedType=if($m.type -eq 'text'){5}else{4}
                if([int](Read-Property $obj 'Type') -ne $expectedType){throw ('Reopen native Type mismatch: '+$m.id)}
                if([string](Read-Property $obj 'Value') -cne [string]$m.request.value){throw ('Reopen payload mismatch: '+$m.id)}
                $root=if($m.type -eq 'text'){'Text'}elseif($m.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
                $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));$st=Get-NativeLiteralState $xml $root;if($st.value -cne [string]$m.request.value){throw ('Reopen literal source mismatch: '+$m.id)}
                $xml.OuterXml|Set-Content -LiteralPath (Join-Path $runDir ('reopen-'+$m.id+'.xml')) -Encoding UTF8
                if((Get-NativeXmlKey $xml) -cne $m.expected.xmlKey){throw ('Reopen XML state mismatch: '+$m.id)}
                if([bool](Read-Property $obj 'DoNotPrint')){throw ('Reopen object became DoNotPrint: '+$m.id)}
                foreach($key in @('X','Y','RotationAngle')){$actual=[double](Read-Property $obj $key);Assert-NativeFinite $actual $key;if([math]::Abs($actual-[double]$m.expected[$key]) -gt 0.02){throw ('Reopen geometry mismatch '+$m.id+'.'+$key)}}
                if($m.type -eq 'text'){
                    Assert-NativeNear ([double](Read-Property $obj 'FontSize')) ([double]$m.expected['FontSize']) 0.02 ('Reopen FontSize '+$m.id)
                    if([string](Read-Property $obj 'FontName') -cne [string]$m.expected['FontName']){throw ('Reopen FontName mismatch: '+$m.id)}
                }elseif($m.type -eq 'code128'){
                    Assert-NativeNear ([double](Read-Property $obj 'Height')) ([double]$m.expected['Height']) 0.02 ('Reopen Height '+$m.id)
                    if((Get-NativeHumanReadableVisibility $xml) -cne 'None'){throw ('Reopen HumanReadable mismatch: '+$m.id)}
                }
                if($m.type -ne 'text'){
                    $x=Get-NativeXDimension $xml;$ex=$m.expected['XDimension']
                    if($x.index -ne $ex.index -or [math]::Abs($x.mils-$ex.mils) -gt 0.02 -or [math]::Abs($x.millimeters-$ex.millimeters) -gt 0.011){throw ('Reopen XDimension mismatch: '+$m.id)}
                    $rr=Export-NativeMeasurement $obj (Join-Path $runDir ('reopen-'+$m.id+'.bmp')) $dpi
                    Assert-NativeRaster $rr
                    if($rr.physicalMmTrust -cne $m.expected['raster'].physicalMmTrust -or [math]::Abs($rr.inkWidthPx-$m.expected['raster'].inkWidthPx) -gt 1 -or [math]::Abs($rr.inkHeightPx-$m.expected['raster'].inkHeightPx) -gt 1){throw ('Reopen raster repeatability mismatch: '+$m.id)}
                }
                $e=@($report.objects|Where-Object{$_.id -ceq $m.id})[0];$e.persistence='SAVE_CLOSE_REOPEN_READBACK_OK'
            }finally{Release-NativeCom $obj}
        }
        foreach($m in @($physicalMap)){
            ('Verify/edit '+$m.id)|Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
            $obj=Find-NativeObject $objects $m.name
            $root=if($m.type -eq 'text'){'Text'}elseif($m.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
            try{
                [void](Set-NativeObjectPayload $objects $obj ('NATIVE-EDIT-'+$m.id) $root (Join-Path $runDir ('edit-'+$m.id)))
            }finally{
                try{[void](Set-NativeObjectPayload $objects $obj ([string]$m.request.value) $root (Join-Path $runDir ('restore-'+$m.id)));if((Get-NativeXmlKey (Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true))))) -cne $m.expected.xmlKey){throw 'Post-edit restored XML differs from saved state.'}}finally{Release-NativeCom $obj}
            }
            $e=@($report.objects|Where-Object{$_.id -ceq $m.id})[0];$e['reopenEditable']='SECOND_PAYLOAD_AND_PEER_ISOLATION_OK'
        }
        Release-NativeCom $objects;$objects=$null
        [void](Invoke-ComMethod $document 'Close' @(1));Release-NativeCom $objects;$objects=$null;Release-NativeCom $document;$document=$null
        if((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -cne $savedHash){throw 'Output changed during read-only reopen verification.'}
        Move-Item -LiteralPath $candidate -Destination $accepted
        $report.status='NATIVE_LAYOUT_CANDIDATE_REOPEN_OK';$report.reopen='PASS';$report.output=$accepted;$report.outputSha256=$savedHash
        Save-NativeJson $report (Join-Path $runDir 'native-build-report.json')
        return $report
    }catch{
        $report.status='FAILED_OR_BLOCKED';$report.output=$null;$report.outputSha256=$null;$report['error']=$_.Exception.ToString();Save-NativeJson $report (Join-Path $runDir 'native-build-report.json');throw
    }finally{
        if($null -ne $document){try{[void](Invoke-ComMethod $document 'Close' @(1))}catch{}}
        Release-NativeCom $objects;Release-NativeCom $document
        if($report.status -eq 'FAILED_OR_BLOCKED'){
            foreach($f in @($candidate,$accepted)){
                if(Test-Path -LiteralPath $f){try{Move-Item -LiteralPath $f -Destination ($f+'.FAILED_UNVERIFIED') -Force}catch{$report.warnings+=('Quarantine failed: '+$_.Exception.Message)}}
            }
            Save-NativeJson $report (Join-Path $runDir 'native-build-report.json')
        }
    }
}
Export-ModuleMember -Function Test-NativeLayoutInput,Invoke-NativeLayoutBuild
