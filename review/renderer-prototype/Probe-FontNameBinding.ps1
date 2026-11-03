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
    schema = 'lwb-fontname-binding-diagnostic-v1'
    status = 'STARTED'
    application = [ordered]@{}
    object = [ordered]@{}
    directPowerShell = [ordered]@{ get = 'NOT_RUN'; set = 'NOT_RUN'; readback = 'NOT_RUN'; error = $null }
    comBridge = [ordered]@{ get = 'NOT_RUN'; set = 'NOT_RUN'; readback = 'NOT_RUN'; error = $null }
    xmlBefore = $null
    xmlAfterDirect = $null
    cleanup = @()
}

$app = $null
$format = $null
$objects = $null
$created = $null
$found = $null
$ownedPid = $null
$preExisting = @(Get-Process -Name BarTend -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

try {
    $bridgePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\ComBridge.cs'))
    if (-not ('LabelWorkbench.ComBridge' -as [type])) { Add-Type -Path $bridgePath -ErrorAction Stop }

    $app = New-Object -ComObject BarTender.Application
    try { $ownedPid = [int]$app.ProcessID } catch { $ownedPid = $null }
    $result.application.ProcessID = $ownedPid
    foreach ($p in @('FullVersion','Edition','BuildNumber')) {
        try { $result.application[$p] = [string]$app.$p } catch { $result.application[$p] = 'ERROR: ' + $_.Exception.Message }
    }
    if ($ownedPid -and $preExisting -contains $ownedPid) { throw 'Diagnostic attached to a pre-existing BarTender process; refusing to mutate it.' }

    $formats = $app.Formats
    $format = $formats.Add()
    $objects = $format.Objects
    $created = $objects.Create(5)
    if ($null -eq $created) { throw 'DesignObjects.Create(5) returned null.' }
    $name = [string]$created.Name
    $result.object.createdName = $name
    try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($created) } catch {}
    $created = $null

    $objects = $format.Objects
    $found = $objects.Find($name)
    if ($null -eq $found) { throw 'Find() did not return the created Text object.' }
    $result.object.type = [int]$found.Type
    $result.xmlBefore = [string]$found.GetXML($true,$true)

    try {
        $v = [string]$found.FontName
        $result.directPowerShell.get = $v
        $found.FontName = 'Arial'
        $result.directPowerShell.set = 'SUCCESS'
        $result.directPowerShell.readback = [string]$found.FontName
        $result.xmlAfterDirect = [string]$found.GetXML($true,$true)
    } catch {
        $result.directPowerShell.error = $_.Exception.ToString()
        $result.directPowerShell.set = 'FAILED'
    }

    # Use a freshly re-acquired object for the bridge path so both routes test
    # the official DesignObjects.Find() view rather than the Create() return.
    try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($found) } catch {}
    $found = $objects.Find($name)
    try {
        $v = [string][LabelWorkbench.ComBridge]::Get($found,'FontName',[object[]]@())
        $result.comBridge.get = $v
        [LabelWorkbench.ComBridge]::Set($found,'FontName',[object[]]@('Arial'))
        $result.comBridge.set = 'SUCCESS'
        $result.comBridge.readback = [string][LabelWorkbench.ComBridge]::Get($found,'FontName',[object[]]@())
    } catch {
        $result.comBridge.error = $_.Exception.ToString()
        $result.comBridge.set = 'FAILED'
    }

    $result.status = 'COMPLETE'
} catch {
    $result.status = 'FAILED'
    $result.error = $_.Exception.ToString()
} finally {
    foreach ($x in @($found,$created,$objects,$format)) {
        if ($null -ne $x -and [Runtime.InteropServices.Marshal]::IsComObject($x)) {
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($x) } catch { $result.cleanup += $_.Exception.Message }
        }
    }
    if ($null -ne $app) {
        try { $app.Quit(1) } catch { $result.cleanup += ('Quit: ' + $_.Exception.Message) }
        try { if ([Runtime.InteropServices.Marshal]::IsComObject($app)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app) } } catch { $result.cleanup += $_.Exception.Message }
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
