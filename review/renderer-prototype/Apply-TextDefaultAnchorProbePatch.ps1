[CmdletBinding()]
param(
    [string]$EnginePath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($EnginePath)) {
    $EnginePath = Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\NativeLayoutEngine.psm1'
}
$EnginePath = [IO.Path]::GetFullPath($EnginePath)
if (-not (Test-Path -LiteralPath $EnginePath -PathType Leaf)) {
    throw ('NativeLayoutEngine.psm1 not found: ' + $EnginePath)
}

function Replace-Exact([string]$Source,[string]$Old,[string]$New,[string]$Label) {
    $count = ([regex]::Matches($Source, [regex]::Escape($Old))).Count
    if ($count -ne 1) { throw ($Label + ' expected exactly one source match; found ' + $count + '.') }
    $out = $Source.Replace($Old,$New)
    if ($out -eq $Source -or $out.Contains($Old)) { throw ($Label + ' did not apply cleanly.') }
    return $out
}

function Replace-FunctionRange([string]$Source,[string]$StartMarker,[string]$EndMarker,[string]$Replacement,[string]$Label) {
    $start = $Source.IndexOf($StartMarker,[StringComparison]::Ordinal)
    if ($start -lt 0 -or $Source.IndexOf($StartMarker,$start + $StartMarker.Length,[StringComparison]::Ordinal) -ge 0) {
        throw ($Label + ' start marker is missing or ambiguous.')
    }
    $end = $Source.IndexOf($EndMarker,$start + $StartMarker.Length,[StringComparison]::Ordinal)
    if ($end -lt 0) { throw ($Label + ' end marker is missing.') }
    return $Source.Substring(0,$start) + $Replacement + $Source.Substring($end)
}

$text = [IO.File]::ReadAllText($EnginePath, [Text.Encoding]::UTF8)

# 1) Fresh Text: BarTender documents Top Left as the default anchor, while
# fresh Text GetXML on the real 2022 runtime omits ReferencePoint entirely.
# Barcode requests still require explicit TopLeft and strict XML readback.
$oldAnchor = "            if(`$o.referencePoint -cne 'TopLeft' -or `$o.rotationDeg -ne 0){throw 'Unsupported prototype anchor or angle.'}"
$newAnchor = @"
            `$hasReferencePoint=(`$null -ne `$o.PSObject.Properties['referencePoint'])
            `$explicitTopLeft=(`$hasReferencePoint -and [string]`$o.referencePoint -ceq 'TopLeft')
            `$textDefaultTopLeft=(`$o.type -eq 'text' -and -not `$hasReferencePoint -and `$null -ne `$o.PSObject.Properties['anchorPolicy'] -and [string]`$o.anchorPolicy -ceq 'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE')
            if((-not (`$explicitTopLeft -or `$textDefaultTopLeft)) -or `$o.rotationDeg -ne 0){throw 'Unsupported prototype anchor or angle.'}
"@.TrimEnd("`r","`n")
$text = Replace-Exact $text $oldAnchor $newAnchor 'Text default-anchor validator patch'

# 2) Real BarTender 2022 runtime evidence proves IBtDesignObject.FontName is
# exposed by the typelib but rejects ordinary automation access with
# 0x8000FFFF (document-event-script-only property). The Text XML contains the
# existing direct Font/@FontName and survives payload roundtrip, so use a
# strict XML-only transaction for FontName while retaining COM validation for
# FontSize/X/Y/Rotation/identity.
$newFontFunction = @'
function Set-NativeTextFontName($obj,[string]$fontName,[string]$prefix='') {
    $baselineText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $baseline=Read-NativeXml $baselineText
    $literal=Get-NativeLiteralState $baseline 'Text';Assert-NativePayload $obj $baseline 'Text' $literal.value
    $font=Get-NativeTextFontNode $baseline
    $beforeName=[string]$font.GetAttribute('FontName')
    $result=[ordered]@{requested=$fontName;before=$beforeName;actual=$beforeName;writeMode='NOT_RUN';error=$null;rollback='NOT_NEEDED';protectedXmlPolicy='STRICT_ONLY_EXISTING_FONTNAME_ATTRIBUTE';runtimeEvidence='COM_FONTNAME_PROPERTY_RESTRICTED_XML_ONLY'}
    if($prefix){$baselineText|Set-Content -LiteralPath ($prefix+'-baseline.xml') -Encoding UTF8}
    $mutationAttempted=$false
    try{
        if($beforeName -ceq $fontName){$result.writeMode='ALREADY_MATCHED_XML';return $result}
        $request=Read-NativeXml $baselineText
        (Get-NativeTextFontNode $request).SetAttribute('FontName',$fontName)
        $proof=Read-NativeXml $request.OuterXml
        (Get-NativeTextFontNode $proof).SetAttribute('FontName',$beforeName)
        if((Get-NativeXmlKey $proof) -cne (Get-NativeXmlKey $baseline)){throw 'Font request changed XML outside FontName.'}
        if($prefix){$request.OuterXml|Set-Content -LiteralPath ($prefix+'-request.xml') -Encoding UTF8}
        $mutationAttempted=$true
        [void](Invoke-ComMethod $obj 'SetXML' @($request.OuterXml))
        $readbackText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
        $readback=Read-NativeXml $readbackText
        Assert-NativePayload $obj $readback 'Text' $literal.value
        if((Get-NativeTextFontNode $readback).GetAttribute('FontName') -cne $fontName){throw 'Font write XML readback mismatch.'}
        if((Get-NativeXmlKey $readback) -cne (Get-NativeXmlKey $request)){throw 'Font write changed protected XML outside FontName.'}
        if($prefix){$readbackText|Set-Content -LiteralPath ($prefix+'-xml-readback.xml') -Encoding UTF8}
        $result.actual=$fontName;$result.writeMode='XML_FONT_ATTRIBUTE_ONLY'
        return $result
    }catch{
        $failure=$_.Exception.ToString();$result.error=$failure;$result.actual=$null;$result.writeMode='FAILED'
        if($mutationAttempted){
            try{Restore-NativeXml $obj $baselineText $(if($prefix){$prefix+'-failure'}else{''});$result.rollback='BASELINE_RESTORED'}
            catch{$result.rollback='FAILED';$result.error=$failure+' | ROLLBACK_FAILED: '+$_.Exception.ToString()}
        }
        throw ('FontName XML transaction failed: '+$result.error)
    }finally{if($prefix){Save-NativeJson $result ($prefix+'-result.json')}}
}
'@
$text = Replace-FunctionRange $text 'function Set-NativeTextFontName(' 'function Set-NativeGeometry(' $newFontFunction 'FontName XML-only function patch'

# 3) Remove the remaining runtime reads of the restricted COM FontName
# property. Each readback uses the same direct Text/Font/@FontName node already
# protected by canonical XML equality.
$oldFinalRead = "        `$finalFont=[string](Read-Property `$obj 'FontName')"
$newFinalRead = "        `$finalFont=`$null"
$text = Replace-Exact $text $oldFinalRead $newFinalRead 'Final geometry FontName COM read patch'

$oldFinalCheck = "        if(`$finalFont -cne [string]`$request.fontName -or (Get-NativeTextFontNode `$finalFontXml).GetAttribute('FontName') -cne [string]`$request.fontName){throw 'FontName changed after final geometry writes.'}"
$newFinalCheck = "        `$finalFont=[string](Get-NativeTextFontNode `$finalFontXml).GetAttribute('FontName');if(`$finalFont -cne [string]`$request.fontName){throw 'FontName changed after final geometry writes.'}"
$text = Replace-Exact $text $oldFinalCheck $newFinalCheck 'Final geometry FontName XML read patch'

$oldPresave = "                    `$expectedState.FontSize=[double](Read-Property `$obj 'FontSize');`$expectedState.FontName=[string](Read-Property `$obj 'FontName')"
$newPresave = "                    `$expectedState.FontSize=[double](Read-Property `$obj 'FontSize');`$expectedState.FontName=[string](Get-NativeTextFontNode `$presaveXml).GetAttribute('FontName')"
$text = Replace-Exact $text $oldPresave $newPresave 'Presave FontName XML read patch'

$oldReopen = "                    if([string](Read-Property `$obj 'FontName') -cne [string]`$m.expected['FontName']){throw ('Reopen FontName mismatch: '+`$m.id)}"
$newReopen = "                    if([string](Get-NativeTextFontNode `$xml).GetAttribute('FontName') -cne [string]`$m.expected['FontName']){throw ('Reopen FontName mismatch: '+`$m.id)}"
$text = Replace-Exact $text $oldReopen $newReopen 'Reopen FontName XML read patch'

foreach($forbidden in @(
    "`$finalFont=[string](Read-Property `$obj 'FontName')",
    "`$expectedState.FontName=[string](Read-Property `$obj 'FontName')",
    "if([string](Read-Property `$obj 'FontName') -cne [string]`$m.expected['FontName'])"
)) {
    if($text.Contains($forbidden)){throw ('Restricted FontName COM read remains after patch: '+$forbidden)}
}
if (-not $text.Contains('COM_FONTNAME_PROPERTY_RESTRICTED_XML_ONLY')) { throw 'FontName XML-only patch marker missing.' }
if (-not $text.Contains('BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE')) { throw 'Text anchor patch marker missing.' }

# Keep UTF-8 BOM, matching the tracked PowerShell module.
$utf8Bom = New-Object Text.UTF8Encoding($true)
[IO.File]::WriteAllText($EnginePath, $text, $utf8Bom)
Write-Host 'Prototype Text default-anchor + restricted FontName XML-only patches applied.' -ForegroundColor Green
