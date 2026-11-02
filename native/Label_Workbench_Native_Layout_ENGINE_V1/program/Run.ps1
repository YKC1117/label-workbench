# Windows PowerShell 5.1; no SDK DLL, Node, Python, web server or print job.
[CmdletBinding()]
param(
    [string]$LayoutPath = '',
    [string]$TemplatePath = '',
    [string]$ResultRoot = '',
    [string]$BaseDirectory = '',
    [switch]$OpenResults,
    [switch]$Inspect,
    [switch]$SaveProbe,
    [switch]$CoreTest,
    [switch]$AllowTemplateSizes
)
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
# Resolve paths AFTER parameter binding. CMD supplies its own folder explicitly;
# direct PowerShell execution falls back to this script's invocation path.
if ([string]::IsNullOrWhiteSpace($BaseDirectory)) {
    $scriptFile = $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrWhiteSpace($scriptFile)) { throw 'Cannot locate Run.ps1. Extract the complete ZIP and launch INSPECT.cmd.' }
    $BaseDirectory = [IO.Path]::GetDirectoryName($scriptFile)
}
$BaseDirectory = [IO.Path]::GetFullPath($BaseDirectory)
if ([string]::IsNullOrWhiteSpace($LayoutPath)) { $LayoutPath = Join-Path $BaseDirectory 'layout.json' }
if ([string]::IsNullOrWhiteSpace($TemplatePath)) { $TemplatePath = Join-Path $BaseDirectory 'clean_template.btw' }
if ([string]::IsNullOrWhiteSpace($ResultRoot)) { $ResultRoot = Join-Path $BaseDirectory 'results' }
$runDir = Join-Path ([IO.Path]::GetFullPath($ResultRoot)) ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
[void][IO.Directory]::CreateDirectory($runDir)
$report = [ordered]@{schema='lwb-bt-automation-report-v1';scriptRevision='one-shot-v4-final-review-20261005' ;baseDirectory=$BaseDirectory;status='NOT_RUN';visualAcceptance='NOT_RUN';stage='preflight';utc=[DateTime]::UtcNow.ToString('o');os=[Environment]::OSVersion.VersionString;powerShell=$PSVersionTable.PSVersion.ToString();processBits=([IntPtr]::Size*8);template=$null;output=$null;unsupported=@();objects=@();error=$null}
$app=$null; $format=$null; $opened=$null; $objects=$null; $page=$null; $exitCode=1
$watchdog=$null
$ownsBt=$false
$btStartTicks=''
$liveStagePath=Join-Path $runDir 'LIVE_STAGE.txt'
function Set-RunStage([string]$text) {
    $report.stage=$text
    $stamp=(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    ($stamp+' | '+$text) | Set-Content -LiteralPath $liveStagePath -Encoding UTF8
    Write-Host ('['+$stamp+'] '+$text) -ForegroundColor Cyan
}
function Release-Com($target) {
    if ($null -ne $target -and [Runtime.InteropServices.Marshal]::IsComObject($target)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($target) }
}
function Assert-Near($actual,$expected,[string]$name) {
    if ([math]::Abs([double]$actual-[double]$expected) -gt 0.02) { throw "$name readback mismatch: expected $expected, actual $actual" }
}
function Verify-Document($document,$plan) {
    Write-Property $document 'MeasurementUnits' 3 # btUnitsMillimeters, documented in LabelWidth property
    $p=Read-Property $document 'PageSetup'
    try { Assert-Near (Read-Property $p 'LabelWidth' @(3)) $plan.widthMm 'LabelWidth'; Assert-Near (Read-Property $p 'LabelHeight' @(3)) $plan.heightMm 'LabelHeight' } finally { Release-Com $p }
    $collection=Read-Property $document 'Objects'
    try {
        foreach ($item in $plan.items) {
            $obj=Invoke-ComMethod $collection 'Find' @($item.slot)
            try {
                if ([string](Invoke-ComMethod $document 'GetNamedSubStringValue' @($item.source)) -cne $item.value) { throw "Data source readback mismatch: $($item.source)" }
                if ([string](Read-Property $obj 'Value') -cne $item.value) { throw "Object value mismatch (check transforms/bindings): $($item.slot)" }
                foreach ($key in $item.set.Keys) {
                    $actual=Read-Property $obj $key; $expected=$item.set[$key]
                    if ($expected -is [double]) { Assert-Near $actual $expected "$($item.slot).$key" }
                    elseif ($actual -cne $expected) { throw "Property mismatch: $($item.slot).$key" }
                }
            } finally { Release-Com $obj }
        }
        for ($i=1;$i -le (Read-Property $collection 'Count');$i++) {
            $obj=Invoke-ComMethod $collection 'Item' @($i)
            try { if ((Read-Property $obj 'Name') -notin @($plan.items.slot) -and -not (Read-Property $obj 'DoNotPrint')) { throw "Unused object not suppressed: $(Read-Property $obj 'Name')" } } finally { Release-Com $obj }
        }
    } finally { Release-Com $collection }
}
try {
    Import-Module (Join-Path $BaseDirectory 'Layout.psm1') -Force
    Import-Module (Join-Path $BaseDirectory 'Com.psm1') -Force
    Import-Module (Join-Path $BaseDirectory 'Diagnostics.psm1') -Force
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows + installed BarTender 2022 Automation/Enterprise required. NOT RUN.' }
    if (-not $Inspect -and -not $SaveProbe -and -not $CoreTest) {
        $layout=Get-Content -LiteralPath $LayoutPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $plan=New-LayoutPlan $layout -AllowTemplateSizes:$AllowTemplateSizes
        $report.unsupported=@($plan.unsupported)
    }
    Set-RunStage 'COM activation'
    $existingBtIds=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $app=New-Object -ComObject BarTender.Application
    $btPid=[int](Read-Property $app 'ProcessID')
    $btProcess=Get-Process -Id $btPid -ErrorAction Stop
    if($btPid -in $existingBtIds -or $btProcess.ProcessName -ine 'BarTend'){throw 'Automation attached to a pre-existing/unidentified process. No visibility change or Quit will be attempted.'}
    $ownsBt=$true
    $btStartTicks=[string]$btProcess.StartTime.ToUniversalTime().Ticks
    $report['diagnosticWarnings']=@()
    try { Add-Type -Path (Join-Path $BaseDirectory 'ComMetadata.cs') } catch { $report.diagnosticWarnings += ('Native metadata helper: '+$_.Exception.Message) }
    try { Write-Property $app 'Visible' $false } catch { $report.diagnosticWarnings += ('Visible: '+$_.Exception.Message) }
    Set-RunStage 'application diagnostics'
    $report['barTender']=[ordered]@{}
    foreach ($name in @('FullVersion','Version','Edition','BuildNumber','ProcessID')) {
        $result=Get-DiagnosticProperty $app $name
        $report.barTender[$name]=$result
        if (-not $result.available) { $report.diagnosticWarnings += ($name+': '+$result.error) }
    }
    if ($CoreTest) {
        $report['applicationMembers']=[ordered]@{available=$false;members=@();error='Skipped in CORE_TEST: prior Windows evidence already captured ITypeInfo diagnostics.'}
    } else {
        $report['applicationMembers']=Get-DiagnosticMembers $app
        if (-not $report.applicationMembers.available) { $report.diagnosticWarnings += $report.applicationMembers.error }
    }
    Set-RunStage 'select template'
    if (-not (Test-Path -LiteralPath $TemplatePath -PathType Leaf) -and ($Inspect -or $SaveProbe -or $CoreTest)) {
        Add-Type -AssemblyName System.Windows.Forms
        $picker=New-Object System.Windows.Forms.OpenFileDialog
        try { $picker.Filter='BarTender (*.btw)|*.btw'; $picker.Title='Select an existing BTW (only a copy will be used)'; if ($picker.ShowDialog() -eq 'OK') { $TemplatePath=$picker.FileName } } finally { $picker.Dispose() }
    }
    if (-not (Test-Path -LiteralPath $TemplatePath -PathType Leaf)) { throw 'Missing clean_template.btw. No certified native template is bundled; see TEMPLATE-CONTRACT.md. Available application diagnostics are recorded in report.json.' }
    $TemplatePath=(Resolve-Path -LiteralPath $TemplatePath).Path
    if ([IO.Path]::GetExtension($TemplatePath) -ine '.btw') { throw 'Template must be .btw.' }
    $report.template=$TemplatePath; $originalHash=(Get-FileHash -LiteralPath $TemplatePath -Algorithm SHA256).Hash
    $report['templateSha256']=$originalHash
    # Work only on a byte-identical copy; no binary patching and never save original.
    $working=Join-Path $runDir 'template-copy.btw'
    Copy-Item -LiteralPath $TemplatePath -Destination $working
    if ($CoreTest) {
        try {
            $btPid=[int](Read-Property $app 'ProcessID')
            $watchdogPath=Join-Path $BaseDirectory 'Watchdog.ps1'
            $args='-NoProfile -ExecutionPolicy Bypass -File "'+$watchdogPath+'" -MainPid '+$PID+' -BarTenderPid '+$btPid+' -RunDir "'+$runDir+'" -BaseDirectory "'+$BaseDirectory+'" -StallSeconds 120 -MaxSeconds 600 -BarTenderStartTicks '+$btStartTicks+' -MainStartTicks '+[string](Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
            $watchdog=Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $args -PassThru
            $report['watchdog']=[ordered]@{enabled=$true;barTenderPid=$btPid;stallSeconds=120;maxSeconds=600;startsBeforeOpen=$true}
        } catch {
            $report['watchdog']=[ordered]@{enabled=$false;error=$_.Exception.Message}
        }
    }
    Set-RunStage 'read Formats via IDispatch'
    $opened=Read-Property $app 'Formats'
    Set-RunStage 'open template copy via compiled COM bridge'
    $report['openArgumentTypes']=@([LabelWorkbench.ComBridge]::ArgumentTypes(@([string]$working,[bool]$false,[string]'')))
    $format=Invoke-ComMethod $opened 'Open' @($working,$false,'')
    Set-RunStage 'read Objects via IDispatch'
    $objects=Read-Property $format 'Objects'
    if ($CoreTest) {
        Set-RunStage 'skip repeated 41-object diagnostics; enter core test'
        $report['formatMembers']=[ordered]@{available=$false;members=@();error='Skipped in CORE_TEST; already proven in earlier Windows evidence.'}
        $report.objects=@()
    } else {
        Set-RunStage 'object diagnostics'
        $report['formatMembers']=Get-DiagnosticMembers $format
        if (-not $report.formatMembers.available) { $report.diagnosticWarnings += $report.formatMembers.error }
        for ($i=1;$i -le (Read-Property $objects 'Count');$i++) {
            $obj=$null
            try {
                $obj=Invoke-ComMethod $objects 'Item' @($i)
                $nameInfo=Get-DiagnosticProperty $obj 'Name'
                $typeInfo=Get-DiagnosticProperty $obj 'Type'
                $members=Get-DiagnosticMembers $obj
                $properties=[ordered]@{}
                if ($SaveProbe) {
                    foreach ($property in @('Value','X','Y','Width','Height','FontSize','FontScale','DoNotPrint')) { $properties[$property]=Get-DiagnosticProperty $obj $property }
                }
                $report.objects += [ordered]@{index=$i;name=$nameInfo;type=$typeInfo;members=$members;properties=$properties}
                if (-not $nameInfo.available -or -not $typeInfo.available -or -not $members.available) { $report.diagnosticWarnings += "Object $i has incomplete diagnostic metadata; see objects in report." }
            } catch {
                if (-not $Inspect) { throw }
                $report.objects += [ordered]@{index=$i;error=$_.Exception.Message}
                $report.diagnosticWarnings += "Object $i could not be inspected."
            } finally { Release-Com $obj }
        }
    }
    if ($CoreTest) {
        Import-Module (Join-Path $BaseDirectory 'XmlCore.psm1') -Force
        Release-Com $objects; $objects=$null
        $ownedDocument=$format; $format=$null
        Set-RunStage 'CORE_TEST start'
        Invoke-CoreTest $ownedDocument $opened $report $runDir $BaseDirectory $TemplatePath $originalHash
        $ownedDocument=$null
        $exitCode=2
    }
    elseif ($SaveProbe) {
        # This is an intentionally limited native edit/save probe, not layout export.
        $report.stage='load save-probe.json'
        $probe=Get-Content -LiteralPath (Join-Path $BaseDirectory 'save-probe.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($key in @('deltaXMm','deltaYMm','fontSizePt')) {
            $v=$probe.$key
            if ($null -eq $v -or $v -is [string] -or $v -is [bool] -or [double]::IsNaN([double]$v) -or [double]::IsInfinity([double]$v)) { throw "Invalid probe number: $key" }
        }
        if ([math]::Abs($probe.deltaXMm) -gt 10 -or [math]::Abs($probe.deltaYMm) -gt 10 -or $probe.fontSizePt -lt 1 -or $probe.fontSizePt -gt 72) { throw 'Probe values outside allowed range.' }
        $textEntries=@($report.objects | Where-Object { $_.type.available -and $_.type.value -eq '5' })
        if ($textEntries.Count -eq 0) { throw 'No native text object found for save probe.' }
        $targetName=[string]$textEntries[0].name.value
        Write-Property $format 'MeasurementUnits' 3
        $obj=Invoke-ComMethod $objects 'Find' @($targetName)
        try {
            $before=[ordered]@{X=[double](Read-Property $obj 'X');Y=[double](Read-Property $obj 'Y');FontSize=[double](Read-Property $obj 'FontSize')}
            $expected=[ordered]@{X=($before.X+[double]$probe.deltaXMm);Y=($before.Y+[double]$probe.deltaYMm);FontSize=[double]$probe.fontSizePt}
            $report['probe']=[ordered]@{slot=$targetName;before=$before;expected=$expected;afterReopen=$null;payloadChanged=$false}
            $report.stage='edit native text geometry'
            foreach ($key in $expected.Keys) { Write-Property $obj $key ([single]$expected[$key]); Assert-Near (Read-Property $obj $key) $expected[$key] $key }
        } finally { Release-Com $obj }
        $report.stage='probe SaveAs'
        $candidate=Join-Path $runDir 'candidate.btw'
        [void](Invoke-ComMethod $format 'SaveAs' @($candidate,$false))
        [void](Invoke-ComMethod $format 'Close' @(1))
        Release-Com $objects; $objects=$null; Release-Com $format; $format=$null
        if (-not (Test-Path -LiteralPath $candidate) -or (Get-Item -LiteralPath $candidate).Length -eq 0) { throw 'SaveAs did not create a nonempty file.' }
        $report.stage='probe reopen and verify'
        $format=Invoke-ComMethod $opened 'Open' @($candidate,$false,'')
        Write-Property $format 'MeasurementUnits' 3
        $objects=Read-Property $format 'Objects'
        $obj=Invoke-ComMethod $objects 'Find' @($targetName)
        try {
            $actual=[ordered]@{}
            foreach ($key in $expected.Keys) { $actual[$key]=[double](Read-Property $obj $key); Assert-Near $actual[$key] $expected[$key] $key }
            $report.probe.afterReopen=$actual
        } finally { Release-Com $obj }
        [void](Invoke-ComMethod $format 'Close' @(1))
        Release-Com $objects; $objects=$null; Release-Com $format; $format=$null
        if ((Get-FileHash -LiteralPath $TemplatePath -Algorithm SHA256).Hash -cne $originalHash) { throw 'Original template changed during execution.' }
        $final=Join-Path $runDir 'output.btw'
        Move-Item -LiteralPath $candidate -Destination $final
        $report.output=$final
        $report.status='TEXT_GEOMETRY_SAVE_READBACK_OK_VISUAL_NOT_RUN'
        $report['limitations']=@('Only first text X/Y/FontSize tested. Payload, barcode sizing and full layout acceptance remain untested.')
        $exitCode=0
    }
    elseif ($Inspect) {
        $report.status=if ($report.diagnosticWarnings.Count) {'INSPECTED_WITH_WARNINGS'} else {'INSPECTED_ONLY'}
        $exitCode=0
    }
    else {
        if ($plan.blocked) { $report.status='BLOCKED_UNSUPPORTED_FIELDS';throw ('No output: unverified or unsupported setters: '+($plan.unsupported -join ', ')+'. Explicit -AllowTemplateSizes can produce a PARTIAL output retaining these template properties.') }
        $report.stage='validate slots and sources'
        foreach ($item in $plan.items) {
            $obj=Invoke-ComMethod $objects 'Find' @($item.slot)
            if ($null -eq $obj) { throw "Missing slot: $($item.slot)" }
            try {
                if ([string](Read-Property $obj 'Name') -cne $item.slot) { throw "Slot lookup mismatch: $($item.slot)" }
                # Type values are captured in report; detailed symbology/anchor are template-contract requirements.
                [void](Invoke-ComMethod $format 'GetNamedSubStringValue' @($item.source))
            } finally { Release-Com $obj }
        }
        $report.stage='set page and objects'
        Write-Property $format 'MeasurementUnits' 3
        $page=Read-Property $format 'PageSetup'
        # One-label page. Indexed PageSetup properties explicitly receive millimetres.
        Write-Property $page 'LabelColumns' 1; Write-Property $page 'LabelRows' 1
        foreach ($key in @('MarginLeft','MarginRight','MarginTop','MarginBottom')) { Write-Property $page $key ([single]0) @(3) }
        Write-Property $page 'PaperWidth' ([single]$plan.widthMm) @(3)
        Write-Property $page 'PaperHeight' ([single]$plan.heightMm) @(3)
        Write-Property $page 'LabelWidth' ([single]$plan.widthMm) @(3)
        Write-Property $page 'LabelHeight' ([single]$plan.heightMm) @(3)
        for ($i=1;$i -le (Read-Property $objects 'Count');$i++) {
            $obj=Invoke-ComMethod $objects 'Item' @($i)
            try { Write-Property $obj 'DoNotPrint' $true } finally { Release-Com $obj }
        }
        foreach ($item in $plan.items) {
            [void](Invoke-ComMethod $format 'SetNamedSubStringValue' @($item.source,$item.value))
            $obj=Invoke-ComMethod $objects 'Find' @($item.slot)
            try { foreach ($key in $item.set.Keys) { Write-Property $obj $key $item.set[$key] } } finally { Release-Com $obj }
        }
        Verify-Document $format $plan
        $report.stage='save and reopen'
        $candidate=Join-Path $runDir 'candidate.btw'
        [void](Invoke-ComMethod $format 'SaveAs' @($candidate,$false))
        [void](Invoke-ComMethod $format 'Close' @(1)) # btDoNotSaveChanges
        Release-Com $page; $page=$null; Release-Com $objects; $objects=$null; Release-Com $format; $format=$null
        if (-not (Test-Path -LiteralPath $candidate) -or (Get-Item -LiteralPath $candidate).Length -eq 0) { throw 'SaveAs did not produce a nonempty file.' }
        $format=Invoke-ComMethod $opened 'Open' @($candidate,$false,'')
        Verify-Document $format $plan
        [void](Invoke-ComMethod $format 'Close' @(1));Release-Com $format;$format=$null
        if ((Get-FileHash -LiteralPath $TemplatePath -Algorithm SHA256).Hash -cne $originalHash) { throw 'Original template changed during execution.' }
        $final=Join-Path $runDir 'output.btw'
        Move-Item -LiteralPath $candidate -Destination $final
        $report.output=$final
        $report.status=if ($plan.unsupported.Count) {'PARTIAL_TEMPLATE_SIZES'} else {'API_READBACK_OK_VISUAL_NOT_RUN'}
        $report['outputSha256']=(Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash
        $report['templateContractVerified']=$false
        $report['limitations']=@('Template anchors, symbologies, native object types and geometry require Designer verification.','Readback does not validate rendered bounds or scanner readability.','No production acceptance claimed.')
        $exitCode=if ($plan.unsupported.Count) {2} else {0}
    }
} catch {
    $report['failureStage']=$report.stage
    if ($report.status -eq 'NOT_RUN') { $report.status='FAILED_OR_BLOCKED' }
    $report.error=$_.Exception.ToString()
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    try { Set-RunStage 'cleanup and package results' } catch {}
    if ($null -ne $format) { try { [void](Invoke-ComMethod $format 'Close' @(1)) } catch {} }
    foreach ($obj in @($page,$objects,$format,$opened)) { Release-Com $obj }
    if ($null -ne $app) { if($ownsBt){try { [void](Invoke-ComMethod $app 'Quit' @(1)) } catch { $report['cleanupError']=$_.Exception.Message }}; Release-Com $app }
    $reportPath=Join-Path $runDir 'report.json'
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    try {
        $summary=@()
        $summary+=('STATUS='+[string]$report.status)
        $summary+=('STAGE='+[string]$report.stage)
        if($report.Contains('core')){
            $summary+=('CORE_SAVE_REOPEN='+[string]$report.core.saveReopen)
            foreach($t in @($report.core.tests)){
                $geometryText=if($t.geometry -is [System.Collections.IDictionary]){[string]$t.geometry.status}else{[string]$t.geometry};$summary+=('TEST '+[string]$t.type+' | object='+[string]$t.objectName+' | payload='+[string]$t.payload+' | geometry='+$geometryText+' | persistence='+[string]$t.persistence)
                if($t.size -is [System.Collections.IDictionary]){
                    $line=('  SIZE='+[string]$t.size.status)
                    if($t.size.Contains('directObjectSize') -and $null -ne $t.size.directObjectSize){$line+=(' | direct='+[string]$t.size.directObjectSize.status)}
                    if($t.size.Contains('finalDirectObjectSize') -and $null -ne $t.size.finalDirectObjectSize){$line+=(' | finalDirect='+[string]$t.size.finalDirectObjectSize.status)}
                    if($t.size.Contains('xdimensionProbe') -and $null -ne $t.size.xdimensionProbe){$line+=(' | xdim='+[string]$t.size.xdimensionProbe.status)}
                    if($t.size.Contains('xdimensionExperiment') -and $null -ne $t.size.xdimensionExperiment){$line+=(' | xdimExperiment='+[string]$t.size.xdimensionExperiment.status)}
                    if($t.size.Contains('documentedHeight') -and $null -ne $t.size.documentedHeight){$line+=(' | height='+[string]$t.size.documentedHeight.status)}
                    if($t.size.Contains('xdimensionExperiment') -and $null -ne $t.size.xdimensionExperiment -and $t.size.xdimensionExperiment.Contains('inkTargetErrorMm') -and $null -ne $t.size.xdimensionExperiment.inkTargetErrorMm){$line+=(' | inkErrorMm='+[string]$t.size.xdimensionExperiment.inkTargetErrorMm)}
                    if($t.size.Contains('finalRaster') -and $null -ne $t.size.finalRaster){$line+=(' | rasterTrust='+[string]$t.size.finalRaster.physicalMmTrust)}
                    if($t.size.Contains('layoutWidthStatus')){$line+=(' | width='+[string]$t.size.layoutWidthStatus)}
                    if($t.size.Contains('finalHeight')){$line+=(' | finalHeight='+[string]$t.size.finalHeight.status)}
                    $summary+=$line
                }
                elseif($null -ne $t.size){$summary+=('  SIZE='+[string]$t.size)}
                foreach($e in @($t.errors)){if(-not [string]::IsNullOrWhiteSpace([string]$e)){$summary+=('  ERROR='+[string]$e)}}
            }
            foreach($b in @($report.core.blocking)){if(-not [string]::IsNullOrWhiteSpace([string]$b)){$summary+=('BLOCKING/WARN='+[string]$b)}}
        }
        if($report.error){$summary+=('TOP_ERROR='+[string]$report.error)}
        $summary | Set-Content -LiteralPath (Join-Path $runDir 'RUN_SUMMARY.txt') -Encoding UTF8
    } catch {}
    $returnZip=$null
    if ($CoreTest -and [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $returnZip=Join-Path $BaseDirectory 'RETURN_TO_CHATGPT.zip'
        $latestReport=Join-Path $BaseDirectory 'LATEST_REPORT.json'
        try {
            if (Test-Path -LiteralPath $returnZip) { Remove-Item -LiteralPath $returnZip -Force }
            Compress-Archive -Path (Join-Path $runDir '*') -DestinationPath $returnZip -CompressionLevel Optimal -Force
            Copy-Item -LiteralPath $returnZip -Destination (Join-Path $runDir 'result.zip') -Force
            Copy-Item -LiteralPath $reportPath -Destination $latestReport -Force
            Write-Host ''
            Write-Host '============================================================' -ForegroundColor Cyan
            Write-Host 'AUTO-SAVED: RETURN_TO_CHATGPT.zip' -ForegroundColor Green
            Write-Host ('File: '+$returnZip) -ForegroundColor Green
            Write-Host 'Upload this ONE zip file back to ChatGPT.' -ForegroundColor Yellow
            Write-Host '============================================================' -ForegroundColor Cyan
        } catch {
            Write-Host ('Could not create RETURN_TO_CHATGPT.zip: '+$_.Exception.Message) -ForegroundColor Red
        }
    }
    try { 'done' | Set-Content -LiteralPath (Join-Path $runDir 'WATCHDOG_DONE.txt') -Encoding ASCII } catch {}
    Write-Host ('Status: '+$report.status)
    Write-Host ('Report: '+$reportPath)
    if ($OpenResults -and [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        try {
            if ($null -ne $returnZip -and (Test-Path -LiteralPath $returnZip)) {
                Start-Process explorer.exe -ArgumentList ('/select,"'+$returnZip+'"')
            } else {
                Invoke-Item -LiteralPath $runDir
            }
        } catch { Write-Host 'Please open the program folder and return RETURN_TO_CHATGPT.zip.' }
    }
}
exit $exitCode
