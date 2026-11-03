param([string]$ResultPath='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
Import-Module (Join-Path $PSScriptRoot 'NativeLayoutEngine.psm1') -Force
$m=Get-Module NativeLayoutEngine -ErrorAction Stop
$cases=New-Object 'System.Collections.Generic.List[object]'
$status='STARTED';$suiteError=$null
try{
 if(-not('NativeReviewFixture.FontProbe' -as [type])){
  $xmlAssembly=[System.Xml.XmlDocument].Assembly.Location
  if([string]::IsNullOrWhiteSpace($xmlAssembly) -or -not(Test-Path -LiteralPath $xmlAssembly)){throw 'System.Xml assembly location unavailable.'}
  Add-Type -Path (Join-Path $PSScriptRoot 'NativeReviewFixtures.cs') -ReferencedAssemblies @($xmlAssembly) -ErrorAction Stop
 }
 & $m {
  param($base,$cases)
  $seed=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $base) 'evidence/object-1-before.xml') -Raw -Encoding UTF8
  $expectedErrors=@{
   'missing-font'='exactly one direct Font';'duplicate-font'='exactly one direct Font';'missing-attribute'='existing FontName attribute'
   'xml-noop'='Font write XML readback mismatch.';'xml-partial'='FontProbe partial SetXML failure'
   'xml-position'='Font write changed protected XML outside FontName.';'xml-name'='Font write changed protected XML outside FontName.'
   'xml-id'='Font write changed protected XML outside FontName.';'xml-payload'='Literal/effective payload mismatch.'
   'xml-source'='Font write changed protected XML outside FontName.';'xml-source-attribute'='Font write changed protected XML outside FontName.'
   'xml-fontsize'='Font write changed protected XML outside FontName.';'xml-font-readback'='Font write XML readback mismatch.'
   'xml-other-node'='Font write changed protected XML outside FontName.';'xml-fit-bounds'='Font write changed protected XML outside FontName.'
   'rollback-failure'='ROLLBACK_FAILED'
  }
  foreach($mode in @('already-matched','com-success','xml-success','com-noop','com-partial','com-hidden-partial','missing-font','duplicate-font','missing-attribute','xml-noop','xml-partial','xml-position','xml-name','xml-id','xml-payload','xml-source','xml-source-attribute','xml-fontsize','xml-font-readback','xml-other-node','xml-fit-bounds','rollback-failure','geometry-font-reset')){
   $contract=if($mode -eq 'geometry-font-reset'){'DISPOSABLE_CANDIDATE_FONTNAME_POINTSIZE_THEN_GEOMETRY'}else{'XML_ONLY_FONTNAME_REAL_RUNTIME'}
   $case=[ordered]@{scenario=$mode;status='STARTED';actualError=$null;expectedError=$null;comCalls=0;xmlCalls=0;restoreCalls=0;contract=$contract}
   [void]$cases.Add($case)
   $dir=Join-Path ([IO.Path]::GetTempPath()) ('native-font-'+[guid]::NewGuid().ToString('N'))
   [void][IO.Directory]::CreateDirectory($dir)
   try{
    $xml=Read-NativeXml $seed
    $xml.DocumentElement.SetAttribute('ID','OBJECT-ID-SENTINEL')
    $font=Get-NativeTextFontNode $xml
    if($mode -eq 'missing-font'){[void]$xml.DocumentElement.RemoveChild($font)}
    if($mode -eq 'duplicate-font'){[void]$xml.DocumentElement.AppendChild($font.CloneNode($true))}
    if($mode -eq 'missing-attribute'){$font.RemoveAttribute('FontName')}
    $obj=New-Object NativeReviewFixture.FontProbe -ArgumentList @($xml.OuterXml)
    $obj.Mode=$mode
    $baselineKey=Get-NativeXmlKey (Read-NativeXml ($obj.GetXML($true,$true)))
    $target=if($mode -eq 'already-matched'){$obj.FontName}else{'Mock Alternate Font'}
    $prefix=Join-Path $dir 'font'
    $errorText=$null;$result=$null
    try{
     if($mode -eq 'geometry-font-reset'){
      $request=[pscustomobject]@{id='FONT_TEST';type='text';fontName=$target;fontSizePt=8.0;xMm=2.5;yMm=2.5;rotationDeg=0.0}
      $result=Set-NativeGeometry $obj $request $prefix
     }else{$result=Set-NativeTextFontName $obj $target $prefix}
    }catch{$errorText=$_.Exception.ToString()}
    $case.actualError=$errorText;$case.comCalls=$obj.FontNameSetCalls;$case.xmlCalls=$obj.SetXmlCalls;$case.restoreCalls=$obj.RestoreCalls

    # Real BarTender 2022 exposes FontName in the typelib but rejects normal
    # automation access. No COM FontName PUT is allowed in any scenario.
    if($obj.FontNameSetCalls -ne 0){throw ('Restricted FontName COM setter was called: '+$mode)}

    if($expectedErrors.ContainsKey($mode)){
     $case.expectedError=$expectedErrors[$mode]
     if(-not $errorText -or $errorText -notmatch [regex]::Escape($case.expectedError)){throw ('Wrong/missing failure for '+$mode+': '+$errorText)}
     if($mode -ne 'rollback-failure'){
      if((Get-NativeXmlKey (Read-NativeXml ($obj.GetXML($true,$true)))) -cne $baselineKey){throw ('Baseline not restored: '+$mode)}
     }
     if($mode -in @('missing-font','duplicate-font','missing-attribute')){
      if($obj.SetXmlCalls -ne 0){throw 'Malformed Font XML was mutated.'}
     }else{
      if($obj.ChangeCalls -ne 1 -or $obj.RestoreCalls -lt 1){throw 'Injected XML fault/rollback was not exercised.'}
     }
    }elseif($mode -eq 'geometry-font-reset'){
     if($errorText){throw ('Unexpected candidate geometry/font failure: '+$errorText)}
     $fontResult=$result.properties['FontName']
     if($null -eq $fontResult -or $fontResult.writeMode -cne 'DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE'){throw 'Candidate Text font mode incorrect.'}
     if($fontResult.actualFontName -cne $target -or [math]::Abs([double]$fontResult.actualPointSize-8.0) -gt 0.001){throw 'Candidate Text font readback incorrect.'}
     if($obj.FontName -cne $target -or [math]::Abs([double]$obj.FontSize-8.0) -gt 0.001){throw 'Geometry writes reset candidate Text font state.'}
     if([math]::Abs([double]$obj.X-2.5) -gt 0.001 -or [math]::Abs([double]$obj.Y-2.5) -gt 0.001 -or [math]::Abs([double]$obj.RotationAngle) -gt 0.001){throw 'Candidate Text geometry readback incorrect.'}
     if($obj.SetXmlCalls -ne 1 -or $obj.RestoreCalls -ne 0){throw 'Candidate Text font path did not perform exactly one non-rollback XML mutation.'}
     $finalXml=Read-NativeXml ($obj.GetXML($true,$true));$finalFont=Get-NativeTextFontNode $finalXml
     if($finalFont.GetAttribute('FontName') -cne $target){throw 'Candidate Text final XML FontName mismatch.'}
     if([math]::Abs((Parse-NativeDouble $finalFont.GetAttribute('PointSize') 'Candidate PointSize')-8.0) -gt 0.001){throw 'Candidate Text final XML PointSize mismatch.'}
    }else{
     if($errorText){throw ('Unexpected font failure: '+$errorText)}
     $expectedMode=if($mode -eq 'already-matched'){'ALREADY_MATCHED_XML'}else{'XML_FONT_ATTRIBUTE_ONLY'}
     if($result.writeMode -cne $expectedMode -or $obj.FontName -cne $target){throw 'Font result/mode incorrect.'}
     $expectedXml=if($mode -eq 'already-matched'){0}else{1}
     if($obj.SetXmlCalls -ne $expectedXml){throw 'Font XML-only route call count incorrect.'}
     if($obj.RestoreCalls -ne 0){throw 'Successful XML-only font transaction unexpectedly restored baseline.'}
     $expected=Read-NativeXml $xml.OuterXml;(Get-NativeTextFontNode $expected).SetAttribute('FontName',$target)
     if((Get-NativeXmlKey (Read-NativeXml ($obj.GetXML($true,$true)))) -cne (Get-NativeXmlKey $expected)){throw 'Font changed unrelated XML.'}
    }

    # Malformed XML is rejected before a transaction result exists. All other
    # paths must leave structured transaction evidence.
    if($mode -eq 'geometry-font-reset'){
     $transactionPath=$prefix+'-font-candidate-font-result.json'
     if(-not(Test-Path -LiteralPath $transactionPath)){throw 'Candidate Text font transaction evidence is missing.'}
     $transaction=Get-Content -LiteralPath $transactionPath -Raw -Encoding UTF8|ConvertFrom-Json
     if($transaction.writeMode -cne 'DISPOSABLE_CANDIDATE_XML_FONTNAME_POINTSIZE'){throw 'Candidate Text transaction writeMode missing.'}
     if($transaction.rollback -cne 'NOT_ATTEMPTED_DISPOSABLE_CANDIDATE'){throw 'Candidate Text transaction attempted rollback.'}
    }else{
     $transactionPath=$prefix+'-result.json'
     if($mode -in @('missing-font','duplicate-font','missing-attribute')){
      if(Test-Path -LiteralPath $transactionPath){throw 'Malformed Font XML unexpectedly emitted a transaction result.'}
     }else{
      if(-not(Test-Path -LiteralPath $transactionPath)){throw 'Font transaction evidence is missing.'}
      $transaction=Get-Content -LiteralPath $transactionPath -Raw -Encoding UTF8|ConvertFrom-Json
      if($transaction.runtimeEvidence -cne 'COM_FONTNAME_PROPERTY_RESTRICTED_XML_ONLY'){throw 'Font transaction runtime evidence marker missing.'}
      if($mode -eq 'rollback-failure' -and $transaction.rollback -cne 'FAILED'){throw 'Rollback failure was hidden.'}
      if($mode -eq 'xml-partial' -and $transaction.rollback -cne 'BASELINE_RESTORED'){throw 'Partial SetXML rollback unverified.'}
     }
    }
    $case.status='PASS';Write-Host ('PASS: native font '+$mode)
   }catch{$case.status='FAIL';$case['testError']=$_.Exception.ToString();Write-Host ('FAIL: native font '+$mode+' '+$_.Exception.Message)}
   finally{Remove-Item -LiteralPath $dir -Recurse -Force}
  }
  if(@($cases.ToArray()|Where-Object{$_.status -ne 'PASS'}).Count){throw 'Native font regression failed; see per-scenario report.'}
 } $PSScriptRoot $cases
 $status='PASS'
}catch{$status='FAIL';$suiteError=$_.Exception.ToString();throw}
finally{
 Remove-Module -ModuleInfo $m -Force -ErrorAction SilentlyContinue
 if($ResultPath){[ordered]@{schema='native-font-results-v3-candidate-text';status=$status;error=$suiteError;expectedScenarios=23;completed=@($cases.ToArray()|Where-Object{$_.status -eq 'PASS'}).Count;scenarios=@($cases.ToArray())}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $ResultPath -Encoding UTF8}
}
