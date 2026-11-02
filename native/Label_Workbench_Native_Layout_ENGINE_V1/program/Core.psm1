Set-StrictMode -Version 2
Import-Module (Join-Path $PSScriptRoot 'Com.psm1')
function Release-CoreCom($target) {
    if ($null -ne $target -and [Runtime.InteropServices.Marshal]::IsComObject($target)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($target) }
}
function Assert-CoreNear($actual,$expected,[string]$name) {
    $a=[double]$actual; $e=[double]$expected
    if ([double]::IsNaN($a) -or [double]::IsInfinity($a) -or [math]::Abs($a-$e) -gt 0.02) { throw "$name readback mismatch: expected $e, actual $a" }
}
function Get-InstalledBarTenderApi {
    $paths=New-Object 'System.Collections.Generic.List[string]'
    $errors=New-Object 'System.Collections.Generic.List[string]'
    $root=[Microsoft.Win32.Registry]::ClassesRoot
    $key=$root.OpenSubKey('BarTender.Application\CLSID')
    if ($null -eq $key) { throw 'BarTender.Application CLSID registry entry unavailable.' }
    try { $clsid=[string]$key.GetValue('') } finally { $key.Dispose() }
    $key=$root.OpenSubKey("CLSID\$clsid\TypeLib")
    if ($null -ne $key) {
        try { $id=[string]$key.GetValue('') } finally { $key.Dispose() }
        $lib=$root.OpenSubKey("TypeLib\$id")
        if ($null -ne $lib) {
            try {
                foreach ($v in $lib.GetSubKeyNames()) {
                    $version=$lib.OpenSubKey($v)
                    try {
                        foreach ($lcid in $version.GetSubKeyNames()) {
                            foreach ($platform in @('win64','win32')) {
                                $k=$version.OpenSubKey("$lcid\$platform")
                                if ($null -ne $k) { try { $path=[string]$k.GetValue(''); if ($path) { $paths.Add($path) } } finally { $k.Dispose() } }
                            }
                        }
                    } finally { $version.Dispose() }
                }
            } finally { $lib.Dispose() }
        }
    }
    $key=$root.OpenSubKey("CLSID\$clsid\LocalServer32")
    if ($null -ne $key) {
        try { $command=[string]$key.GetValue('') } finally { $key.Dispose() }
        if ($command -match '^\s*"([^"]+\.exe)"') { $paths.Add($Matches[1]) }
        elseif ($command -match '^\s*(.+?\.exe)(?:\s|$)') { $paths.Add($Matches[1]) }
    }
    foreach ($path in @($paths | Select-Object -Unique)) {
        try { return @{path=$path;members=@([LabelWorkbench.ComMetadata]::ReadLibrary($path));errors=@($errors.ToArray())} }
        catch { $errors.Add($path+': '+$_.Exception.Message) }
    }
    return @{path=$null;members=@();errors=@($errors.ToArray())}
}
function Invoke-CoreTest($document,$formats,$report,[string]$runDir,[string]$baseDirectory,[string]$templatePath,[string]$originalHash) {
    $collection=$null
    $report['core']=[ordered]@{api=$null;sources=@();tests=@();verified=@();blocking=@();fullLayoutAccepted=$false}
    try {
        $report.stage='read installed official type library'
        try { $report.core.api=Get-InstalledBarTenderApi }
        catch { $report.core.api=@{path=$null;members=@();errors=@($_.Exception.Message)} }
        $report.core.api | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $runDir 'installed-api.json') -Encoding UTF8
        # Names come exclusively from the installed BarTender type library; no speculative setters.
        $xdim=@($report.core.api.members | Where-Object {
            $_.TypeName -match 'DesignObject' -and $_.Name -match 'X.?Dimension' -and $_.InvokeKind -eq 'INVOKE_PROPERTYPUT' -and
            $_.ParameterVariantTypes.Length -eq 1 -and $_.ParameterVariantTypes[0] -in @(4,5)
        } | Select-Object -ExpandProperty Name -Unique)
        if ($xdim.Count -ne 1) { $report.core.blocking += 'X-dimension setter signature not uniquely resolved from installed API. No guessed setter was called.' }
        $report.stage='read named data sources'
        $sources=$null
        try {
            $sources=Read-Property $document 'NamedSubStrings'
            $recordSep='__LWB_RECORD_'+[guid]::NewGuid().ToString('N')+'__'
            $nameSep='__LWB_NAME_'+[guid]::NewGuid().ToString('N')+'__'
            $all=[string](Invoke-ComMethod $sources 'GetAll' @($nameSep,$recordSep))
            if ($all.Length) {
                foreach ($record in $all.Split(@($recordSep),[StringSplitOptions]::None)) {
                    $pair=$record.Split(@($nameSep),[StringSplitOptions]::None)
                    if ($pair.Length -ne 2) { throw 'Named data source listing could not be parsed without ambiguity.' }
                    $report.core.sources += @{name=$pair[0];value=$pair[1]}
                }
            }
        } finally { Release-CoreCom $sources }
        if ($report.core.sources.Count -eq 0) { $report.core.blocking += 'Template contains no named data sources. Documented SetNamedSubStringValue cannot edit its embedded payloads without a prepared template.' }
        $config=Get-Content -LiteralPath (Join-Path $baseDirectory 'core-test.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Property $document 'MeasurementUnits' 3
        $collection=Read-Property $document 'Objects'
        $checks=New-Object 'System.Collections.Generic.List[object]'
        $changedSources=@{}
        foreach ($request in $config.objects) {
            $obj=$null
            $test=[ordered]@{slot=$request.slot;declaredType=$request.type;payload='NOT_RUN';geometry='NOT_RUN';xDimension='NOT_RUN';errors=@()}
            $report.core.tests += $test
            try {
                $obj=Invoke-ComMethod $collection 'Find' @([string]$request.slot)
                if ($null -eq $obj -or [string](Read-Property $obj 'Name') -cne $request.slot) { throw 'Requested object not found.' }
                $expectedType=if ($request.type -eq 'text') {5} else {4}
                if ([int](Read-Property $obj 'Type') -ne $expectedType) { throw 'Native object type does not match test configuration.' }
                # Only bind when BOTH original source value and object value match uniquely.
                $value=[string](Read-Property $obj 'Value')
                $matches=@($report.core.sources | Where-Object { $_.value -ceq $value })
                if ($matches.Count -eq 1 -and -not $changedSources.ContainsKey($matches[0].name)) {
                    $source=[string]$matches[0].name
                    [void](Invoke-ComMethod $document 'SetNamedSubStringValue' @($source,[string]$request.value))
                    if ([string](Read-Property $obj 'Value') -cne $request.value) { throw 'Named source changed but object payload did not match. Output cancelled.' }
                    $changedSources[$source]=$true
                    $checks.Add(@{slot=$request.slot;property='Value';expected=[string]$request.value;source=$source})
                    $test.payload='SET_PENDING_REOPEN';$test['source']=$source
                } else { $test.payload='BLOCKED_NO_UNIQUE_NAMED_SOURCE' }
                if ($request.type -eq 'code128') {
                    # Official Height setter is supported for 1D barcodes. Symbology in this sample is user-declared.
                    $before=[double](Read-Property $obj 'Height')
                    if ($request.heightMm -is [string] -or $request.heightMm -is [bool] -or $null -eq $request.heightMm) { throw 'heightMm must be a number.' }
                    $target=[double]$request.heightMm
                    if ([double]::IsNaN($target) -or [double]::IsInfinity($target) -or $target -le 0 -or $target -gt 100) { throw 'heightMm outside test range.' }
                    Write-Property $obj 'Height' ([single]$target)
                    Assert-CoreNear (Read-Property $obj 'Height') $target ($request.slot+'.Height')
                    $checks.Add(@{slot=$request.slot;property='Height';expected=$target})
                    $test.geometry='SET_PENDING_REOPEN'
                    $test['heightBefore']=$before;$test['heightRequested']=$target
                }
                if ($request.type -ne 'text' -and $xdim.Count -eq 1) {
                    $name=[string]$xdim[0]
                    $before=[double](Read-Property $obj $name)
                    if ($before -le 0 -or [double]::IsInfinity($before) -or [double]::IsNaN($before)) { throw 'Invalid native X-dimension value.' }
                    # A relative test does not assume an undocumented measurement unit.
                    $target=$before*1.10
                    Write-Property $obj $name ([single]$target)
                    $actual=[double](Read-Property $obj $name)
                    if ([math]::Abs($actual-$before) -lt 0.00000001) { throw 'X-dimension setter had no observable effect.' }
                    $checks.Add(@{slot=$request.slot;property=$name;expected=$actual})
                    $test.xDimension='SET_PENDING_REOPEN';$test['xDimensionProperty']=$name
                    $test['xDimensionBefore']=$before;$test['xDimensionAfter']=$actual
                }
            } catch {
                # An attempted write may already have changed the copy. Fail closed, never publish partial unknown state.
                $test.errors += $_.Exception.Message
                throw
            } finally { Release-CoreCom $obj }
        }
        if ($checks.Count -eq 0) { $report.status='CORE_BLOCKED_NO_EDITS'; return }
        $report.stage='save core test and reopen'
        $candidate=Join-Path $runDir 'candidate.btw'
        [void](Invoke-ComMethod $document 'SaveAs' @($candidate,$false))
        [void](Invoke-ComMethod $document 'Close' @(1))
        Release-CoreCom $collection; $collection=$null; Release-CoreCom $document; $document=$null
        $document=Invoke-ComMethod $formats 'Open' @($candidate,$false,'')
        Write-Property $document 'MeasurementUnits' 3
        $collection=Read-Property $document 'Objects'
        foreach ($check in $checks) {
            $obj=Invoke-ComMethod $collection 'Find' @([string]$check.slot)
            try {
                $actual=Read-Property $obj $check.property
                if ($check.property -eq 'Value') {
                    if ([string]$actual -cne $check.expected -or [string](Invoke-ComMethod $document 'GetNamedSubStringValue' @($check.source)) -cne $check.expected) { throw 'Payload did not survive SaveAs/reopen.' }
                } elseif ($check.property -eq 'Height') { Assert-CoreNear $actual $check.expected ($check.slot+'.'+$check.property) }
                else {
                    $n=[double]$actual
                    if ([double]::IsNaN($n) -or [double]::IsInfinity($n) -or [math]::Abs($n-[double]$check.expected) -gt [math]::Max(0.0000001,[math]::Abs([double]$check.expected)*0.01)) { throw 'X-dimension did not survive SaveAs/reopen within 1 percent.' }
                }
                $report.core.verified += @{slot=$check.slot;property=$check.property;expected=$check.expected;actual=$actual}
            } finally { Release-CoreCom $obj }
        }
        [void](Invoke-ComMethod $document 'Close' @(1))
        Release-CoreCom $collection; $collection=$null; Release-CoreCom $document; $document=$null
        if ((Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash -cne $originalHash) { throw 'Original template changed during test.' }
        $final=Join-Path $runDir 'output.btw'
        Move-Item -LiteralPath $candidate -Destination $final
        $report.output=$final;$report['outputSha256']=(Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash
        foreach ($test in $report.core.tests) {
            foreach ($key in @('payload','geometry','xDimension')) {
                if ($test[$key] -eq 'SET_PENDING_REOPEN') { $test[$key]='SAVE_REOPEN_READBACK_OK' }
            }
        }
        $report.core.api=@{path=$report.core.api.path;errors=$report.core.api.errors;details='installed-api.json'}
        $report.status='CORE_PARTIAL_READBACK_OK'
        $report.core.blocking += 'This is a bounded capability test. Full layout, absolute barcode width, symbology and visual/scanner acceptance are not verified.'
    } finally {
        if ($null -ne $document) { try { [void](Invoke-ComMethod $document 'Close' @(1)) } catch {} }
        Release-CoreCom $collection; Release-CoreCom $document
    }
}
Export-ModuleMember -Function Invoke-CoreTest
