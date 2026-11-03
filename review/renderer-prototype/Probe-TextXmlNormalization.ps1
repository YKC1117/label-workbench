[CmdletBinding()]
param(
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot 'runner-evidence\text-xml-normalization-diagnostic.json'
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$outDir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Release-Com($value) {
    if ($null -ne $value -and [Runtime.InteropServices.Marshal]::IsComObject($value)) {
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($value) } catch {}
    }
}

function Add-XmlSnapshot($node,[string]$path,[hashtable]$map) {
    if ($node -isnot [System.Xml.XmlElement]) { return }
    foreach ($a in @($node.Attributes | Sort-Object Name)) {
        $map[$path + '/@' + $a.Name] = [string]$a.Value
    }
    $elementChildren = @($node.ChildNodes | Where-Object { $_ -is [System.Xml.XmlElement] })
    if ($elementChildren.Count -eq 0) {
        $map[$path + '/#text'] = [string]$node.InnerText
    }
    $seen = @{}
    foreach ($child in $elementChildren) {
        $name = [string]$child.LocalName
        if (-not $seen.ContainsKey($name)) { $seen[$name] = 0 }
        $seen[$name] = [int]$seen[$name] + 1
        Add-XmlSnapshot $child ($path + '/' + $name + '[' + $seen[$name] + ']') $map
    }
}

function Get-XmlSnapshot([string]$text) {
    $doc = New-Object System.Xml.XmlDocument
    $doc.PreserveWhitespace = $true
    $doc.LoadXml($text)
    $map = @{}
    Add-XmlSnapshot $doc.DocumentElement ('/' + $doc.DocumentElement.LocalName + '[1]') $map
    return $map
}

function Compare-XmlText([string]$before,[string]$after) {
    $a = Get-XmlSnapshot $before
    $b = Get-XmlSnapshot $after
    $keys = @($a.Keys + $b.Keys | Sort-Object -Unique)
    $diff = @()
    foreach ($key in $keys) {
        $hasA = $a.ContainsKey($key)
        $hasB = $b.ContainsKey($key)
        $va = if ($hasA) { [string]$a[$key] } else { $null }
        $vb = if ($hasB) { [string]$b[$key] } else { $null }
        if ((-not $hasA) -or (-not $hasB) -or $va -cne $vb) {
            $diff += [pscustomobject]@{ path=$key; before=$va; after=$vb }
        }
    }
    return @($diff)
}

function Set-XmlFontName([string]$xml,[string]$fontName) {
    $doc = New-Object System.Xml.XmlDocument
    $doc.PreserveWhitespace = $true
    $doc.LoadXml($xml)
    $font = $doc.SelectSingleNode('/*/*[local-name()="Font"]')
    if ($null -eq $font -or -not $font.HasAttribute('FontName')) { throw 'Text XML has no direct Font/@FontName.' }
    $font.SetAttribute('FontName',$fontName)
    return [string]$doc.OuterXml
}

function Get-XmlFontName([string]$xml) {
    $doc = New-Object System.Xml.XmlDocument
    $doc.LoadXml($xml)
    $font = $doc.SelectSingleNode('/*/*[local-name()="Font"]')
    if ($null -eq $font) { return $null }
    return [string]$font.GetAttribute('FontName')
}

function New-FreshText($objects) {
    $created = $null
    try {
        $created = [LabelWorkbench.ComBridge]::Call($objects,'Create',[object[]]@(5))
        if ($null -eq $created) { throw 'DesignObjects.Create(5) returned null.' }
        $name = [string][LabelWorkbench.ComBridge]::Get($created,'Name',[object[]]@())
    } finally { Release-Com $created }
    $found = [LabelWorkbench.ComBridge]::Call($objects,'Find',[object[]]@($name))
    if ($null -eq $found) { throw ('Find failed for fresh Text: ' + $name) }
    return ,$found
}

$result = [ordered]@{
    schema = 'lwb-text-xml-normalization-diagnostic-v1'
    status = 'STARTED'
    runtime = [ordered]@{}
    targetFont = 'Arial'
    scenarios = @()
    persistence = $null
    cleanup = @()
}

$app=$null;$formats=$null;$format=$null;$objects=$null;$persistName=$null;$persistBeforeSave=$null;$ownedPid=$null
$preExisting = @(Get-Process -Name BarTend -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$candidate = Join-Path $outDir 'text-xml-normalization-disposable.btw'
try {
    $bridgePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\ComBridge.cs'))
    if (-not ('LabelWorkbench.ComBridge' -as [type])) { Add-Type -Path $bridgePath -ErrorAction Stop }
    $app = New-Object -ComObject BarTender.Application
    $ownedPid = [int][LabelWorkbench.ComBridge]::Get($app,'ProcessID',[object[]]@())
    if ($preExisting -contains $ownedPid) { throw 'Diagnostic attached to a pre-existing BarTender process.' }
    foreach ($p in @('FullVersion','Edition','BuildNumber')) {
        $result.runtime[$p] = [string][LabelWorkbench.ComBridge]::Get($app,$p,[object[]]@())
    }
    $result.runtime.ProcessID = $ownedPid
    $formats = [LabelWorkbench.ComBridge]::Get($app,'Formats',[object[]]@())
    $format = [LabelWorkbench.ComBridge]::Call($formats,'Add',[object[]]@())
    $objects = [LabelWorkbench.ComBridge]::Get($format,'Objects',[object[]]@())

    foreach ($size in @($null,9.0,18.0)) {
        $obj = $null
        $row = [ordered]@{ label=if($null -eq $size){'default-12pt'}else{([string]$size+'pt')}; requestedPointSize=$size; status='STARTED'; error=$null }
        try {
            $obj = New-FreshText $objects
            $row.name = [string][LabelWorkbench.ComBridge]::Get($obj,'Name',[object[]]@())
            $row.type = [int][LabelWorkbench.ComBridge]::Get($obj,'Type',[object[]]@())
            if ($null -ne $size) {
                [LabelWorkbench.ComBridge]::Set($obj,'FontSize',[object[]]@([double]$size))
                $row.fontSizeReadback = [double][LabelWorkbench.ComBridge]::Get($obj,'FontSize',[object[]]@())
            }
            $baseline = [string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true))
            $originalFont = Get-XmlFontName $baseline
            $row.originalFont = $originalFont
            $row.baselineXml = $baseline

            $request = Set-XmlFontName $baseline 'Arial'
            $row.requestXml = $request
            [void][LabelWorkbench.ComBridge]::Call($obj,'SetXML',[object[]]@($request))
            $after = [string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true))
            $row.afterXml = $after
            $row.afterFont = Get-XmlFontName $after
            $row.forwardDiff = @(Compare-XmlText $baseline $after)

            # Semantic revert: construct the revert from BarTender's CURRENT
            # readback, changing only FontName back to the original value.
            $revertRequest = Set-XmlFontName $after $originalFont
            $row.semanticRevertRequestXml = $revertRequest
            [void][LabelWorkbench.ComBridge]::Call($obj,'SetXML',[object[]]@($revertRequest))
            $reverted = [string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true))
            $row.semanticRevertXml = $reverted
            $row.revertedFont = Get-XmlFontName $reverted
            $row.revertDiffFromBaseline = @(Compare-XmlText $baseline $reverted)

            # Put the 9pt object back to Arial and keep it for Save/reopen
            # persistence evidence.
            if ($size -eq 9.0) {
                $current = [string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true))
                $toArial = Set-XmlFontName $current 'Arial'
                [void][LabelWorkbench.ComBridge]::Call($obj,'SetXML',[object[]]@($toArial))
                $persistBeforeSave = [string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true))
                $persistName = $row.name
            }
            $row.status = 'COMPLETE'
        } catch {
            $row.status = 'FAILED'
            $row.error = $_.Exception.ToString()
        } finally {
            Release-Com $obj
            $result.scenarios += [pscustomobject]$row
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($persistName)) {
        if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force }
        [void][LabelWorkbench.ComBridge]::Call($format,'SaveAs',[object[]]@($candidate,$false))
        Release-Com $objects; $objects=$null
        [void][LabelWorkbench.ComBridge]::Call($format,'Close',[object[]]@(1))
        Release-Com $format; $format=$null
        $format = [LabelWorkbench.ComBridge]::OpenFormat($formats,$candidate,$false,'')
        $objects = [LabelWorkbench.ComBridge]::Get($format,'Objects',[object[]]@())
        $obj = [LabelWorkbench.ComBridge]::Call($objects,'Find',[object[]]@($persistName))
        try {
            if ($null -eq $obj) { throw 'Persistence object missing after reopen.' }
            $reopenXml = [string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true))
            $result.persistence = [ordered]@{
                name=$persistName
                beforeSaveXml=$persistBeforeSave
                reopenXml=$reopenXml
                reopenFont=(Get-XmlFontName $reopenXml)
                diff=@(Compare-XmlText $persistBeforeSave $reopenXml)
            }
        } finally { Release-Com $obj }
    }
    $result.status = 'COMPLETE'
} catch {
    $result.status = 'FAILED'
    $result.error = $_.Exception.ToString()
} finally {
    Release-Com $objects
    if ($null -ne $format) { try { [void][LabelWorkbench.ComBridge]::Call($format,'Close',[object[]]@(1)) } catch { $result.cleanup += ('Close: '+$_.Exception.Message) }; Release-Com $format }
    Release-Com $formats
    if ($null -ne $app) {
        try { [void][LabelWorkbench.ComBridge]::Call($app,'Quit',[object[]]@(1)) } catch { $result.cleanup += ('Quit: '+$_.Exception.Message) }
        Release-Com $app
    }
    Start-Sleep -Milliseconds 500
    if ($ownedPid -and -not ($preExisting -contains $ownedPid)) {
        $left = Get-Process -Id $ownedPid -ErrorAction SilentlyContinue
        if ($null -ne $left) {
            try { Stop-Process -Id $ownedPid -Force -ErrorAction Stop; $result.cleanup += 'Owned diagnostic BarTender process force-stopped after Quit.' } catch { $result.cleanup += ('Stop-Process: '+$_.Exception.Message) }
        }
    }
    if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue }
    $result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}

Write-Host ('Text XML normalization diagnostic written: ' + $OutputPath)
if ($result.status -ne 'COMPLETE') { exit 1 }
exit 0
