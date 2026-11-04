Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
# Strict decoder for the <Value> literal inside a BarTender object GetXML.
#
# Observed contracts (do not mix them):
#  - Object GetXML <Value Encoding="Base64">: UTF-8 bytes, Base64 text.
#    Source: Run51 (actions run 41760467332), CRLF payload
#    "FIRST PARAGRAPH LINE<CR><LF>SECOND PARAGRAPH LINE" (NATIVE_PARAGRAPH_HANDOFF.md s.8).
#  - DataMerge ExportDataSourceValuesToXML <Value Encoding="base64">: UTF-16LE.
#    That path is owned by HybridPayload/NativeLayoutEngine and is NOT handled here.
#
# Anything not observed fails closed: other Encoding spellings or values, empty
# Base64, whitespace or non-alphabet characters, non-canonical padding, a UTF-8
# BOM, or invalid UTF-8. No tolerance is added to make a comparison pass.
$script:ObservedObjectEncoding='Base64'
$script:Canonical='^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'

function Get-ObjectXmlValueLiteral($valueElement){
 $r=[ordered]@{ok=$false;encoding=$null;literal=$null;error=$null}
 if($null -eq $valueElement -or -not ($valueElement -is [Xml.XmlElement])){$r.error='VALUE_ELEMENT_MISSING';return $r}
 if(-not $valueElement.HasAttribute('Encoding')){$r.encoding='none';$r.literal=$valueElement.InnerText;$r.ok=$true;return $r}
 $enc=$valueElement.GetAttribute('Encoding');$r.encoding=$enc
 if($enc -cne $script:ObservedObjectEncoding){$r.error='UNOBSERVED_VALUE_ENCODING:'+$enc;return $r}
 foreach($a in @($valueElement.Attributes)){if($a.Name -cne 'Encoding'){$r.error='UNOBSERVED_VALUE_ATTRIBUTE:'+$a.Name;return $r}}
 $text=$valueElement.InnerText
 if([string]::IsNullOrEmpty($text)){$r.error='EMPTY_BASE64_NOT_OBSERVED';return $r}
 if($text -cnotmatch $script:Canonical){$r.error='NON_CANONICAL_BASE64_TEXT';return $r}
 try{$bytes=[Convert]::FromBase64String($text)}catch{$r.error='BASE64_DECODE_FAILED';return $r}
 if($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF){$r.error='UTF8_BOM_NOT_OBSERVED';return $r}
 $utf8=New-Object Text.UTF8Encoding($false,$true)
 try{$literal=$utf8.GetString($bytes)}catch{$r.error='INVALID_UTF8';return $r}
 # Round trip must reproduce the exact Base64 text (rejects stray padding bits).
 if(-not (Test-OrdinalEqual ([Convert]::ToBase64String($utf8.GetBytes($literal))) $text)){$r.error='BASE64_ROUND_TRIP_MISMATCH';return $r}
 $r.literal=$literal;$r.ok=$true;return $r
}

# Clean Designer Text acceptance (same rule as NativeLayoutEngine Get-NativeLiteralState)
# plus the strict Value decoding above. Returns $null when not acceptable; the
# reason is available through -Reason.
function Test-CleanTextXml([string]$xmlText,[ref]$Reason){
 if($null -ne $Reason){$Reason.Value=$null}
 $fail={param($why) if($null -ne $Reason){$Reason.Value=$why};return $null}
 $d=New-Object Xml.XmlDocument;$d.LoadXml($xmlText)
 if($d.DocumentElement.LocalName -cne 'Text'){return (& $fail 'ROOT_NOT_TEXT')}
 $ds=$d.SelectSingleNode('/*/*[local-name()="DataSources"]');if($null -eq $ds){return (& $fail 'DATASOURCES_MISSING')}
 $kids=@($ds.ChildNodes|Where-Object{$_ -is [Xml.XmlElement]})
 if($kids.Count -ne 1 -or $kids[0].LocalName -cne 'EmbeddedDataSource'){return (& $fail 'NOT_ONE_EMBEDDED_SOURCE')}
 $s=$kids[0]
 if(@($s.SelectNodes('.//*[contains(local-name(),"Transform")]')).Count -ne 0){return (& $fail 'TRANSFORM_PRESENT')}
 foreach($a in @('Name','DataSourceName')){if($s.HasAttribute($a) -and $s.GetAttribute($a)){return (& $fail 'NAMED_SOURCE')}}
 if($s.HasAttribute('SubStringListStringID') -and $s.GetAttribute('SubStringListStringID') -cne '4294967295'){return (& $fail 'SHARED_SOURCE')}
 if([string]::IsNullOrWhiteSpace($s.GetAttribute('ID'))){return (& $fail 'SOURCE_ID_MISSING')}
 $v=@($s.SelectNodes('./*[local-name()="Value"]'));if($v.Count -ne 1){return (& $fail 'NOT_ONE_VALUE')}
 $lit=Get-ObjectXmlValueLiteral $v[0]
 if(-not $lit.ok){return (& $fail ('VALUE_'+$lit.error))}
 return [ordered]@{sourceId=$s.GetAttribute('ID');value=$lit.literal;valueEncoding=$lit.encoding}
}
# PowerShell -ceq/-cne use a linguistic comparison that IGNORES characters such as
# U+0000, U+00AD, U+200B, U+200D and U+FEFF ("A"+NUL+"B" -ceq "AB" is True).
# Every exactness gate in this probe layer uses ordinal comparison instead.
function Test-OrdinalEqual($a,$b){
 if($null -eq $a -and $null -eq $b){return $true}
 if($null -eq $a -or $null -eq $b){return $false}
 return [string]::Equals([string]$a,[string]$b,[StringComparison]::Ordinal)
}
Export-ModuleMember -Function Get-ObjectXmlValueLiteral,Test-CleanTextXml,Test-OrdinalEqual
