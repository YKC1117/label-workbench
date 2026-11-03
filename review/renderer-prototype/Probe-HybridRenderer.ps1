[CmdletBinding()]
param(
    [string]$CanonicalPath='',
    [string]$TextPoolPath=''
)
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$program=Join-Path $repo 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
if([string]::IsNullOrWhiteSpace($CanonicalPath)){$CanonicalPath=Join-Path $repo 'canonical.json'}
if([string]::IsNullOrWhiteSpace($TextPoolPath)){$TextPoolPath=Join-Path $PSScriptRoot 'runner-evidence\controlled-donor.btw'}
$CanonicalPath=[IO.Path]::GetFullPath($CanonicalPath);$TextPoolPath=[IO.Path]::GetFullPath($TextPoolPath)
$resultRoot=Join-Path $program 'native-results';$runDir=Join-Path $resultRoot ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-hybrid-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($runDir)
$package=Join-Path $program 'NATIVE_BUILD_RESULT.zip';$latest=Join-Path $program 'LATEST_NATIVE_OUTPUT.btw';$latestReport=Join-Path $program 'LATEST_NATIVE_REPORT.json';$reportPath=Join-Path $runDir 'native-build-report.json'
$app=$null;$formats=$null;$ownsBt=$false;$report=$null;$exitCode=1;$runtime=[ordered]@{schema='lwb-hybrid-probe-runtime-v1';status='STARTED';os=[Environment]::OSVersion.VersionString;powerShell=$PSVersionTable.PSVersion.ToString();barTender=[ordered]@{};renderer='hybrid-text-pool-btc';productAcceptance='NOT_RUN';cleanupErrors=@()}
function Release-Com($v){if($null -ne $v -and [Runtime.InteropServices.Marshal]::IsComObject($v)){try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($v)}catch{}}}
function Get-Raster([string]$path,[int]$dpi){
    if(-not('LabelWorkbench.RasterEvidence' -as [type])){Add-Type -Path (Join-Path $program 'RasterEvidence.cs') -ErrorAction Stop}
    $r=[LabelWorkbench.RasterEvidence]::Read($path);$tol=[math]::Max(1.0,[double]$dpi*.01);$trust=($r.HeaderDpiX -gt 0 -and $r.HeaderDpiY -gt 0 -and [math]::Abs($r.HeaderDpiX-$dpi)-le$tol -and [math]::Abs($r.HeaderDpiY-$dpi)-le$tol)
    return [ordered]@{requestedDpi=$dpi;headerDpiX=$r.HeaderDpiX;headerDpiY=$r.HeaderDpiY;dpiTrust=if($trust){'TRUSTED_HEADER_MATCH'}else{'UNTRUSTED'};canvasWidthPx=$r.CanvasWidth;canvasHeightPx=$r.CanvasHeight;inkLeftPx=$r.Left;inkTopPx=$r.Top;inkWidthPx=$r.InkWidth;inkHeightPx=$r.InkHeight;darkPixels=$r.DarkPixels;canvasWidthMm=if($trust){$r.CanvasWidth*25.4/$dpi}else{$null};canvasHeightMm=if($trust){$r.CanvasHeight*25.4/$dpi}else{$null};inkWidthMm=if($trust){$r.InkWidth*25.4/$dpi}else{$null};inkHeightMm=if($trust){$r.InkHeight*25.4/$dpi}else{$null};sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}
}
function Capture-HybridEvidence($formats,$report,$plan){
    if($report.reopen -cne 'PASS' -or -not(Test-Path -LiteralPath $report.output)){throw 'Hybrid visual evidence requires a Save/Reopen verified output.'}
    $hash=(Get-FileHash -LiteralPath $report.output -Algorithm SHA256).Hash
    $ev=[ordered]@{schema='lwb-native-visual-evidence-v1';revision='20261103-hybrid-text-pool-btc-v1';status='STARTED';coordinateClaim='BAR_TENDER_BMP_REGISTRATION_REQUIRED';requestedDpi=600;candidateSha256Before=$hash;candidateSha256After=$null;page=[ordered]@{widthMm=[double]$plan.widthMm;heightMm=[double]$plan.heightMm};formatPreview=$null;objects=@();notes=@('Designer-authored Text pool uses explicit TopLeft request; BarTender may omit the default ReferencePoint attribute.','Omitted Text ReferencePoint is accepted only if independent BMP registration passes.','Unused donor objects are DoNotPrint and excluded from report object coverage.');productAcceptance='NOT_RUN'}
    $doc=$null;$objs=$null;$failure=$null
    try{
        $doc=Com\Invoke-ComMethod $formats 'Open' @([string]$report.output,$false,'');if($null -eq $doc){throw 'Hybrid evidence Open returned null.'}
        Com\Write-Property $doc 'MeasurementUnits' 3
        $preview=Join-Path $runDir 'native-format-preview.bmp';[void](Com\Invoke-ComMethod $doc 'ExportToFile' @($preview,'BMP',[int]0,[int]600,[int]2));if(-not(Test-Path -LiteralPath $preview)){throw 'Hybrid format BMP missing.'}
        $ev.formatPreview=Get-Raster $preview 600;if($ev.formatPreview.dpiTrust -cne 'TRUSTED_HEADER_MATCH'){throw 'Hybrid format BMP DPI untrusted.'}
        $objs=Com\Read-Property $doc 'Objects'
        foreach($entry in @($report.objects)){
            $obj=$null
            try{
                $obj=Com\Invoke-ComMethod $objs 'Find' @([string]$entry.physicalName);if($null -eq $obj){throw ('Hybrid evidence object missing: '+$entry.id)}
                $xmlText=[string](Com\Invoke-ComMethod $obj 'GetXML' @($true,$true));$xml=New-Object Xml.XmlDocument;$xml.PreserveWhitespace=$true;$xml.LoadXml($xmlText);$present=$xml.DocumentElement.HasAttribute('ReferencePoint')
                $bmp=Join-Path $runDir ('visual-'+$entry.id+'.bmp');[void](Com\Invoke-ComMethod $obj 'ExportToFile' @($bmp,'BMP',[int]0,[int]600,[int]2));if(-not(Test-Path -LiteralPath $bmp)){throw ('Hybrid object BMP missing: '+$entry.id)}
                $rr=Get-Raster $bmp 600;if($rr.dpiTrust -cne 'TRUSTED_HEADER_MATCH'){throw ('Hybrid object BMP DPI untrusted: '+$entry.id)}
                $ev.objects+=,[ordered]@{id=[string]$entry.id;type=[string]$entry.type;physicalName=[string]$entry.physicalName;nativeType=[int](Com\Read-Property $obj 'Type');xMm=[double](Com\Read-Property $obj 'X');yMm=[double](Com\Read-Property $obj 'Y');rotationDeg=[double](Com\Read-Property $obj 'RotationAngle');referencePointPresent=[bool]$present;referencePoint=if($present){[string]$xml.DocumentElement.GetAttribute('ReferencePoint')}else{$null};xmlRoot=[string]$xml.DocumentElement.LocalName;raster=$rr}
            }finally{Release-Com $obj}
        }
        if(@($ev.objects).Count -ne @($report.objects).Count){throw 'Hybrid evidence object count mismatch.'}
    }catch{$failure=$_.Exception.ToString()}finally{Release-Com $objs;if($null -ne $doc){try{[void](Com\Invoke-ComMethod $doc 'Close' @(1))}catch{};Release-Com $doc}}
    try{$ev.candidateSha256After=(Get-FileHash -LiteralPath $report.output -Algorithm SHA256).Hash;if($ev.candidateSha256After -cne $hash){throw 'Hybrid evidence changed BTW file.'}}catch{if($failure){$failure+=' | '+$_.Exception.ToString()}else{$failure=$_.Exception.ToString()}}
    if($failure){$ev.status='FAIL';$ev['error']=$failure}else{$ev.status='PASS'}
    $ev|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $runDir 'native-visual-evidence.json') -Encoding UTF8
    if($failure){throw $failure};return $ev
}
try{
    foreach($p in @($package,$latest,$latestReport)){if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'Hybrid probe requires Windows.'}
    if(-not(Test-Path -LiteralPath $CanonicalPath -PathType Leaf)){throw 'Canonical input missing.'};if(-not(Test-Path -LiteralPath $TextPoolPath -PathType Leaf)){throw 'Text pool missing.'}
    Copy-Item -LiteralPath $CanonicalPath -Destination (Join-Path $runDir 'input-canonical.json')
    $node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source;$prepare=[IO.Path]::GetFullPath((Join-Path $program '..\..\..\renderer\prepare.cjs'))
    & $node $prepare (Join-Path $runDir 'input-canonical.json') $runDir;if($LASTEXITCODE -ne 0){throw 'Hybrid canonical adapter failed.'}
    Import-Module (Join-Path $program 'Com.psm1') -Force;Import-Module (Join-Path $program 'NativeLayoutEngine.psm1') -Force;Import-Module (Join-Path $program 'HybridPool.psm1') -Force
    $layout=Get-Content -LiteralPath (Join-Path $runDir 'renderer-request.json') -Raw -Encoding UTF8|ConvertFrom-Json;$plan=Test-NativeLayoutInput $layout
    $existing=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id);$app=New-Object -ComObject BarTender.Application;$pidBt=[int](Com\Read-Property $app 'ProcessID');$bt=Get-Process -Id $pidBt -ErrorAction Stop
    if($pidBt -in $existing -or $bt.ProcessName -ine 'BarTend'){throw 'Hybrid probe attached to pre-existing/unidentified BarTender process.'};$ownsBt=$true
    foreach($p in @('FullVersion','Edition','BuildNumber')){try{$runtime.barTender[$p]=[string](Com\Read-Property $app $p)}catch{$runtime.barTender[$p]='UNAVAILABLE'}};$runtime.barTender.ProcessID=$pidBt
    Com\Write-Property $app 'Visible' $false;$formats=Com\Read-Property $app 'Formats'
    $report=Invoke-HybridPoolBuild $formats $plan $TextPoolPath $runDir $program;$report|ConvertTo-Json -Depth 24|Set-Content -LiteralPath $reportPath -Encoding UTF8
    $runtime['visualEvidence']=Capture-HybridEvidence $formats $report $plan
    & $node (Join-Path $program 'probe-render.cjs') $runDir (Join-Path $runDir 'renderer-request.json');if($LASTEXITCODE -ne 0){throw 'Hybrid dual-render Visual QA unresolved/outside tolerance.'}
    $exitCode=0
}catch{$runtime['error']=$_.Exception.ToString();$_.Exception.ToString()|Set-Content -LiteralPath (Join-Path $runDir 'NATIVE_BUILD_ERROR.txt') -Encoding UTF8;Write-Host $_.Exception.Message -ForegroundColor Red}
finally{
    Release-Com $formats
    if($null -ne $app){if($ownsBt){try{[void](Com\Invoke-ComMethod $app 'Quit' @(1))}catch{$runtime.cleanupErrors+=$_.Exception.Message;$exitCode=1}};Release-Com $app}
    try{
        if($exitCode -eq 0 -and $null -ne $report -and $report.reopen -ceq 'PASS'){
            Copy-Item -LiteralPath $report.output -Destination $latest -Force;Copy-Item -LiteralPath $reportPath -Destination $latestReport -Force;$runtime.status='VERIFIED_CANDIDATE_NOT_PRODUCT_ACCEPTANCE'
        }else{
            $runtime.status='FAILED_OR_BLOCKED';if($null -ne $report -and -not [string]::IsNullOrWhiteSpace([string]$report.output) -and (Test-Path -LiteralPath $report.output)){Move-Item -LiteralPath $report.output -Destination ($report.output+'.FAILED_UNVERIFIED') -Force}
            foreach($p in @($latest,$latestReport)){if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
        }
        $runtime|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $runDir 'runtime.json') -Encoding UTF8;Compress-Archive -Path (Join-Path $runDir '*') -DestinationPath $package -CompressionLevel Optimal -Force
    }catch{$exitCode=1;$runtime.status='PUBLICATION_FAILED';$runtime.cleanupErrors+=$_.Exception.ToString();try{$runtime|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $runDir 'runtime.json') -Encoding UTF8}catch{}}
}
Write-Host ('Hybrid result: '+$package+'; exit='+$exitCode)
exit $exitCode
