$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'NativeLayoutEngine.psm1') -Force
$count=0
function Assert($condition,[string]$message){if(-not $condition){throw $message};$script:count++}
function Load([string]$json){return $json|ConvertFrom-Json}
$good=Load '{"schema":"lwb-native-layout-v1","widthMm":140,"heightMm":38,"objects":[{"id":"TEXT_001","type":"text","value":"001 中文","xMm":2.5,"yMm":2.5,"fontSizePt":8},{"id":"C128_001","type":"code128","value":"001234","xMm":2.5,"yMm":8,"widthMm":32,"heightMm":4.5},{"id":"DM_001","type":"datamatrix","value":"DM","xMm":116,"yMm":2,"sizeMm":12}]}'
$p=Test-NativeLayoutInput $good
Assert ($p.objects.Count -eq 3) 'Valid layout object count changed.'
Assert ($p.objects[1].value -ceq '001234') 'Leading zero payload lost.'
Assert ($p.objects[1].humanReadable -ceq 'none') 'Code128 product rule must hide built-in caption.'
Assert ($p.objects[2].widthMm -eq 12 -and $p.objects[2].heightMm -eq 12) 'DataMatrix must normalize to a square target.'
$bad=Load '{"schema":"lwb-native-layout-v1","widthMm":140,"heightMm":38,"objects":[{"id":"TEXT_001","type":"text","value":"x","xMm":2.5,"yMm":2.5}]}'
$failed=$false;try{$null=Test-NativeLayoutInput $bad}catch{$failed=$true};Assert $failed 'Text without fontSizePt was accepted.'
$bad=Load '{"schema":"lwb-native-layout-v1","widthMm":140,"heightMm":38,"objects":[{"id":"C128_001","type":"code128","value":"x","xMm":2.5,"yMm":8,"widthMm":32,"heightMm":4.5},{"id":"C128_001","type":"code128","value":"y","xMm":2.5,"yMm":18,"widthMm":32,"heightMm":4.5}]}'
$failed=$false;try{$null=Test-NativeLayoutInput $bad}catch{$failed=$true};Assert $failed 'Duplicate ids were accepted.'
$bad=Load '{"schema":"wrong","widthMm":140,"heightMm":38,"objects":[{"id":"TEXT_001","type":"text","value":"x","xMm":1,"yMm":1,"fontSizePt":8}]}'
$failed=$false;try{$null=Test-NativeLayoutInput $bad}catch{$failed=$true};Assert $failed 'Wrong schema was accepted.'

$bad=Load '{"schema":"lwb-native-layout-v1","widthMm":140,"heightMm":38,"objects":[{"id":"TEXT_001","type":"text","value":"x","xMm":1,"yMm":1,"fontSizePt":8,"typo":1}]}'
$failed=$false;try{$null=Test-NativeLayoutInput $bad}catch{$failed=$true};Assert $failed 'Unknown object field was silently accepted.'

function RejectInput($v,[string]$message){$failed=$false;try{$null=Test-NativeLayoutInput $v}catch{$failed=$true};Assert $failed $message}
function Fresh {return ($good|ConvertTo-Json -Depth 10|ConvertFrom-Json)}
$v=Fresh;$v.objects[0].id='text_001';RejectInput $v 'Lowercase ID accepted despite case-sensitive contract.'
$v=Fresh;$v.objects[0].type='TEXT';RejectInput $v 'Case variant type accepted.'
$v=Fresh;$v|Add-Member NoteProperty typo 1;RejectInput $v 'Unknown top-level field accepted.'
$v=Fresh;$v.objects[0]|Add-Member NoteProperty fontName 123;RejectInput $v 'Numeric fontName coerced.'
$v=Fresh;$v.objects[0].value="line1`nline2";RejectInput $v 'Multiline text accepted.'
$v=Fresh;$v.objects[2]|Add-Member NoteProperty widthMm 13;RejectInput $v 'Conflicting DataMatrix sizes accepted.'
$v=Fresh;$v.widthMm=[double]::NaN;RejectInput $v 'NaN page size accepted.'
$v=Fresh;$v.objects[0].xMm=[double]::PositiveInfinity;RejectInput $v 'Infinite position accepted.'
$v=Fresh;$v|Add-Member NoteProperty printerName 123;RejectInput $v 'Numeric printer name coerced.'
$v=Fresh;$v.objects=@($v.objects[0]);$one=Test-NativeLayoutInput $v;Assert (@($one.objects).Count -eq 1) 'Singleton layout flattened incorrectly.'
Write-Host ("PASS: "+$count+" NativeLayout input assertions. COM/BarTender NOT RUN by this test.")
