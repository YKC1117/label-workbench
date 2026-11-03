param(
    [Parameter(Mandatory=$true)][string]$HybridPoolPath
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2

$path=[IO.Path]::GetFullPath($HybridPoolPath)
if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw ('HybridPool.psm1 missing: '+$path)}
$text=[IO.File]::ReadAllText($path,[Text.Encoding]::UTF8)
$old=@'
                $peer=Find-NativeObject $objects $peerName
                try{
                    $xmlText=[string](Invoke-ComMethod $peer 'GetXML' @($true,$true))
                    $value=$null;$valueReadable=$false
'@
$new=@'
                $peer=Find-NativeObject $objects $peerName
                try{
                    # Only already-enabled objects are retained peers. All donor
                    # objects are parked DoNotPrint=true before assignment and
                    # unused donor objects are deleted before barcode insertion.
                    # Source-ID collision checks still inspect every donor object.
                    if([bool](Read-Property $peer 'DoNotPrint')){continue}
                    $xmlText=[string](Invoke-ComMethod $peer 'GetXML' @($true,$true))
                    $value=$null;$valueReadable=$false
'@
$matches=([regex]::Matches($text,[regex]::Escape($old))).Count
if($matches -ne 1){throw ('Guarded peer-scope patch expected exactly one source fingerprint; found '+$matches)}
$patched=$text.Replace($old,$new)
if($patched -eq $text){throw 'Guarded peer-scope patch made no change.'}
[IO.File]::WriteAllText($path,$patched,(New-Object Text.UTF8Encoding($true)))
Write-Host 'PASS: guarded runtime proof limits exact-XML peer snapshots to already-enabled retained objects; source-ID scan remains global.' -ForegroundColor Yellow
