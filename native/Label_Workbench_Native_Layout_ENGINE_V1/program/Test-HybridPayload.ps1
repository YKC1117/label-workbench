$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
Import-Module (Join-Path $PSScriptRoot 'HybridPayload.psm1') -Force
function Require($condition,[string]$message){if(-not $condition){throw $message}}
$export=New-Object System.Xml.XmlDocument
$export.LoadXml('<Command><DataMerge><Object Name="peer" Type="1"><SubString Position="0"><Value>PEER</Value></SubString><SubString Position="1"><Value>LINKED</Value></SubString></Object><Object Name="text3" Type="2"><SubString Position="0"><Value Encoding="base64">TwBMAEQA</Value></SubString></Object></DataMerge></Command>')
$before=$export.OuterXml
$write=New-HybridPayloadImport $export 'text3' 'OLD' 'EXP 2027-12-31'
Require (@($write.SelectNodes('//Object')).Count -eq 1) 'Sparse export contains peers.'
Require ($write.SelectSingleNode('//Object').GetAttribute('Name') -ceq 'text3') 'Target identity changed.'
Require ([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($write.SelectSingleNode('//Value').InnerText)) -ceq 'EXP 2027-12-31') 'Payload encoding changed.'
Require ($export.OuterXml -ceq $before) 'Input export was mutated.'
foreach($test in @('missing','peer')){
    $rejected=$false
    try{[void](New-HybridPayloadImport $export $test 'OLD' 'NEW')}catch{$rejected=$true}
    Require $rejected 'Ambiguous/multi-source target accepted.'
}
$rejected=$false;try{[void](New-HybridPayloadImport $export 'text3' 'WRONG' 'NEW')}catch{$rejected=$true};Require $rejected 'Original payload mismatch accepted.'
$plain=New-Object System.Xml.XmlDocument;$plain.LoadXml('<Command><DataMerge><Object Name="literal"><SubString Position="0"><Value>A&amp;B</Value></SubString></Object></DataMerge></Command>')
$plainWrite=New-HybridPayloadImport $plain 'literal' 'A&B' 'C<D'
Require ($plainWrite.SelectSingleNode('//Value').InnerText -ceq 'C<D') 'Plain XML value escaped incorrectly.'
$left='<Text Name="T" Position.X="1"><DataSources><EmbeddedDataSource ID="ID"><Value>OLD</Value></EmbeddedDataSource></DataSources></Text>'
$changes=@(Get-HybridXmlDifferences $left $left.Replace('OLD','NEW'))
Require ($changes.Count -eq 1 -and $changes[0].before -ceq 'OLD' -and $changes[0].after -ceq 'NEW') 'Payload semantic diff missed change.'
foreach($right in @($left.Replace('ID="ID"','ID="OTHER"'),$left.Replace('Position.X="1"','Position.X="2"'),$left.Replace('<Text','<BarCode-Code-128').Replace('</Text>','</BarCode-Code-128>'))){
    Require (@(Get-HybridXmlDifferences $left $right).Count -gt 0) 'Protected peer XML mutation ignored.'
}
$state=Get-HybridXmlSemantics $left
Require ($state.embeddedIds[0] -ceq 'ID' -and $state.root -ceq 'Text') 'Semantic evidence lost root/source identity.'
Write-Host 'PASS Hybrid sparse payload/import provenance, encoding, peer semantic diff and mutation rejection.'
