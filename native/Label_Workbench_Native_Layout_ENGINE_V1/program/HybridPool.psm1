Set-StrictMode -Version 2
$ErrorActionPreference='Stop'

function Invoke-HybridPoolBuild($formats,$plan,[string]$textPoolPath,[string]$runDir,[string]$baseDirectory) {
    if([string]::IsNullOrWhiteSpace($textPoolPath) -or -not(Test-Path -LiteralPath $textPoolPath -PathType Leaf)){throw 'HYBRID_TEXT_POOL_MISSING'}
    $poolHash=(Get-FileHash -LiteralPath $textPoolPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if($poolHash -cne '73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B'){throw ('HYBRID_TEXT_POOL_HASH_MISMATCH: '+$poolHash)}

    $engine=Get-Module NativeLayoutEngine -ErrorAction Stop
    return & $engine {
        param($formats,$plan,$textPoolPath,$runDir,$baseDirectory,$poolHash)

        Import-Module (Join-Path $baseDirectory 'HybridPayload.psm1') -Force -ErrorAction Stop

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
                    # All remaining slots are part of the candidate. Parked slots
                    # are protected too; unused donor graphs were already removed.
                    $xmlText=[string](Invoke-ComMethod $peer 'GetXML' @($true,$true))
                    $value=$null;$valueReadable=$false
                    try{$value=[string](Read-Property $peer 'Value');$valueReadable=$true}catch{}
                    $properties=[ordered]@{}
                    foreach($property in @('Name','Type','X','Y','RotationAngle','DoNotPrint')){$properties[$property]=Read-Property $peer $property}
                    if([int]$properties.Type -eq 4){$properties['Height']=Read-Property $peer 'Height'}
                    if([int]$properties.Type -eq 5){foreach($property in @('FontName','FontSize','FontBold','FontItalic')){$properties[$property]=Read-Property $peer $property}}
                    $rows[$peerName]=[ordered]@{xml=$xmlText;xmlKey=Get-NativeXmlKey (Read-NativeXml $xmlText);properties=$properties;valueReadable=$valueReadable;value=$value}
                }finally{Release-NativeCom $peer}
            }
            return $rows
        }
        function Assert-HybridPeerSnapshot($objects,$snapshot,[string]$prefix,[switch]$DiagnosticOnly) {
            $audit=@();$failures=@();$index=0
            foreach($peerName in @($snapshot.Keys|Sort-Object)){
                $index++;$peer=Find-NativeObject $objects $peerName
                try{
                    $before=$snapshot[$peerName]
                    $nowText=[string](Invoke-ComMethod $peer 'GetXML' @($true,$true))
                    $now=Get-NativeXmlKey (Read-NativeXml $nowText)
                    $propertyChanges=@()
                    foreach($property in $before.properties.Keys){
                        $actual=Read-Property $peer $property
                        if([string]$actual -cne [string]$before.properties[$property]){$propertyChanges+=,[ordered]@{property=$property;before=$before.properties[$property];after=$actual}}
                    }
                    $actualValue=if($before.valueReadable){[string](Read-Property $peer 'Value')}else{$null}
                    $changed=($now -cne $before.xmlKey -or $propertyChanges.Count -gt 0 -or ($before.valueReadable -and $actualValue -cne $before.value))
                    $audit+=,[ordered]@{name=$peerName;status=if($changed){'FAIL'}else{'PASS'};strictXmlEqual=($now -ceq $before.xmlKey);propertiesEqual=($propertyChanges.Count -eq 0);originalRetainedPeer=(-not [bool]$before.properties.DoNotPrint);valueEqual=if($before.valueReadable){$actualValue -ceq $before.value}else{$null}}
                    if($changed){
                        $stem=$prefix+'-peer-'+$index
                        $before.xml|Set-Content -LiteralPath ($stem+'-before.xml') -Encoding UTF8
                        $nowText|Set-Content -LiteralPath ($stem+'-after.xml') -Encoding UTF8
                        $diff=[ordered]@{name=$peerName;policy='STRICT_XML_AND_COM_NO_NORMALIZATION_EXCEPTIONS';before=Get-HybridXmlSemantics $before.xml;after=Get-HybridXmlSemantics $nowText;properties=$propertyChanges;effectiveValueBefore=$before.value;effectiveValueAfter=$actualValue;xmlChanges=@(Get-HybridXmlDifferences $before.xml $nowText)}
                        Save-NativeJson $diff ($stem+'-diff.json')
                        $failures+=,$peerName
                    }
                }finally{Release-NativeCom $peer}
            }
            Save-NativeJson ([ordered]@{status=if($failures.Count){'FAIL'}else{'PASS'};peerCount=$audit.Count;policy='ALL_RETAINED_PEERS_INCLUDING_PARKED';diagnosticOnly=[bool]$DiagnosticOnly;objects=$audit}) ($prefix+'-peer-isolation.json')
            if($failures.Count -and -not $DiagnosticOnly){throw ('Hybrid payload import modified peer XML or semantic state: '+($failures -join ', '))}
        }
        function Set-HybridPayload($objects,$obj,[string]$payload,[string]$expectedRoot,[string]$prefix,[switch]$DiagnosticFullImport) {
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
            $sparse=New-HybridPayloadImport $export $name ([string]$literal.value) $payload
            if($DiagnosticFullImport){
                # Replay the old full-document transaction only in a disposable,
                # unsaved diagnostic format. It can never publish a candidate.
                $row=@($export.SelectNodes('/Command/DataMerge/Object')|Where-Object{$_.GetAttribute('Name') -ceq $name})[0]
                $row.SelectSingleNode('./SubString/Value').InnerText=$sparse.SelectSingleNode('/Command/DataMerge/Object/SubString/Value').InnerText
            }else{$export=$sparse}
            if($prefix){$beforeText|Set-Content -LiteralPath ($prefix+'-payload-before.xml') -Encoding UTF8;$export.OuterXml|Set-Content -LiteralPath ($prefix+'-payload-import.xml') -Encoding UTF8}
            $ok=Invoke-ComMethod $objects 'ImportDataSourceValuesFromXML' @($export.OuterXml);if(-not [bool]$ok){throw 'Hybrid ImportDataSourceValuesFromXML returned false.'}
            $readText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));if($prefix){$readText|Set-Content -LiteralPath ($prefix+'-payload-readback.xml') -Encoding UTF8}
            $read=Read-NativeXml $readText;$state=Get-NativeLiteralState $read $expectedRoot
            if($state.value -cne $payload -or [string](Read-Property $obj 'Value') -cne $payload){throw 'Hybrid target payload readback mismatch.'}
            if($state.sourceId -cne $id){throw 'Hybrid target source identity changed.'}
            $expectedTarget=Read-NativeXml $beforeText
            $expectedTarget.SelectSingleNode('/*/*[local-name()="DataSources"]/*/*[local-name()="Value"]').InnerText=$payload
            $expectedSources=$expectedTarget.SelectSingleNode('/*/*[local-name()="DataSources"]')
            $actualSources=$read.SelectSingleNode('/*/*[local-name()="DataSources"]')
            if((Get-NativeXmlKey $actualSources) -cne (Get-NativeXmlKey $expectedSources) -or $read.DocumentElement.GetAttribute('Name') -cne $before.DocumentElement.GetAttribute('Name')){throw 'Hybrid import changed protected target source or identity.'}
            Assert-HybridPeerSnapshot $objects $peers $prefix -DiagnosticOnly:$DiagnosticFullImport
            return $state
        }
        function Get-HybridCleanTextSlots($objects,[int]$needed) {
            if($needed -eq 0){return @()}
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
        function Set-HybridText($objects,[string]$name,$request,[string]$prefix,[switch]$DiagnosticFullImport) {
            $obj=Find-NativeObject $objects $name
            try{
                if([int](Read-Property $obj 'Type') -ne 5){throw 'Hybrid selected slot is not Text.'}
                $stylePeers=Get-HybridPeerSnapshot $objects $name
                $anchor=Set-HybridTopLeft $obj $prefix
                $payload=Set-HybridPayload $objects $obj ([string]$request.value) 'Text' $prefix -DiagnosticFullImport:$DiagnosticFullImport
                $bold=($null -ne $request.PSObject.Properties['bold'] -and [bool]$request.bold)
                $italic=($null -ne $request.PSObject.Properties['italic'] -and [bool]$request.italic)
                $targets=[ordered]@{FontName=[string]$request.fontName;FontSize=[double]$request.fontSizePt;FontBold=$bold;FontItalic=$italic;RotationAngle=[double]$request.rotationDeg;X=[double]$request.xMm;Y=[double]$request.yMm}
                $alignmentEvidence=$null
                Write-Property $obj 'DoNotPrint' $false
                if($isGeneralCandidate){
                    Add-Type -AssemblyName System.Drawing
                    $family=New-Object System.Drawing.FontFamily -ArgumentList ([string]$request.fontName)
                    try{if($family.Name -cne [string]$request.fontName){throw ('Font substitution is prohibited: '+$request.fontName)}}finally{$family.Dispose()}
                }
                if($request.alignment -cne 'left' -or $request.rotationDeg -ne 0){
                    foreach($key in @('FontName','FontSize','FontBold','FontItalic')){Write-Property $obj $key $targets[$key]}
                    Write-Property $obj 'RotationAngle' ([double]0)
                    $measure=Export-NativeMeasurement $obj ($prefix+'-upright.bmp') 600
                    if($measure.physicalMmTrust -cne 'TRUSTED'){throw 'Untrusted Text alignment measurement.'}
                    $excess=[double]$request.widthMm-[double]$measure.inkWidthMm
                    if($excess -lt -0.02){throw ('Text ink exceeds canonical frame: '+$request.id)}
                    $shift=if($request.alignment -ceq 'center'){$excess/2}elseif($request.alignment -ceq 'right'){$excess}else{0.0}
                    $radians=-[double]$request.rotationDeg*[math]::PI/180
                    $targets.X=[double]$request.xMm+$shift*[math]::Cos($radians)
                    $targets.Y=[double]$request.yMm+$shift*[math]::Sin($radians)
                    $alignmentEvidence=[ordered]@{policy='CANONICAL_FRAME_ALIGNED_USING_NATIVE_INK';alignment=[string]$request.alignment;upright=$measure;shiftMm=$shift;targetX=$targets.X;targetY=$targets.Y}
                }
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
                Assert-HybridPeerSnapshot $objects $stylePeers ($prefix+'-style') -DiagnosticOnly:$DiagnosticFullImport
                $xml=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));if($prefix){$xml|Set-Content -LiteralPath ($prefix+'-presave.xml') -Encoding UTF8}
                return [ordered]@{anchor=$anchor;payload=$payload;properties=$properties;anchorAfterProperties=$afterAnchor.mode;alignmentEvidence=$alignmentEvidence}
            }finally{Release-NativeCom $obj}
        }
        function Set-HybridBarcodeGeometry($obj,$request,[string]$root,[string]$prefix) {
            $beforeText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$before=Read-NativeXml $beforeText
            $literal=Get-NativeLiteralState $before $root
            if((Get-NativeHumanReadableVisibility $before) -cne 'None'){throw 'Hybrid barcode caption must be None before geometry.'}
            $beforeData=$before.SelectSingleNode('/*/*[local-name()="DataSources"]');if($null -eq $beforeData){throw 'Hybrid barcode DataSources missing before geometry.'}
            $beforeX=Get-NativeXDimension $before
            $write=Read-NativeXml $beforeText;$write.DocumentElement.SetAttribute('ReferencePoint','TopLeft')
            if($prefix){$beforeText|Set-Content -LiteralPath ($prefix+'-anchor-before.xml') -Encoding UTF8;$write.OuterXml|Set-Content -LiteralPath ($prefix+'-anchor-request.xml') -Encoding UTF8}
            [void](Invoke-ComMethod $obj 'SetXML' @($write.OuterXml))
            $anchor=Get-HybridAnchorState $obj
            if($prefix){$anchor.xml|Set-Content -LiteralPath ($prefix+'-anchor-readback.xml') -Encoding UTF8}
            if(-not $anchor.accepted){throw ('Hybrid barcode TopLeft anchor not accepted: '+[string]$anchor.value)}
            $afterAnchor=Read-NativeXml $anchor.xml;$afterLiteral=Get-NativeLiteralState $afterAnchor $root
            if($afterLiteral.value -cne $literal.value){throw 'Hybrid barcode anchor write changed payload.'}
            if((Get-NativeHumanReadableVisibility $afterAnchor) -cne 'None'){throw 'Hybrid barcode anchor write changed HumanReadable.'}
            $afterData=$afterAnchor.SelectSingleNode('/*/*[local-name()="DataSources"]')
            if($null -eq $afterData -or (Get-NativeXmlKey $beforeData) -cne (Get-NativeXmlKey $afterData)){throw 'Hybrid barcode anchor write changed DataSources.'}
            $afterX=Get-NativeXDimension $afterAnchor
            if($afterX.index -ne $beforeX.index){throw 'Hybrid barcode anchor write changed XDimension index.'}
            Assert-NativeNear ([double]$afterX.mils) ([double]$beforeX.mils) 0.02 'Hybrid barcode anchor XDimension mils'

            $targets=[ordered]@{}
            if($request.type -eq 'code128'){$targets['Height']=[double]$request.heightMm}
            $targets['RotationAngle']=[double]$request.rotationDeg;$targets['X']=[double]$request.xMm;$targets['Y']=[double]$request.yMm
            $properties=[ordered]@{}
            foreach($key in @($targets.Keys)){
                Write-Property $obj $key $targets[$key]
                $actual=Read-Property $obj $key;$target=$targets[$key]
                # Real BarTender/Argox evidence quantizes coordinates: 70.000 ->
                # 69.977 mm. 0.05 mm is only a COM readback gate; the 600dpi
                # full-page BMP Visual QA remains the placement authority.
                $tol=if($key -in @('X','Y')){0.05}elseif($key -eq 'Height'){0.10}else{0.01}
                Assert-NativeNear ([double]$actual) ([double]$target) $tol ('Hybrid barcode '+$request.id+'.'+$key)
                $properties[$key]=[ordered]@{requested=$target;actual=[double]$actual;tolerance=$tol}
            }
            $finalText=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true));$final=Read-NativeXml $finalText
            if($prefix){$finalText|Set-Content -LiteralPath ($prefix+'-geometry-presave.xml') -Encoding UTF8}
            $finalLiteral=Get-NativeLiteralState $final $root
            if($finalLiteral.value -cne $literal.value){throw 'Hybrid barcode geometry changed payload.'}
            if((Get-NativeHumanReadableVisibility $final) -cne 'None'){throw 'Hybrid barcode geometry changed HumanReadable.'}
            $finalX=Get-NativeXDimension $final
            if($finalX.index -ne $beforeX.index){throw 'Hybrid barcode geometry changed selected XDimension index.'}
            Assert-NativeNear ([double]$finalX.mils) ([double]$beforeX.mils) 0.02 'Hybrid barcode final XDimension mils'
            $finalAnchor=Get-HybridAnchorState $obj;if(-not $finalAnchor.accepted){throw 'Hybrid barcode anchor changed after geometry writes.'}
            return [ordered]@{status='TARGET_GEOMETRY_WITHIN_TOLERANCE_VISUAL_PENDING';anchor=[ordered]@{status='PASS_VISUAL_PENDING';mode=$finalAnchor.mode;serialized=$finalAnchor.value};properties=$properties;xDimension=$finalX}
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

        function Capture-HybridLegacyDiagnostic {
            $diagDir=Join-Path $runDir 'legacy-payload-diagnostic';[void][IO.Directory]::CreateDirectory($diagDir)
            $doc=$null;$objs=$null;$summary=[ordered]@{diagnosticOnly=$true;candidatePublication='PROHIBITED';imports=@();status='STARTED'}
            try{
                $doc=Invoke-ComMethod $formats 'Open' @($textPoolPath,$false,'');Write-Property $doc 'MeasurementUnits' 3
                [void](Set-NativePage $doc $plan);$objs=Read-Property $doc 'Objects'
                foreach($n in @(Get-NativeObjectNames $objs)){
                    $peer=Find-NativeObject $objs $n
                    try{Write-Property $peer 'DoNotPrint' $true}finally{Release-NativeCom $peer}
                }
                $requests=@($plan.objects|Where-Object{$_.type -eq 'text'}|Select-Object -First 3)
                $slots=@(Get-HybridCleanTextSlots $objs $requests.Count)
                for($i=0;$i -lt $requests.Count;$i++){
                    ('Legacy diagnostic '+$requests[$i].id)|Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
                    [void](Set-HybridText $objs ([string]$slots[$i]) $requests[$i] (Join-Path $diagDir ('legacy-'+$requests[$i].id)) -DiagnosticFullImport)
                    $summary.imports+=,[string]$requests[$i].id
                }
                $summary.status='DIAGNOSTIC_CAPTURED_NOT_ACCEPTANCE'
            }catch{$summary.status='DIAGNOSTIC_STOPPED';$summary['error']=$_.Exception.ToString()}
            finally{
                Release-NativeCom $objs
                if($null -ne $doc){try{[void](Invoke-ComMethod $doc 'Close' @(1))}catch{$summary['closeError']=$_.Exception.ToString()};Release-NativeCom $doc}
                Save-NativeJson $summary (Join-Path $diagDir 'summary.json')
            }
        }
        # One bounded legacy replay in this engineering stress run captures the
        # previously missing peer delta; the production transaction stays strict.
        $isGeneralCandidate=($null -ne $plan.PSObject.Properties['runtimeProfile'] -and $plan.runtimeProfile -ceq 'candidate-general-v1')
        if(-not $isGeneralCandidate -and @($plan.objects|Where-Object{$_.type -eq 'text'}).Count -ge 3){Capture-HybridLegacyDiagnostic}

        $candidate=Join-Path $runDir 'candidate.unverified.btw';$accepted=Join-Path $runDir 'native-output.btw'
        $document=$null;$objects=$null;$reopenDoc=$null;$reopenObjects=$null
        $report=[ordered]@{schema='lwb-hybrid-pool-build-report-v1';status='STARTED';renderer='hybrid-text-pool-btc';productAcceptance='NOT_RUN';textPool=[ordered]@{path=$textPoolPath;sha256=$poolHash};page=$null;objects=@();warnings=@('Designer-authored Text slots are reused; unused donor objects are deleted from the disposable candidate copy before any payload assignment; the embedded donor source remains unchanged.','An omitted ReferencePoint after an explicit TopLeft request is accepted only pending final unique full-page BMP Visual QA.');output=$null;outputSha256=$null;reopen='NOT_RUN'}
        try{
            $document=Invoke-ComMethod $formats 'Open' @($textPoolPath,$false,'');if($null -eq $document){throw 'Hybrid Formats.Open returned null.'}
            Write-Property $document 'MeasurementUnits' 3
            $report.page=Set-NativePage $document $plan
            $objects=Read-Property $document 'Objects'
            $originalNames=@(Get-NativeObjectNames $objects)
            foreach($name in $originalNames){$o=Find-NativeObject $objects $name;try{Write-Property $o 'DoNotPrint' $true;if(-not [bool](Read-Property $o 'DoNotPrint')){throw ('Hybrid could not park donor object: '+$name)}}finally{Release-NativeCom $o}}

            $textRequests=@($plan.objects|Where-Object{$_.type -eq 'text'})
            $textSlots=@(Get-HybridCleanTextSlots $objects $textRequests.Count)
            $unusedNames=@($originalNames|Where-Object{-not ($textSlots -ccontains [string]$_)})
            foreach($unusedName in $unusedNames){
                $deleted=[bool](Invoke-ComMethod $objects 'Delete' @([string]$unusedName))
                if(-not $deleted){throw ('Hybrid failed to delete unused donor object: '+$unusedName)}
            }
            Release-NativeCom $objects;$objects=$null;$objects=Read-Property $document 'Objects'
            $expectedTextNames=@($textSlots)
            Assert-NativeNameSet $expectedTextNames @(Get-NativeObjectNames $objects)
            Assert-NativeSourceIsolation $objects
            $report['deletedUnusedDonorObjects']=$unusedNames.Count

            for($i=0;$i -lt $textRequests.Count;$i++){
                ('Hybrid candidate '+$textRequests[$i].id)|Set-Content -LiteralPath (Join-Path $runDir 'LIVE_STAGE.txt') -Encoding UTF8
                $request=$textRequests[$i];$name=[string]$textSlots[$i]
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
                    $geometryPeers=Get-HybridPeerSnapshot $objects $name
                    $human=Hide-NativeCode128HumanReadable $obj ($prefix+'-human-readable') $root
                    Write-Property $obj 'RotationAngle' ([double]0)
                    if($request.type -eq 'code128'){Write-Property $obj 'Height' ([double]$request.heightMm)}
                    $sizing=Fit-NativeXDimensionNearest $obj $request ($prefix+'-size') $dpi
                    if($request.rotationDeg -ne 0){[void](Export-NativeMeasurement $obj ($prefix+'-upright.bmp') 600)}
                    $geometry=Set-HybridBarcodeGeometry $obj $request $root $prefix
                    Assert-HybridPeerSnapshot $objects $geometryPeers ($prefix+'-geometry')
                    Write-Property $obj 'DoNotPrint' $false;if([bool](Read-Property $obj 'DoNotPrint')){throw 'Hybrid barcode remained DoNotPrint.'}
                    $report.objects+=,[ordered]@{id=[string]$request.id;type=[string]$request.type;physicalName=$name;nativeType=4;humanReadable=$human;sizing=$sizing;geometry=$geometry;reopenEditable='NOT_RUN'}
                }finally{Release-NativeCom $obj}
            }

            Assert-NativeSourceIsolation $objects
            Assert-NativeNameSet @($report.objects|ForEach-Object{[string]$_.physicalName}) @(Get-NativeObjectNames $objects)
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
                    Assert-NativeNear ([double](Read-Property $obj 'X')) ([double]$entry.geometry.properties.X.requested) 0.05 ('Hybrid reopen X '+$request.id)
                    Assert-NativeNear ([double](Read-Property $obj 'Y')) ([double]$entry.geometry.properties.Y.requested) 0.05 ('Hybrid reopen Y '+$request.id)
                    Assert-NativeNear ([double](Read-Property $obj 'RotationAngle')) ([double]$request.rotationDeg) 0.01 ('Hybrid reopen Rotation '+$request.id)
                    if([bool](Read-Property $obj 'DoNotPrint')){throw ('Hybrid reopen object hidden: '+$request.id)}
                    if($request.type -eq 'text'){
                        if([string](Read-Property $obj 'FontName') -cne [string]$request.fontName){throw ('Hybrid reopen FontName mismatch: '+$request.id)}
                        Assert-NativeNear ([double](Read-Property $obj 'FontSize')) ([double]$request.fontSizePt) 0.02 ('Hybrid reopen FontSize '+$request.id)
                        foreach($flag in @('bold','italic')){
                            $expectedFlag=($null -ne $request.PSObject.Properties[$flag] -and [bool]$request.$flag)
                            $property=if($flag -ceq 'bold'){'FontBold'}else{'FontItalic'}
                            if([bool](Read-Property $obj $property) -ne $expectedFlag){throw ('Hybrid reopen text style mismatch: '+$request.id+'.'+$flag)}
                        }
                        $a=Get-HybridAnchorState $obj;if(-not $a.accepted){throw ('Hybrid reopen Text anchor mismatch: '+$request.id)}
                    }else{
                        $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)));if((Get-NativeHumanReadableVisibility $xml) -cne 'None'){throw ('Hybrid reopen caption visible: '+$request.id)}
                        $reopenedX=Get-NativeXDimension $xml
                        if($reopenedX.index -ne $request.moduleIndex){throw ('Hybrid reopen module index mismatch: '+$request.id)}
                        Assert-NativeNear ([double]$reopenedX.mils*0.0254) ([double]$request.moduleMm) 0.001 ('Hybrid reopen module '+$request.id)
                        if($request.type -ceq 'code128'){Assert-NativeNear ([double](Read-Property $obj 'Height')) ([double]$request.heightMm) 0.10 ('Hybrid reopen bar height '+$request.id)}
                        $a=Get-HybridAnchorState $obj;if(-not $a.accepted){throw ('Hybrid reopen barcode anchor mismatch: '+$request.id)}
                    }
                    $entry.reopenEditable='PAYLOAD_GEOMETRY_STYLE_PERSISTED'
                    if($isGeneralCandidate){
                        $beforeChallenge=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
                        $root=if($request.type -ceq 'text'){'Text'}elseif($request.type -ceq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
                        $prefix=Join-Path $runDir ('editable-'+$request.id)
                        [void](Set-HybridPayload $reopenObjects $obj ('EDIT_'+$request.id) $root ($prefix+'-challenge'))
                        [void](Set-HybridPayload $reopenObjects $obj ([string]$request.value) $root ($prefix+'-restore'))
                        $afterChallenge=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))
                        if((Get-NativeXmlKey (Read-NativeXml $beforeChallenge)) -cne (Get-NativeXmlKey (Read-NativeXml $afterChallenge))){throw ('Editability roundtrip did not restore exact object XML: '+$request.id)}
                        $entry.reopenEditable='CHALLENGE_RESTORE_EXACT_XML_AND_PEER_ISOLATION_PASS'
                    }
                }finally{Release-NativeCom $obj}
            }
            Assert-NativeNameSet @($report.objects|ForEach-Object{[string]$_.physicalName}) @(Get-NativeObjectNames $reopenObjects)
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
