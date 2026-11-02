param([string]$ResultPath='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
Import-Module (Join-Path $PSScriptRoot 'NativeLayoutEngine.psm1') -Force
if(-not('NativeReviewFixture.Formats' -as [type])){
 $xmlAssembly=[System.Xml.XmlDocument].Assembly.Location
 if([string]::IsNullOrWhiteSpace($xmlAssembly) -or -not(Test-Path -LiteralPath $xmlAssembly)){throw 'System.Xml assembly location unavailable; Windows PowerShell/.NET Framework preflight cannot compile NativeReviewFixtures.cs.'}
 Add-Type -Path (Join-Path $PSScriptRoot 'NativeReviewFixtures.cs') -ReferencedAssemblies @($xmlAssembly) -ErrorAction Stop
}
$m=Get-Module NativeLayoutEngine -ErrorAction Stop
$scenarioResults=New-Object 'System.Collections.Generic.List[object]'
$suiteStatus='STARTED';$suiteError=$null
try {
& $m {
 param($base,$scenarioResults)
 # Exercise production wrappers BEFORE installing the PageSetup adapter.
 foreach($commandName in @('Read-Property','Write-Property','Invoke-ComMethod')){
  $command=Get-Command $commandName -CommandType Function -ErrorAction Stop
  if($command.ModuleName -cne 'NativeLayoutEngine'){throw ('Bridge command belongs to another session state: '+$commandName)}
 }
 $probe=New-Object NativeReviewFixture.Obj
 Write-Property $probe 'Name' 'scope-probe'
 if([string](Read-Property $probe 'Name') -cne 'scope-probe'){throw 'Production bridge property probe failed.'}
 $probeXml=[string](Invoke-ComMethod $probe 'GetXML' @($true,$true))
 if(([xml]$probeXml).DocumentElement.GetAttribute('Name') -cne 'scope-probe'){throw 'Production bridge method probe failed.'}
 $collectionProbe=New-Object NativeReviewFixture.Objects
 $collectionResult=Invoke-ComMethod $collectionProbe 'Create' @([int]5)
 if($null -eq $collectionResult -or [int](Read-Property $collectionResult 'Type') -ne 5){throw 'Production bridge object return failed.'}
 $documentProbe=New-Object NativeReviewFixture.Document
 $returnedCollection=Read-Property $documentProbe 'Objects'
 if(-not [object]::ReferenceEquals($returnedCollection,$documentProbe.Objects)){throw 'Production bridge flattened enumerable collection.'}
 Write-Host 'PASS: native module ownership/property/method/object/collection bridge probes.'

 # Only emulate the indexed PageSetup properties; all collection/object transport uses ComBridge.
 function script:Read-Property($target,[string]$name,[object[]]$arguments=@()){
  if($target -is [NativeReviewFixture.Page]){return $target.Values[$name]}
  return ,([LabelWorkbench.ComBridge]::Get($target,$name,$arguments))
 }
 function script:Write-Property($target,[string]$name,$value,[object[]]$indices=@()){
  if($target -is [NativeReviewFixture.Page]){$target.Values[$name]=[double]$value;return}
  [LabelWorkbench.ComBridge]::Set($target,$name,([object[]]@($indices+@($value))))
 }
 # Override the module resolver in module script scope so the regression never touches the Windows registry or real BarTender component folders.
 function script:Resolve-NativeDataMatrixComponent {param([string]$runDir) $p=Join-Path $runDir 'Data Matrix.btc';Set-Content -LiteralPath $p -Value 'MOCK ONLY';return $p}
 if(-not(Get-Command Read-Property -CommandType Function -ErrorAction SilentlyContinue)){throw 'NativeLayoutEngine mock bridge Read-Property is not visible in module script scope.'}
 if(-not(Get-Command Write-Property -CommandType Function -ErrorAction SilentlyContinue)){throw 'NativeLayoutEngine mock bridge Write-Property is not visible in module script scope.'}
 if(-not(Get-Command Invoke-ComMethod -CommandType Function -ErrorAction SilentlyContinue)){throw 'NativeLayoutEngine mock bridge Invoke-ComMethod is not visible in module script scope.'}
 # A negative test must fail for its injected defect, not merely any exception.
 $expectedErrors=@{
  'wrong-create'='Create(5) produced unexpected Type'
  'duplicate-name'='Empty, non-flat or duplicate native object name.'
  'duplicate-source'='Different objects share an EmbeddedDataSource ID.'
  'partial-insert'='Partial insertion fault'
  'peer-payload'='Payload import modified another object.'
  'noop-index'='XDimension write/raster response not proven'
  'bad-dpi'='Baseline raster DPI is untrusted.'
  'reopen-type'='Reopen native Type mismatch:'
  'reopen-payload'='Reopen payload mismatch:'
  'reopen-nan'='Reopen XML state mismatch:'
  'reopen-printer'='Reopen printer changed;'
  'reopen-margin'='Reopen MarginLeft mismatch:'
  'reopen-dpi'='Raster DPI is untrusted.'
 }
 foreach($fault in @('none','wrong-create','duplicate-name','duplicate-source','partial-insert','peer-payload','noop-index','bad-dpi','reopen-type','reopen-payload','reopen-nan','reopen-printer','reopen-margin','reopen-dpi')){
  $dir=Join-Path ([IO.Path]::GetTempPath()) ('native-review-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($dir)
  $case=[ordered]@{scenario=$fault;status='STARTED';actualError=$null;expectedError=$null}
  [void]$scenarioResults.Add($case)
  try{
   $layout=Get-Content -LiteralPath (Join-Path $base 'native-layout.multi.sample.json') -Raw -Encoding UTF8|ConvertFrom-Json
   # Force one text away from the fixture default so the regression exercises
   # the real-runtime FontName COM failure -> Text XML fallback path.
   $layout.objects[0].fontName='Mock Alternate Font'
   $formats=New-Object NativeReviewFixture.Formats;$formats.Fault=$fault
   $failed=$false;$result=$null
   try{$result=Invoke-NativeLayoutBuild $formats $layout $dir $base}catch{$failed=$true;$case.actualError=$_.Exception.ToString()}
   if($fault -eq 'none'){
    if($failed){throw ('Healthy six-object mock failed: '+$case.actualError)}
    if($result.objects.Count -ne 6 -or $result.reopen -cne 'PASS' -or -not(Test-Path -LiteralPath $result.output)){throw 'Healthy mock output missing.'}
    if([object]::ReferenceEquals($formats.Added,$formats.Reopened)){throw 'Reopen must be a new instance.'}
    $fontResult=$result.objects[0].geometry.properties['FontName']
    $fontObject=$formats.Added.Objects.Data[0]
    if($fontResult.writeMode -cne 'XML_FONT_ATTRIBUTE_FALLBACK' -or $fontResult.actual -cne 'Mock Alternate Font' -or $fontObject.FontNameSetCalls -ne 1 -or $fontObject.FontXmlChangeCalls -ne 1){throw 'Healthy mock did not execute exactly one rejected COM font setter and XML font change.'}
    if($formats.Added.Objects.Data[1].FontNameSetCalls -ne 0){throw 'Already-matched font was unnecessarily written.'}

    if(@($result.objects|Where-Object{$_.reopenEditable -cne 'SECOND_PAYLOAD_AND_PEER_ISOLATION_OK'}).Count){throw 'Editability/isolation missing.'}
   }else{
    if(-not $failed){throw ('Injected fault accepted: '+$fault)}
    $case.expectedError=$expectedErrors[$fault]
    if($case.actualError -notmatch [regex]::Escape($case.expectedError)){throw ('Unexpected failure for '+$fault+': '+$case.actualError)}
    if($null -eq $formats.Added){throw ('Fault did not reach document creation: '+$fault)}
    if($fault -like 'reopen-*' -and $null -eq $formats.Reopened){throw ('Fault did not reach reopen: '+$fault)}
    if(Test-Path -LiteralPath (Join-Path $dir 'native-output.btw')){throw ('Failed build published output: '+$fault)}
    if(Test-Path -LiteralPath (Join-Path $dir 'candidate.unverified.btw')){throw ('Failed build left an unquarantined candidate: '+$fault)}
    $r=Get-Content -LiteralPath (Join-Path $dir 'native-build-report.json') -Raw -Encoding UTF8|ConvertFrom-Json
    if($r.status -cne 'FAILED_OR_BLOCKED' -or $null -ne $r.output){throw 'Failure report not closed.'}
   }
   if($null -ne $formats.Added -and $formats.Added.CloseCalls -lt 1){throw 'New document not closed.'}
   if($null -ne $formats.Reopened -and $formats.Reopened.CloseCalls -lt 1){throw 'Reopened document not closed.'}
   $case.status='PASS'
   Write-Host ('PASS: native mock '+$fault)
  }catch{$case.status='FAIL';$case['testError']=$_.Exception.ToString();throw}
  finally{
   [void][NativeReviewFixture.Document]::Saved.Remove((Join-Path $dir 'candidate.unverified.btw'))
   Remove-Item -LiteralPath $dir -Recurse -Force
  }
 }
 'PASS: 14 native multi-object mock scenarios; no real BarTender execution.'
} $PSScriptRoot $scenarioResults
$suiteStatus='PASS'
}catch{$suiteStatus='FAIL';$suiteError=$_.Exception.ToString();throw}
finally{
 # Never leave mock script-scope overrides available to a production invocation.
 Remove-Module -ModuleInfo $m -Force -ErrorAction SilentlyContinue
 if($ResultPath){
  [ordered]@{schema='native-mock-results-v1';status=$suiteStatus;error=$suiteError;expectedScenarios=14;completed=@($scenarioResults.ToArray()|Where-Object{$_.status -eq 'PASS'}).Count;scenarios=@($scenarioResults.ToArray())}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $ResultPath -Encoding UTF8
 }
}
