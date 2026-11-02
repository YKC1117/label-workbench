Set-StrictMode -Version 2
if (-not ('LabelWorkbench.ComBridge' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'ComBridge.cs') -ErrorAction Stop
}
# Invoke IDispatch through reflection. Do not rely on the PowerShell COM adapter.
# Unary comma preserves returned COM collections as ONE object, not pipeline items.
function Read-Property($target, [string]$name, [object[]]$arguments=@()) {
    if ($null -eq $target) { throw "Cannot read $name from a null object." }
    $value=[LabelWorkbench.ComBridge]::Get($target,$name,$arguments)
    return ,$value
}
function Write-Property($target, [string]$name, $value, [object[]]$indices=@()) {
    if ($null -eq $target) { throw "Cannot write $name on a null object." }
    [LabelWorkbench.ComBridge]::Set($target,$name,([object[]]@($indices + @($value))))
}
function Invoke-ComMethod($target, [string]$name, [object[]]$arguments=@()) {
    if ($null -eq $target) { throw "Cannot invoke $name on a null object." }
    if ($name -eq 'Open' -and $arguments.Count -eq 3) {
        $value=[LabelWorkbench.ComBridge]::OpenFormat($target,[string]$arguments[0],[bool]$arguments[1],[string]$arguments[2])
    } else {
        $value=[LabelWorkbench.ComBridge]::Call($target,$name,$arguments)
    }
    return ,$value
}
Export-ModuleMember -Function Read-Property,Write-Property,Invoke-ComMethod
