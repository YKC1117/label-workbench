$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
Import-Module (Join-Path $PSScriptRoot 'XmlCore.psm1') -Force
if(-not('LabelWorkbench.RasterEvidence' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'RasterEvidence.cs')}
if(-not('LwbReviewFixture.Obj' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'ReviewFixtures.cs')}
$m=Get-Module XmlCore
$dir=Join-Path ([IO.Path]::GetTempPath()) ('lwb-review-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($dir)
try {
& $m {
 param($dir,$base)
 function Check($ok,$message){if(-not $ok){throw $message}}
 function Reject([scriptblock]$action){$failed=$false;try{& $action}catch{$failed=$true};Check $failed 'Expected rejection.'}
 $api=Get-Content -LiteralPath (Join-Path (Split-Path $base -Parent) 'evidence/installed-api.json') -Raw | ConvertFrom-Json
 Assert-ReviewApi $api
 $before=@();for($i=1;$i -le 41;$i++){$before+=('物件 '+$i)}
 $delta=@(Get-NameDelta $before @($before+@('條碼 7')))
 Check ($delta.Count -eq 1 -and $delta[0] -ceq '條碼 7') '41 -> 42 name delta'
 Check (@(Get-NameDelta @() @()).Count -eq 0) 'Empty arrays'
 Check (@(Get-NameDelta @() @('one')).Count -eq 1) 'Singleton array'
 Reject {Assert-NameList @('A','a')}
 Reject {Assert-NameList @((,@('A','B')))}
 Reject {Assert-NameSetEqual @('A','B') @('A','C')}
 $collection=New-Object LwbReviewFixture.Objects
 Check (@(Get-ObjectNames $collection).Count -eq 0) 'Empty COM-style collection'
 $obj=New-Object LwbReviewFixture.Obj;$obj.Name='條碼 7';$obj.Type=4;$collection.Data.Add($obj)
 $names=@(Get-ObjectNames $collection);Check ($names.Count -eq 1 -and $names[0] -ceq '條碼 7') 'COM transport singleton name'
 Check ([object]::ReferenceEquals((Find-ExactObject $collection '條碼 7'),$obj)) 'Find exact COM transport'
 $obj.EmptyTransforms=$true
 [void](Get-LiteralBarcodeState (Read-SafeObjectXml ($obj.GetXML($true,$true))) 'BarCode-Code-128')
 Assert-SingleEmbeddedDataSource (Read-SafeObjectXml ($obj.GetXML($true,$true))) 'old' 'slot'
 $obj.Dirty=$true
 Reject {[void](Get-LiteralBarcodeState (Read-SafeObjectXml ($obj.GetXML($true,$true))) 'BarCode-Code-128')}
 $obj.Dirty=$false
 Set-LiteralPayload $collection $obj '中文<&007' 'BarCode-Code-128' (Join-Path $dir 'payload')
 Check ($obj.Value -ceq '中文<&007') 'Exact payload including XML special characters'
 $base64=Read-SafeObjectXml '<Value Encoding="base64">MQA=</Value>'
 Set-ExportedValue $base64.DocumentElement '中文007<&'
 Check ((Get-ExportedValue $base64.DocumentElement) -ceq '中文007<&') 'UTF16LE payload encoding'
 Check ((Get-ComponentCandidateScore 'Code 128.btc' 'code128') -gt (Get-ComponentCandidateScore 'Circular Code 128.btc' 'code128')) 'Circular ranking'
 Check ((Get-ComponentCandidateScore 'Circular Code 128.btc' 'code128') -lt 0) 'Circular excluded'
 Check ((Get-ComponentCandidateScore 'unrelated.btc' 'code128') -eq 0) 'Neutral fallback not excluded'
 # Direct exact-component strategy: one COM insertion only, no mass scan.
 $componentPath=Join-Path $dir 'Code 128.btc';Set-Content -LiteralPath $componentPath -Value 'fixture'
 $script:ReviewCandidatePaths=@([pscustomobject]@{path=$componentPath;score=300;length=7})
 function Get-BarTenderComponentCandidates {param($kind,$runDir) return $script:ReviewCandidatePaths}
 $request=[pscustomobject]@{slot='條碼 1';type='code128';value='LWB-C128-001';widthMm=32;heightMm=4.5;xMm=2.5;yMm=8}
 $work=New-Object LwbReviewFixture.Document
 $insert=Insert-VerifiedCode128Component $work $work.Objects $request $dir
 Check ($insert.name -ceq '條碼 7' -and $work.Objects.Count -eq 1) 'Direct exact component adds one stable object'
 Check ($work.Objects.Find('條碼 7').Value -ceq $request.value) 'Direct exact component two-payload roundtrip ends at target'
 $catalog=Get-Content (Join-Path $dir 'component-scan.json') -Raw | ConvertFrom-Json
 Check ($catalog.attemptedComInsertions -eq 1 -and $catalog.status -ceq 'VERIFIED_ONE_INSERT_NO_MASS_SCAN') 'No mass COM component scan'
 Check ($catalog.selection.selectionClass -ceq 'VERIFIED_DIRECT') 'Direct selection recorded'
 $noVisibility=Read-SafeObjectXml '<BarCode-Code-128><HumanReadable/></BarCode-Code-128>'
 Check ((Get-HumanReadableVisibility $noVisibility) -ceq 'VISIBLE_DEFAULT_OR_UNSPECIFIED') 'Missing visibility is not treated as hidden'
 $humanObj=$work.Objects.Find('條碼 7');$humanObj.Payload=$request.value;$humanObj.HumanReadableVisibility='Visible'
 $human=Try-HideCode128HumanReadable $humanObj $request (Join-Path $dir 'human-readable')
 Check ($human.status -ceq 'HIDDEN_BY_SETXML' -and $human.finalVisibility -ceq 'None') 'HumanReadable Visibility=None capability'
 $probeObj=$work.Objects.Find('條碼 7');$probeObj.Payload=$request.value;$probeObj.EmptyTransforms=$false;$probeObj.Index=2
 $probe=Probe-XDimensionResponse $probeObj $request (Join-Path $dir 'single-xdim') 600 $true
 Check ($probe.execution -ceq 'RUN' -and $probe.restored -and $probe.baseline.xDimension.index -eq 2 -and $probe.probe.readback.index -eq 3) 'Single-step XDimension probe responds and restores exact baseline'
 # BMP canvas and foreground intentionally differ; inverted palettes must work.
 foreach($invert in @($false,$true)){
  $path=Join-Path $dir ('ink-'+$invert+'.bmp')
  [LwbReviewFixture.Bmp]::Write($path,160,90,20,10,80,40,$invert)
  $r=[LabelWorkbench.RasterEvidence]::Read($path)
  Check ($r.CanvasWidth -eq 160 -and $r.InkWidth -eq 80 -and $r.InkHeight -eq 40 -and $r.Left -eq 20 -and $r.Top -eq 10) 'Canvas != ink; palette orientation'
 }
 $obj.Payload=$request.value;$obj.EmptyTransforms=$false;$obj.IgnoreIndex=$true
 $r=Measure-XDimensionExperiment $obj $request (Join-Path $dir 'noop') 600
 Check ($r.status -eq 'INDEX_WRITE_NOT_PROVEN' -and $r.symbolSize -eq 'NOT_VERIFIED') 'No-op SetXML cannot PASS'
 $obj.IgnoreIndex=$false
 $obj.Index=2;$obj.AlwaysDpiMismatch=$false;$obj.MismatchDpiIndex=-1
 $trustedRaster=Export-ObjectMeasurement $obj (Join-Path $dir 'dpi-match.bmp') 600
 Check ($trustedRaster.requestedDpi -eq 600 -and $trustedRaster.physicalMmTrust -ceq 'TRUSTED' -and $trustedRaster.dpiTrust -ceq 'TRUSTED_HEADER_MATCH' -and $null -ne $trustedRaster.inkWidthMm) 'Matching requested/header DPI is trusted'
 $r=Measure-XDimensionExperiment $obj $request (Join-Path $dir 'respond') 600
 Check ($r.status -eq 'INDEX_AND_RASTER_RESPONDED_SYMBOL_SIZE_UNVERIFIED' -and $r.finalRaster.symbolBounds -eq 'NOT_VERIFIED_NO_DECODER') 'Responding raster is still not symbol acceptance'
 $obj.HumanReadableVisibility='Visible';$obj.Index=2
 $rVisible=Measure-XDimensionExperiment $obj $request (Join-Path $dir 'visible-code128-layout') 600
 Check ($rVisible.execution -ceq 'NOT_RUN' -and $rVisible.status -ceq 'SKIPPED_CAPTION' -and $null -eq $rVisible.inkTargetErrorMm -and $obj.Index -eq 2) 'Visible Code128 never participates in width selection'
 $obj.HumanReadableVisibility='None'
 # Valid but mismatched BMP DPI invalidates physical-mm evidence before any Index selection.
 $obj.Index=2;$obj.AlwaysDpiMismatch=$true;$obj.MismatchDpiIndex=-1
 $badDpi=Export-ObjectMeasurement $obj (Join-Path $dir 'dpi-mismatch.bmp') 600
 Check ($badDpi.requestedDpi -eq 600 -and $badDpi.dpiTrust -ceq 'UNTRUSTED_HEADER_DPI_MISMATCH' -and $badDpi.physicalMmTrust -ceq 'UNTRUSTED' -and $null -eq $badDpi.inkWidthMm) 'Mismatched valid header DPI makes physical mm UNTRUSTED'
 $rMismatch=Measure-XDimensionExperiment $obj $request (Join-Path $dir 'dpi-mismatch-probe') 600
 Check ($rMismatch.status -ceq 'RASTER_DPI_UNTRUSTED' -and $rMismatch.execution -ceq 'NOT_RUN' -and $rMismatch.slopeTrust -ceq 'UNTRUSTED_DPI_MISMATCH' -and $rMismatch.finalX.index -eq 2) 'Baseline DPI mismatch prevents Index probing/best selection'
 # A mismatch discovered after a trusted baseline must not let that untrusted probe choose the best Index.
 $obj.AlwaysDpiMismatch=$false;$obj.Index=2;$obj.MismatchDpiIndex=1
 $rMid=Measure-XDimensionExperiment $obj $request (Join-Path $dir 'dpi-mid-probe') 600
 Check ($rMid.status -ceq 'RASTER_DPI_UNTRUSTED_DURING_PROBE' -and $rMid.slopeTrust -ceq 'UNTRUSTED_DPI_MISMATCH' -and $rMid.bestSelection -ceq 'SUPPRESSED_DPI_INCONSISTENT' -and $rMid.finalX.index -eq 2 -and $rMid.samples.Count -ge 3 -and $rMid.samples[2].raster.physicalMmTrust -ceq 'UNTRUSTED' -and $null -eq $rMid.inkTargetErrorMm) 'Mid-probe DPI inconsistency suppresses best-Index selection and mm error'
 $obj.MismatchDpiIndex=-1
 # Final-review fault injection. These tests execute real module functions through the fixture bridge.
 foreach($mode in @('missing','duplicate','empty','ignored','dirty')){
  $h=New-Object LwbReviewFixture.Obj;$h.Name='h';$h.Payload=$request.value;$h.HumanReadableVisibility='Visible'
  if($mode -eq 'missing'){$h.OmitHumanReadable=$true}
  if($mode -eq 'duplicate'){$h.DuplicateHumanReadable=$true}
  if($mode -eq 'empty'){$h.HumanReadableVisibility=''}
  if($mode -eq 'ignored'){$h.IgnoreHumanReadable=$true}
  if($mode -eq 'dirty'){$h.DirtyOnHide=$true}
  $hr=Try-HideCode128HumanReadable $h $request (Join-Path $dir ('human-'+$mode))
  if($mode -in @('missing','duplicate')){Check ($hr.finalVisibility -ceq 'UNKNOWN' -and $hr.restored) 'Unknown is never hidden'}
  elseif($mode -eq 'empty'){Check ($hr.status -ceq 'HIDDEN_BY_SETXML') 'Empty requires a successful write/readback'}
  else{Check ($hr.status -ceq 'NOT_APPLIED_RESTORED' -and $hr.restored -and -not $h.Dirty) 'Rejected/corrupt hide restores complete baseline'}
 }
 foreach($mode in @('exception','caption','final-dpi')){
  $o=New-Object LwbReviewFixture.Obj;$o.Name='failure';$o.Payload=$request.value
  if($mode -eq 'exception'){$o.ThrowIndex=1}
  if($mode -eq 'caption'){$o.CaptionIndex=3}
  if($mode -eq 'final-dpi'){$o.BadDpiExportCall=6}
  $failure=Measure-XDimensionExperiment $o $request (Join-Path $dir ('failure-'+$mode)) 600
  Check ($o.Index -eq 2 -and $o.HumanReadableVisibility -ceq 'None' -and $failure.restored -and $null -eq $failure.inkTargetErrorMm) 'Fault must restore baseline and suppress width acceptance'
 }
 $noOp=New-Object LwbReviewFixture.Obj;$noOp.Name='no-op';$noOp.Payload=$request.value;$noOp.IgnoreIndex=$true
 $nr=Measure-XDimensionExperiment $noOp $request (Join-Path $dir 'no-op-final') 600
 Check ($null -eq $nr.inkTargetErrorMm -and $nr.restored) 'No-op cannot accidentally accept baseline width'
 Save-CoreJson $r (Join-Path $dir 'measurement.json')
 'PASS: review regression: flat arrays, reflection collection transport, dirty sources, direct Code128 HumanReadable hide, visible-caption sizing rejection, BMP canvas/ink, DPI trust/mismatch/mid-probe rejection, ignored SetXML rejection. MOCK ONLY.'
} $dir $PSScriptRoot
} finally {Remove-Item -LiteralPath $dir -Recurse -Force}
