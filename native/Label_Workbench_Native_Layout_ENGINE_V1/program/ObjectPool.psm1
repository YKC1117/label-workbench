Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
# The existing engine owns COM transport and geometry. Work in its module scope
# so pool and BTC use exactly the same setter/readback implementation.
function Invoke-ObjectPoolBuild($formats,$plan,[string]$selectionPath,[string]$runDir){
    $selection=Get-Content -LiteralPath $selectionPath -Raw -Encoding UTF8|ConvertFrom-Json
    $engine=Get-Module NativeLayoutEngine
    if($null -eq $engine){throw 'Native engine must be loaded.'}
    return & $engine {
        param($formats,$plan,$selection,$runDir)
        $doc=$null;$objects=$null;$candidate=Join-Path $runDir 'pool.unverified.btw'
        $report=[ordered]@{schema='lwb-pool-report-v1';renderer='object-pool';status='STARTED';objects=@();output=$null;reopen='NOT_RUN';productAcceptance='NOT_RUN'}
        try{
            if((Get-FileHash -LiteralPath $selection.path -Algorithm SHA256).Hash -ine $selection.sha256){throw 'Pool identity changed.'}
            $doc=Invoke-ComMethod $formats 'Open' @([string]$selection.path,$false,'')
            $report['page']=Set-NativePage $doc $plan
            $objects=Read-Property $doc 'Objects'
            Assert-NativeNameSet @($selection.slots|ForEach-Object{$_.name}) @(Get-NativeObjectNames $objects)
            foreach($slot in $selection.slots){
                $obj=Find-NativeObject $objects $slot.name
                try{
                    Write-Property $obj 'DoNotPrint' $true
                    if(-not [bool](Read-Property $obj 'DoNotPrint')){throw 'Pool park ignored.'}
                }finally{Release-NativeCom $obj}
            }
            $snapshots=@()
            foreach($assignment in $selection.assignments){
                $request=@($plan.objects|Where-Object{$_.id -ceq $assignment.id})[0]
                $obj=Find-NativeObject $objects $assignment.name
                try{
                    $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
                    $root=if($request.type -eq 'text'){'Text'}elseif($request.type -eq 'code128'){'BarCode-Code-128'}else{'BarCode-DataMatrix'}
                    if($xml.DocumentElement.LocalName -cne $root -or $xml.DocumentElement.GetAttribute('ReferencePoint') -cne 'TopLeft'){throw 'Pool root/anchor is not certified.'}
                    $sources=Get-NativeDataSourceState $xml
                    if($sources.count -ne 1 -or $sources.embeddedCount -ne 1 -or $sources.objectValueCount -ne 0){throw 'Pool object must have one editable embedded source.'}
                    if(@($xml.SelectNodes('/*/*[local-name()="DataSources"]//*[contains(local-name(),"Transform") and local-name()!="Transforms"]')).Count){throw 'Pool source transform is unsupported.'}
                    $expectedType=if($request.type -eq 'text'){5}else{4}
                    if([int](Read-Property $obj 'Type') -ne $expectedType){throw 'Pool native Type mismatch.'}
                    # Named binding is tested behaviorally, not inferred from XML attribute spelling.
                    $peer=@{}
                    foreach($other in $selection.slots){$peer[$other.name]=[string](Invoke-ComMethod $doc 'GetNamedSubStringValue' @([string]$other.namedSubString))}
                    [void](Invoke-ComMethod $doc 'SetNamedSubStringValue' @([string]$assignment.namedSubString,[string]$request.value))
                    if([string](Read-Property $obj 'Value') -cne $request.value){throw 'Named binding did not update intended object.'}
                    foreach($other in $selection.slots){
                        if($other.name -cne $assignment.name -and [string](Invoke-ComMethod $doc 'GetNamedSubStringValue' @([string]$other.namedSubString)) -cne $peer[$other.name]){throw 'Pool datasource alias detected.'}
                    }
                    $prefix=Join-Path $runDir ('pool-'+$request.id)
                    if($request.type -ne 'text'){
                        if((Get-NativeHumanReadableVisibility $xml) -cne 'None'){throw 'Pool barcode must be authored with caption hidden.'}
                        Write-Property $obj 'RotationAngle' ([double]0)
                        # Explicit module path does not inspect or rewrite NamedSubString bindings.
                        [void](Fit-NativeXDimensionNearest $obj $request ($prefix+'-module') 600)
                    }
                    $geometryRequest=$request
                    if($request.type -eq 'text'){
                        $sourcesBefore=Get-NativeXmlKey ($xml.SelectSingleNode('/*/*[local-name()="DataSources"]'))
                        $styles=[ordered]@{FontName=[string]$request.fontName;FontSize=[double]$request.fontSizePt;FontBold=[bool]$request.bold;FontItalic=[bool]$request.italic}
                        foreach($key in $styles.Keys){Write-Property $obj $key $styles[$key]}
                        foreach($key in $styles.Keys){
                            $read=Read-Property $obj $key
                            if($key -eq 'FontName'){if([string]$read -cne $styles[$key]){throw 'Pool font substitution.'}}
                            else{Assert-NativeNear ([double]$read) ([double]$styles[$key]) 0.02 ('Pool style '+$key)}
                        }
                        $afterStyle=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
                        if((Get-NativeXmlKey ($afterStyle.SelectSingleNode('/*/*[local-name()="DataSources"]'))) -cne $sourcesBefore){throw 'Pool font write changed datasource bindings.'}
                        $geometryRequest=$request.PSObject.Copy();$geometryRequest.type='pool-text'
                    }
                    [void](Set-NativeGeometry $obj $geometryRequest $prefix)
                    if($request.type -eq 'text'){
                        foreach($key in $styles.Keys){
                            $read=Read-Property $obj $key
                            if($key -eq 'FontName'){if([string]$read -cne $styles[$key]){throw 'Pool final font mismatch.'}}
                            else{Assert-NativeNear ([double]$read) ([double]$styles[$key]) 0.02 ('Pool final style '+$key)}
                        }
                    }
                    if([string](Read-Property $obj 'Value') -cne $request.value){throw 'Pool geometry changed payload.'}
                    Write-Property $obj 'DoNotPrint' $false
                    $snapshots+=,[pscustomobject]@{request=$request;assignment=$assignment;xml=[string](Invoke-ComMethod $obj 'GetXML' @($true,$true))}
                    $report.objects+=,[ordered]@{id=$request.id;type=$request.type;physicalName=$assignment.name;persistence='NOT_RUN'}
                }finally{Release-NativeCom $obj}
            }
            [void](Invoke-ComMethod $doc 'SaveAs' @($candidate,$false))
            Release-NativeCom $objects;$objects=$null
            [void](Invoke-ComMethod $doc 'Close' @(1));Release-NativeCom $doc;$doc=$null
            $hash=(Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
            $doc=Invoke-ComMethod $formats 'Open' @($candidate,$false,'');Write-Property $doc 'MeasurementUnits' 3
            $objects=Read-Property $doc 'Objects'
            foreach($s in $snapshots){
                $obj=Find-NativeObject $objects $s.assignment.name
                try{
                    $xml=Read-NativeXml ([string](Invoke-ComMethod $obj 'GetXML' @($true,$true)))
                    if((Get-NativeXmlKey $xml) -cne (Get-NativeXmlKey (Read-NativeXml $s.xml)) -or [string](Read-Property $obj 'Value') -cne $s.request.value -or [bool](Read-Property $obj 'DoNotPrint')){throw 'Pool persistence mismatch.'}
                    if([string](Invoke-ComMethod $doc 'GetNamedSubStringValue' @([string]$s.assignment.namedSubString)) -cne $s.request.value){throw 'Named value persistence mismatch.'}
                }finally{Release-NativeCom $obj}
            }
            foreach($name in $selection.unused){
                $obj=Find-NativeObject $objects $name
                try{if(-not [bool](Read-Property $obj 'DoNotPrint')){throw 'Unused pool slot became printable.'}}finally{Release-NativeCom $obj}
            }
            Release-NativeCom $objects;$objects=$null;[void](Invoke-ComMethod $doc 'Close' @(1));Release-NativeCom $doc;$doc=$null
            if((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -cne $hash){throw 'Pool output changed during reopen.'}
            $output=Join-Path $runDir 'native-output.btw';Move-Item -LiteralPath $candidate -Destination $output
            $report.output=$output;$report.reopen='PASS';$report.status='POOL_REOPEN_OK'
            foreach($entry in $report.objects){$entry.persistence='SAVE_CLOSE_REOPEN_XML_AND_VALUE_OK'}
            return $report
        }catch{
            $report.status='FAILED_OR_BLOCKED';$report['error']=$_.Exception.ToString();throw
        }finally{
            Release-NativeCom $objects
            if($null -ne $doc){try{[void](Invoke-ComMethod $doc 'Close' @(1))}catch{}}
            Release-NativeCom $doc
            Save-NativeJson $report (Join-Path $runDir 'pool-report.json')
        }
    } $formats $plan $selection $runDir
}
Export-ModuleMember -Function Invoke-ObjectPoolBuild
