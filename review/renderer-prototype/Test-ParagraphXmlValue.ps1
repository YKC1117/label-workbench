[CmdletBinding()]
param()
# Offline regression for ParagraphXmlValue.psm1. Runs under Windows PowerShell 5.1
# (invoked by Invoke-ProbeDispatch.ps1 before the native-paragraph probe) and pwsh.
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'ParagraphXmlValue.psm1') -Force
$script:n=0;$script:failed=@()
function T([string]$name,[scriptblock]$body){try{if(-not (& $body)){$script:failed+=,$name}}catch{$script:failed+=,($name+': '+$_.Exception.Message)};$script:n++}
function V([string]$inner){$d=New-Object Xml.XmlDocument;$d.LoadXml('<Value'+$inner+'</Value>');return $d.DocumentElement}
function B([byte[]]$b){return [Convert]::ToBase64String($b)}
$utf8=New-Object Text.UTF8Encoding($false)
$crlf=[string][char]13+[char]10
# Run51 observed CRLF payload (NATIVE_PARAGRAPH_HANDOFF.md section 8).
$run51='FIRST PARAGRAPH LINE'+$crlf+'SECOND PARAGRAPH LINE'
$run51B64=B ($utf8.GetBytes($run51))
function TextXml([string]$valueXml){return '<Text Name="T"><Tabs/><Font PointSize="8.000" FontName="Arial"/><DataSources><EmbeddedDataSource ID="{A}" SubStringListStringID="4294967295" CharSet="136" CultureID="-3" InputCultureID="1028">'+$valueXml+'</EmbeddedDataSource></DataSources></Text>'}

# Positive: observed Base64 UTF-8 with CRLF preserved byte for byte.
T 'run51 Base64 UTF-8 CRLF decodes exactly' {$r=Get-ObjectXmlValueLiteral (V (' Encoding="Base64">'+$run51B64));$r.ok -and $r.literal -ceq $run51 -and $r.literal.Contains($crlf) -and $r.encoding -ceq 'Base64'}
T 'CRLF not normalised to LF' {$r=Get-ObjectXmlValueLiteral (V (' Encoding="Base64">'+$run51B64));$r.literal.Length -eq $run51.Length -and $r.literal.IndexOf([char]13) -eq 20}
T 'plain value without Encoding' {$r=Get-ObjectXmlValueLiteral (V '>NATIVE MIXED LABEL');$r.ok -and $r.literal -ceq 'NATIVE MIXED LABEL' -and $r.encoding -ceq 'none'}
T 'non-ASCII UTF-8 in observed format' {$s=[string][char]0x6A19+[char]0x7C64+$crlf+'TEXT';$r=Get-ObjectXmlValueLiteral (V (' Encoding="Base64">'+(B ($utf8.GetBytes($s)))));$r.ok -and $r.literal -ceq $s}
T 'clean Text XML returns decoded CRLF literal' {$c=Test-CleanTextXml (TextXml ('<Value Encoding="Base64">'+$run51B64+'</Value>'));$null -ne $c -and $c.value -ceq $run51 -and $c.valueEncoding -ceq 'Base64' -and $c.sourceId -ceq '{A}'}
T 'clean Text XML plain value' {$c=Test-CleanTextXml (TextXml '<Value>ABC</Value>');$null -ne $c -and $c.value -ceq 'ABC'}

# Negative: every unobserved or malformed form fails closed.
function Rej([string]$inner,[string]$expect){$r=Get-ObjectXmlValueLiteral (V $inner);return ((-not $r.ok) -and $null -eq $r.literal -and $r.error -like ($expect+'*'))}
T 'lowercase base64 (DataMerge spelling) rejected in object XML' {Rej (' Encoding="base64">'+$run51B64) 'UNOBSERVED_VALUE_ENCODING'}
T 'UTF-16 encoding name rejected' {Rej (' Encoding="UTF-16">'+$run51B64) 'UNOBSERVED_VALUE_ENCODING'}
T 'empty Encoding rejected' {Rej (' Encoding="">'+$run51B64) 'UNOBSERVED_VALUE_ENCODING'}
T 'extra attribute rejected' {Rej (' Encoding="Base64" Charset="x">'+$run51B64) 'UNOBSERVED_VALUE_ATTRIBUTE'}
T 'empty Base64 rejected' {Rej ' Encoding="Base64">' 'EMPTY_BASE64_NOT_OBSERVED'}
T 'embedded whitespace rejected' {Rej (' Encoding="Base64">'+$run51B64.Substring(0,8)+' '+$run51B64.Substring(8)) 'NON_CANONICAL_BASE64_TEXT'}
T 'line-wrapped Base64 rejected' {Rej (' Encoding="Base64">'+$run51B64.Substring(0,8)+[char]10+$run51B64.Substring(8)) 'NON_CANONICAL_BASE64_TEXT'}
T 'illegal character rejected' {Rej ' Encoding="Base64">QUJD*A==' 'NON_CANONICAL_BASE64_TEXT'}
T 'bad length rejected' {Rej ' Encoding="Base64">QUJDR' 'NON_CANONICAL_BASE64_TEXT'}
T 'missing padding rejected' {Rej ' Encoding="Base64">QQ' 'NON_CANONICAL_BASE64_TEXT'}
T 'URL-safe alphabet rejected' {Rej ' Encoding="Base64">-_-_' 'NON_CANONICAL_BASE64_TEXT'}
T 'non-zero padding bits rejected' {Rej ' Encoding="Base64">QR==' 'BASE64_ROUND_TRIP_MISMATCH'}
T 'invalid UTF-8 rejected' {Rej (' Encoding="Base64">'+(B ([byte[]](0xC3,0x28)))) 'INVALID_UTF8'}
T 'overlong UTF-8 rejected' {Rej (' Encoding="Base64">'+(B ([byte[]](0xC0,0xAF)))) 'INVALID_UTF8'}
T 'UTF-8 BOM rejected' {Rej (' Encoding="Base64">'+(B ([byte[]](0xEF,0xBB,0xBF,0x41)))) 'UTF8_BOM_NOT_OBSERVED'}
T 'UTF-16LE bytes under Base64 rejected as invalid UTF-8 or mismatch' {$u=(New-Object Text.UnicodeEncoding($false,$false)).GetBytes('A'+[char]0xD800);$r=Get-ObjectXmlValueLiteral (V (' Encoding="Base64">'+(B $u)));-not $r.ok}
T 'UTF-16LE ASCII bytes decode to NULs, never equal to the text' {$u=(New-Object Text.UnicodeEncoding($false,$false)).GetBytes('AB');$r=Get-ObjectXmlValueLiteral (V (' Encoding="Base64">'+(B $u)));(-not $r.ok) -or (-not (Test-OrdinalEqual $r.literal 'AB'))}
T 'clean Text with bad Base64 returns null with reason' {$why=$null;$c=Test-CleanTextXml (TextXml '<Value Encoding="Base64">QR==</Value>') ([ref]$why);$null -eq $c -and $why -ceq 'VALUE_BASE64_ROUND_TRIP_MISMATCH'}
T 'clean Text with lowercase base64 returns null' {$why=$null;$c=Test-CleanTextXml (TextXml ('<Value Encoding="base64">'+$run51B64+'</Value>')) ([ref]$why);$null -eq $c -and $why -like 'VALUE_UNOBSERVED_VALUE_ENCODING*'}
T 'two Values rejected' {$why=$null;$c=Test-CleanTextXml (TextXml '<Value>A</Value><Value>B</Value>') ([ref]$why);$null -eq $c -and $why -ceq 'NOT_ONE_VALUE'}
T 'transform rejected' {$why=$null;$c=Test-CleanTextXml (TextXml '<Transforms><PrefixTransform/></Transforms><Value>A</Value>') ([ref]$why);$null -eq $c -and $why -ceq 'TRANSFORM_PRESENT'}
T 'reason parameter optional' {$c=Test-CleanTextXml (TextXml '<Value>A</Value>');$null -ne $c}
# Ordinal exactness: linguistic -ceq ignores these characters; gates must not.
foreach($cp in @(0x0000,0x00AD,0x200B,0x200D,0xFEFF)){
 $ch=[char]$cp;$hex=('U+{0:X4}' -f $cp)
 T ('ordinal detects '+$hex) {-not (Test-OrdinalEqual ('A'+$ch+'B') 'AB')}
}
T 'ordinal equal identical' {Test-OrdinalEqual ('A'+$crlf+'B') ('A'+$crlf+'B')}
T 'ordinal null handling' {(Test-OrdinalEqual $null $null) -and -not (Test-OrdinalEqual $null '') -and -not (Test-OrdinalEqual '' $null)}
T 'ordinal is case sensitive' {-not (Test-OrdinalEqual 'Base64' 'base64')}
# Raw Base64 text must never be accepted as the literal (the Run51 bug).
T 'Run51 bug regression: literal is not the Base64 text' {$c=Test-CleanTextXml (TextXml ('<Value Encoding="Base64">'+$run51B64+'</Value>'));$c.value -cne $run51B64}

if($script:failed.Count){Write-Host ('ParagraphXmlValue regression FAIL: '+($script:failed -join ' | '));exit 1}
Write-Host ('ParagraphXmlValue regression: '+$script:n+'/'+$script:n+' PASS (PowerShell '+$PSVersionTable.PSVersion+')')
exit 0
