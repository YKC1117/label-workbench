[CmdletBinding()]
param(
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot 'runner-evidence\fontname-binding-diagnostic.json'
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $parent | Out-Null

$result = [ordered]@{
    schema = 'lwb-fontname-binding-diagnostic-v2'
    status = 'STARTED'
    application = [ordered]@{}
    directObject = [ordered]@{}
    bridgeObject = [ordered]@{}
    directPowerShell = [ordered]@{ get = 'NOT_RUN'; set = 'NOT_RUN'; readback = 'NOT_RUN'; error = $null }
    comBridge = [ordered]@{ get = 'NOT_RUN'; set = 'NOT_RUN'; readback = 'NOT_RUN'; error = $null }
    cleanup = @()
}

$app = $null
$formats = $null
$format = $null
$objects = $null
$created = $null
$direct = $null
$bridge = $null
$ownedPid = $null
$preExisting = @(Get-Process -Name BarTend -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

function Release-Com($value) {
    if ($null -ne $value -and [Runtime.InteropServices.Marshal]::IsComObject($value)) {
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($value) } catch {}
    }
}

try {
    $bridgePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\ComBridge.cs'))
    if (-not ('LabelWorkbench.ComBridge' -as [type])) { Add-Type -Path $bridgePath -ErrorAction Stop }

    $app = New-Object -ComObject BarTender.Application
    $ownedPid = [int][LabelWorkbench.ComBridge]::Get($app,'ProcessID',[object[]]@())
    $result.application.ProcessID = $ownedPid
    foreach ($p in @('FullVersion','Edition','BuildNumber')) {
        try { $result.application[$p] = [string][LabelWorkbench.ComBridge]::Get($app,$p,[object[]]@()) }
        catch { $result.application[$p] = 'ERROR: ' + $_.Exception.Message }
    }
    if ($ownedPid -and $preExisting -contains $ownedPid) { throw 'Diagnostic attached to a pre-existing BarTender process; refusing to mutate it.' }

    $formats = [LabelWorkbench.ComBridge]::Get($app,'Formats',[object[]]@())
    if ($null -eq $formats) { throw 'Application.Formats returned null through ComBridge.' }
    $format = [LabelWorkbench.ComBridge]::Call($formats,'Add',[object[]]@())
    if ($null -eq $format) { throw 'Formats.Add returned null through ComBridge.' }
    $objects = [LabelWorkbench.ComBridge]::Get($format,'Objects',[object[]]@())
    if ($null -eq $objects) { throw 'Format.Objects returned null through ComBridge.' }

    # Object A: setup through ComBridge, but FontName itself uses normal
    # PowerShell COM property syntax.
    $created = [LabelWorkbench.ComBridge]::Call($objects,'Create',[object[]]@(5))
    if ($null -eq $created) { throw 'DesignObjects.Create(5) returned null for direct object.' }
    $directName = [string][LabelWorkbench.ComBridge]::Get($created,'Name',[object[]]@())
    Release-Com $created; $created = $null
    $direct = [LabelWorkbench.ComBridge]::Call($objects,'Find',[object[]]@($directName))
    if ($null -eq $direct) { throw 'Find() did not return direct Text object.' }
    $result.directObject.name = $directName
    $result.directObject.type = [int][LabelWorkbench.ComBridge]::Get($direct,'Type',[object[]]@())
    $result.directObject.xmlBefore = [string][LabelWorkbench.ComBridge]::Call($direct,'GetXML',[object[]]@($true,$true))
    try {
        $result.directPowerShell.get = [string]$direct.FontName
        $direct.FontName = 'Arial'
        $result.directPowerShell.set = 'SUCCESS'
        $result.directPowerShell.readback = [string]$direct.FontName
        $result.directObject.xmlAfter = [string][LabelWorkbench.ComBridge]::Call($direct,'GetXML',[object[]]@($true,$true))
    } catch {
        $result.directPowerShell.set = 'FAILED'
        $result.directPowerShell.error = $_.Exception.ToString()
    }

    # Object B: same Create -> release -> Find lifecycle, FontName only through
    # the production ComBridge path.
    $created = [LabelWorkbench.ComBridge]::Call($objects,'Create',[object[]]@(5))
    if ($null -eq $created) { throw 'DesignObjects.Create(5) returned null for bridge object.' }
    $bridgeName = [string][LabelWorkbench.ComBridge]::Get($created,'Name',[object[]]@())
    Release-Com $created; $created = $null
    $bridge = [LabelWorkbench.ComBridge]::Call($objects,'Find',[object[]]@($bridgeName))
    if ($null -eq $bridge) { throw 'Find() did not return bridge Text object.' }
    $result.bridgeObject.name = $bridgeName
    $result.bridgeObject.type = [int][LabelWorkbench.ComBridge]::Get($bridge,'Type',[object[]]@())
    $result.bridgeObject.xmlBefore = [string][LabelWorkbench.ComBridge]::Call($bridge,'GetXML',[object[]]@($true,$true))
    try {
        $result.comBridge.get = [string][LabelWorkbench.ComBridge]::Get($bridge,'FontName',[object[]]@())
        [LabelWorkbench.ComBridge]::Set($bridge,'FontName',[object[]]@('Arial'))
        $result.comBridge.set = 'SUCCESS'
        $result.comBridge.readback = [string][LabelWorkbench.ComBridge]::Get($bridge,'FontName',[object[]]@())
        $result.bridgeObject.xmlAfter = [string][LabelWorkbench.ComBridge]::Call($bridge,'GetXML',[object[]]@($true,$true))
    } catch {
        $result.comBridge.set = 'FAILED'
        $result.comBridge.error = $_.Exception.ToString()
    }

    $result.status = 'COMPLETE'
} catch {
    $result.status = 'FAILED'
    $result.error = $_.Exception.ToString()
} finally {
    foreach ($x in @($bridge,$direct,$created,$objects,$format,$formats)) { Release-Com $x }
    if ($null -ne $app) {
        try { [void][LabelWorkbench.ComBridge]::Call($app,'Quit',[object[]]@(1)) } catch { $result.cleanup += ('Quit: ' + $_.Exception.Message) }
        Release-Com $app
    }
    Start-Sleep -Milliseconds 500
    if ($ownedPid -and -not ($preExisting -contains $ownedPid)) {
        $left = Get-Process -Id $ownedPid -ErrorAction SilentlyContinue
        if ($null -ne $left) {
            try { Stop-Process -Id $ownedPid -Force -ErrorAction Stop; $result.cleanup += 'Owned diagnostic BarTender process force-stopped after Quit.' } catch { $result.cleanup += ('Stop-Process: ' + $_.Exception.Message) }
        }
    }
    $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}

if ($result.status -ne 'COMPLETE') { exit 1 }
Write-Host ('FontName binding diagnostic written: ' + $OutputPath)
exit 0
