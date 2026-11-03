[CmdletBinding()]
param()
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$program=Join-Path $root 'native\Label_Workbench_Native_Layout_ENGINE_V1\program'
$results=Join-Path $program 'native-results'
[void][IO.Directory]::CreateDirectory($results)
$summary=[ordered]@{schema='lwb-general-suite-v1';revision='20261103-general-candidate-v1';commit=$env:GITHUB_SHA;productAcceptance='NOT_RUN';cases=@();status='STARTED'}
$psExe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# Parse every changed PowerShell file before activating any COM runtime.
foreach($file in @('NativeLayoutEngine.psm1','HybridPool.psm1','Build-NativeLayout.ps1')){
    $tokens=$null;$errors=$null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $program $file),[ref]$tokens,[ref]$errors)
    if($errors.Count){throw ('PowerShell parser failed: '+$file+' '+($errors -join '; '))}
}
foreach($name in @('A-text','B-barcode','C-rotation')){
    $caseRoot=Join-Path $results $name.Substring(0,1)
    [void][IO.Directory]::CreateDirectory($caseRoot)
    $layout=Join-Path $PSScriptRoot ('general-candidate\'+$name+'.json')
    Write-Host ('Starting consolidated candidate case '+$name)
    & $psExe -STA -NoProfile -ExecutionPolicy Bypass -File (Join-Path $program 'Build-NativeLayout.ps1') -LayoutPath $layout -ResultRoot $caseRoot -CaptureVisualEvidence -RendererMode Hybrid
    $code=$LASTEXITCODE
    $zip=Join-Path $program 'NATIVE_BUILD_RESULT.zip'
    if(Test-Path -LiteralPath $zip){Copy-Item -LiteralPath $zip -Destination (Join-Path $caseRoot 'RESULT.zip') -Force}
    $summary.cases+=,[ordered]@{name=$name;exitCode=$code;status=if($code -eq 0){'PASS'}else{'FAIL'};results=$caseRoot}
    $summary|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $results 'suite-report.json') -Encoding UTF8
}
$failed=@($summary.cases|Where-Object{$_.status -cne 'PASS'})
$summary.status=if($failed.Count){'FAIL'}else{'PASS'}
$summary|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $results 'suite-report.json') -Encoding UTF8
if($failed.Count){exit 1}
exit 0
