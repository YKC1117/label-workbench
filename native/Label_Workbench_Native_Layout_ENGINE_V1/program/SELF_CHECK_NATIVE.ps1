param(
    [string]$EvidenceDirectory='',
    [ValidateSet('Auto','Hybrid','Legacy')][string]$Profile='Auto'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$root=$PSScriptRoot

# The canonical/renderer-probe path now uses Designer-authored Text slots plus
# BTC barcodes. The old Create(5) font transaction tests are intentionally kept
# for the legacy renderer, but they must not gate the Hybrid renderer that does
# not call Create(5) for Text at all.
$effectiveProfile=$Profile
if($effectiveProfile -ceq 'Auto'){
    $effectiveProfile='Legacy'
    if(-not [string]::IsNullOrWhiteSpace($EvidenceDirectory)){
        $input=Join-Path $EvidenceDirectory 'input-layout.json'
        if(Test-Path -LiteralPath $input -PathType Leaf){
            try{
                $probe=Get-Content -LiteralPath $input -Raw -Encoding UTF8|ConvertFrom-Json
                if([string]$probe.schema -cin @('lwb-canonical-v1','renderer-probe-v1')){$effectiveProfile='Hybrid'}
            }catch{throw ('SELF_CHECK_NATIVE could not classify input-layout.json: '+$_.Exception.Message)}
        }
    }
}

$runtime=@('HybridPayload.psm1','Test-HybridPayload.ps1','HybridPool.psm1','Build-NativeLayout.ps1','NativeLayoutEngine.psm1','HybridPool.psm1','Com.psm1','Watchdog.ps1','SELF_CHECK_NATIVE.ps1','Test-NativeLayoutEngine.ps1','Test-NativePersistence.ps1','Test-NativeFontFallback.ps1')
foreach($name in $runtime){
    $path=Join-Path $root $name
    if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw ('Missing native runtime file: '+$name)}
    $tokens=$null;$errors=$null
    [void][Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
    if(@($errors).Count){throw (($errors|ForEach-Object{$name+': '+$_.Message}) -join ' | ')}
}
Write-Host ('PASS: parsed '+$runtime.Count+' native runtime PowerShell files.') -ForegroundColor Green

$sample=Join-Path $root 'native-layout.sample.json'
$multi=Join-Path $root 'native-layout.multi.sample.json'
foreach($j in @($sample,$multi)){
    if(-not(Test-Path -LiteralPath $j)){throw ('Missing native layout sample: '+$j)}
    [void](Get-Content -LiteralPath $j -Raw -Encoding UTF8|ConvertFrom-Json)
}
Write-Host 'PASS: native layout sample JSON files parse.' -ForegroundColor Green

if(-not('LabelWorkbench.ComBridge' -as [type])){Add-Type -Path (Join-Path $root 'ComBridge.cs') -ErrorAction Stop}
Write-Host 'PASS: ComBridge compiles.' -ForegroundColor Green
if(-not('LabelWorkbench.RasterEvidence' -as [type])){Add-Type -Path (Join-Path $root 'RasterEvidence.cs') -ErrorAction Stop}
Write-Host 'PASS: RasterEvidence compiles.' -ForegroundColor Green

$evidence=Join-Path (Split-Path -Parent $root) 'evidence\installed-api.json'
$api=Get-Content -LiteralPath $evidence -Raw -Encoding UTF8|ConvertFrom-Json
function Require([string]$type,[string]$name,[string]$invoke,[int[]]$params,[int]$returnType){
    $m=@($api.members|Where-Object{$_.TypeName -ceq $type -and $_.Name -ceq $name -and $_.InvokeKind -ceq $invoke})
    if($m.Count -ne 1){throw ('Missing/ambiguous API: '+$type+'.'+$name+' '+$invoke)}
    if($m[0].ReturnVariantType -ne $returnType){throw ('API return signature changed: '+$type+'.'+$name)}
    if((@($m[0].ParameterVariantTypes)-join ',') -cne (@($params)-join ',')){throw ('API parameter signature changed: '+$type+'.'+$name)}
}

# Shared runtime contract used by Hybrid and legacy paths.
Require 'IBtFormats' 'Add' 'INVOKE_FUNC' @() 26
Require 'IBtFormat' 'InsertComponent' 'INVOKE_FUNC' @(8,5,5) 11
Require 'IBtDesignObjects' 'Delete' 'INVOKE_FUNC' @(8) 11
Require 'IBtDesignObjects' 'ExportDataSourceValuesToXML' 'INVOKE_FUNC' @() 8
Require 'IBtDesignObjects' 'ImportDataSourceValuesFromXML' 'INVOKE_FUNC' @(8) 11
Require 'IBtDesignObject' 'GetXML' 'INVOKE_FUNC' @(11,11) 8
Require 'IBtDesignObject' 'SetXML' 'INVOKE_FUNC' @(8) 24
Require 'IBtDesignObject' 'FontName' 'INVOKE_PROPERTYGET' @() 8
Require 'IBtDesignObject' 'FontName' 'INVOKE_PROPERTYPUT' @(8) 24
Require 'IBtDesignObject' 'FontSize' 'INVOKE_PROPERTYGET' @() 5
Require 'IBtDesignObject' 'FontSize' 'INVOKE_PROPERTYPUT' @(5) 24
Require 'IBtFormat' 'ExportToFile' 'INVOKE_FUNC' @(8,8,29,29,29) 24
Require 'IBtDesignObject' 'ExportToFile' 'INVOKE_FUNC' @(8,8,29,29,29) 24
if($effectiveProfile -ceq 'Legacy'){
    Require 'IBtDesignObjects' 'Create' 'INVOKE_FUNC' @(29) 26
}
Write-Host ('PASS: packaged real-machine TypeLib evidence covers '+$effectiveProfile+' renderer APIs.') -ForegroundColor Green

$proven=Join-Path $root 'proven-code128.btc'
$sha='0B1E2481BCDE6E5CF1D084599F822DC3027AB19215530B7776296B40A59899F2'
if((Get-FileHash -LiteralPath $proven -Algorithm SHA256).Hash -cne $sha){throw 'proven-code128.btc hash mismatch.'}
Write-Host 'PASS: proven Code128 component hash matches real Windows evidence.' -ForegroundColor Green

Import-Module (Join-Path $root 'NativeLayoutEngine.psm1') -Force
$layout=Get-Content -LiteralPath $sample -Raw -Encoding UTF8|ConvertFrom-Json
$plan=Test-NativeLayoutInput $layout
if($plan.objects.Count -ne 3){throw 'Native layout sample contract regression.'}
$multiPlan=Test-NativeLayoutInput (Get-Content -LiteralPath $multi -Raw -Encoding UTF8|ConvertFrom-Json)
if($multiPlan.objects.Count -ne 6){throw 'Multi-object sample contract regression.'}
& (Join-Path $root 'Test-NativeLayoutEngine.ps1')

if($effectiveProfile -ceq 'Legacy'){
    $mockResultPath=''
    if($EvidenceDirectory){$mockResultPath=Join-Path $EvidenceDirectory 'native-mock-results.json'}
    $fontResultPath=''
    if($EvidenceDirectory){$fontResultPath=Join-Path $EvidenceDirectory 'native-font-results.json'}
    & (Join-Path $root 'Test-NativeFontFallback.ps1') -ResultPath $fontResultPath
    & (Join-Path $root 'Test-NativePersistence.ps1') -ResultPath $mockResultPath
    Write-Host 'SELF_CHECK_NATIVE PASS [Legacy]: parser/input/C# helpers/23 font cases/14 native multi-object mocks passed; BarTender has not been opened yet.' -ForegroundColor Green
}else{
    # Hybrid Text is sourced from a fixed-SHA Designer-authored pool. Real
    # Windows evidence proved Create(5) Text exposes a restricted automation
    # view, while Designer-authored Text supports X/Y/Rotation/FontName/
    # FontSize. Therefore the Create(5) font + persistence mocks are historical
    # regression coverage, not a Hybrid precondition. Hybrid-specific safety is
    # enforced by the fixed pool hash, peer-isolated payload transaction,
    # exact four-object candidate, Save/Reopen, and 600dpi Visual QA.
    Write-Host 'PASS: Hybrid profile intentionally excludes retired Create(5) Text font/persistence mocks.' -ForegroundColor Yellow
    Write-Host 'SELF_CHECK_NATIVE PASS [Hybrid]: parser/input/C# helpers/TypeLib/Delete/InsertComponent/payload/raster/Code128 contracts passed; BarTender has not been opened yet.' -ForegroundColor Green
}
Remove-Module NativeLayoutEngine -Force -ErrorAction SilentlyContinue

& (Join-Path $root 'Test-HybridPayload.ps1')
