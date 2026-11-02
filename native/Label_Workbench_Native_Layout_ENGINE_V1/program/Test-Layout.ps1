$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Layout.psm1') -Force
function Fixture { '{"widthMm":140,"heightMm":38,"objects":[{"type":"text","slot":"TEXT_01","value":"中文 001","xMm":2.5,"yMm":2.5,"fontSizePt":5},{"type":"code128","slot":"C128_01","value":"001234","xMm":2.5,"yMm":5.5,"heightMm":4},{"type":"datamatrix","slot":"DM_01","value":"DM_PAYLOAD","xMm":116,"yMm":2}]}' | ConvertFrom-Json }
$count=0
function Assert($condition,$message) { if (-not $condition) { throw $message }; $script:count++ }
function Reject($layout) { $rejected=$false;try { $null=New-LayoutPlan $layout }catch { $rejected=$true }; Assert $rejected 'Expected invalid input to be rejected' }
$p=New-LayoutPlan (Fixture)
Assert (-not $p.blocked) 'Supported subset blocked'
Assert ($p.items[0].value -ceq '中文 001') 'Unicode corrupted'
Assert ($p.items[1].value -ceq '001234') 'Leading zeros lost'
Assert ($p.items[1].set.Height -eq 4) 'Code128 height absent'
Assert (-not $p.items[2].set.Contains('Height')) 'Illegal DM height setter'
$x=Fixture;$x.objects[0].xMm=-1;Reject $x
$x=Fixture;$x.objects[0].xMm='2.5';Reject $x
$x=Fixture;$x.objects[0].fontSizePt=0;Reject $x
$x=Fixture;$x.objects[0].value=12;Reject $x
$x=Fixture;$x.objects += $x.objects[0];Reject $x
$x=Fixture;$x.objects[0] | Add-Member NoteProperty typo 1;Reject $x
$x=Fixture;$x.objects[1].slot='TEXT_02';Reject $x
$x=Fixture;$x.objects[0] | Add-Member NoteProperty widthMm 38
$p=New-LayoutPlan $x;Assert $p.blocked 'Normal text width silently ignored'
$p=New-LayoutPlan $x -AllowTemplateSizes;Assert (-not $p.blocked -and $p.unsupported.Count -eq 1) 'Partial mode must retain unsupported evidence'
$x=Fixture;$x.objects[2] | Add-Member NoteProperty heightMm 12
$p=New-LayoutPlan $x;Assert $p.blocked 'DM height silently accepted'
$x=Fixture;$x.objects[1] | Add-Member NoteProperty xDimensionMm 0.254
$p=New-LayoutPlan $x;Assert $p.blocked 'Unverified X dimension setter used'
$x=Fixture;$x.objects[2] | Add-Member NoteProperty dataSource TEXT_01;Reject $x
$x=Fixture;$x.objects[0].yMm=39;Reject $x
# Regression: absent optional version fields must not abort diagnostics.
Import-Module (Join-Path $PSScriptRoot 'Diagnostics.psm1') -Force
$limited=[pscustomobject]@{Version='11.3';Edition='example'}
foreach ($name in @('FullVersion','BuildNumber','ProcessID')) {
    $d=Get-DiagnosticProperty $limited $name
    Assert (-not $d.available -and $null -eq $d.value -and $d.error.Length -gt 0) "Missing $name aborted or was misreported"
}
$d=Get-DiagnosticProperty $limited 'Version'
Assert ($d.available -and $d.value -eq '11.3') 'Version fallback evidence lost'
$limited | Add-Member ScriptProperty Broken { throw 'unavailable getter' }
$d=Get-DiagnosticProperty $limited 'Broken'
Assert (-not $d.available) 'Throwing getter was reported available'
$d=Get-DiagnosticMembers $limited
Assert ($d.available -and $d.members.Count -gt 0) 'Members inspection failed'
# Parse every script, including Windows-only runner, without running COM.
foreach ($path in Get-ChildItem $PSScriptRoot -Include *.ps1,*.psm1 -Recurse) {
    $tokens=$null;$errors=$null
    $null=[Management.Automation.Language.Parser]::ParseFile($path.FullName,[ref]$tokens,[ref]$errors)
    Assert ($errors.Count -eq 0) ($errors | Out-String)
}
Write-Host "PASS: $count local assertions. Windows COM and Designer: NOT RUN."
