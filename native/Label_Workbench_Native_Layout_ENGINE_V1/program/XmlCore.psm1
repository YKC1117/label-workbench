Set-StrictMode -Version 2
Import-Module (Join-Path $PSScriptRoot 'Com.psm1')
$script:InvariantCulture=[Globalization.CultureInfo]::InvariantCulture
function Release-XmlCom($target) {
    if ($null -ne $target -and [Runtime.InteropServices.Marshal]::IsComObject($target)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($target) }
}

function Write-CoreHeartbeat([string]$runDir,[string]$text) {
    try {
        $stamp=(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        ($stamp+' | '+$text) | Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
        Write-Host ('['+$stamp+'] '+$text) -ForegroundColor Cyan
    } catch {}
}
function Set-CoreStage($report,[string]$runDir,[string]$text) {
    $report.stage=$text
    Write-CoreHeartbeat $runDir $text
}
function Read-SafeObjectXml([string]$value) {
    $settings=New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver=$null
    $reader=[System.Xml.XmlReader]::Create((New-Object System.IO.StringReader($value)),$settings)
    try { $doc=New-Object System.Xml.XmlDocument; $doc.XmlResolver=$null; $doc.PreserveWhitespace=$true; $doc.Load($reader); return ,$doc } finally { $reader.Dispose() }
}
function Parse-InvariantDouble([string]$value,[string]$name) {
    $number=0.0
    if (-not [double]::TryParse($value,[Globalization.NumberStyles]::Float,$script:InvariantCulture,[ref]$number)) { throw ("Invalid numeric XML value for ${name}: $value") }
    return $number
}
function Format-Invariant3([double]$value) { return $value.ToString('0.000',$script:InvariantCulture) }

function Get-DataSourceState($xml) {
    $container=$xml.SelectSingleNode('/*/*[local-name()="DataSources"]')
    if ($null -eq $container) { throw 'Object XML has no direct DataSources element.' }
    $sources=@($container.ChildNodes | Where-Object { $_ -is [System.Xml.XmlElement] })
    $kinds=@($sources | ForEach-Object { $_.LocalName })
    return [ordered]@{count=$sources.Count;kinds=$kinds;objectValueCount=@($sources | Where-Object {$_.LocalName -eq 'ObjectValueDataSource'}).Count;embeddedCount=@($sources | Where-Object {$_.LocalName -eq 'EmbeddedDataSource'}).Count}
}
function Get-ExportedValue($node) {
    if ($node -is [System.Xml.XmlElement] -and $node.HasAttribute('Encoding')) {
        if ($node.GetAttribute('Encoding') -ine 'base64') { throw 'Unsupported exported value encoding.' }
        $bytes=[Convert]::FromBase64String($node.InnerText)
        if ($bytes.Length % 2 -ne 0) { throw 'Invalid UTF-16LE byte count.' }
        $encoding=New-Object System.Text.UnicodeEncoding($false,$false,$true)
        return $encoding.GetString($bytes)
    }
    return $node.InnerText
}
function Set-ExportedValue($node,[string]$value) {
    if ($node -is [System.Xml.XmlElement] -and $node.HasAttribute('Encoding')) {
        if ($node.GetAttribute('Encoding') -ine 'base64') { throw 'Unsupported exported value encoding.' }
        $encoding=New-Object System.Text.UnicodeEncoding($false,$false,$true)
        $node.InnerText=[Convert]::ToBase64String($encoding.GetBytes($value))
    } else { $node.InnerText=$value }
}
function Set-ExportedObjectPayload($export,$objectXml,[string]$slot,[string]$payload) {
    $dataSources=@($objectXml.SelectNodes('/*/*[local-name()="DataSources"]/*'))
    if ($dataSources.Count -eq 0) { throw 'No original data source identifiers.' }
    $targets=@()
    foreach ($source in $dataSources) {
        $id=$source.GetAttribute('ID')
        if (-not $id) { throw 'Missing original data source ID.' }
        $nodes=@($export.SelectNodes('//*') | Where-Object {
            $node=$_
            @($node.Attributes | Where-Object { $_.Value -ieq $id }).Count -gt 0
        })
        if ($nodes.Count -ne 1) { $targets=@(); break }
        $node=$nodes[0]
        if ($node.HasAttribute('Value')) { $targets += $node.GetAttributeNode('Value') }
        else {
            $values=@($node.SelectNodes('./*[local-name()="Value"]'))
            if ($values.Count -ne 1) { $targets=@(); break }
            $targets += $values[0]
        }
    }
    if ($targets.Count -ne $dataSources.Count) {
        $objects=@($export.SelectNodes('//*') | Where-Object { $_.HasAttribute('Name') -and $_.GetAttribute('Name') -ceq $slot })
        if ($objects.Count -ne 1) { throw ('Cannot unambiguously map exported source XML for '+$slot+'. Export snapshot retained.') }
        $targets=@($objects[0].SelectNodes('.//*[local-name()="Value"] | .//@Value'))
        if ($targets.Count -ne $dataSources.Count) { throw ('Exported value count does not match original sources for '+$slot) }
        for ($i=0;$i -lt $targets.Count;$i++) {
            $original=$dataSources[$i].SelectSingleNode('./*[local-name()="Value"]')
            if ($null -eq $original -or (Get-ExportedValue $targets[$i]) -cne $original.InnerText) { throw 'Exported source ordering/value mismatch.' }
        }
    }
    for ($i=0;$i -lt $targets.Count;$i++) {
        $value=if ($i -eq 0) {$payload} else {''}
        Set-ExportedValue $targets[$i] $value
    }
}

function Get-RegisteredBarTenderLibraryMembers([string]$runDir) {
    $paths=New-Object 'System.Collections.Generic.List[string]'
    $root=[Microsoft.Win32.Registry]::ClassesRoot
    $clsidKey=$root.OpenSubKey('BarTender.Application\CLSID')
    if ($null -eq $clsidKey) { throw 'BarTender.Application CLSID registry entry unavailable.' }
    try { $clsid=[string]$clsidKey.GetValue('') } finally { $clsidKey.Dispose() }
    $typeLibKey=$root.OpenSubKey("CLSID\$clsid\TypeLib")
    if ($null -ne $typeLibKey) {
        try { $typeLibId=[string]$typeLibKey.GetValue('') } finally { $typeLibKey.Dispose() }
        if (-not [string]::IsNullOrWhiteSpace($typeLibId)) {
            $lib=$root.OpenSubKey("TypeLib\$typeLibId")
            if ($null -ne $lib) {
                try {
                    foreach ($versionName in $lib.GetSubKeyNames()) {
                        $version=$lib.OpenSubKey($versionName)
                        if ($null -eq $version) { continue }
                        try {
                            foreach ($lcid in $version.GetSubKeyNames()) {
                                foreach ($platform in @('win64','win32')) {
                                    $k=$version.OpenSubKey("$lcid\$platform")
                                    if ($null -ne $k) {
                                        try {
                                            $candidate=[string]$k.GetValue('')
                                            if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $paths.Add($candidate) }
                                        } finally { $k.Dispose() }
                                    }
                                }
                            }
                        } finally { $version.Dispose() }
                    }
                } finally { $lib.Dispose() }
            }
        }
    }
    $serverKey=$root.OpenSubKey("CLSID\$clsid\LocalServer32")
    if ($null -ne $serverKey) {
        try { $command=[string]$serverKey.GetValue('') } finally { $serverKey.Dispose() }
        $exe=$null
        if ($command -match '^\s*"([^"]+\.exe)"') { $exe=$Matches[1] }
        elseif ($command -match '^\s*(.+?\.exe)(?:\s|$)') { $exe=$Matches[1] }
        if (-not [string]::IsNullOrWhiteSpace($exe) -and (Test-Path -LiteralPath $exe -PathType Leaf)) { $paths.Add($exe) }
    }
    $errors=@()
    foreach ($path in @($paths | Select-Object -Unique)) {
        try {
            $members=@([LabelWorkbench.ComMetadata]::ReadLibrary($path))
            if ($members.Count -gt 0) {
                $result=[ordered]@{path=$path;members=$members;errors=$errors}
                $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $runDir 'installed-api-component-route.json') -Encoding UTF8
                return $result
            }
        } catch { $errors += ($path+': '+$_.Exception.Message) }
    }
    throw ('Could not read registered BarTender type library. '+($errors -join ' | '))
}

function Get-PackagedApiEvidence([string]$baseDirectory) {
    $path=Join-Path (Split-Path -Parent $baseDirectory) 'evidence\installed-api.json'
    if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Packaged evidence\installed-api.json is missing.'}
    $api=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if($null -eq $api.members -or @($api.members).Count -eq 0){throw 'Packaged installed-api.json has no members.'}
    return [ordered]@{path=$path;members=@($api.members);errors=@();source='PACKAGED_REAL_MACHINE_EVIDENCE'}
}

function Assert-InsertComponentApi($api) {
    $matches=@($api.members | Where-Object {
        $_.TypeName -eq 'IBtFormat' -and $_.Name -eq 'InsertComponent' -and $_.InvokeKind -eq 'INVOKE_FUNC'
    })
    if ($matches.Count -ne 1) { throw 'Installed BarTender API does not expose exactly one IBtFormat.InsertComponent method.' }
    $m=$matches[0]
    $types=@($m.ParameterVariantTypes)
    $names=@($m.ParameterNames)
    if ($m.ReturnVariantType -ne 11 -or $types.Count -ne 3 -or $types[0] -ne 8 -or $types[1] -ne 5 -or $types[2] -ne 5) {
        throw 'IBtFormat.InsertComponent signature differs from the proven BarTender 2022 signature (BSTR, R8, R8 -> BOOL).'
    }
    if ($names.Count -eq 3 -and (($names[0] -ne 'componentPath') -or ($names[1] -ne 'X') -or ($names[2] -ne 'Y'))) {
        throw 'IBtFormat.InsertComponent parameter names differ from the proven signature.'
    }
    return [ordered]@{typeName=$m.TypeName;name=$m.Name;dispId=$m.DispId;returnVariantType=$m.ReturnVariantType;parameterNames=$names;parameterVariantTypes=$types;documentation=$m.Documentation}
}
function Get-BarTenderInstallRootFromRegistry {
    $root=[Microsoft.Win32.Registry]::ClassesRoot
    $clsidKey=$root.OpenSubKey('BarTender.Application\CLSID')
    if ($null -eq $clsidKey) { return $null }
    try { $clsid=[string]$clsidKey.GetValue('') } finally { $clsidKey.Dispose() }
    $serverKey=$root.OpenSubKey("CLSID\$clsid\LocalServer32")
    if ($null -eq $serverKey) { return $null }
    try { $command=[string]$serverKey.GetValue('') } finally { $serverKey.Dispose() }
    $exe=$null
    if ($command -match '^\s*"([^"]+\.exe)"') { $exe=$Matches[1] }
    elseif ($command -match '^\s*(.+?\.exe)(?:\s|$)') { $exe=$Matches[1] }
    if ([string]::IsNullOrWhiteSpace($exe)) { return $null }
    return [IO.Path]::GetDirectoryName($exe)
}
function Get-BarTenderComponentCandidates([string]$kind,[string]$runDir) {
    $roots=New-Object 'System.Collections.Generic.List[string]'
    $installRoot=Get-BarTenderInstallRootFromRegistry
    if (-not [string]::IsNullOrWhiteSpace($installRoot)) {
        $roots.Add($installRoot)
    }

    $documents=[Environment]::GetFolderPath('MyDocuments')
    if (-not [string]::IsNullOrWhiteSpace($documents)) {
        foreach ($relative in @('BarTender')) {
            $candidate=Join-Path $documents $relative
            if (Test-Path -LiteralPath $candidate -PathType Container) { $roots.Add($candidate) }
        }
    }
    $publicDocuments=[Environment]::GetFolderPath('CommonDocuments')
    if (-not [string]::IsNullOrWhiteSpace($publicDocuments)) {
        $candidate=Join-Path $publicDocuments 'BarTender'
        if (Test-Path -LiteralPath $candidate -PathType Container) { $roots.Add($candidate) }
    }
    $files=@()
    foreach ($rootPath in @($roots | Select-Object -Unique)) {
        try {
            foreach ($file in @(Get-ChildItem -LiteralPath $rootPath -Recurse -File -Filter '*.btc' -ErrorAction SilentlyContinue)) {
                $files += [pscustomobject][ordered]@{path=$file.FullName;score=(Get-ComponentCandidateScore $file.FullName $kind);length=$file.Length}
            }
        } catch {}
    }
    $files=@($files | Sort-Object -Property @{Expression='score';Descending=$true},@{Expression='path';Descending=$false} -Unique)
    $files | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runDir ($kind+'-component-files.json')) -Encoding UTF8
    return $files
}

function Save-CoreJson($value,[string]$path) {
    ConvertTo-Json -InputObject $value -Depth 18 | Set-Content -LiteralPath $path -Encoding UTF8
}
function Get-ComponentCandidateScore([string]$path,[string]$kind) {
    # Rank the basename, not a parent directory such as 'Barcodes'. Never treat circular as linear.
    $text=[IO.Path]::GetFileNameWithoutExtension($path).ToLowerInvariant()
    if ($text -match 'circular|circ[ _-]|gs1|ucc|ean|sscc|hibc|composite|shipping|mil-std') { return -100 }
    if ($kind -eq 'code128') {
        if ($text -match '^code[ _-]*128$') { return 300 }
        if ($text -match 'code[ _-]*128') { return 200 }
        if ($text -match '128') { return 100 }
    }
    if ($kind -eq 'datamatrix' -and $text -match 'data[ _-]*matrix') { return 200 }
    return 0
}
function Get-ObjectNames($objects) {
    $count=[int](Read-Property $objects 'Count')
    $names=@()
    for($i=1;$i -le $count;$i++) {
        $obj=Invoke-ComMethod $objects 'Item' @($i)
        try { $names += [string](Read-Property $obj 'Name') } finally { Release-XmlCom $obj }
    }
    Assert-NameList $names
    if ([int](Read-Property $objects 'Count') -ne $count) { throw 'Object collection changed during snapshot.' }
    return $names
}
function Assert-NameList($names) {
    $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($name in @($names)) {
        if ($name -isnot [string] -or [string]::IsNullOrWhiteSpace($name)) { throw 'Non-flat or empty object name.' }
        if (-not $seen.Add($name)) { throw ('Ambiguous/duplicate object name: '+$name) }
    }
}
function Get-NameDelta($beforeNames,$afterNames) {
    Assert-NameList $beforeNames; Assert-NameList $afterNames
    $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach($name in @($beforeNames)) { [void]$seen.Add($name) }
    foreach($name in @($afterNames)) { if (-not $seen.Contains($name)) { $name } }
}
function Assert-NameSetEqual($before,$after) {
    if (@($before).Count -ne @($after).Count -or @(Get-NameDelta $before $after).Count -ne 0 -or @(Get-NameDelta $after $before).Count -ne 0) { throw 'Object identities/count did not restore.' }
}
function Find-ExactObject($objects,[string]$name) {
    $obj=Invoke-ComMethod $objects 'Find' @($name)
    if ($null -eq $obj) { throw ('Object missing: '+$name) }
    if ([string](Read-Property $obj 'Name') -cne $name) { Release-XmlCom $obj;throw ('Find identity mismatch: '+$name) }
    return ,$obj
}
function Get-LiteralBarcodeState($xml,[string]$expectedRoot) {
    if ($xml.DocumentElement.LocalName -cne $expectedRoot) { throw ('Unexpected symbology: '+$xml.DocumentElement.LocalName) }
    $state=Get-DataSourceState $xml
    if ($state.count -ne 1 -or $state.embeddedCount -ne 1) { throw 'Requires exactly one EmbeddedDataSource.' }
    $source=$xml.SelectSingleNode('/*/*[local-name()="DataSources"]/*')
    $transforms=@($source.SelectNodes('.//*[local-name()="Transforms"]/* | .//*[contains(local-name(),"Transform") and local-name()!="Transforms"]'))
    if ($transforms.Count -ne 0) { throw ('Source transforms rejected: '+(($transforms | ForEach-Object {$_.LocalName}) -join ', ')) }
    foreach($attribute in @('Name','DataSourceName')) {
        if ($source.HasAttribute($attribute) -and $source.GetAttribute($attribute)) { throw 'Named/shared source rejected.' }
    }
    if ($source.HasAttribute('SubStringListStringID') -and $source.GetAttribute('SubStringListStringID') -ne '4294967295') { throw 'Potential shared source ID rejected.' }
    $values=@($source.SelectNodes('./*[local-name()="Value"]'))
    if ($values.Count -ne 1) { throw 'Source has no unique literal Value.' }
    return [ordered]@{root=$expectedRoot;count=$state.count;kinds=@($state.kinds);sourceId=$source.GetAttribute('ID');value=$values[0].InnerText;prefixSuffixCount=0;dataEntryCount=0;transformCount=0}
}
function Get-HumanReadableVisibility($xml) {
    $nodes=@($xml.SelectNodes('/*/*[local-name()="HumanReadable"]'))
    if ($nodes.Count -ne 1) { return 'UNKNOWN' }
    $visibility=[string]$nodes[0].GetAttribute('Visibility')
    if ([string]::IsNullOrWhiteSpace($visibility)) { return 'VISIBLE_DEFAULT_OR_UNSPECIFIED' }
    return $visibility
}
function Assert-SingleEmbeddedDataSource($xml,[string]$payload,[string]$slot) {
    $state=Get-LiteralBarcodeState $xml $xml.DocumentElement.LocalName
    if ($state.value -cne $payload) { throw ($slot+': embedded payload mismatch.') }
}
function Set-LiteralPayload($objects,$obj,[string]$payload,[string]$root,[string]$prefix) {
    $name=[string](Read-Property $obj 'Name')
    $beforeText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $xml=Read-SafeObjectXml $beforeText
    if ($root) { [void](Get-LiteralBarcodeState $xml $root) }
    $export=Read-SafeObjectXml ([string](Invoke-ComMethod $objects 'ExportDataSourceValuesToXML' @()))
    Set-ExportedObjectPayload $export $xml $name $payload
    $beforeText | Set-Content -LiteralPath ($prefix+'-before.xml') -Encoding UTF8
    $export.OuterXml | Set-Content -LiteralPath ($prefix+'-import-request.xml') -Encoding UTF8
    $ok=Invoke-ComMethod $objects 'ImportDataSourceValuesFromXML' @($export.OuterXml)
    if (-not [bool]$ok) { throw 'Payload import returned false.' }
    $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $text | Set-Content -LiteralPath ($prefix+'-readback.xml') -Encoding UTF8
    $after=Read-SafeObjectXml $text
    if ($root) { [void](Get-LiteralBarcodeState $after $root);Assert-SingleEmbeddedDataSource $after $payload $name }
    if ([string](Read-Property $obj 'Value') -cne $payload) { throw 'Effective Value readback differs from literal payload.' }
}
function Clear-ProbeObjects($objects) {
    foreach($name in @(Get-ObjectNames $objects)) {
        if (-not [bool](Invoke-ComMethod $objects 'Delete' @($name))) { throw ('Probe cleanup failed: '+$name) }
    }
    if ([int](Read-Property $objects 'Count') -ne 0) { throw 'Probe document is not empty after cleanup.' }
}
function Select-Code128ComponentFile([string]$runDir) {
    # First choice is the exact .btc returned by the user's previous real Windows run.
    # That run already proved: native BarCode-Code-128, exactly one EmbeddedDataSource,
    # no source transforms, and two successful payload roundtrips. Re-verify it once on
    # the working copy, but do not mass-scan hundreds of installed components again.
    $bundled=Join-Path $PSScriptRoot 'proven-code128.btc'
    if(Test-Path -LiteralPath $bundled -PathType Leaf){
        $sha=(Get-FileHash -LiteralPath $bundled -Algorithm SHA256).Hash
        $catalog=[ordered]@{
            mode='BUNDLED_FROM_PRIOR_REAL_WINDOWS_EVIDENCE_NO_COMPONENT_SCAN'
            discovered=1
            exactCode128Files=1
            attemptedComInsertions=0
            chosenPath=$bundled
            chosenSha256=$sha
            status='FILE_SELECTED_NOT_YET_REVERIFIED'
            entries=@()
        }
        Save-CoreJson $catalog (Join-Path $runDir 'component-scan.json')
        return [ordered]@{candidate=[pscustomobject]@{path=$bundled;score=1000;length=(Get-Item -LiteralPath $bundled).Length};catalog=$catalog}
    }
    # Fallback for a different machine/package: locate only exact basename matches.
    $all=@(Get-BarTenderComponentCandidates 'code128' $runDir)
    $exact=@($all | Where-Object {$_.score -eq 300 -and [IO.Path]::GetFileName($_.path) -ceq 'Code 128.btc'})
    if($exact.Count -eq 0){throw 'No bundled or exact Code 128.btc component file was discovered.'}
    $preferred=@($exact | Sort-Object -Property @{Expression={if($_.path -match '\\Barcodes\\Common Bar Codes\\Code 128\.btc$'){0}else{1}};Ascending=$true},@{Expression='path';Ascending=$true})
    $chosen=$preferred[0]
    $catalog=[ordered]@{
        mode='EXACT_BASENAME_FALLBACK_NO_MASS_COM_SCAN'
        discovered=$all.Count
        exactCode128Files=$exact.Count
        attemptedComInsertions=0
        chosenPath=$chosen.path
        chosenSha256=(Get-FileHash -LiteralPath $chosen.path -Algorithm SHA256).Hash
        status='FILE_SELECTED_NOT_YET_REVERIFIED'
        entries=@()
    }
    Save-CoreJson $catalog (Join-Path $runDir 'component-scan.json')
    return [ordered]@{candidate=$chosen;catalog=$catalog}
}
function Insert-VerifiedCode128Component($doc,$objects,$request,[string]$runDir) {
    $pick=Select-Code128ComponentFile $runDir
    $candidate=$pick.candidate;$catalog=$pick.catalog
    $catalogPath=Join-Path $runDir 'component-scan.json'
    $entry=[ordered]@{path=$candidate.path;sha256=$catalog.chosenSha256;status='STARTED';insertReturn=$null;newNames=@();error=$null;source=$null;humanReadableVisibility='UNKNOWN';selectionClass='UNVERIFIED'}
    $catalog.entries+=,$entry;$catalog.attemptedComInsertions=1;Save-CoreJson $catalog $catalogPath
    Write-CoreHeartbeat $runDir ('Verify proven Code128 component once: '+[IO.Path]::GetFileName($candidate.path))
    $before=@(Get-ObjectNames $objects);$obj=$null;$added=@();$ok=$false;$insertError=$null
    try {
        try{$ok=[bool](Invoke-ComMethod $doc 'InsertComponent' @([string]$candidate.path,[double]$request.xMm,[double]$request.yMm))}catch{$insertError=$_.Exception.Message}
        $entry.insertReturn=$ok
        $after=@(Get-ObjectNames $objects);$added=@(Get-NameDelta $before $after);$removed=@(Get-NameDelta $after $before);$entry.newNames=$added
        if($insertError){throw ('InsertComponent failed: '+$insertError)}
        if(-not $ok -or $added.Count -ne 1 -or $removed.Count -ne 0 -or $after.Count -ne $before.Count+1){throw 'Code128 insertion did not add exactly one stable object.'}
        $name=[string]$added[0]
        $obj=Find-ExactObject $objects $name
        if([int](Read-Property $obj 'Type') -ne 4){throw 'Inserted component is not a native barcode.'}
        $prefix=Join-Path $runDir 'component-verified'
        $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$text | Set-Content -LiteralPath ($prefix+'-original.xml') -Encoding UTF8
        $entry.source=Get-LiteralBarcodeState (Read-SafeObjectXml $text) 'BarCode-Code-128'
        # Re-prove both arbitrary payload writes on the actual working copy. This is
        # the same capability that succeeded in the previous real Windows run.
        Set-LiteralPayload $objects $obj '007LWB-PROBE-B' 'BarCode-Code-128' ($prefix+'-challenge')
        Set-LiteralPayload $objects $obj ([string]$request.value) 'BarCode-Code-128' ($prefix+'-target')
        $qualifiedText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$qualified=Read-SafeObjectXml $qualifiedText
        [void](Get-LiteralBarcodeState $qualified 'BarCode-Code-128');Assert-SingleEmbeddedDataSource $qualified ([string]$request.value) ([string]$request.slot)
        $visibility=Get-HumanReadableVisibility $qualified;$entry.humanReadableVisibility=$visibility
        $entry.status='VERIFIED_CLEAN_NATIVE_CODE128_ON_WORKING_COPY';$entry.selectionClass='VERIFIED_DIRECT'
        $selection=[ordered]@{path=$candidate.path;sha256=$catalog.chosenSha256;source=$entry.source;humanReadableVisibility=$visibility;selectionClass='VERIFIED_DIRECT';realEvidence='single EmbeddedDataSource + two payload roundtrips'}
        $catalog.selection=$selection;$catalog.status='VERIFIED_ONE_INSERT_NO_MASS_SCAN';Save-CoreJson $catalog $catalogPath
        return [ordered]@{name=$name;selection=$selection}
    } catch {
        $entry.status='FAILED';$entry.error=$_.Exception.Message;$catalog.status='FAILED_SINGLE_PROVEN_COMPONENT'
        # Roll back only identities actually added by this single insertion.
        foreach($name in @($added)){try{[void](Invoke-ComMethod $objects 'Delete' @([string]$name))}catch{}}
        Save-CoreJson $catalog $catalogPath
        throw
    } finally {Release-XmlCom $obj;Save-CoreJson $catalog $catalogPath}
}
function Get-XDimensionInfo($xml) {
    $nodes=@($xml.SelectNodes('/*/*[local-name()="XDimension"]'))
    if ($nodes.Count -ne 1) { throw 'Missing/ambiguous XDimension.' }
    $n=$nodes[0]
    foreach($key in @('Index','Mils','Millimeters')) { if(-not $n.HasAttribute($key)){throw ('XDimension missing '+$key)} }
    $index=[int]$n.GetAttribute('Index')
    $mils=Parse-InvariantDouble $n.GetAttribute('Mils') 'Mils'
    $mm=Parse-InvariantDouble $n.GetAttribute('Millimeters') 'Millimeters'
    if ($index -lt 0 -or [double]::IsNaN($mm) -or [double]::IsInfinity($mm) -or $mils -le 0 -or $mm -le 0 -or [double]::IsInfinity($mils) -or [double]::IsNaN($mils) -or [math]::Abs($mm-$mils*0.0254) -gt 0.011) {throw 'Inconsistent XDimension units.'}
    return [ordered]@{index=$index;mils=$mils;millimeters=$mm;indexMeaning='UNVERIFIED_ENUM_INDEX_NOT_DOTS'}
}
function Export-ObjectMeasurement($obj,[string]$path,[int]$dpi) {
    if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
    [void](Invoke-ComMethod $obj 'ExportToFile' @($path,'BMP',[int]0,$dpi,[int]2))
    $r=[LabelWorkbench.RasterEvidence]::Read($path)
    $tol=[math]::Max(1.0,[double]$dpi*0.01)
    $validHeader=($r.HeaderDpiX -gt 0 -and $r.HeaderDpiY -gt 0 -and -not [double]::IsNaN($r.HeaderDpiX) -and -not [double]::IsNaN($r.HeaderDpiY) -and -not [double]::IsInfinity($r.HeaderDpiX) -and -not [double]::IsInfinity($r.HeaderDpiY))
    $dpiTrust='UNTRUSTED_HEADER_DPI_INVALID'
    if($validHeader){
        if([math]::Abs($r.HeaderDpiX-$dpi) -le $tol -and [math]::Abs($r.HeaderDpiY-$dpi) -le $tol){$dpiTrust='TRUSTED_HEADER_MATCH'}
        else{$dpiTrust='UNTRUSTED_HEADER_DPI_MISMATCH'}
    }
    $trusted=($dpiTrust -ceq 'TRUSTED_HEADER_MATCH')
    $physicalTrust=if($trusted){'TRUSTED'}else{'UNTRUSTED'}
    $canvasWidthMm=$null;$canvasHeightMm=$null;$inkWidthMm=$null;$inkHeightMm=$null
    if($trusted){
        $canvasWidthMm=$r.CanvasWidth*25.4/$dpi;$canvasHeightMm=$r.CanvasHeight*25.4/$dpi
        $inkWidthMm=$r.InkWidth*25.4/$dpi;$inkHeightMm=$r.InkHeight*25.4/$dpi
    }
    return [ordered]@{
        file=[IO.Path]::GetFileName($path);dpi=$dpi;requestedDpi=$dpi;headerDpiX=$r.HeaderDpiX;headerDpiY=$r.HeaderDpiY;dpiTolerance=$tol;dpiTrust=$dpiTrust;physicalMmTrust=$physicalTrust;
        canvasWidthPx=$r.CanvasWidth;canvasHeightPx=$r.CanvasHeight;canvasWidthMm=$canvasWidthMm;canvasHeightMm=$canvasHeightMm;
        inkLeft=$r.Left;inkTop=$r.Top;inkWidthPx=$r.InkWidth;inkHeightPx=$r.InkHeight;inkWidthMm=$inkWidthMm;inkHeightMm=$inkHeightMm;
        sha256=(Get-FileHash -LiteralPath $path).Hash;symbolBounds='NOT_VERIFIED_NO_DECODER';quietZone='NOT_VERIFIED';physicalPrint='NOT_RUN'
    }
}
function Assert-TrustedPhysicalMeasurement($m) {
    if($null -eq $m -or $m.physicalMmTrust -cne 'TRUSTED'){throw 'Raster physical-mm evidence is UNTRUSTED because BMP header DPI does not match requested DPI.'}
}
function Get-InkError($m,$request) {
    Assert-TrustedPhysicalMeasurement $m
    $e=[math]::Abs([double]$m.inkWidthMm-[double]$request.widthMm)
    if ($request.type -eq 'datamatrix') {$e=[math]::Max($e,[math]::Abs([double]$m.inkHeightMm-[double]$request.heightMm))}
    return $e
}
function Measure-XDimensionExperiment($obj,$request,[string]$prefix,[int]$dpi) {
    $result=[ordered]@{status='NOT_RUN';execution='NOT_RUN';targetWidthMm=$request.widthMm;targetHeightMm=$request.heightMm;indexSemantics='UNVERIFIED';symbolSize='NOT_VERIFIED';humanReadableVisibility='UNKNOWN';measurementBasis='NOT_RUN';physicalMmTrust='NOT_RUN';slopeTrust='NOT_RUN';bestSelection='NOT_RUN';samples=@();finalX=$null;finalRaster=$null;inkTargetErrorMm=$null;restored=$false;error=$null}
    $original=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $xml=Read-SafeObjectXml $original
    Assert-BarcodePayloadState $obj $xml $request
    $original | Set-Content -LiteralPath ($prefix+'-baseline.xml') -Encoding UTF8
    $initial=Get-XDimensionInfo $xml
    $visibility=Get-HumanReadableVisibility $xml
    $result.humanReadableVisibility=$visibility
    if ($visibility -cne 'None') {
        $result.status='SKIPPED_CAPTION';$result.execution='NOT_RUN';$result.bestSelection='SUPPRESSED_CAPTION';$result.finalX=$initial;$result.restored=$true;return $result
    }
    $result.measurementBasis='RASTER_INK_WIDTH_NO_HUMAN_READABLE'
    try{$m=Export-ObjectMeasurement $obj ($prefix+'-baseline.bmp') $dpi}
    catch{$result.status='BASELINE_RASTER_UNAVAILABLE';$result.error=$_.Exception.Message;$result.finalX=$initial;$result.restored=$true;return $result}
    $result.physicalMmTrust=$m.physicalMmTrust
    $result.samples+=,[ordered]@{requestedIndex=$initial.index;readback=$initial;raster=$m;write='NONE'}
    if($m.physicalMmTrust -cne 'TRUSTED'){
        $result.status='RASTER_DPI_UNTRUSTED';$result.execution='NOT_RUN';$result.slopeTrust='UNTRUSTED_DPI_MISMATCH';$result.bestSelection='SUPPRESSED_DPI_MISMATCH';$result.finalX=$initial;$result.finalRaster=$m;$result.restored=$true;return $result
    }
    $result.execution='RUN'
    $best=[ordered]@{x=$initial;raster=$m;error=(Get-InkError $m $request);xml=$original}
    $queue=New-Object 'System.Collections.Generic.List[int]'
    $queue.Add($initial.index+1)
    if ($initial.index -gt 0) {$queue.Add($initial.index-1)}
    $tried=@{};$tried[[string]$initial.index]=$true
    try {
        # A deliberately labelled experiment: Index only; no fabricated Mils, mm, Density or dot mapping.
        for($i=0;$i -lt $queue.Count -and $i -lt 5;$i++) {
            $index=$queue[$i]
            if ($index -lt 0 -or $index -gt 255 -or $tried.ContainsKey([string]$index)) {continue}
            $tried[[string]$index]=$true
            $write=Read-SafeObjectXml $original
            $write.SelectSingleNode('/*/*[local-name()="XDimension"]').SetAttribute('Index',[string]$index)
            $write.OuterXml | Set-Content -LiteralPath ($prefix+'-index-'+$index+'-request.xml') -Encoding UTF8
            [void](Invoke-ComMethod $obj 'SetXML' @($write.OuterXml))
            $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
            $text | Set-Content -LiteralPath ($prefix+'-index-'+$index+'-readback.xml') -Encoding UTF8
            $read=Read-SafeObjectXml $text
            $root=if($request.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
            [void](Get-LiteralBarcodeState $read $root)
            Assert-SingleEmbeddedDataSource $read ([string]$request.value) ([string]$request.slot)
            if ([string](Read-Property $obj 'Value') -cne $request.value) {throw 'Payload changed during XDimension experiment.'}
            if((Get-HumanReadableVisibility $read) -cne 'None'){throw 'Caption appeared during XDimension experiment.'}
            if((Get-XmlStateKey ($read.SelectSingleNode('/*/*[local-name()="DataSources"]'))) -cne (Get-XmlStateKey ($xml.SelectSingleNode('/*/*[local-name()="DataSources"]')))){throw 'DataSources changed during XDimension experiment.'}
            $x=Get-XDimensionInfo $read
            $r=Export-ObjectMeasurement $obj ($prefix+'-index-'+$index+'.bmp') $dpi
            $result.samples+=,[ordered]@{requestedIndex=$index;readback=$x;raster=$r;write='INDEX_ONLY_EXPERIMENT'}
            if($r.physicalMmTrust -cne 'TRUSTED'){
                $result.status='RASTER_DPI_UNTRUSTED_DURING_PROBE';$result.physicalMmTrust='PARTIAL_UNTRUSTED';$result.slopeTrust='UNTRUSTED_DPI_MISMATCH';$result.bestSelection='SUPPRESSED_DPI_INCONSISTENT';$best=[ordered]@{x=$initial;raster=$m;error=(Get-InkError $m $request);xml=$original};break
            }
            if ($x.index -ne $index -or [math]::Abs($x.mils-$initial.mils) -lt 0.001 -or [math]::Abs([double]$r.inkWidthMm-[double]$m.inkWidthMm) -lt 25.4/$dpi) {
                $result.status='INDEX_WRITE_NOT_PROVEN';break
            }
            $err=Get-InkError $r $request
            if($err -lt $best.error){$best=[ordered]@{x=$x;raster=$r;error=$err;xml=$text};$result.bestSelection='BEST_TRUSTED_SAMPLE'}
            if($i -eq 0){
                $slope=([double]$r.inkWidthMm-[double]$m.inkWidthMm)/($x.index-$initial.index)
                $result.slopeTrust='TRUSTED_INPUTS'
                if($slope -gt 0){
                    $estimate=$initial.index+([double]$request.widthMm-[double]$m.inkWidthMm)/$slope
                    $queue.Add([int][math]::Floor($estimate));$queue.Add([int][math]::Ceiling($estimate))
                }
            }
            $result.status='INDEX_AND_RASTER_RESPONDED_SYMBOL_SIZE_UNVERIFIED'
            $result.physicalMmTrust='TRUSTED'
        }
    } catch {$result.status='EXPERIMENT_ERROR';$result.error=$_.Exception.Message}
    finally {
        # Only a completely successful bounded experiment may retain the best sample.
        if($result.status -cne 'INDEX_AND_RASTER_RESPONDED_SYMBOL_SIZE_UNVERIFIED'){
            $best=[ordered]@{x=$initial;raster=$m;error=(Get-InkError $m $request);xml=$original}
            if($result.bestSelection -notlike 'SUPPRESSED*'){$result.bestSelection='SUPPRESSED_EXPERIMENT_FAILED'}
        }
        try {
        [void](Invoke-ComMethod $obj 'SetXML' @([string]$best.xml))
        $finalText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
        $finalText | Set-Content -LiteralPath ($prefix+'-final.xml') -Encoding UTF8
        $finalXml=Read-SafeObjectXml $finalText
        Assert-BarcodePayloadState $obj $finalXml $request
        if((Get-XmlStateKey $finalXml) -cne (Get-XmlStateKey (Read-SafeObjectXml ([string]$best.xml)))){throw 'Selected XML state did not restore completely.'}
        $final=Get-XDimensionInfo $finalXml
        if($final.index -ne $best.x.index -or [math]::Abs($final.mils-$best.x.mils) -gt 0.02){throw 'XDimension state restoration failed.'}
        if([string](Read-Property $obj 'Value') -cne $request.value){throw 'Payload restoration failed.'}
        $result.finalX=$final;$result.finalRaster=Export-ObjectMeasurement $obj ($prefix+'-final.bmp') $dpi
        Assert-TrustedPhysicalMeasurement $result.finalRaster
        foreach($k in @('inkWidthPx','inkHeightPx')){if([math]::Abs($result.finalRaster[$k]-$best.raster[$k]) -gt 1){throw 'Selected raster not repeatable.'}}
        $result.restored=$true
        } catch {
            $result.status='FINAL_VERIFICATION_FAILED';$result.error=$_.Exception.Message
            $result.bestSelection='SUPPRESSED_FINAL_VERIFICATION';$result.finalRaster=$null
            Restore-BarcodeSnapshot $obj $original $request $prefix
            $result.finalX=$initial;$result.restored=$true
        }
    }
    if($result.status -cne 'INDEX_AND_RASTER_RESPONDED_SYMBOL_SIZE_UNVERIFIED'){$result['inkTargetErrorMm']=$null}
    elseif($null -ne $result.finalRaster -and $result.finalRaster.physicalMmTrust -ceq 'TRUSTED'){$result['inkTargetErrorMm']=Get-InkError $result.finalRaster $request}
    else{$result['inkTargetErrorMm']=$null}
    return $result
}
function Get-XmlStateKey($node) {
    if ($node -is [System.Xml.XmlDocument]) { return Get-XmlStateKey $node.DocumentElement }
    if ($node -is [System.Xml.XmlElement]) {
        $parts=@('E', $node.NamespaceURI, $node.LocalName)
        foreach($a in @($node.Attributes | Sort-Object NamespaceURI,LocalName)) {
            $parts+=@('A',$a.NamespaceURI,$a.LocalName,$a.Value)
        }
        foreach($child in @($node.ChildNodes)) {
            if($child -is [System.Xml.XmlWhitespace]){continue}
            $parts+=,(Get-XmlStateKey $child)
        }
        return (($parts | ForEach-Object { [string]$_.Length+':'+$_ }) -join '')
    }
    return ([string]$node.NodeType+':'+[string]$node.Value)
}
function Assert-BarcodePayloadState($obj,$xml,$request) {
    $root=if($request.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
    [void](Get-LiteralBarcodeState $xml $root)
    Assert-SingleEmbeddedDataSource $xml ([string]$request.value) ([string]$request.slot)
    if([string](Read-Property $obj 'Value') -cne [string]$request.value){throw 'Effective payload mismatch.'}
}
function Restore-BarcodeSnapshot($obj,[string]$original,$request,[string]$prefix) {
    [void](Invoke-ComMethod $obj 'SetXML' @($original))
    $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $text | Set-Content -LiteralPath ($prefix+'-rollback-readback.xml') -Encoding UTF8
    $back=Read-SafeObjectXml $text
    Assert-BarcodePayloadState $obj $back $request
    if((Get-XmlStateKey $back) -cne (Get-XmlStateKey (Read-SafeObjectXml $original))){throw 'Full XML rollback readback differs from baseline.'}
}
function Try-HideCode128HumanReadable($obj,$request,[string]$prefix) {
    $r=[ordered]@{status='NOT_RUN';beforeVisibility='UNKNOWN';finalVisibility='UNKNOWN';restored=$false;error=$null}
    $original=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $xml=Read-SafeObjectXml $original
    [void](Get-LiteralBarcodeState $xml 'BarCode-Code-128')
    Assert-SingleEmbeddedDataSource $xml ([string]$request.value) ([string]$request.slot)
    Assert-BarcodePayloadState $obj $xml $request
    $original | Set-Content -LiteralPath ($prefix+'-baseline.xml') -Encoding UTF8
    $r.beforeVisibility=Get-HumanReadableVisibility $xml
    if($r.beforeVisibility -ceq 'None'){$r.status='ALREADY_HIDDEN';$r.finalVisibility='None';$r.restored=$true;return $r}
    $nodes=@($xml.SelectNodes('/*/*[local-name()="HumanReadable"]'))
    if($nodes.Count -ne 1){$r.status='MISSING_OR_AMBIGUOUS_HUMAN_READABLE';$r.finalVisibility='UNKNOWN';$r.restored=$true;return $r}
    $node=$nodes[0]
    try{
        $node.SetAttribute('Visibility','None')
        $xml.OuterXml | Set-Content -LiteralPath ($prefix+'-hide-request.xml') -Encoding UTF8
        [void](Invoke-ComMethod $obj 'SetXML' @($xml.OuterXml))
        $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$text | Set-Content -LiteralPath ($prefix+'-hide-readback.xml') -Encoding UTF8
        $read=Read-SafeObjectXml $text
        [void](Get-LiteralBarcodeState $read 'BarCode-Code-128')
        Assert-SingleEmbeddedDataSource $read ([string]$request.value) ([string]$request.slot)
        if([string](Read-Property $obj 'Value') -cne [string]$request.value){throw 'Payload changed while hiding HumanReadable.'}
        if((Get-XmlStateKey ($read.SelectSingleNode('/*/*[local-name()="DataSources"]'))) -cne (Get-XmlStateKey ($xml.SelectSingleNode('/*/*[local-name()="DataSources"]')))){throw 'DataSources changed while hiding HumanReadable.'}
        $r.finalVisibility=Get-HumanReadableVisibility $read
        if($r.finalVisibility -ceq 'None'){$r.status='HIDDEN_BY_SETXML';$r.restored=$true;return $r}
        throw 'HumanReadable Visibility=None was not accepted on readback.'
    }catch{
        $r.error=$_.Exception.Message
        try{
            Restore-BarcodeSnapshot $obj $original $request $prefix
            $back=Read-SafeObjectXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
            $r.finalVisibility=Get-HumanReadableVisibility $back
            if([string](Read-Property $obj 'Value') -cne [string]$request.value){throw 'Payload changed during HumanReadable rollback.'}
            $r.restored=$true;$r.status='NOT_APPLIED_RESTORED'
        }catch{$r.restored=$false;$r.status='ROLLBACK_FAILED';$r.error=($r.error+' | rollback: '+$_.Exception.Message)}
        return $r
    }
}
function Test-Code128Height($obj,$request,[double]$toleranceMm) {
    $r=[ordered]@{status='NOT_RUN';property='Height';toleranceMm=$toleranceMm;requestedMm=[double]$request.heightMm;beforeMm=$null;readbackMm=$null;errorMm=$null;withinTolerance=$false;error=$null}
    try{
        $r.beforeMm=[double](Read-Property $obj 'Height')
        Write-Property $obj 'Height' ([double]$request.heightMm)
        $actual=[double](Read-Property $obj 'Height')
        if([double]::IsNaN($actual) -or [double]::IsInfinity($actual)){throw 'Height readback is not finite.'}
        $r.readbackMm=$actual;$r.errorMm=[math]::Abs($actual-[double]$request.heightMm)
        $r.withinTolerance=($r.errorMm -le $toleranceMm)
        $r.status=if($r.withinTolerance){'HEIGHT_WITHIN_TOLERANCE'}else{'HEIGHT_READBACK_OUTSIDE_TOLERANCE'}
    }catch{$r.status='FAILED';$r.error=$_.Exception.Message}
    return $r
}
function Set-TargetGeometryBestEffort($obj,$request,[double]$positionToleranceMm) {
    # Position is applied after barcode sizing so BarTender cannot clamp coordinates
    # against the component's original oversized bounds. Target mismatch is diagnostic,
    # not fatal; persistence verifies the actual accepted coordinates after reopen.
    $result=[ordered]@{status='NOT_RUN';positionToleranceMm=$positionToleranceMm;properties=[ordered]@{};allTargetsReached=$true}
    $targets=[ordered]@{X=[double]$request.xMm;Y=[double]$request.yMm;RotationAngle=[double]0}
    if($request.type -eq 'text'){$targets['FontSize']=[double]$request.fontSizePt}
    foreach($key in @($targets.Keys)){
        $tol=if($key -eq 'X' -or $key -eq 'Y'){$positionToleranceMm}else{0.05}
        $entry=[ordered]@{requested=[double]$targets[$key];before=$null;readback=$null;error=$null;tolerance=$tol;status='NOT_RUN'}
        try{
            $entry.before=[double](Read-Property $obj $key)
            Write-Property $obj $key ([double]$targets[$key])
            $actual=[double](Read-Property $obj $key)
            if([double]::IsNaN($actual) -or [double]::IsInfinity($actual)){throw ($key+' readback is not finite.')}
            $entry.readback=$actual;$entry.error=[math]::Abs($actual-[double]$targets[$key])
            if($entry.error -le $tol){$entry.status='TARGET_WITHIN_TOLERANCE'}else{$entry.status='TARGET_NOT_REACHED';$result.allTargetsReached=$false}
        }catch{$entry.status='FAILED';$entry['exception']=$_.Exception.Message;$result.allTargetsReached=$false}
        $result.properties[$key]=$entry
    }
    $result.status=if($result.allTargetsReached){'TARGET_GEOMETRY_WITHIN_TOLERANCE'}else{'BEST_EFFORT_GEOMETRY_RECORDED'}
    return $result
}
function Probe-XDimensionResponse($obj,$request,[string]$prefix,[int]$dpi,[bool]$rasterAvailable) {
    # Capability probe only. Never infer printer dots, never calculate a best Index,
    # and always restore the exact original XML before returning.
    $r=[ordered]@{status='NOT_RUN';execution='NOT_RUN';indexSemantics='UNVERIFIED_ENUM_INDEX_NOT_DOTS';baseline=$null;probe=$null;inkTargetErrorMm=$null;restored=$false;error=$null}
    $original=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
    $xml=Read-SafeObjectXml $original
    $root=if($request.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
    [void](Get-LiteralBarcodeState $xml $root)
    $initial=Get-XDimensionInfo $xml
    $base=[ordered]@{xDimension=$initial;raster=$null}
    if($rasterAvailable){try{$base.raster=Export-ObjectMeasurement $obj ($prefix+'-baseline.bmp') $dpi}catch{$base['rasterError']=$_.Exception.Message}}
    Assert-BarcodePayloadState $obj $xml $request
    $original | Set-Content -LiteralPath ($prefix+'-baseline.xml') -Encoding UTF8
    $r.baseline=$base
    $targetIndex=$initial.index+1
    if($targetIndex -gt 255){$targetIndex=$initial.index-1}
    if($targetIndex -lt 0){$r.status='NO_SAFE_ADJACENT_INDEX';return $r}
    try{
        $write=Read-SafeObjectXml $original
        $write.SelectSingleNode('/*/*[local-name()="XDimension"]').SetAttribute('Index',[string]$targetIndex)
        $write.OuterXml | Set-Content -LiteralPath ($prefix+'-request.xml') -Encoding UTF8
        [void](Invoke-ComMethod $obj 'SetXML' @($write.OuterXml))
        $readText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$readText | Set-Content -LiteralPath ($prefix+'-readback.xml') -Encoding UTF8
        $read=Read-SafeObjectXml $readText;Assert-BarcodePayloadState $obj $read $request
        if((Get-XmlStateKey ($read.SelectSingleNode('/*/*[local-name()="DataSources"]'))) -cne (Get-XmlStateKey ($xml.SelectSingleNode('/*/*[local-name()="DataSources"]')))){throw 'DataSources changed during readback-only probe.'}
        $x=Get-XDimensionInfo $read
        $probe=[ordered]@{requestedIndex=$targetIndex;readback=$x;raster=$null}
        if($rasterAvailable){try{$probe.raster=Export-ObjectMeasurement $obj ($prefix+'-probe.bmp') $dpi}catch{$probe['rasterError']=$_.Exception.Message}}
        $r.probe=$probe;$r.execution='RUN'
        if($x.index -eq $targetIndex -and ([math]::Abs($x.mils-$initial.mils) -gt 0.001 -or [math]::Abs($x.millimeters-$initial.millimeters) -gt 0.001)){$r.status='INDEX_WRITE_AND_XDIMENSION_READBACK_RESPONDED'}
        elseif($x.index -eq $targetIndex){$r.status='INDEX_WRITE_READBACK_ONLY_MILS_UNCHANGED'}
        else{$r.status='INDEX_WRITE_NOT_PROVEN'}
    }catch{$r.status='EXPERIMENT_ERROR';$r.error=$_.Exception.Message}
    finally{
        try{
            Restore-BarcodeSnapshot $obj $original $request $prefix
            $finalText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$final=Read-SafeObjectXml $finalText;$fx=Get-XDimensionInfo $final
            if($fx.index -ne $initial.index -or [math]::Abs($fx.mils-$initial.mils) -gt 0.02){throw 'Exact XDimension baseline restoration failed.'}
            if([string](Read-Property $obj 'Value') -cne [string]$request.value){throw 'Payload changed during XDimension capability probe.'}
            $r.restored=$true
        }catch{$r.restored=$false;if(-not $r.error){$r.error=$_.Exception.Message};$r.status='RESTORE_FAILED'}
    }
    return $r
}
function Assert-ReviewApi($api) {
    [void](Assert-InsertComponentApi $api)
    $specs=@(
        @('IBtFormats','Add','INVOKE_FUNC',26,@()),
        @('IBtDesignObjects','Delete','INVOKE_FUNC',11,@(8)),
        @('IBtDesignObjects','ExportDataSourceValuesToXML','INVOKE_FUNC',8,@()),
        @('IBtDesignObjects','ImportDataSourceValuesFromXML','INVOKE_FUNC',11,@(8)),
        @('IBtDesignObject','GetXML','INVOKE_FUNC',8,@(11,11)),
        @('IBtDesignObject','SetXML','INVOKE_FUNC',24,@(8)),
        @('IBtDesignObject','Value','INVOKE_PROPERTYGET',8,@()),
        @('IBtDesignObject','RotationAngle','INVOKE_PROPERTYPUT',24,@(5)),
        @('IBtDesignObject','Height','INVOKE_PROPERTYPUT',24,@(5)),
        @('IBtDesignObject','Height','INVOKE_PROPERTYGET',5,@())
    )
    foreach($s in $specs){
        $members=@($api.members | Where-Object {$_.TypeName -ceq $s[0] -and $_.Name -ceq $s[1] -and $_.InvokeKind -ceq $s[2]})
        if($members.Count -ne 1 -or $members[0].ReturnVariantType -ne $s[3] -or (@($members[0].ParameterVariantTypes) -join ',') -cne (@($s[4]) -join ',')){throw ('Unverified API signature: '+$s[0]+'.'+$s[1])}
    }
    if(@($api.members | Where-Object {$_.TypeName -eq 'IBtDesignObject' -and $_.Name -eq 'Value' -and $_.InvokeKind -eq 'INVOKE_PROPERTYPUT'}).Count){throw 'Unexpected Value setter; contract changed.'}
}
function Invoke-CoreTest($document,$formats,$report,[string]$runDir,[string]$baseDirectory,[string]$templatePath,[string]$originalHash) {
    $objects=$null
    $report['core']=[ordered]@{route='single proven Code128 component + size-before-position + empirical DataMatrix XDimension + persistence matrix';tests=@();blocking=@();fullLayoutAccepted=$false;scannerReadability='NOT_RUN';symbolBounds='NOT_VERIFIED';saveReopen='NOT_RUN'}
    $checkpoint=Join-Path $runDir 'core-progress.json'
    try {
        $rasterAvailable=$true;$rasterHelperError=$null
        if(-not ('LabelWorkbench.RasterEvidence' -as [type])){
            try{Add-Type -Path (Join-Path $baseDirectory 'RasterEvidence.cs') -ErrorAction Stop}
            catch{$rasterAvailable=$false;$rasterHelperError=$_.Exception.Message}
        }
        if(-not $rasterAvailable){$report.core.blocking+=('Raster sizing helper unavailable; payload/geometry/persistence tests will continue: '+$rasterHelperError)}
        $config=Get-Content -LiteralPath (Join-Path $baseDirectory 'core-test.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $dpi=[int]$config.exportDpi
        if($dpi -lt 72 -or $dpi -gt 1200){throw 'Invalid export DPI.'}
        Write-Property $document 'MeasurementUnits' 3
        $unitReadback=[int](Read-Property $document 'MeasurementUnits')
        if($unitReadback -ne 3){throw ('MeasurementUnits readback is not millimeters: '+$unitReadback)}
        $report.core['measurementUnits']='MILLIMETERS_CONFIRMED'
        $objects=Read-Property $document 'Objects'
        Set-CoreStage $report $runDir 'check exact BarTender TypeLib contracts'
        $api=$null;$liveApiError=$null
        if('LabelWorkbench.ComMetadata' -as [type]){
            try{$api=Get-RegisteredBarTenderLibraryMembers $runDir;$api['source']='LIVE_REGISTERED_TYPELIB'}catch{$liveApiError=$_.Exception.Message}
        }else{$liveApiError='ComMetadata helper unavailable in this process.'}
        if($null -eq $api){
            $api=Get-PackagedApiEvidence $baseDirectory
            $report.core.blocking+=('Live TypeLib metadata read unavailable; using previously captured real-machine API evidence: '+$liveApiError)
        }
        Assert-ReviewApi $api
        $report.core['apiPath']=$api.path
        $report.core['apiSource']=$api.source
        try{$report.core['documentPrinter']=[string](Read-Property $document 'Printer')}catch{$report.core['documentPrinterError']=$_.Exception.Message}
        $report.core['printerDotPitch']='NOT_VERIFIED_FROM_DEVICE_SETTINGS'
        $initialNames=@(Get-ObjectNames $objects)
        Save-CoreJson $initialNames (Join-Path $runDir 'original-object-names.json')
        $codeRequests=@($config.objects | Where-Object {$_.type -eq 'code128'})
        if($codeRequests.Count -ne 1){throw 'Expected one Code128 test request.'}
        $selection=$null;$codeName=$null
        try {
            Set-CoreStage $report $runDir 'verify one previously proven exact Code128 component on working copy'
            $insert=Insert-VerifiedCode128Component $document $objects $codeRequests[0] $runDir
            $selection=$insert.selection;$codeName=[string]$insert.name
            $report.core['selection']=$selection
            Copy-Item -LiteralPath $selection.path -Destination (Join-Path $runDir 'selected-component.btc')
            # Refresh the Objects collection after the structural insertion. Do not
            # carry a pre-mutation collection wrapper through the rest of the run.
            Release-XmlCom $objects;$objects=Read-Property $document 'Objects'
            $probe=Find-ExactObject $objects $codeName;try{if([string](Read-Property $probe 'Value') -cne [string]$codeRequests[0].value){throw 'Code128 value changed after Objects collection refresh.'}}finally{Release-XmlCom $probe}
        } catch {$report.core.blocking+=('Code128 direct component verification: '+$_.Exception.Message)}
        $checks=@();$index=0
        foreach($request in @($config.objects)) {
            $index++;$obj=$null
            $test=[ordered]@{slot=$request.slot;type=$request.type;objectName=$null;payload='NOT_RUN';geometry='NOT_RUN';source='NOT_RUN';size='NOT_RUN';persistence='NOT_RUN';errors=@()}
            $report.core.tests+=,$test
            $prefix=Join-Path $runDir ('object-'+$index)
            try {
                Set-CoreStage $report $runDir ('independent capability test: '+$request.type)
                if($request.type -eq 'code128' -and $null -eq $codeName){throw 'Code128 component unavailable; other tests continue.'}
                $name=if($request.type -eq 'code128'){$codeName}else{[string]$request.slot}
                $test.objectName=$name;$obj=Find-ExactObject $objects $name
                $expectedType=if($request.type -eq 'text'){5}else{4}
                if([int](Read-Property $obj 'Type') -ne $expectedType){throw 'Wrong native object Type.'}
                $root=switch($request.type){'code128'{'BarCode-Code-128'} 'datamatrix'{'BarCode-DataMatrix'} default{''}}
                Set-LiteralPayload $objects $obj ([string]$request.value) $root ($prefix+'-payload')
                $test.payload='EFFECTIVE_AND_SOURCE_READBACK_OK'
                if($root){$test.source='SINGLE_EMBEDDED_NO_SOURCE_TRANSFORMS'}else{$test.source='EXISTING_TEXT'}
                $expected=[ordered]@{}
                $size=$null
                if($request.type -eq 'code128'){
                    Set-CoreStage $report $runDir 'Code128 hide HumanReadable if supported, then bounded empirical XDimension layout sizing'
                    $human=Try-HideCode128HumanReadable $obj $request ($prefix+'-human-readable')
                    if(-not $human.restored){throw ('HumanReadable rollback failed; isolate Code128: '+$human.error)}
                    $height=Test-Code128Height $obj $request ([double]$config.heightToleranceMm)
                    if($null -ne $height.readbackMm){$expected['Height']=[double]$height.readbackMm}
                    if($rasterAvailable){
                        $xdim=Measure-XDimensionExperiment $obj $request ($prefix+'-xdim-fit') $dpi
                        if($xdim.status -eq 'SKIPPED_CAPTION'){
                            $human['xdimensionReadbackOnly']=Probe-XDimensionResponse $obj $request ($prefix+'-xdim-caption-readback') $dpi $false
                            if(-not $human.xdimensionReadbackOnly.restored){throw 'Caption fallback XDimension rollback failed.'}
                        }
                    }else{
                        $xdim=Probe-XDimensionResponse $obj $request ($prefix+'-xdim') $dpi $false
                    }
                    # Reapply documented 1D barcode Height after any SetXML XDimension experiment.
                    if($xdim.Contains('restored') -and -not $xdim.restored -and $xdim.status -eq 'RESTORE_FAILED'){throw 'XDimension rollback failed; isolate Code128.'}
                    $heightFinal=Test-Code128Height $obj $request ([double]$config.heightToleranceMm)
                    if($null -ne $heightFinal.readbackMm){$expected['Height']=[double]$heightFinal.readbackMm}
                    $finalXml=Read-SafeObjectXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
                    $finalX=Get-XDimensionInfo $finalXml
                    $finalVisibility=Get-HumanReadableVisibility $finalXml
                    $finalRaster=$null
                    if($rasterAvailable){try{$finalRaster=Export-ObjectMeasurement $obj ($prefix+'-final-size.bmp') $dpi}catch{$test.errors+=('Final raster: '+$_.Exception.Message)}}
                    $widthStatus='NOT_RUN'
                    if($rasterAvailable -and $finalVisibility -ceq 'None' -and $null -ne $finalRaster -and $finalRaster.physicalMmTrust -ceq 'TRUSTED' -and $null -ne $xdim.inkTargetErrorMm){$widthStatus=if((Get-InkError $finalRaster $request) -le [double]$config.sizeToleranceMm){'LAYOUT_INK_WIDTH_WITHIN_TOLERANCE'}else{'NEAREST_TRUSTED_LAYOUT_INK_WIDTH_OUTSIDE_TOLERANCE'}}
                    elseif($rasterAvailable){$widthStatus='LAYOUT_WIDTH_NOT_ESTABLISHED'}
                    else{$widthStatus='RASTER_UNAVAILABLE'}
                    $size=[ordered]@{status='CODE128_DIAGNOSTICS_RECORDED_NOT_ACCEPTANCE';documentedHeight=$height;humanReadableControl=$human;xdimensionExperiment=$xdim;finalHeight=$heightFinal;finalXDimension=$finalX;finalHumanReadableVisibility=$finalVisibility;finalRaster=$finalRaster;targetMm=[ordered]@{width=[double]$request.widthMm;height=[double]$request.heightMm};layoutWidthStatus=$widthStatus;widthMeaning='RASTER_INK_LAYOUT_WIDTH_APPROX_ONLY_NOT_DECODER_SYMBOL_BOUND';symbolBounds='NOT_VERIFIED_NO_DECODER';physicalPrint='NOT_RUN'}
                    $test.size=$size
                }elseif($request.type -eq 'datamatrix'){
                    if($rasterAvailable){
                        Set-CoreStage $report $runDir 'DataMatrix bounded empirical XDimension sizing experiment'
                        $xdim=Measure-XDimensionExperiment $obj $request ($prefix+'-xdim-fit') $dpi
                    }else{
                        Set-CoreStage $report $runDir 'DataMatrix XDimension readback capability without raster sizing'
                        $xdim=Probe-XDimensionResponse $obj $request ($prefix+'-xdim') $dpi $false
                    }
                    $finalXml=Read-SafeObjectXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
                    $finalX=Get-XDimensionInfo $finalXml
                    $finalRaster=$null
                    if($rasterAvailable){try{$finalRaster=Export-ObjectMeasurement $obj ($prefix+'-final-size.bmp') $dpi}catch{$test.errors+=('Final raster: '+$_.Exception.Message)}}
                    $size=[ordered]@{status=if($rasterAvailable){'DATAMATRIX_EMPIRICAL_XDIMENSION_CAPABILITY_COMPLETE'}else{'DATAMATRIX_XDIMENSION_READBACK_ONLY_RASTER_UNAVAILABLE'};directWidthHeight='NOT_USED_FOR_2D_BARCODE';xdimensionExperiment=$xdim;finalXDimension=$finalX;finalRaster=$finalRaster;targetMm=[ordered]@{width=[double]$request.widthMm;height=[double]$request.heightMm};symbolBounds='RASTER_INK_ONLY_NOT_DECODER_VERIFIED';physicalPrint='NOT_RUN'}
                    $test.size=$size
                }else{$test.size='NOT_APPLICABLE'}

                Set-CoreStage $report $runDir ('apply target position after size: '+$request.type)
                $geometry=Set-TargetGeometryBestEffort $obj $request ([double]$config.positionToleranceMm)
                $test.geometry=$geometry
                foreach($key in @($geometry.properties.Keys)){
                    $e=$geometry.properties[$key]
                    if($null -ne $e.readback){$expected[$key]=[double]$e.readback}
                }
                if($request.type -eq 'code128'){
                    $snapshot=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
                    $snapshot | Set-Content -LiteralPath ($prefix+'-presave.xml') -Encoding UTF8
                    $sx=Read-SafeObjectXml $snapshot;Assert-BarcodePayloadState $obj $sx $request
                    $size.finalXDimension=Get-XDimensionInfo $sx
                    $size['presaveXDimensionXmlKey']=Get-XmlStateKey ($sx.SelectSingleNode('/*/*[local-name()="XDimension"]'))
                    $size['presaveDataSourcesXmlKey']=Get-XmlStateKey ($sx.SelectSingleNode('/*/*[local-name()="DataSources"]'))
                    $size.finalHumanReadableVisibility=Get-HumanReadableVisibility $sx
                    $size.finalRaster=$null
                    if($rasterAvailable){try{$size.finalRaster=Export-ObjectMeasurement $obj ($prefix+'-presave.bmp') $dpi}catch{$test.errors+=('Presave raster: '+$_.Exception.Message)}}
                    $size.layoutWidthStatus='LAYOUT_WIDTH_NOT_ESTABLISHED'
                    $size['finalInkTargetErrorMm']=$null
                    if($size.finalHumanReadableVisibility -ceq 'None' -and $null -ne $size.finalRaster -and $size.finalRaster.physicalMmTrust -ceq 'TRUSTED' -and $null -ne $xdim.inkTargetErrorMm -and $xdim.status -ceq 'INDEX_AND_RASTER_RESPONDED_SYMBOL_SIZE_UNVERIFIED'){
                        $size.finalInkTargetErrorMm=Get-InkError $size.finalRaster $request
                        $size.layoutWidthStatus=if($size.finalInkTargetErrorMm -le [double]$config.sizeToleranceMm){'LAYOUT_INK_WIDTH_WITHIN_TOLERANCE'}else{'NEAREST_TRUSTED_LAYOUT_INK_WIDTH_OUTSIDE_TOLERANCE'}
                    }
                }
                $checks+=,[ordered]@{request=$request;test=$test;name=$name;root=$root;type=$expectedType;expected=$expected;size=$size;prefix=$prefix}
            }catch{$test.errors+=$_.Exception.Message}
            finally{Release-XmlCom $obj;Save-CoreJson $report.core $checkpoint}
        }
        # Only accepted active objects are made printable in this diagnostic copy.
        $activeNames=@($checks | ForEach-Object {$_.name})
        foreach($name in @(Get-ObjectNames $objects)){
            $obj=Find-ExactObject $objects $name
            try{Write-Property $obj 'DoNotPrint' ($name -cnotin $activeNames)}finally{Release-XmlCom $obj}
        }
        $savedNames=@(Get-ObjectNames $objects)
        if($checks.Count -eq 0){throw 'No successful payload/geometry tests to persist.'}
        $candidate=Join-Path $runDir 'diagnostic.btw'
        Set-CoreStage $report $runDir 'save one diagnostic file, close, release, then reopen'
        [void](Invoke-ComMethod $document 'SaveAs' @($candidate,$false))
        Release-XmlCom $objects;$objects=$null
        [void](Invoke-ComMethod $document 'Close' @(1));Release-XmlCom $document;$document=$null
        if(-not(Test-Path -LiteralPath $candidate) -or (Get-Item -LiteralPath $candidate).Length -le 0){throw 'SaveAs produced no file.'}
        $savedHash=(Get-FileHash -LiteralPath $candidate).Hash
        $document=Invoke-ComMethod $formats 'Open' @($candidate,$false,'')
        Write-Property $document 'MeasurementUnits' 3
        if([int](Read-Property $document 'MeasurementUnits') -ne 3){throw 'Reopen units are not millimeters.'}
        $objects=Read-Property $document 'Objects'
        Assert-NameSetEqual $savedNames @(Get-ObjectNames $objects)
        $reopenFailed=$false
        foreach($check in $checks){
            $obj=$null
            try{
                Set-CoreStage $report $runDir ('reopen verification: '+$check.name)
                $obj=Find-ExactObject $objects $check.name
                if([int](Read-Property $obj 'Type') -ne $check.type){throw 'Native Type changed after reopen.'}
                if([string](Read-Property $obj 'Value') -cne $check.request.value){throw 'Payload changed after reopen.'}
                $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
                $text | Set-Content -LiteralPath ($check.prefix+'-reopen.xml') -Encoding UTF8
                $xml=Read-SafeObjectXml $text
                if($check.root){[void](Get-LiteralBarcodeState $xml $check.root);Assert-SingleEmbeddedDataSource $xml ([string]$check.request.value) $check.name}
                foreach($key in $check.expected.Keys){
                    $v=[double](Read-Property $obj $key)
                    if([double]::IsNaN($v) -or [double]::IsInfinity($v) -or [math]::Abs($v-$check.expected[$key]) -gt 0.02){throw ('Reopen property mismatch: '+$key)}
                }
                if($null -ne $check.size -and $null -ne $check.size.finalXDimension){
                    # Compare against the actual final native state after the temporary probe was restored
                    # and Width/Height were reapplied.
                    $x=Get-XDimensionInfo $xml;$baseline=$check.size.finalXDimension
                    if($x.index -ne $baseline.index -or [math]::Abs($x.mils-$baseline.mils) -gt 0.02 -or [math]::Abs($x.millimeters-$baseline.millimeters) -gt 0.011){throw 'Reopen final XDimension mismatch.'}
                }
                if($check.request.type -eq 'code128' -and $null -ne $check.size){
                    if((Get-XmlStateKey ($xml.SelectSingleNode('/*/*[local-name()="XDimension"]'))) -cne $check.size.presaveXDimensionXmlKey){throw 'Reopen XDimension XML changed.'}
                    if((Get-XmlStateKey ($xml.SelectSingleNode('/*/*[local-name()="DataSources"]'))) -cne $check.size.presaveDataSourcesXmlKey){throw 'Reopen DataSources XML changed.'}
                }
                if($check.request.type -eq 'code128' -and $null -ne $check.size -and $null -ne $check.size.humanReadableControl -and $check.size.humanReadableControl.status -in @('HIDDEN_BY_SETXML','ALREADY_HIDDEN')){
                    if((Get-HumanReadableVisibility $xml) -cne 'None'){throw 'Reopen HumanReadable visibility mismatch.'}
                }
                if($null -ne $check.size -and $null -ne $check.size.finalRaster){
                    $r=Export-ObjectMeasurement $obj ($check.prefix+'-reopen.bmp') $dpi
                    $check.test['reopenRaster']=$r
                    if($r.physicalMmTrust -cne $check.size.finalRaster.physicalMmTrust){throw 'Reopen raster trust state changed.'}
                    foreach($k in @('canvasWidthPx','canvasHeightPx','inkWidthPx','inkHeightPx','inkLeft','inkTop')){if([math]::Abs($r[$k]-$check.size.finalRaster[$k]) -gt 1){throw ('Reopen raster differs: '+$k)}}
                }
                $check.test.persistence='SAVE_CLOSE_REOPEN_READBACK_OK_SYMBOL_BOUNDS_UNVERIFIED'
            }catch{$reopenFailed=$true;$check.test.persistence='FAILED';$check.test.errors+=$_.Exception.Message}
            finally{Release-XmlCom $obj;Save-CoreJson $report.core $checkpoint}
        }
        foreach($name in @(Get-ObjectNames $objects)){
            $obj=Find-ExactObject $objects $name
            try{if([bool](Read-Property $obj 'DoNotPrint') -ne ($name -cnotin $activeNames)){throw 'Reopen visibility mismatch.'}}finally{Release-XmlCom $obj}
        }
        # Reopen editability + isolation challenge. Do not save these temporary challenge values.
        foreach($check in @($checks | Where-Object {$_.root -and $_.test.persistence -ne 'FAILED'})){
            $obj=$null
            try{
                $obj=Find-ExactObject $objects $check.name
                Set-CoreStage $report $runDir ('reopened embedded-payload challenge: '+$check.name)
                Set-LiteralPayload $objects $obj '009LWB-REOPEN' $check.root ($check.prefix+'-reopen-challenge')
                foreach($other in @($checks | Where-Object {$_.name -cne $check.name})){
                    $peer=Find-ExactObject $objects $other.name
                    try{if([string](Read-Property $peer 'Value') -cne $other.request.value){throw 'Reopen challenge changed another active object.'}}finally{Release-XmlCom $peer}
                }
                $check.test['reopenEditable']='SECOND_PAYLOAD_AND_ACTIVE_OBJECT_ISOLATION_OK'
            }catch{$reopenFailed=$true;$check.test['reopenEditable']='FAILED';$check.test.errors+=$_.Exception.Message}
            finally{
                try{if($null -ne $obj){Set-LiteralPayload $objects $obj ([string]$check.request.value) $check.root ($check.prefix+'-reopen-finally-restore')}}
                catch{$reopenFailed=$true;$check.test['reopenEditable']='FAILED';$check.test.errors+=('Challenge rollback: '+$_.Exception.Message)}
                Release-XmlCom $obj;Save-CoreJson $report.core $checkpoint
            }
        }
        Release-XmlCom $objects;$objects=$null
        [void](Invoke-ComMethod $document 'Close' @(1));Release-XmlCom $document;$document=$null
        if((Get-FileHash -LiteralPath $candidate).Hash -cne $savedHash){throw 'Diagnostic BTW changed during unsaved reopen challenges.'}
        $report.core.saveReopen=if($reopenFailed){'ONE_OR_MORE_CHECKS_FAILED'}else{'READBACK_CHECKS_COMPLETE'}
        $report['diagnosticFile']=$candidate
        $report['diagnosticSha256']=$savedHash
        $report.output=$candidate
        $report.status='REVIEW_DIAGNOSTICS_COMPLETE_NOT_PRODUCT_ACCEPTANCE'
        $report.core.blocking+='Canvas/ink bounds are not decoder-confirmed symbol bounds. Barcode size acceptance and physical scanning are NOT RUN.'
    }finally{
        if($null -ne $document){try{[void](Invoke-ComMethod $document 'Close' @(1))}catch{}}
        Release-XmlCom $objects;Release-XmlCom $document
        $unchanged=((Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash -ceq $originalHash)
        $report.core['originalUnchanged']=$unchanged
        Save-CoreJson $report.core $checkpoint
        if(-not $unchanged){throw 'Original template hash changed.'}
    }
}
Export-ModuleMember -Function Invoke-CoreTest
