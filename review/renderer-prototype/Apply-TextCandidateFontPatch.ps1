[CmdletBinding()]
param([string]$EnginePath = '')
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($EnginePath)){$EnginePath=Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\NativeLayoutEngine.psm1'}
$EnginePath=[IO.Path]::GetFullPath($EnginePath)
if(-not(Test-Path -LiteralPath $EnginePath -PathType Leaf)){throw ('NativeLayoutEngine.psm1 not found: '+$EnginePath)}
function Replace-Exact([string]$Source,[string]$Old,[string]$New,[string]$Label){$count=([regex]::Matches($Source,[regex]::Escape($Old))).Count;if($count -ne 1){throw ($Label+' expected exactly one source match; found '+$count+'.')};$out=$Source.Replace($Old,$New);if($out -eq $Source -or $out.Contains($Old)){throw ($Label+' did not apply cleanly.')};return $out}

$text=[IO.File]::ReadAllText($EnginePath,[Text.Encoding]::UTF8)
if(-not $text.Contains('COM_FONTNAME_PROPERTY_RESTRICTED_XML_ONLY')){throw 'First-stage Text patch marker missing.'}
if($text.Contains('DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE')){throw 'Candidate Text font patch already applied.'}

$oldPolicyLine="            `$textDefaultTopLeft=(`$o.type -eq 'text' -and -not `$hasReferencePoint -and `$null -ne `$o.PSObject.Properties['anchorPolicy'] -and [string]`$o.anchorPolicy -ceq 'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE')"
$newPolicyLine=@"
            `$textDefaultTopLeft=(`$o.type -eq 'text' -and -not `$hasReferencePoint -and `$null -ne `$o.PSObject.Properties['anchorPolicy'] -and [string]`$o.anchorPolicy -ceq 'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE')
            `$textFontPolicy=(`$o.type -ne 'text' -or (`$null -ne `$o.PSObject.Properties['fontMutationPolicy'] -and [string]`$o.fontMutationPolicy -ceq 'DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE'))
            if(-not `$textFontPolicy){throw 'Unsupported Text font mutation policy.'}
"@.TrimEnd("`r","`n")
$text=Replace-Exact $text $oldPolicyLine $newPolicyLine 'Text candidate font policy validator'

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
$text=Replace-Exact $text $geometryMarker ($newCandidateFunction+"`n"+$geometryMarker) 'Insert disposable Text font function'

$oldCall="        `$result.properties['FontName']=(Set-NativeTextFontName `$obj ([string]`$request.fontName) `$(if(`$prefix){`$prefix+'-font'}else{''}))`n        `$targets['FontSize']=[double]`$request.fontSizePt"
$newCall="        `$result.properties['FontName']=(Set-NativeTextFontStyleCandidate `$obj ([string]`$request.fontName) ([double]`$request.fontSizePt) `$(if(`$prefix){`$prefix+'-font'}else{''}))"
$text=Replace-Exact $text $oldCall $newCall 'Use disposable Text FontName/PointSize XML path'

$oldFlags=@"
        foreach(`$flag in @('bold','italic')){
            if(`$null -ne `$request.PSObject.Properties[`$flag]){
                `$property=if(`$flag -eq 'bold'){'FontBold'}else{'FontItalic'}
                `$targets[`$property]=[bool]`$request.`$flag
            }
        }
"@.TrimEnd("`r","`n")
$newFlags=@"
        foreach(`$flag in @('bold','italic')){
            if(`$null -ne `$request.PSObject.Properties[`$flag] -and [bool]`$request.`$flag){throw ('CAPABILITY_UNSUPPORTED_TEXT_STYLE: '+`$flag)}
        }
"@.TrimEnd("`r","`n")
$text=Replace-Exact $text $oldFlags $newFlags 'Remove restricted Text style COM writes'

$oldFinal=@"
        `$finalFont=`$null
        `$finalFontXml=Read-NativeXml ([string](Invoke-ComMethod `$obj 'GetXML' @(`$true,`$true)))
        `$finalFont=[string](Get-NativeTextFontNode `$finalFontXml).GetAttribute('FontName');if(`$finalFont -cne [string]`$request.fontName){throw 'FontName changed after final geometry writes.'}
        `$result.properties['FontName'].actual=`$finalFont
"@.TrimEnd("`r","`n")
$newFinal=@"
        `$finalFontXml=Read-NativeXml ([string](Invoke-ComMethod `$obj 'GetXML' @(`$true,`$true)))
        `$finalFontNode=Get-NativeTextFontNode `$finalFontXml
        `$finalFont=[string]`$finalFontNode.GetAttribute('FontName');if(`$finalFont -cne [string]`$request.fontName){throw 'FontName changed after final geometry writes.'}
        `$finalPoint=Parse-NativeDouble ([string]`$finalFontNode.GetAttribute('PointSize')) 'Final Text PointSize';Assert-NativeNear `$finalPoint ([double]`$request.fontSizePt) 0.001 'Final Text PointSize'
        `$result.properties['FontName'].actualFontName=`$finalFont;`$result.properties['FontName'].actualPointSize=`$finalPoint
"@.TrimEnd("`r","`n")
$text=Replace-Exact $text $oldFinal $newFinal 'Final Text XML font verification'

$oldPresave="                    `$expectedState.FontSize=[double](Read-Property `$obj 'FontSize');`$expectedState.FontName=[string](Get-NativeTextFontNode `$presaveXml).GetAttribute('FontName')"
$newPresave="                    `$presaveFontNode=Get-NativeTextFontNode `$presaveXml;`$expectedState.FontSize=Parse-NativeDouble ([string]`$presaveFontNode.GetAttribute('PointSize')) 'Presave Text PointSize';`$expectedState.FontName=[string]`$presaveFontNode.GetAttribute('FontName')"
$text=Replace-Exact $text $oldPresave $newPresave 'Presave Text PointSize XML readback'

$oldReopen="                    Assert-NativeNear ([double](Read-Property `$obj 'FontSize')) ([double]`$m.expected['FontSize']) 0.02 ('Reopen FontSize '+`$m.id)"
$newReopen="                    `$reopenFontNode=Get-NativeTextFontNode `$xml;`$reopenPoint=Parse-NativeDouble ([string]`$reopenFontNode.GetAttribute('PointSize')) ('Reopen Text PointSize '+`$m.id);Assert-NativeNear `$reopenPoint ([double]`$m.expected['FontSize']) 0.02 ('Reopen FontSize '+`$m.id)"
$text=Replace-Exact $text $oldReopen $newReopen 'Reopen Text PointSize XML readback'

foreach($required in @('DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE','ONLY_FONTNAME_POINTSIZE_AND_BARTENDER_DERIVED_CHARACTERSET_HEIGHT','CAPABILITY_UNSUPPORTED_TEXT_STYLE')){if(-not $text.Contains($required)){throw ('Candidate Text patch marker missing: '+$required)}}
foreach($forbidden in @("`$targets['FontSize']=[double]`$request.fontSizePt","Assert-NativeNear ([double](Read-Property `$obj 'FontSize')) ([double]`$m.expected['FontSize'])")){if($text.Contains($forbidden)){throw ('Restricted Text FontSize COM path remains: '+$forbidden)}}
$utf8Bom=New-Object Text.UTF8Encoding($true);[IO.File]::WriteAllText($EnginePath,$text,$utf8Bom)

# Align the prototype-only native persistence regression with this runtime
# contract. The tracked test is not weakened: it still requires zero COM
# FontName calls, exactly one XML font change, reopen and peer isolation.
$testPath=Join-Path (Split-Path -Parent $EnginePath) 'Test-NativePersistence.ps1'
$test=[IO.File]::ReadAllText($testPath,[Text.Encoding]::UTF8)
$test=Replace-Exact $test "`$fontResult.writeMode -cne 'XML_FONT_ATTRIBUTE_ONLY'" "`$fontResult.writeMode -cne 'DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE'" 'Persistence expected Text font mode'
[IO.File]::WriteAllText($testPath,$test,$utf8Bom)
Write-Host 'Prototype disposable-candidate Text FontName/PointSize XML patch applied.' -ForegroundColor Green
