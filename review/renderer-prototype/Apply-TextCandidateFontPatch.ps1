[CmdletBinding()]
param([string]$EnginePath = '')
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($EnginePath)){$EnginePath=Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\NativeLayoutEngine.psm1'}
$EnginePath=[IO.Path]::GetFullPath($EnginePath)
if(-not(Test-Path -LiteralPath $EnginePath -PathType Leaf)){throw ('NativeLayoutEngine.psm1 not found: '+$EnginePath)}
function Replace-Exact([string]$Source,[string]$Old,[string]$New,[string]$Label){$count=([regex]::Matches($Source,[regex]::Escape($Old))).Count;if($count -ne 1){throw ($Label+' expected exactly one source match; found '+$count+'.')};$out=$Source.Replace($Old,$New);if($out -eq $Source){throw ($Label+' did not apply cleanly.')};return $out}
$text=[IO.File]::ReadAllText($EnginePath,[Text.Encoding]::UTF8)
if(-not $text.Contains('COM_FONTNAME_PROPERTY_RESTRICTED_XML_ONLY')){throw 'First-stage Text patch marker missing.'}
if($text.Contains('DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE')){throw 'Candidate Text font patch already applied.'}

$oldPolicy="            `$textDefaultTopLeft=(`$o.type -eq 'text' -and -not `$hasReferencePoint -and `$null -ne `$o.PSObject.Properties['anchorPolicy'] -and [string]`$o.anchorPolicy -ceq 'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE')"
$newPolicy=$oldPolicy+"`r`n            `$textFontPolicy=(`$o.type -ne 'text' -or (`$null -ne `$o.PSObject.Properties['fontMutationPolicy'] -and [string]`$o.fontMutationPolicy -ceq 'DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE'))`r`n            if(-not `$textFontPolicy){throw 'Unsupported Text font mutation policy.'}"
$text=Replace-Exact $text $oldPolicy $newPolicy 'Text candidate font policy validator'

$newCandidateFunction=@'
function Set-NativeTextFontStyleCandidate($obj,[string]$fontName,[double]$fontSizePt,[string]$prefix='') {
    $baselineText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $baseline=Read-NativeXml $baselineText
    $literal=Get-NativeLiteralState $baseline 'Text';Assert-NativePayload $obj $baseline 'Text' $literal.value
    $baselineFont=Get-NativeTextFontNode $baseline
    foreach($attr in @('FontName','PointSize','CharacterSet','Height')){if(-not $baselineFont.HasAttribute($attr)){throw ('Fresh Text Font missing required attribute: '+$attr)}}
    $result=[ordered]@{requestedFontName=$fontName;requestedPointSize=$fontSizePt;actualFontName=$null;actualPointSize=$null;characterSet=$null;height=$null;writeMode='NOT_RUN';protectedXmlPolicy='ONLY_FONTNAME_POINTSIZE_AND_BARTENDER_DERIVED_CHARACTERSET_HEIGHT';rollback='NOT_ATTEMPTED_DISPOSABLE_CANDIDATE';error=$null}
    if($prefix){$baselineText|Set-Content -LiteralPath ($prefix+'-candidate-baseline.xml') -Encoding UTF8}
    try{
        $request=Read-NativeXml $baselineText;$requestFont=Get-NativeTextFontNode $request
        $requestFont.SetAttribute('FontName',$fontName)
        $requestFont.SetAttribute('PointSize',$fontSizePt.ToString('0.000',$script:InvariantCulture))
        if($prefix){$request.OuterXml|Set-Content -LiteralPath ($prefix+'-candidate-request.xml') -Encoding UTF8}
        [void](Invoke-ComMethod $obj 'SetXML' @($request.OuterXml))
        $readbackText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$readback=Read-NativeXml $readbackText
        if($prefix){$readbackText|Set-Content -LiteralPath ($prefix+'-candidate-readback.xml') -Encoding UTF8}
        Assert-NativePayload $obj $readback 'Text' $literal.value
        $actualFont=Get-NativeTextFontNode $readback
        $actualName=[string]$actualFont.GetAttribute('FontName');if($actualName -cne $fontName){throw ('Text FontName readback mismatch: '+$actualName+' expected '+$fontName)}
        $actualPoint=Parse-NativeDouble ([string]$actualFont.GetAttribute('PointSize')) 'Text PointSize';Assert-NativeNear $actualPoint $fontSizePt 0.001 'Text PointSize'
        if([string]::IsNullOrWhiteSpace($actualFont.GetAttribute('CharacterSet')) -or [string]::IsNullOrWhiteSpace($actualFont.GetAttribute('Height'))){throw 'BarTender-derived Text font CharacterSet/Height missing.'}
        $proof=Read-NativeXml $readbackText;$proofFont=Get-NativeTextFontNode $proof
        foreach($attr in @('FontName','PointSize','CharacterSet','Height')){$proofFont.SetAttribute($attr,$baselineFont.GetAttribute($attr))}
        if((Get-NativeXmlKey $proof) -cne (Get-NativeXmlKey $baseline)){throw 'Text font mutation changed XML outside certified FontName/PointSize/CharacterSet/Height set.'}
        $result.actualFontName=$actualName;$result.actualPointSize=$actualPoint;$result.characterSet=[string]$actualFont.GetAttribute('CharacterSet');$result.height=[string]$actualFont.GetAttribute('Height');$result.writeMode='DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE'
        return $result
    }catch{
        $result.error=$_.Exception.ToString();$result.writeMode='FAILED_DISCARD_CANDIDATE'
        throw ('DISPOSABLE_CANDIDATE_TEXT_FONT_MUTATION_FAILED: '+$_.Exception.Message)
    }finally{if($prefix){Save-NativeJson $result ($prefix+'-candidate-font-result.json')}}
}
'@
$geometryMarker="function Set-NativeGeometry(`$obj,`$request,[string]`$prefix='') {"
$text=Replace-Exact $text $geometryMarker ($newCandidateFunction+"`r`n"+$geometryMarker) 'Insert disposable Text font function'

$oldCall="        `$result.properties['FontName']=(Set-NativeTextFontName `$obj ([string]`$request.fontName) `$(if(`$prefix){`$prefix+'-font'}else{''}))"
$newCall="        `$result.properties['FontName']=(Set-NativeTextFontStyleCandidate `$obj ([string]`$request.fontName) ([double]`$request.fontSizePt) `$(if(`$prefix){`$prefix+'-font'}else{''}))"
$text=Replace-Exact $text $oldCall $newCall 'Use disposable Text FontName/PointSize XML path'
$text=Replace-Exact $text "        `$targets['FontSize']=[double]`$request.fontSizePt" '' 'Remove restricted Text FontSize COM write'

$oldFinalCheck="        `$finalFont=[string](Get-NativeTextFontNode `$finalFontXml).GetAttribute('FontName');if(`$finalFont -cne [string]`$request.fontName){throw 'FontName changed after final geometry writes.'}"
$newFinalCheck=$oldFinalCheck+"`r`n        `$finalFontNode=Get-NativeTextFontNode `$finalFontXml;`$finalPoint=Parse-NativeDouble ([string]`$finalFontNode.GetAttribute('PointSize')) 'Final Text PointSize';Assert-NativeNear `$finalPoint ([double]`$request.fontSizePt) 0.001 'Final Text PointSize'"
$text=Replace-Exact $text $oldFinalCheck $newFinalCheck 'Final Text PointSize XML verification'
$text=Replace-Exact $text "        `$result.properties['FontName'].actual=`$finalFont" "        `$result.properties['FontName'].actualFontName=`$finalFont;`$result.properties['FontName'].actualPointSize=`$finalPoint" 'Final Text evidence update'

$oldPresave="                    `$expectedState.FontSize=[double](Read-Property `$obj 'FontSize');`$expectedState.FontName=[string](Get-NativeTextFontNode `$presaveXml).GetAttribute('FontName')"
$newPresave="                    `$presaveFontNode=Get-NativeTextFontNode `$presaveXml;`$expectedState.FontSize=Parse-NativeDouble ([string]`$presaveFontNode.GetAttribute('PointSize')) 'Presave Text PointSize';`$expectedState.FontName=[string]`$presaveFontNode.GetAttribute('FontName')"
$text=Replace-Exact $text $oldPresave $newPresave 'Presave Text PointSize XML readback'
$oldReopen="                    Assert-NativeNear ([double](Read-Property `$obj 'FontSize')) ([double]`$m.expected['FontSize']) 0.02 ('Reopen FontSize '+`$m.id)"
$newReopen="                    `$reopenFontNode=Get-NativeTextFontNode `$xml;`$reopenPoint=Parse-NativeDouble ([string]`$reopenFontNode.GetAttribute('PointSize')) ('Reopen Text PointSize '+`$m.id);Assert-NativeNear `$reopenPoint ([double]`$m.expected['FontSize']) 0.02 ('Reopen FontSize '+`$m.id)"
$text=Replace-Exact $text $oldReopen $newReopen 'Reopen Text PointSize XML readback'

foreach($required in @('DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE','ONLY_FONTNAME_POINTSIZE_AND_BARTENDER_DERIVED_CHARACTERSET_HEIGHT')){if(-not $text.Contains($required)){throw ('Candidate Text patch marker missing: '+$required)}}
if($text.Contains("`$targets['FontSize']=[double]`$request.fontSizePt")){throw 'Restricted Text FontSize COM write remains.'}
$utf8Bom=New-Object Text.UTF8Encoding($true);[IO.File]::WriteAllText($EnginePath,$text,$utf8Bom)

$testPath=Join-Path (Split-Path -Parent $EnginePath) 'Test-NativePersistence.ps1'
$test=[IO.File]::ReadAllText($testPath,[Text.Encoding]::UTF8)
$test=Replace-Exact $test "`$fontResult.writeMode -cne 'XML_FONT_ATTRIBUTE_ONLY'" "`$fontResult.writeMode -cne 'DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE'" 'Persistence expected Text font mode'
[IO.File]::WriteAllText($testPath,$test,$utf8Bom)
Write-Host 'Prototype disposable-candidate Text FontName/PointSize XML patch applied.' -ForegroundColor Green
