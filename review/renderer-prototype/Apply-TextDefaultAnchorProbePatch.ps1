[CmdletBinding()]
param(
    [string]$EnginePath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($EnginePath)) {
    $EnginePath = Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\NativeLayoutEngine.psm1'
}
$EnginePath = [IO.Path]::GetFullPath($EnginePath)
if (-not (Test-Path -LiteralPath $EnginePath -PathType Leaf)) {
    throw ('NativeLayoutEngine.psm1 not found: ' + $EnginePath)
}

# Prototype-only guarded source compatibility patch.
# This exists only because the canonical adapter now intentionally omits
# referencePoint for fresh Text objects: BarTender documents Top Left as the
# default anchor, while fresh Text GetXML does not serialize ReferencePoint.
# Barcode requests still carry explicit referencePoint=TopLeft and remain on
# the strict XML readback path.
$old = "            if(`$o.referencePoint -cne 'TopLeft' -or `$o.rotationDeg -ne 0){throw 'Unsupported prototype anchor or angle.'}"
$new = @"
            `$hasReferencePoint=(`$null -ne `$o.PSObject.Properties['referencePoint'])
            `$explicitTopLeft=(`$hasReferencePoint -and [string]`$o.referencePoint -ceq 'TopLeft')
            `$textDefaultTopLeft=(`$o.type -eq 'text' -and -not `$hasReferencePoint -and `$null -ne `$o.PSObject.Properties['anchorPolicy'] -and [string]`$o.anchorPolicy -ceq 'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE')
            if((-not (`$explicitTopLeft -or `$textDefaultTopLeft)) -or `$o.rotationDeg -ne 0){throw 'Unsupported prototype anchor or angle.'}
"@.TrimEnd("`r","`n")

$text = [IO.File]::ReadAllText($EnginePath, [Text.Encoding]::UTF8)
$count = ([regex]::Matches($text, [regex]::Escape($old))).Count
if ($count -ne 1) {
    throw ('Guarded Text anchor patch expected exactly one legacy validator line; found ' + $count + '. Source was not changed.')
}

$patched = $text.Replace($old, $new)
if ($patched -eq $text -or $patched.Contains($old)) {
    throw 'Guarded Text anchor patch did not produce the expected source change.'
}
if (-not $patched.Contains('BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE')) {
    throw 'Guarded Text anchor patch marker missing after replacement.'
}

# Keep UTF-8 BOM, matching the tracked PowerShell module.
$utf8Bom = New-Object Text.UTF8Encoding($true)
[IO.File]::WriteAllText($EnginePath, $patched, $utf8Bom)
Write-Host 'Prototype Text default-anchor validator patch applied exactly once.' -ForegroundColor Green
