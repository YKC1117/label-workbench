Set-StrictMode -Version 2
$ErrorActionPreference='Stop'

function Read-HybridPayloadXml([string]$text) {
    $settings=New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver=$null
    $reader=[System.Xml.XmlReader]::Create((New-Object IO.StringReader($text)),$settings)
    try{
        $doc=New-Object System.Xml.XmlDocument
        $doc.XmlResolver=$null;$doc.PreserveWhitespace=$true;$doc.Load($reader)
        return ,$doc
    }finally{$reader.Dispose()}
}
function New-HybridPayloadImport($export,[string]$name,[string]$beforeValue,[string]$payload) {
    $write=Read-HybridPayloadXml $export.OuterXml
    if($write.DocumentElement.LocalName -cne 'Command'){throw 'Hybrid payload export root must be Command.'}
    $merges=@($write.SelectNodes('/Command/DataMerge'))
    if($merges.Count -ne 1){throw 'Hybrid payload requires one DataMerge.'}
    $rows=@($merges[0].SelectNodes('./Object'))
    $matched=@($rows|Where-Object{$_.GetAttribute('Name') -ceq $name})
    if($matched.Count -ne 1){throw ('Hybrid cannot map exactly one exported object: '+$name)}
    $target=$matched[0]
    $subs=@($target.SelectNodes('./SubString'))
    if($subs.Count -ne 1 -or $subs[0].GetAttribute('Position') -cne '0'){throw 'Hybrid target must export one SubString at Position 0.'}
    $values=@($subs[0].SelectNodes('./Value'))
    if($values.Count -ne 1){throw 'Hybrid exported literal is missing or ambiguous.'}
    $value=$values[0]
    if($value.HasAttribute('Encoding')){
        if($value.GetAttribute('Encoding') -ine 'base64'){throw 'Unsupported Hybrid value encoding.'}
        $enc=New-Object System.Text.UnicodeEncoding($false,$false,$true)
        $bytes=[Convert]::FromBase64String($value.InnerText)
        if($bytes.Length % 2){throw 'Invalid Hybrid UTF-16LE length.'}
        $old=$enc.GetString($bytes)
        if($old -cne $beforeValue){throw 'Hybrid exported source value mismatch.'}
        $value.InnerText=[Convert]::ToBase64String($enc.GetBytes($payload))
    }else{
        if($value.InnerText -cne $beforeValue){throw 'Hybrid exported source value mismatch.'}
        $value.InnerText=$payload
    }
    # No unrelated Object or pseudo-object is sent through the global import API.
    foreach($row in $rows){if(-not [object]::ReferenceEquals($row,$target)){[void]$merges[0].RemoveChild($row)}}
    if(@($write.SelectNodes('//Object')).Count -ne 1 -or @($write.SelectNodes('//Value')).Count -ne 1){throw 'Hybrid sparse import escaped the one-object contract.'}
    return ,$write
}
function Get-HybridXmlMap($node,[string]$path='') {
    $map=@{}
    function Visit-HybridXml($n,[string]$p,$out) {
        if($n -is [System.Xml.XmlElement]){
            $out[$p+'/#element']=$n.NamespaceURI+'|'+$n.LocalName
            foreach($a in $n.Attributes){$out[$p+'/@'+$a.NamespaceURI+'|'+$a.LocalName]=$a.Value}
            $index=0
            foreach($child in $n.ChildNodes){
                if($child -is [System.Xml.XmlWhitespace]){continue}
                Visit-HybridXml $child ($p+'/'+$index) $out;$index++
            }
        }else{$out[$p+'/#'+[string]$n.NodeType]=[string]$n.Value}
    }
    Visit-HybridXml $node.DocumentElement '/root' $map
    return ,$map
}
function Get-HybridXmlDifferences([string]$before,[string]$after) {
    $left=Get-HybridXmlMap (Read-HybridPayloadXml $before)
    $right=Get-HybridXmlMap (Read-HybridPayloadXml $after)
    foreach($key in @(@($left.Keys)+@($right.Keys)|Sort-Object -Unique)){
        if(-not $left.ContainsKey($key) -or -not $right.ContainsKey($key) -or $left[$key] -cne $right[$key]){
            [pscustomobject]@{path=$key;before=if($left.ContainsKey($key)){$left[$key]}else{$null};after=if($right.ContainsKey($key)){$right[$key]}else{$null}}
        }
    }
}
function Get-HybridXmlSemantics([string]$text) {
    $doc=Read-HybridPayloadXml $text;$root=$doc.DocumentElement
    $nodes=@{}
    foreach($key in @('DataSources','HumanReadable','XDimension','Font')){
        $n=$root.SelectSingleNode('./*[local-name()="'+$key+'"]')
        $nodes[$key]=if($null -ne $n){$n.OuterXml}else{$null}
    }
    return [ordered]@{name=$root.GetAttribute('Name');root=$root.LocalName;attributes=@($root.Attributes|ForEach-Object{[ordered]@{name=$_.Name;value=$_.Value}});embeddedIds=@($root.SelectNodes('.//*[local-name()="EmbeddedDataSource"]')|ForEach-Object{$_.GetAttribute('ID')});transforms=@($root.SelectNodes('.//*[contains(local-name(),"Transform")]')|ForEach-Object{$_.OuterXml});protectedNodes=$nodes}
}
Export-ModuleMember -Function New-HybridPayloadImport,Get-HybridXmlDifferences,Get-HybridXmlSemantics
