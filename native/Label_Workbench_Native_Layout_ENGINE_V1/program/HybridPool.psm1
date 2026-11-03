Set-StrictMode -Version 2
$ErrorActionPreference='Stop'

function Invoke-HybridPoolBuild($formats,$plan,[string]$textPoolPath,[string]$runDir,[string]$baseDirectory) {
    if([string]::IsNullOrWhiteSpace($textPoolPath) -or -not(Test-Path -LiteralPath $textPoolPath -PathType Leaf)){throw 'HYBRID_TEXT_POOL_MISSING'}
    $poolHash=(Get-FileHash -LiteralPath $textPoolPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if($poolHash -cne '73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B'){throw ('HYBRID_TEXT_POOL_HASH_MISMATCH: '+$poolHash)}

    $engine=Get-Module NativeLayoutEngine -ErrorAction Stop
    return & $engine {
        param($formats,$plan,$textPoolPath,$runDir,$baseDirectory,$poolHash)

        function Get-HybridAnchorState($obj) {
            $text=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$xml=Read-NativeXml $text
            $present=$xml.DocumentElement.HasAttribute('ReferencePoint')
            $value=if($present){[string]$xml.DocumentElement.GetAttribute('ReferencePoint')}else{$null}
            $accepted=($value -ceq 'TopLeft' -or -not $present)
            return [ordered]@{accepted=$accepted;present=$present;value=$value;mode=if($value -ceq 'TopLeft'){'EXPLICIT_TOPLEFT'}elseif(-not $present){'BARTENDER_DEFAULT_TOPLEFT_OMITTED'}else{'UNEXPECTED_REFERENCE_POINT'};xml=$text}
        }
        function Set-HybridTopLeft($obj,[string]$prefix) {
            $beforeText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$before=Read-NativeXml $beforeText
            if($before.DocumentElement.LocalName -cne 'Text'){throw 'Hybrid Text anchor requires native Text XML.'}
            $beforeData=$before.SelectSingleNode('/*/*[local-name()="DataSources"]')
            $write=Read-NativeXml $beforeText;$write.DocumentElement.SetAttribute('ReferencePoint','TopLeft')
            if($prefix){$beforeText|Set-Content -LiteralPath ($prefix+'-anchor-before.xml') -Encoding UTF8;$write.OuterXml|Set-Content -LiteralPath ($prefix+'-anchor-request.xml') -Encoding UTF8}
            [void](Invoke-ComMethod $obj 'SetXML' @($write.OuterXml))
            $state=Get-HybridAnchorState $obj
            if($prefix){$state.xml|Set-Content -LiteralPath ($prefix+'-anchor-readback.xml') -Encoding UTF8}
            if(-not $state.accepted){throw ('Hybrid Text TopLeft anchor not accepted: '+[string]$state.value)}
            $after=Read-NativeXml $state.xml;$afterData=$after.SelectSingleNode('/*/*[local-name()="DataSources"]')
            if($null -eq $beforeData -or $null -eq $afterData -or (Get-NativeXmlKey $beforeData) -cne (Get-NativeXmlKey $afterData)){throw 'Hybrid Text anchor write changed DataSources.'}
            return [ordered]@{status='PASS_VISUAL_PENDING';mode=$state.mode;serialized=$state.value}
        }
        function Get-HybridPeerSnapshot($objects,[string]$targetName) {
            $rows=@{}
            foreach($peerName in @(Get-NativeObjectNames $objects)){
                if($peerName -ceq $targetName){continue}
                $peer=Find-NativeObject $objects $peerName
                try{
                    $xmlText=[string](Invoke-ComMethod $peer 'GetXML' @($true,$true))
                    $value=$null;$valueReadable=$false
                    try{$value=[string](Read-Property $peer 'Value');$valueReadable=$true}catch{}
                    $rows[$peerName]=[ordered]@{xmlKey=Get-NativeXmlKey (Read-NativeXml $xmlText);valueReadable=$valueReadable;value=$value}
                }finally{Release-NativeCom $peer}
            }
            return $rows
        }
        function Assert-HybridPeerSnapshot($objects,$snapshot) {
            foreach($peerName in @($snapshot.Keys)){
                $peer=Find-NativeObject $objects $peerName
                try{
                    $now=Get-NativeXmlKey (Read-NativeXml ([string](Invoke-ComMethod $peer 'GetXML' @($true,$true))))
                    if($now -cne $snapshot[$peerName].xmlKey){throw ('Hybrid payload import modified peer XML: '+$peerName)}
                    if([bool]$snapshot[$peerName].valueReadable){
                        if([string](Read-Property $peer 'Value') -cne [string]$snapshot[$peerName].value){throw ('Hybrid payload import modified peer Value: '+$peerName)}
                    }
                }finally{Release-NativeCom $peer}
            }
        }
        function Set-HybridPayload($objects,$obj,[string]$payload,[string]$expectedRoot,[string]$prefix) {
            $name=[string](Read-Property $obj 'Name')
            $beforeText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$before=Read-NativeXml $beforeText
            $literal=Get-NativeLiteralState $before $expectedRoot
            $source=$before.SelectSingleNode('/*/*[local-name()="DataSources"]/*');$id=[string]$source.GetAttribute('ID')
            if([string]::IsNullOrWhiteSpace($id)){throw 'Hybrid target source has no ID.'}
            foreach($peerName in @(Get-NativeObjectNames $objects)){
                if($peerName -ceq $name){continue}
                $peer=Find-NativeObject $objects $peerName
                try{
                    $px=Read-NativeXml ([string](Invoke-ComMethod $peer 'GetXML' @($true,$true)))
                    foreach($n in @($px.SelectNodes('//*[local-name()="EmbeddedDataSource"]'))){if([string]$n.GetAttribute('ID') -ceq $id){throw ('Hybrid target source ID is shared with peer: '+$peerName)}}
                }finally{Release-NativeCom $peer}
            }
            $peers=Get-HybridPeerSnapshot $objects $name
            $export=Read-NativeXml ([string](Invoke-ComMethod $objects 'ExportDataSourceValuesToXML' @()))
            $matches=@($export.SelectNodes('//*') | Where-Object {$node=$_; @($node.Attributes | Where-Object {$_.Value -ieq $id}).Count -gt 0})
            $target=$null
            if($matches.Count -eq 1){
                if($matches[0].HasAttribute('Value')){$target=$matches[0].GetAttributeNode('Value')}
                else{$values=@($matches[0].SelectNodes('./*[local-name()="Value"]'));if($values.Count -eq 1){$target=$values[0]}}
            }
            if($null -eq $target){
                $named=@($export.SelectNodes('//*') | Where-Object {$_.HasAttribute('Name') -and $_.GetAttribute('Name') -ceq $name})
                if($named.Count -ne 1){throw ('Hybrid cannot map exported source for '+$name)}
                $values=@($named[0].SelectNodes('.//*[local-name()="Value"] | .//@Value'))
                if($values.Count -ne 1){throw ('Hybrid cannot find one exported literal value for '+$name)}
                if((Get-NativeExportedValue $values[0]) -cne [string]$literal.value){throw 'Hybrid exported source value mismatch.'}
                $target=$values[0]
            }
            Set-NativeExportedValue $target $payload
            if($prefix){$beforeText|Set-Content -LiteralPath ($prefix+'-payload-before.xml') -Encoding UTF8;$export.OuterXml|Set-Content -LiteralPath ($prefix+'-payload-import.xml') -Encoding UTF8}
            $ok=Invoke-ComMethod $objects 'ImportDataSourceValuesFromXML' @($export.OuterXml);if(-not [bool]$ok){throw 'Hybrid ImportDataSourceValuesFromXML returned false.'}
            $readText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));if($prefix){$readText|Set-Content -LiteralPath ($prefix+'-payload-readback.xml') -Encoding UTF8}
            $read=Read-NativeXml $readText;$state=Get-NativeLiteralState $read $expectedRoot
            if($state.value -cne $payload -or [string](Read-Property $obj 'Value') -cne $payload){throw 'Hybrid target payload readback mismatch.'}
            if($state.sourceId -cne $id){throw 'Hybrid target source identity changed.'}
            Assert-HybridPeerSnapshot $objects $peers
            return $state
        }
        function Get-HybridCleanTextSlots($objects,[int]$needed) {
            $slots=@()
            foreach($name in @(Get-NativeObjectNames $objects)){
                $obj=Find-NativeObject $objects $name
                try{
                    if([int](Read-Property $obj 'Type') -ne 5){continue}
                    try{
                        $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
                        [void](Get-NativeLiteralState $xml 'Text')
                        $slots+=,$name
                    }catch{continue}
                }finally{Release-NativeCom $obj}
                if($slots.Count -ge $needed){break}
            }
            if($slots.Count -lt $needed){throw ('HYBRID_TEXT_POOL_CAPACITY: '+$slots.Count+' clean Text slots for '+$needed+' requests.')}
            return @($slots)
        }
        function Set-HybridText($objects,[string]$name,$request,[string]$prefix) {
            $obj=Find-NativeObject $objects $name
            try{
                if([int](Read-Property $obj 'Type') -ne 5){throw 'Hybrid selected slot is not Text.'}
                $anchor=Set-HybridTopLeft $obj $prefix
                $payload=Set-HybridPayload $objects $obj ([string]$request.value) 'Text' $prefix
                $targets=[ordered]@{FontName=[string]$request.fontName;FontSize=[double]$request.fontSizePt;FontBold=$false;FontItalic=$false;RotationAngle=[double]$request.rotationDeg;X=[double]$request.xMm;Y=[double]$request.yMm}
                foreach($key in @($targets.Keys)){Write-Property $obj $key $targets[$key]}
                $properties=[ordered]@{}
                foreach($key in @($targets.Keys)){
                    $actual=Read-Property $obj $key;$target=$targets[$key]
                    if($key -eq 'FontName'){if([string]$actual -cne [string]$target){throw 'Hybrid Text FontName mismatch.'}}
                    elseif($key -in @('FontBold','FontItalic')){if([bool]$actual -ne [bool]$target){throw ('Hybrid Text '+$key+' mismatch.')}}
                    else{$tol=if($key -in @('X','Y')){0.02}elseif($key -eq 'RotationAngle'){0.01}else{0.02};Assert-NativeNear ([double]$actual) ([double]$target) $tol ('Hybrid Text '+$key)}
                    $properties[$key]=[ordered]@{requested=$target;actual=$actual}
                }
                Write-Property $obj 'DoNotPrint' $false;if([bool](Read-Property $obj 'DoNotPrint')){throw 'Hybrid Text remained DoNotPrint.'}
                $afterAnchor=Get-HybridAnchorState $obj;if(-not $afterAnchor.accepted){throw 'Hybrid Text anchor changed after property writes.'}
                $xml=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));if($prefix){$xml|Set-Content -LiteralPath ($prefix+'-presave.xml') -Encoding UTF8}
                return [ordered]@{anchor=$anchor;payload=$payload;properties=$properties;anchorAfterProperties=$afterAnchor.mode}
            }finally{Release-NativeCom $obj}
        }
        function Insert-HybridComponent($document,[ref]$objectsRef,[string]$path,[string]$expectedRoot,$request,[string]$prefix) {
            $objects=$objectsRef.Value;$before=@(Get-NativeObjectNames $objects)
            $ok=[bool](Invoke-ComMethod $document 'InsertComponent' @($path,[double]$request.xMm,[double]$request.yMm));if(-not $ok){throw ('Hybrid InsertComponent returned false: '+$path)}
            $objectsRef.Value=$null;Release-NativeCom $objects;$objects=$null;$objects=Read-Property $document 'Objects';$objectsRef.Value=$objects
            $after=@(Get-NativeObjectNames $objects);$delta=@(Get-NativeNameDelta $before $after)
            if($delta.Count -ne 1 -or $after.Count -ne $before.Count+1){throw 'Hybrid InsertComponent did not add exactly one object.'}
            if(@(Get-NativeNameDelta $after $before).Count){throw 'Hybrid InsertComponent removed an existing object.'}
            $name=[string]$delta[0];$obj=Find-NativeObject $objects $name
            try{
                if([int](Read-Property $obj 'Type') -ne 4){throw 'Hybrid inserted component is not barcode Type 4.'}
                $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));[void](Get-NativeLiteralState $xml $expectedRoot)
                [void](Set-HybridPayload $objects $obj ([string]$request.value) $expectedRoot ($prefix+'-payload'))
            }finally{Release-NativeCom $obj}
            return $name
        }

        $candidate=Join-Path $runDir 'candidate.unverified.btw';$accepted=Join-Path $runDir 'native-output.btw'
        $document=$null;$objects=$null;$reopenDoc=$null;$reopenObjects=$null
        $report=[ordered]@{schema='lwb-hybrid-pool-build-report-v1';status='STARTED';renderer='hybrid-text-pool-btc';productAcceptance='NOT_RUN';textPool=[ordered]@{path=$textPoolPath;sha256=$poolHash};page=$null;objects=@();warnings=@('Designer-authored Text slots are reused; unused donor objects remain hidden with DoNotPrint.','An omitted Text ReferencePoint after explicit TopLeft request is treated as BarTender default TopLeft only pending final BMP Visual QA.');output=$null;outputSha256=$null;reopen='NOT_RUN'}
        try{
            $document=Invoke-ComMethod $formats 'Open' @($textPoolPath,$false,'');if($null -eq $document){throw 'Hybrid Formats.Open returned null.'}
            Write-Property $document 'MeasurementUnits' 3
            $report.page=Set-NativePage $document $plan
            $objects=Read-Property $document 'Objects'
            $originalNames=@(Get-NativeObjectNames $objects)
            foreach($name in $originalNames){$o=Find-NativeObject $objects $name;try{Write-Property $o 'DoNotPrint' $true;if(-not [bool](Read-Property $o 'DoNotPrint')){throw ('Hybrid could not park donor object: '+$name)}}finally{Release-NativeCom $o}}

            $textRequests=@($plan.objects|Where-Object{$_.type -eq 'text'})
            $textSlots=@(Get-HybridCleanTextSlots $objects $textRequests.Count)
            $usedPool=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
            for($i=0;$i -lt $textRequests.Count;$i++){
                $request=$textRequests[$i];$name=[string]$textSlots[$i];[void]$usedPool.Add($name)
                $prefix=Join-Path $runDir ('hybrid-'+$request.id)
                $state=Set-HybridText $objects $name $request $prefix
                $report.objects+=,[ordered]@{id=[string]$request.id;type='text';physicalName=$name;nativeType=5;referencePointXml=$state.anchor.serialized;geometry=$state;reopenEditable='NOT_RUN'}
            }

            $codeComponent=Join-Path $baseDirectory 'proven-code128.btc'
            if(@($plan.objects|Where-Object{$_.type -eq 'code128'}).Count -gt 0){if(-not(Test-Path -LiteralPath $codeComponent -PathType Leaf)){throw 'Bundled proven-code128.btc is missing.'};$h=(Get-FileHash -LiteralPath $codeComponent -Algorithm SHA256).Hash;if($h -cne '0B1E2481BCDE6E5CF1D084599F822DC3027AB19215530B7776296B40A59899F2'){throw 'Code128 component hash mismatch.'}}
            $dmComponent=$null;if(@($plan.objects|Where-Object{$_.type -eq 'datamatrix'}).Count -gt 0){$dmComponent=Resolve-NativeDataMatrixComponent $runDir;$report['dataMatrixComponent']=$dmComponent}
            $dpi=600
            foreach($request in @($plan.objects|Where-Object{$_.type -ne 'text'})){
                $root=if($request.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'};$component=if($request.type -eq 'code128'){$codeComponent}else{$dmComponent}
                $prefix=Join-Path $runDir ('hybrid-'+$request.id);$ref=[ref]$objects
                $name=Insert-HybridComponent $document $ref $component $root $request $prefix;$objects=$ref.Value
                $obj=Find-NativeObject $objects $name
                try{
                    $human=Hide-NativeCode128HumanReadable $obj ($prefix+'-human-readable') $root
                    Write-Property $obj 'RotationAngle' ([double]0)
                    if($request.type -eq 'code128'){Write-Property $obj 'Height' ([double]$request.heightMm)}
                    $sizing=Fit-NativeXDimensionNearest $obj $request ($prefix+'-size') $dpi
                    $geometry=Set-NativeGeometry $obj $request $prefix
                    Write-Property $obj 'DoNotPrint' $false;if([bool](Read-Property $obj 'DoNotPrint')){throw 'Hybrid barcode remained DoNotPrint.'}
                    $report.objects+=,[ordered]@{id=[string]$request.id;type=[string]$request.type;physicalName=$name;nativeType=4;humanReadable=$human;sizing=$sizing;geometry=$geometry;reopenEditable='NOT_RUN'}
                }finally{Release-NativeCom $obj}
            }

            [void](Invoke-ComMethod $document 'SaveAs' @($candidate,$false))
            Release-NativeCom $objects;$objects=$null;[void](Invoke-ComMethod $document 'Close' @(1));Release-NativeCom $document;$document=$null
            if(-not(Test-Path -LiteralPath $candidate) -or (Get-Item -LiteralPath $candidate).Length -le 0){throw 'Hybrid SaveAs produced no candidate.'}
            $savedHash=(Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
            $reopenDoc=Invoke-ComMethod $formats 'Open' @($candidate,$false,'');Write-Property $reopenDoc 'MeasurementUnits' 3
            $page=Get-NativePageState $reopenDoc
            foreach($k in @('PaperWidth','PaperHeight','LabelWidth','LabelHeight','MarginLeft','MarginRight','MarginTop','MarginBottom')){Assert-NativeNear ([double]$page[$k]) ([double]$report.page[$k]) 0.05 ('Hybrid reopen '+$k)}
            $reopenObjects=Read-Property $reopenDoc 'Objects'
            foreach($request in @($plan.objects)){
                $entry=@($report.objects|Where-Object{$_.id -ceq $request.id})[0];$obj=Find-NativeObject $reopenObjects ([string]$entry.physicalName)
                try{
                    $expectedType=if($request.type -eq 'text'){5}else{4};if([int](Read-Property $obj 'Type') -ne $expectedType){throw ('Hybrid reopen Type mismatch: '+$request.id)}
                    if([string](Read-Property $obj 'Value') -cne [string]$request.value){throw ('Hybrid reopen payload mismatch: '+$request.id)}
                    Assert-NativeNear ([double](Read-Property $obj 'X')) ([double]$request.xMm) 0.02 ('Hybrid reopen X '+$request.id)
                    Assert-NativeNear ([double](Read-Property $obj 'Y')) ([double]$request.yMm) 0.02 ('Hybrid reopen Y '+$request.id)
                    Assert-NativeNear ([double](Read-Property $obj 'RotationAngle')) ([double]$request.rotationDeg) 0.01 ('Hybrid reopen Rotation '+$request.id)
                    if([bool](Read-Property $obj 'DoNotPrint')){throw ('Hybrid reopen object hidden: '+$request.id)}
                    if($request.type -eq 'text'){
                        if([string](Read-Property $obj 'FontName') -cne [string]$request.fontName){throw ('Hybrid reopen FontName mismatch: '+$request.id)}
                        Assert-NativeNear ([double](Read-Property $obj 'FontSize')) ([double]$request.fontSizePt) 0.02 ('Hybrid reopen FontSize '+$request.id)
                        if([bool](Read-Property $obj 'FontBold') -or [bool](Read-Property $obj 'FontItalic')){throw ('Hybrid reopen text style mismatch: '+$request.id)}
                        $a=Get-HybridAnchorState $obj;if(-not $a.accepted){throw ('Hybrid reopen Text anchor mismatch: '+$request.id)}
                    }else{
                        $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));if((Get-NativeHumanReadableVisibility $xml) -cne 'None'){throw ('Hybrid reopen caption visible: '+$request.id)}
                    }
                    $entry.reopenEditable='PAYLOAD_GEOMETRY_STYLE_PERSISTED'
                }finally{Release-NativeCom $obj}
            }
            foreach($name in $originalNames){if($usedPool.Contains($name)){continue};$o=Find-NativeObject $reopenObjects $name;try{if(-not [bool](Read-Property $o 'DoNotPrint')){throw ('Hybrid unused donor object became printable: '+$name)}}finally{Release-NativeCom $o}}
            Release-NativeCom $reopenObjects;$reopenObjects=$null;[void](Invoke-ComMethod $reopenDoc 'Close' @(1));Release-NativeCom $reopenDoc;$reopenDoc=$null
            if((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -cne $savedHash){throw 'Hybrid reopen verification changed candidate file.'}
            Move-Item -LiteralPath $candidate -Destination $accepted -Force
            $report.output=$accepted;$report.outputSha256=(Get-FileHash -LiteralPath $accepted -Algorithm SHA256).Hash;$report.reopen='PASS';$report.status='VERIFIED_CANDIDATE_VISUAL_PENDING'
            return $report
        }catch{
            $report.status='FAILED_OR_BLOCKED';$report['error']=$_.Exception.ToString();$report|ConvertTo-Json -Depth 24|Set-Content -LiteralPath (Join-Path $runDir 'native-build-report.json') -Encoding UTF8
            throw
        }finally{
            Release-NativeCom $reopenObjects
            if($null -ne $reopenDoc){try{[void](Invoke-ComMethod $reopenDoc 'Close' @(1))}catch{};Release-NativeCom $reopenDoc}
            Release-NativeCom $objects
            if($null -ne $document){try{[void](Invoke-ComMethod $document 'Close' @(1))}catch{};Release-NativeCom $document}
        }
    } $formats $plan $textPoolPath $runDir $baseDirectory $poolHash
}

Export-ModuleMember -Function Invoke-HybridPoolBuild
