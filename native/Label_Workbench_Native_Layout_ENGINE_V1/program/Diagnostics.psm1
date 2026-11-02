Set-StrictMode -Version 2
function Get-DiagnosticProperty($Target, [string]$Name) {
    try {
        if ($null -eq $Target) { throw 'Object is null.' }
        # A missing property is diagnostic evidence, never an export capability verdict.
        $property = $Target.PSObject.Properties[$Name]
        if ($null -eq $property) { throw "Property $Name is not exposed by the PowerShell adapter." }
        $value = $Target.$Name
        if ($null -eq $value) { throw "Property $Name returned no value." }
        return [pscustomobject]@{available=$true;value=[string]$value;error=$null}
    } catch {
        $adapterError=$_.Exception.Message
        # COM IDispatch may expose a member not listed by the PowerShell adapter.
        if ($null -ne $Target -and [Runtime.InteropServices.Marshal]::IsComObject($Target)) {
            try {
                $value=$Target.GetType().InvokeMember($Name,[Reflection.BindingFlags]::GetProperty,$null,$Target,@())
                if ($null -eq $value) { throw "Property $Name returned no value." }
                return [pscustomobject]@{available=$true;value=[string]$value;error=$null}
            } catch { $adapterError += ' | IDispatch: ' + $_.Exception.Message }
        }
        return [pscustomobject]@{available=$false;value=$null;error=$adapterError}
    }
}
function Get-DiagnosticMembers($Target) {
    try {
        if ($null -ne $Target -and [Runtime.InteropServices.Marshal]::IsComObject($Target)) {
            $members=@([LabelWorkbench.ComMetadata]::Read($Target))
            if ($members.Count -eq 0) { throw 'Native ITypeInfo returned zero members.' }
            return [pscustomobject]@{available=$true;source='IDispatch.ITypeInfo';members=$members;error=$null}
        }
        $members=@($Target | Get-Member -ErrorAction Stop | Select-Object Name,MemberType,Definition)
        return [pscustomobject]@{available=$true;members=$members;error=$null}
    } catch { return [pscustomobject]@{available=$false;members=@();error=$_.Exception.Message} }
}
Export-ModuleMember -Function Get-DiagnosticProperty,Get-DiagnosticMembers
