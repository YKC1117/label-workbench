$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$root=$PSScriptRoot

# Target-machine preflight for ONE-SHOT execution. Only runtime files can block the run.
# Developer-only regression files remain in the package but are intentionally not prerequisites.
$runtimePsNames=@(
 'Launch-Core.ps1','Run.ps1','Watchdog.ps1','SELF_CHECK.ps1',
 'Com.psm1','Diagnostics.psm1','Layout.psm1','Core.psm1','XmlCore.psm1'
)
$psFiles=@()
foreach($name in $runtimePsNames){
 $path=Join-Path $root $name
 if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw ('Missing runtime PowerShell file: '+$name)}
 $psFiles+=Get-Item -LiteralPath $path
}
$parseErrors=@()
foreach ($path in $psFiles) {
 $tokens=$null;$errors=$null
 [void][Management.Automation.Language.Parser]::ParseFile($path.FullName,[ref]$tokens,[ref]$errors)
 if ($errors -and $errors.Count -gt 0) {$parseErrors += @($errors | ForEach-Object { $path.Name+': '+$_.Message })}
}
if ($parseErrors.Count -gt 0) {throw ('Runtime PowerShell parse check failed: '+($parseErrors -join ' | '))}
Write-Host ('PASS: parsed '+$psFiles.Count+' runtime PowerShell files.') -ForegroundColor Green

$runtimeJsonNames=@('core-test.json','layout.json','layout-supported.json','save-probe.json')
foreach($name in $runtimeJsonNames){
 $path=Join-Path $root $name
 if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw ('Missing runtime JSON: '+$name)}
 try{[void](Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)}catch{throw ('JSON validation failed: '+$name+': '+$_.Exception.Message)}
}
Write-Host ('PASS: validated '+$runtimeJsonNames.Count+' runtime JSON files.') -ForegroundColor Green

$proven=Join-Path $root 'proven-code128.btc'
$provenSha='0B1E2481BCDE6E5CF1D084599F822DC3027AB19215530B7776296B40A59899F2'
if(-not(Test-Path -LiteralPath $proven -PathType Leaf)){throw 'Missing proven-code128.btc returned by prior real Windows evidence.'}
$actualProvenSha=(Get-FileHash -LiteralPath $proven -Algorithm SHA256).Hash
if($actualProvenSha -cne $provenSha){throw ('proven-code128.btc SHA256 mismatch: '+$actualProvenSha)}
Write-Host ('PASS: prior real-machine Code128 component hash verified: '+$actualProvenSha) -ForegroundColor Green

# ComBridge is the only mandatory C# helper: it is needed for reliable IDispatch calls.
# It has no compile-time System.Management.Automation dependency in this package.
$bridge=Join-Path $root 'ComBridge.cs'
if(-not(Test-Path -LiteralPath $bridge -PathType Leaf)){throw 'Missing ComBridge.cs'}
if(-not('LabelWorkbench.ComBridge' -as [type])){
 try{Add-Type -Path $bridge -ErrorAction Stop}catch{throw ('MANDATORY ComBridge compile failed: '+$_.Exception.ToString())}
}
Write-Host 'PASS: mandatory runtime helper compiles: ComBridge.cs' -ForegroundColor Green

# These two helpers improve diagnostics/sizing, but must not block payload + SaveAs + reopen.
foreach($helper in @(
 [pscustomobject]@{Type='LabelWorkbench.ComMetadata';File='ComMetadata.cs'},
 [pscustomobject]@{Type='LabelWorkbench.RasterEvidence';File='RasterEvidence.cs'}
)){
 $path=Join-Path $root $helper.File
 if(-not(Test-Path -LiteralPath $path -PathType Leaf)){Write-Host ('WARN: optional helper missing: '+$helper.File) -ForegroundColor Yellow;continue}
 if(-not($helper.Type -as [type])){
  try{Add-Type -Path $path -ErrorAction Stop;Write-Host ('PASS: optional helper compiles: '+$helper.File) -ForegroundColor Green}
  catch{Write-Host ('WARN: optional helper compile failed; core run will continue without that capability: '+$helper.File+' :: '+$_.Exception.Message) -ForegroundColor Yellow}
 }else{Write-Host ('PASS: optional helper already loaded: '+$helper.File) -ForegroundColor Green}
}

# Verify packaged, already-captured BarTender 2022 TypeLib evidence. Live TypeLib re-read is attempted later,
# but failure of the metadata helper must not block core functionality.
$evidenceApi=Join-Path (Split-Path -Parent $root) 'evidence\installed-api.json'
if(-not(Test-Path -LiteralPath $evidenceApi -PathType Leaf)){throw 'Missing evidence\installed-api.json'}
$apiEvidence=Get-Content -LiteralPath $evidenceApi -Raw -Encoding UTF8 | ConvertFrom-Json
if($null -eq $apiEvidence.members){throw 'Evidence installed-api.json is missing members.'}
$insert=@($apiEvidence.members | Where-Object {$_.TypeName -eq 'IBtFormat' -and $_.Name -eq 'InsertComponent' -and $_.InvokeKind -eq 'INVOKE_FUNC'})
if($insert.Count -ne 1){throw 'Evidence does not contain exactly one IBtFormat.InsertComponent.'}
$m=$insert[0];$types=@($m.ParameterVariantTypes)
if($m.ReturnVariantType -ne 11 -or $types.Count -ne 3 -or $types[0] -ne 8 -or $types[1] -ne 5 -or $types[2] -ne 5){throw 'Evidence InsertComponent signature mismatch.'}
Write-Host ('PASS: packaged TypeLib evidence loaded: '+$apiEvidence.members.Count+' members; InsertComponent signature matches.') -ForegroundColor Green

# Import the real runtime module. Optional C# types are not required merely to parse/import it.
try{Import-Module (Join-Path $root 'XmlCore.psm1') -Force -ErrorAction Stop;Remove-Module XmlCore -Force -ErrorAction SilentlyContinue}
catch{throw ('XmlCore runtime module import failed: '+$_.Exception.ToString())}
Write-Host 'PASS: XmlCore runtime module imports.' -ForegroundColor Green
Write-Host 'SELF_CHECK PASS: one-shot runtime preflight completed; BarTender has not been opened yet.' -ForegroundColor Green
