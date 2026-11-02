Set-StrictMode -Version 2
function Test-Number($value, [double]$min, [double]$max, [string]$name) {
    if ($null -eq $value -or $value -is [bool] -or $value -is [string]) { throw "$name must be a JSON number." }
    $n = [double]$value
    if ([double]::IsNaN($n) -or [double]::IsInfinity($n) -or $n -lt $min -or $n -gt $max) { throw "$name out of range." }
}
function New-LayoutPlan($Layout, [switch]$AllowTemplateSizes) {
    foreach ($key in @('widthMm','heightMm','objects')) {
        if ($null -eq $Layout.PSObject.Properties[$key]) { throw "Missing $key." }
    }
    foreach ($key in @('widthMm','heightMm')) { Test-Number $Layout.$key 0.01 10000 $key }
    if ($Layout.objects -isnot [array] -or $Layout.objects.Count -eq 0 -or $Layout.objects.Count -gt 500) { throw 'objects must be an array of 1..500 objects.' }
    $seen = @{}; $sources = @{}; $items = @(); $unsupported = @()
    foreach ($obj in $Layout.objects) {
        foreach ($key in @('type','slot','value','xMm','yMm')) {
            if ($null -eq $obj.PSObject.Properties[$key]) { throw "Missing object.$key." }
        }
        if ($obj.type -cnotin @('text','code128','datamatrix')) { throw "Unsupported type: $($obj.type)" }
        if ($obj.slot -isnot [string] -or $obj.slot -notmatch '^(TEXT|C128|DM)_[0-9]{2,3}$') { throw 'Invalid slot.' }
        $prefix = @{text='TEXT_';code128='C128_';datamatrix='DM_'}[$obj.type]
        if (-not $obj.slot.StartsWith($prefix)) { throw 'Slot prefix/type mismatch.' }
        if ($seen.ContainsKey($obj.slot)) { throw "Duplicate slot: $($obj.slot)" }; $seen[$obj.slot] = $true
        if ($obj.value -isnot [string]) { throw 'value must be a string (preserve leading zeros).' }
        Test-Number $obj.xMm 0 $Layout.widthMm 'xMm'; Test-Number $obj.yMm 0 $Layout.heightMm 'yMm'
        $source = $obj.slot
        if ($null -ne $obj.PSObject.Properties['dataSource']) { $source = $obj.dataSource }
        if ($source -isnot [string] -or [string]::IsNullOrWhiteSpace($source)) { throw 'Invalid dataSource.' }
        if ($sources.ContainsKey($source)) { throw "Shared data source not allowed: $source" }; $sources[$source]=$true
        $set = [ordered]@{X=[double]$obj.xMm;Y=[double]$obj.yMm;DoNotPrint=$false}
        foreach ($property in $obj.PSObject.Properties) {
            $name = $property.Name
            if ($name -notin @('type','slot','value','dataSource','xMm','yMm','widthMm','heightMm','fontSizePt','fontScalePercent','fontName','xDimensionMm')) { throw "Unknown object field: $name" }
            if ($name -in @('widthMm','heightMm','fontSizePt','fontScalePercent','xDimensionMm')) { Test-Number $property.Value 0.001 10000 $name }
        }
        if ($obj.type -eq 'text') {
            if ($null -eq $obj.PSObject.Properties['fontSizePt']) { throw 'Text requires fontSizePt.' }
            Test-Number $obj.fontSizePt 0.5 3600 'fontSizePt'; $set.FontSize=[double]$obj.fontSizePt
            if ($null -ne $obj.PSObject.Properties['fontScalePercent']) { $set.FontScale=[double]$obj.fontScalePercent }
            if ($null -ne $obj.PSObject.Properties['fontName']) {
                if ($obj.fontName -isnot [string] -or [string]::IsNullOrWhiteSpace($obj.fontName)) { throw 'Invalid fontName.' }
                $set.FontName=$obj.fontName
            }
        } elseif ($obj.type -eq 'code128' -and $null -ne $obj.PSObject.Properties['heightMm']) { $set.Height=[double]$obj.heightMm }
        foreach ($key in @('widthMm','heightMm','xDimensionMm','fontSizePt','fontScalePercent','fontName')) {
            if ($null -eq $obj.PSObject.Properties[$key]) { continue }
            $ok = ($obj.type -eq 'text' -and $key -in @('fontSizePt','fontScalePercent','fontName')) -or ($obj.type -eq 'code128' -and $key -eq 'heightMm')
            if (-not $ok) { $unsupported += "$($obj.slot).$key" }
        }
        $items += [pscustomobject]@{slot=$obj.slot;type=$obj.type;source=$source;value=$obj.value;set=$set}
    }
    [pscustomobject]@{widthMm=[double]$Layout.widthMm;heightMm=[double]$Layout.heightMm;items=$items;unsupported=$unsupported;blocked=($unsupported.Count -gt 0 -and -not $AllowTemplateSizes)}
}
Export-ModuleMember -Function New-LayoutPlan
