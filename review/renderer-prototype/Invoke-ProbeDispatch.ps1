[CmdletBinding()]
param()
# Probe dispatcher. run-request.json "probe" selects one bounded probe.
# Absent field keeps the historical behaviour (primitive candidate) unchanged.
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$request=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'run-request.json') -Raw -Encoding UTF8|ConvertFrom-Json
$probe='primitive-candidate'
if($null -ne $request.PSObject.Properties['probe']){$probe=[string]$request.probe}
$map=@{'primitive-candidate'='Run-PrimitiveCandidate.ps1';'richtext-contract'='Probe-RichTextContract.ps1';'native-paragraph'='Probe-NativeParagraph.ps1';'designer-multiline'='Probe-DesignerMultiline.ps1'}
if(-not $map.ContainsKey($probe)){throw ('Unknown probe selector: '+$probe)}
$target=Join-Path $PSScriptRoot $map[$probe]
$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ('PS5.1 parser: '+$target+' '+($errors -join '; '))}
Write-Host ('Probe dispatch: '+$probe+' -> '+$map[$probe])
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# The native-paragraph probe depends on strict object-XML Value decoding; prove it
# under the runner's Windows PowerShell 5.1 before any BarTender process starts.
if($probe -ceq 'native-paragraph' -or $probe -ceq 'designer-multiline'){
 & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Test-ParagraphXmlValue.ps1')
 if($LASTEXITCODE -ne 0){Write-Host 'Pre-probe ParagraphXmlValue regression failed; BarTender not started.';exit 1}
}
& $ps -STA -NoProfile -ExecutionPolicy Bypass -File $target
exit $LASTEXITCODE
