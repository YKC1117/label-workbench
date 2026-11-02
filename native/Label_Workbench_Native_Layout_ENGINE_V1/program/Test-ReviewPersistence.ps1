$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
Import-Module (Join-Path $PSScriptRoot 'XmlCore.psm1') -Force
if(-not('LwbReviewFixture.Obj' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'ReviewFixtures.cs')}
$m=Get-Module XmlCore
& $m {
 param($base)
 $script:FixtureApi=Get-Content -LiteralPath (Join-Path (Split-Path $base -Parent) 'evidence/installed-api.json') -Raw | ConvertFrom-Json
 function Get-RegisteredBarTenderLibraryMembers {param($runDir) return ([ordered]@{members=@($script:FixtureApi.members);path='fixture';source='MOCK'})}
 function Get-BarTenderComponentCandidates {param($kind,$runDir) return ([pscustomobject]@{path=$script:Candidate;score=300;length=1})}
 foreach($corrupt in @('none','payload','root','source','geometry','xdim','type','caption','height','no-component')){
  $dir=Join-Path ([IO.Path]::GetTempPath()) ('lwb-persist-'+[guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($dir)
  try{
   $script:Candidate=Join-Path $dir 'clean.btc';if($corrupt -eq 'no-component'){$script:Candidate=Join-Path $dir 'dirty.btc'}
   Set-Content -LiteralPath $script:Candidate -Value 'fixture'
   $source=Join-Path $dir 'source.btw';Set-Content -LiteralPath $source -Value 'fixture not BTW'
   $doc=New-Object LwbReviewFixture.Document
   if($corrupt -eq 'no-component'){$doc.FailInsert=$true}
   $t=New-Object LwbReviewFixture.Obj;$t.Name='文字 1';$t.Type=5;$t.Root='Text';$doc.Objects.Data.Add($t)
   $dm=New-Object LwbReviewFixture.Obj;$dm.Name='條碼 3';$dm.Type=4;$dm.Root='BarCode-DataMatrix';$doc.Objects.Data.Add($dm)
   $formats=New-Object LwbReviewFixture.Formats;$formats.Corrupt=$corrupt
   $report=[ordered]@{status='NOT_RUN';stage='';output=$null}
   Invoke-CoreTest $doc $formats $report $dir $base $source (Get-FileHash -LiteralPath $source).Hash
   if($report.core.tests.Count -ne 3){throw 'Must retain three independent test records.'}
   $ct=$report.core.tests[1]
   if($corrupt -eq 'none'){
    if($report.core.saveReopen -ne 'READBACK_CHECKS_COMPLETE' -or $ct.reopenEditable -ne 'SECOND_PAYLOAD_AND_ACTIVE_OBJECT_ISOLATION_OK'){throw 'Healthy mock persistence/editability failed.'}
   }elseif($corrupt -eq 'no-component'){
    if($report.core.tests[2].persistence -notlike 'SAVE_CLOSE_REOPEN*'){throw 'Missing Code128 must not suppress independent DataMatrix persistence test.'}
   }elseif($ct.persistence -ne 'FAILED' -or $report.core.saveReopen -ne 'ONE_OR_MORE_CHECKS_FAILED'){throw ('Corrupt reopen accepted: '+$corrupt)}
   if($report.core.fullLayoutAccepted -or $report.core.symbolBounds -ne 'NOT_VERIFIED' -or -not(Test-Path -LiteralPath $report.output)){throw 'Diagnostic must never claim complete product or symbol bounds.'}
  }finally{Remove-Item -LiteralPath $dir -Recurse -Force}
 }
 'PASS: full mock save/close/new-instance reopen; payload/root/source/geometry/XDimension/type corruption rejected; missing Code128 still tests DataMatrix. BarTender NOT RUN.'
} $PSScriptRoot
