[CmdletBinding()]
param([string]$LayoutPath='',[string]$BaseDirectory='',[string]$ResultRoot='',[switch]$OpenResults,[switch]$CaptureVisualEvidence)
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($BaseDirectory)){$BaseDirectory=[IO.Path]::GetDirectoryName($MyInvocation.MyCommand.Path)}
$BaseDirectory=[IO.Path]::GetFullPath($BaseDirectory)
if([string]::IsNullOrWhiteSpace($ResultRoot)){$ResultRoot=Join-Path $BaseDirectory 'native-results'}
$runDir=Join-Path ([IO.Path]::GetFullPath($ResultRoot)) ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($runDir)
$reportPath=Join-Path $runDir 'native-build-report.json'
$package=Join-Path $BaseDirectory 'NATIVE_BUILD_RESULT.zip'
$latest=Join-Path $BaseDirectory 'LATEST_NATIVE_OUTPUT.btw'
$latestReport=Join-Path $BaseDirectory 'LATEST_NATIVE_REPORT.json'
$app=$null;$formats=$null;$ownsBt=$false;$exitCode=1;$report=$null;$watchdog=$null
$runtime=[ordered]@{revision='20261102-layout-rc2';os=[Environment]::OSVersion.VersionString;powerShell=$PSVersionTable.PSVersion.ToString();processBits=[IntPtr]::Size*8;barTender=[ordered]@{};cleanupErrors=@();status='STARTED'}
function Release-RunnerCom($target){if($null -ne $target -and [Runtime.InteropServices.Marshal]::IsComObject($target)){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($target)}}
function Get-RunnerRasterEvidence([string]$path,[int]$requestedDpi) {
    if(-not('LabelWorkbench.RasterEvidence' -as [type])){Add-Type -Path (Join-Path $BaseDirectory 'RasterEvidence.cs') -ErrorAction Stop}
    $r=[LabelWorkbench.RasterEvidence]::Read($path)
    $tol=[math]::Max(1.0,[double]$requestedDpi*0.01)
    $valid=($r.HeaderDpiX -gt 0 -and $r.HeaderDpiY -gt 0 -and -not [double]::IsNaN($r.HeaderDpiX) -and -not [double]::IsNaN($r.HeaderDpiY) -and -not [double]::IsInfinity($r.HeaderDpiX) -and -not [double]::IsInfinity($r.HeaderDpiY))
    $trust=($valid -and [math]::Abs($r.HeaderDpiX-$requestedDpi) -le $tol -and [math]::Abs($r.HeaderDpiY-$requestedDpi) -le $tol)
    return [ordered]@{requestedDpi=$requestedDpi;headerDpiX=$r.HeaderDpiX;headerDpiY=$r.HeaderDpiY;dpiTrust=if($trust){'TRUSTED_HEADER_MATCH'}else{'UNTRUSTED'};canvasWidthPx=$r.CanvasWidth;canvasHeightPx=$r.CanvasHeight;inkLeftPx=$r.Left;inkTopPx=$r.Top;inkWidthPx=$r.InkWidth;inkHeightPx=$r.InkHeight;darkPixels=$r.DarkPixels;canvasWidthMm=if($trust){$r.CanvasWidth*25.4/$requestedDpi}else{$null};canvasHeightMm=if($trust){$r.CanvasHeight*25.4/$requestedDpi}else{$null};inkWidthMm=if($trust){$r.InkWidth*25.4/$requestedDpi}else{$null};inkHeightMm=if($trust){$r.InkHeight*25.4/$requestedDpi}else{$null};sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}
}
function Capture-RunnerVisualEvidence($formats,$report,$plan,[string]$runDir,[string]$baseDirectory) {
    if($null -eq $report -or [string]::IsNullOrWhiteSpace([string]$report.output) -or -not(Test-Path -LiteralPath $report.output)){throw 'Visual evidence requires a verified native output.'}
    $candidateHashBefore=(Get-FileHash -LiteralPath $report.output -Algorithm SHA256).Hash
    $ev=[ordered]@{schema='lwb-native-visual-evidence-v1';revision='20261102-layout-rc2';status='STARTED';coordinateClaim='EVIDENCE_ONLY_NOT_IMAGE_TOP_LEFT_CERTIFIED';requestedDpi=600;candidateSha256Before=$candidateHashBefore;candidateSha256After=$null;page=[ordered]@{widthMm=[double]$plan.widthMm;heightMm=[double]$plan.heightMm};formatPreview=$null;objects=@();notes=@('BarTender X/Y are anchor coordinates, not automatically image top-left coordinates.','ReferencePoint is captured from object XML; an absent attribute is recorded as absent, not guessed.','Raster evidence is diagnostic only and does not change the V5 native build core.')}
    $doc=$null;$objs=$null;$failure=$null
    try{
        $doc=Com\Invoke-ComMethod $formats 'Open' @([string]$report.output,$false,'')
        if($null -eq $doc){throw 'Open returned no document.'}
        $report.reopen='PASS'
        Com\Write-Property $doc 'MeasurementUnits' 3
        $preview=Join-Path $runDir 'native-format-preview.bmp'
        if(Test-Path -LiteralPath $preview){Remove-Item -LiteralPath $preview -Force}
        [void](Com\Invoke-ComMethod $doc 'ExportToFile' @($preview,'BMP',[int]0,[int]600,[int]2))
        if(-not(Test-Path -LiteralPath $preview) -or (Get-Item -LiteralPath $preview).Length -le 0){throw 'Format preview export produced no BMP.'}
        $ev.formatPreview=Get-RunnerRasterEvidence $preview 600
        if($ev.formatPreview.dpiTrust -cne 'TRUSTED_HEADER_MATCH'){throw 'Format preview DPI is untrusted.'}
        $objs=Com\Read-Property $doc 'Objects'
        foreach($entry in @($report.objects)){
            $obj=$null
            try{
                $obj=Com\Invoke-ComMethod $objs 'Find' @([string]$entry.physicalName)
                if($null -eq $obj){throw ('Visual evidence object missing: '+$entry.id)}
                $xmlText=[string](Com\Invoke-ComMethod $obj 'GetXML' @($true,$true))
                $xml=New-Object System.Xml.XmlDocument;$xml.PreserveWhitespace=$true;$xml.LoadXml($xmlText)
                $hasRef=$xml.DocumentElement.HasAttribute('ReferencePoint')
                $objBmp=Join-Path $runDir ('visual-'+$entry.id+'.bmp')
                if(Test-Path -LiteralPath $objBmp){Remove-Item -LiteralPath $objBmp -Force}
                [void](Com\Invoke-ComMethod $obj 'ExportToFile' @($objBmp,'BMP',[int]0,[int]600,[int]2))
                if(-not(Test-Path -LiteralPath $objBmp) -or (Get-Item -LiteralPath $objBmp).Length -le 0){throw ('Object preview export produced no BMP: '+$entry.id)}
                $rr=Get-RunnerRasterEvidence $objBmp 600
                if($rr.dpiTrust -cne 'TRUSTED_HEADER_MATCH'){throw ('Object preview DPI is untrusted: '+$entry.id)}
                $ev.objects+=,[ordered]@{id=[string]$entry.id;type=[string]$entry.type;physicalName=[string]$entry.physicalName;nativeType=[int](Com\Read-Property $obj 'Type');xMm=[double](Com\Read-Property $obj 'X');yMm=[double](Com\Read-Property $obj 'Y');rotationDeg=[double](Com\Read-Property $obj 'RotationAngle');referencePointPresent=[bool]$hasRef;referencePoint=if($hasRef){[string]$xml.DocumentElement.GetAttribute('ReferencePoint')}else{$null};xmlRoot=[string]$xml.DocumentElement.LocalName;raster=$rr}
            }finally{Release-RunnerCom $obj}
        }
        if(@($ev.objects).Count -ne @($report.objects).Count){throw 'Visual evidence object count mismatch.'}
    }catch{$failure=$_.Exception.ToString()}
    finally{
        Release-RunnerCom $objs
        if($null -ne $doc){try{[void](Com\Invoke-ComMethod $doc 'Close' @(1))}catch{if($null -eq $failure){$failure=$_.Exception.ToString()}};Release-RunnerCom $doc}
    }
    try{
        if(-not(Test-Path -LiteralPath $report.output)){throw 'Verified candidate disappeared during visual evidence capture.'}
        $ev.candidateSha256After=(Get-FileHash -LiteralPath $report.output -Algorithm SHA256).Hash
        if($ev.candidateSha256After -cne $candidateHashBefore){throw 'Visual evidence capture changed the verified BTW file.'}
    }catch{if($null -eq $failure){$failure=$_.Exception.ToString()}else{$failure+=' | hash-check: '+$_.Exception.ToString()}}
    if($null -ne $failure){$ev.status='FAIL';$ev['error']=$failure}else{$ev.status='PASS'}
    $ev|ConvertTo-Json -Depth 16|Set-Content -LiteralPath (Join-Path $runDir 'native-visual-evidence.json') -Encoding UTF8
    if($null -ne $failure){throw $failure}
    return $ev
}

try{
    # Remove only fixed generated latest aliases; historical per-run results are retained.
    foreach($p in @($package,$latest,$latestReport)){if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'Windows + installed BarTender required. NOT RUN.'}
    if([string]::IsNullOrWhiteSpace($LayoutPath)){
        Add-Type -AssemblyName System.Windows.Forms
        $picker=New-Object System.Windows.Forms.OpenFileDialog
        try{$picker.Filter='Native layout (*.json)|*.json';$picker.Title='Select native-layout.multi.sample.json or normalized layout';if($picker.ShowDialog() -eq 'OK'){$LayoutPath=$picker.FileName}}finally{$picker.Dispose()}
    }
    if([string]::IsNullOrWhiteSpace($LayoutPath) -or -not(Test-Path -LiteralPath $LayoutPath -PathType Leaf)){throw 'No valid layout JSON selected.'}
    Copy-Item -LiteralPath $LayoutPath -Destination (Join-Path $runDir 'input-layout.json')
    & (Join-Path $BaseDirectory 'SELF_CHECK_NATIVE.ps1') -EvidenceDirectory $runDir *> (Join-Path $runDir 'PREFLIGHT_LOG.txt')
    Import-Module (Join-Path $BaseDirectory 'Com.psm1') -Force
    Import-Module (Join-Path $BaseDirectory 'NativeLayoutEngine.psm1') -Force
    $layout=Get-Content -LiteralPath (Join-Path $runDir 'input-layout.json') -Raw -Encoding UTF8|ConvertFrom-Json
    if($layout.schema -ceq 'renderer-probe-v1' -and -not $CaptureVisualEvidence){throw 'Prototype requires full-page capture.'}
    $production=($layout.schema -ceq 'lwb-production-review-v2')
    if($production){
        if(-not $CaptureVisualEvidence -or $layout.revision -cne $runtime.revision -or $layout.layout.revision -cne $runtime.revision){throw 'RC2 evidence revision mismatch.'}
        $plan=$layout.layout
        if(-not $plan.physicalSizeKnown -or $plan.objects.Count -lt 1 -or $plan.objects.Count -gt 200){throw 'Invalid production object list or paper size.'}
        $ids=@{};$names=@{}
        foreach($entry in $plan.objects){
            if($entry.id -cnotmatch '^OBJ_[0-9]+$' -or $ids.ContainsKey($entry.id) -or [string]::IsNullOrWhiteSpace($entry.physicalName) -or $names.ContainsKey($entry.physicalName)){throw 'Invalid or ambiguous production object identity.'}
            $ids[$entry.id]=$true;$names[$entry.physicalName]=$true
        }
        $artifact=Join-Path $runDir 'native-output.btw'
        [IO.File]::WriteAllBytes($artifact,[Convert]::FromBase64String($layout.btwBase64))
        if((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash -ine $layout.sha256){throw 'Website BTW hash mismatch.'}
        $report=[ordered]@{output=$artifact;reopen='NOT_RUN';objects=$plan.objects;revision=$runtime.revision;sha256=$layout.sha256}
    }else{
        if($layout.schema -ceq 'lwb-review-input-v1'){throw 'RC1 review input lacks production parity.'}
        $plan=Test-NativeLayoutInput $layout
    }
    if($CaptureVisualEvidence){$nodePath=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source}
    $runtime['objectCount']=$plan.objects.Count
    $existing=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
    $app=New-Object -ComObject BarTender.Application
    $pidBt=[int](Com\Read-Property $app 'ProcessID');$bt=Get-Process -Id $pidBt -ErrorAction Stop
    if($pidBt -in $existing -or $bt.ProcessName -ine 'BarTend'){throw 'BarTender process is pre-existing or unidentified; refusing to modify or Quit it.'}
    $ownsBt=$true
    foreach($key in @('FullVersion','Version','Edition','BuildNumber')){try{$runtime.barTender[$key]=[string](Com\Read-Property $app $key)}catch{$runtime.barTender[$key]='UNAVAILABLE'}}
    $runtime.barTender['ProcessID']=$pidBt
    'COM process acquired'|Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
    $psExe=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $wdArgs='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $BaseDirectory 'Watchdog.ps1')+'" -MainPid '+$PID+' -BarTenderPid '+$pidBt+' -RunDir "'+$runDir+'" -BaseDirectory "'+$BaseDirectory+'" -StallSeconds 120 -MaxSeconds 600 -BarTenderStartTicks '+[string]$bt.StartTime.ToUniversalTime().Ticks+' -MainStartTicks '+[string](Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks+' -ReturnZipName NATIVE_BUILD_RESULT.zip'
    $watchdog=Start-Process -FilePath $psExe -ArgumentList $wdArgs -PassThru -WindowStyle Hidden -ErrorAction Stop
    $runtime['watchdog']='120-second stall / 600-second owned-run maximum; activation itself precedes watchdog'
    Com\Write-Property $app 'Visible' $false
    $formats=Com\Read-Property $app 'Formats'
    if(-not $production){$report=Invoke-NativeLayoutBuild $formats $layout $runDir $BaseDirectory}
    if($CaptureVisualEvidence){$runtime['visualEvidence']=Capture-RunnerVisualEvidence $formats $report $plan $runDir $BaseDirectory
        $checker=if($layout.schema -ceq 'renderer-probe-v1'){'probe-render.cjs'}else{'compare-render.cjs'}
        & $nodePath (Join-Path $BaseDirectory $checker) $runDir (Join-Path $runDir 'input-layout.json')
        if($LASTEXITCODE -ne 0){throw 'Render comparison unresolved or outside tolerance. See render-comparison.json.'}
    }
    if($production){$report|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $reportPath -Encoding UTF8}
    $exitCode=0
}catch{
    $_.Exception.ToString()|Set-Content -LiteralPath (Join-Path $runDir 'NATIVE_BUILD_ERROR.txt') -Encoding UTF8
    Write-Host $_.Exception.Message -ForegroundColor Red
}finally{
    try{Release-RunnerCom $formats}catch{$runtime.cleanupErrors+=$_.Exception.Message;$exitCode=1}
    if($null -ne $app){
        if($ownsBt){try{[void](Com\Invoke-ComMethod $app 'Quit' @(1))}catch{$runtime.cleanupErrors+=$_.Exception.Message;$exitCode=1}}
        try{Release-RunnerCom $app}catch{$runtime.cleanupErrors+=$_.Exception.Message;$exitCode=1}
    }
    'done'|Set-Content -LiteralPath (Join-Path $runDir 'WATCHDOG_DONE.txt') -Encoding ASCII
    if($null -ne $watchdog){try{if(-not $watchdog.HasExited){$watchdog.Kill()}}catch{}}
    try{
        if($exitCode -eq 0 -and $null -ne $report -and $report.reopen -ceq 'PASS'){
            Copy-Item -LiteralPath $report.output -Destination $latest
            Copy-Item -LiteralPath $reportPath -Destination $latestReport
            $runtime.status='VERIFIED_CANDIDATE_NOT_PRODUCT_ACCEPTANCE'
        }else{
            $runtime.status='FAILED_OR_BLOCKED'
            foreach($name in @('candidate.unverified.btw','native-output.btw')){
                $f=Join-Path $runDir $name
                if(Test-Path -LiteralPath $f){Move-Item -LiteralPath $f -Destination ($f+'.FAILED_UNVERIFIED') -Force}
            }
        }
        $runtime|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $runDir 'runtime.json') -Encoding UTF8
        Compress-Archive -Path (Join-Path $runDir '*') -DestinationPath $package -CompressionLevel Optimal -Force
    }catch{
        $exitCode=1
        foreach($p in @($latest,$latestReport)){if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
        $publicationError=$_.Exception.Message
        $runtime.status='PUBLICATION_FAILED';$runtime.cleanupErrors+=$publicationError
        try{
            $f=Join-Path $runDir 'native-output.btw';if(Test-Path -LiteralPath $f){Move-Item -LiteralPath $f -Destination ($f+'.PUBLICATION_FAILED') -Force}
            $runtime|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $runDir 'runtime.json') -Encoding UTF8
        }catch{}
        Write-Host ('Output/package publication failed: '+$publicationError) -ForegroundColor Red
    }
    if($OpenResults){try{Invoke-Item -LiteralPath $runDir}catch{}}
}
Write-Host ('Result: '+$package+'; exit='+$exitCode)
exit $exitCode
