[CmdletBinding()]
param()
# Probe dispatcher. run-request.json "probe" selects one bounded probe.
# Absent field keeps the historical behaviour (primitive candidate) unchanged.
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$request=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'run-request.json') -Raw -Encoding UTF8|ConvertFrom-Json
$probe='primitive-candidate'
if($null -ne $request.PSObject.Properties['probe']){$probe=[string]$request.probe}
$map=@{'primitive-candidate'='Run-PrimitiveCandidate.ps1';'richtext-contract'='Probe-RichTextContract.ps1'}
if(-not $map.ContainsKey($probe)){throw ('Unknown probe selector: '+$probe)}
$target=Join-Path $PSScriptRoot $map[$probe]
$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ('PS5.1 parser: '+$target+' '+($errors -join '; '))}
Write-Host ('Probe dispatch: '+$probe+' -> '+$map[$probe])
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $ps -STA -NoProfile -ExecutionPolicy Bypass -File $target
exit $LASTEXITCODE
