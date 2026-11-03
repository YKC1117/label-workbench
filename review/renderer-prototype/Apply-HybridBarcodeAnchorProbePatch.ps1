[CmdletBinding()]
param([string]$HybridModulePath='')
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($HybridModulePath)){$HybridModulePath=Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\HybridPool.psm1'}
$HybridModulePath=[IO.Path]::GetFullPath($HybridModulePath)
if(-not(Test-Path -LiteralPath $HybridModulePath -PathType Leaf)){throw ('HybridPool.psm1 not found: '+$HybridModulePath)}
$text=[IO.File]::ReadAllText($HybridModulePath,[Text.Encoding]::UTF8)
$marker='function Insert-HybridComponent($document,[ref]$objectsRef,[string]$path,[string]$expectedRoot,$request,[string]$prefix) {'
if(([regex]::Matches($text,[regex]::Escape($marker))).Count -ne 1){throw 'Hybrid barcode geometry insertion marker missing or ambiguous.'}
if($text.Contains('function Set-HybridBarcodeGeometry(')){throw 'Hybrid barcode geometry patch already present in tracked source; remove runtime patch instead of double-applying.'}
$helper=@'
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
                # BarTender stores coordinates on the active printer/grid quantum.
                # Real CP-3140 evidence observed 70.000 -> 69.977 mm (0.023 mm),
                # so 0.05 mm is a readback/quantization gate only. Independent
                # 600dpi BMP registration remains the placement acceptance gate.
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
'@
$text=$text.Replace($marker,$helper+"`n        "+$marker)
$old='$geometry=Set-NativeGeometry $obj $request $prefix'
$new='$geometry=Set-HybridBarcodeGeometry $obj $request $root $prefix'
if(([regex]::Matches($text,[regex]::Escape($old))).Count -ne 1){throw 'Expected exactly one Hybrid Set-NativeGeometry barcode call.'}
$text=$text.Replace($old,$new)
$reopenX="Assert-NativeNear ([double](Read-Property `$obj 'X')) ([double]`$request.xMm) 0.02 ('Hybrid reopen X '+`$request.id)"
$reopenY="Assert-NativeNear ([double](Read-Property `$obj 'Y')) ([double]`$request.yMm) 0.02 ('Hybrid reopen Y '+`$request.id)"
foreach($pair in @(@($reopenX,$reopenX.Replace(' 0.02 ',' 0.05 ')),@($reopenY,$reopenY.Replace(' 0.02 ',' 0.05 ')))){
    if(([regex]::Matches($text,[regex]::Escape([string]$pair[0]))).Count -ne 1){throw ('Expected exactly one reopen coordinate tolerance source: '+[string]$pair[0])}
    $text=$text.Replace([string]$pair[0],[string]$pair[1])
}
if(-not $text.Contains('TARGET_GEOMETRY_WITHIN_TOLERANCE_VISUAL_PENDING')){throw 'Hybrid barcode geometry patch marker missing after replacement.'}
[IO.File]::WriteAllText($HybridModulePath,$text,(New-Object Text.UTF8Encoding($true)))
Write-Host 'Prototype Hybrid barcode default-TopLeft geometry + 0.05 mm coordinate quantization patch applied.' -ForegroundColor Green
