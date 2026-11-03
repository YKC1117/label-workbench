[CmdletBinding()]
param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $PSScriptRoot 'runner-evidence\text-xml-normalization-diagnostic.json' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$outDir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$inv = [Globalization.CultureInfo]::InvariantCulture

function Release-Com($value) {
    if ($null -ne $value -and [Runtime.InteropServices.Marshal]::IsComObject($value)) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($value) } catch {} }
}
function Add-XmlSnapshot($node,[string]$path,[hashtable]$map) {
    if ($node -isnot [System.Xml.XmlElement]) { return }
    foreach ($a in @($node.Attributes | Sort-Object Name)) { $map[$path + '/@' + $a.Name] = [string]$a.Value }
    $children = @($node.ChildNodes | Where-Object { $_ -is [System.Xml.XmlElement] })
    if ($children.Count -eq 0) { $map[$path + '/#text'] = [string]$node.InnerText }
    $seen=@{}
    foreach($child in $children){$name=[string]$child.LocalName;if(-not $seen.ContainsKey($name)){$seen[$name]=0};$seen[$name]=[int]$seen[$name]+1;Add-XmlSnapshot $child ($path+'/'+$name+'['+$seen[$name]+']') $map}
}
function Get-XmlSnapshot([string]$text){$doc=New-Object System.Xml.XmlDocument;$doc.PreserveWhitespace=$true;$doc.LoadXml($text);$map=@{};Add-XmlSnapshot $doc.DocumentElement ('/'+$doc.DocumentElement.LocalName+'[1]') $map;return $map}
function Compare-XmlText([string]$before,[string]$after){$a=Get-XmlSnapshot $before;$b=Get-XmlSnapshot $after;$keys=@($a.Keys+$b.Keys|Sort-Object -Unique);$diff=@();foreach($key in $keys){$ha=$a.ContainsKey($key);$hb=$b.ContainsKey($key);$va=if($ha){[string]$a[$key]}else{$null};$vb=if($hb){[string]$b[$key]}else{$null};if((-not $ha)-or(-not $hb)-or $va -cne $vb){$diff += [pscustomobject]@{path=$key;before=$va;after=$vb}}};return @($diff)}
function Get-FontState([string]$xml){$d=New-Object System.Xml.XmlDocument;$d.LoadXml($xml);$f=$d.SelectSingleNode('/*/*[local-name()="Font"]');if($null -eq $f){throw 'Text XML has no direct Font.'};$o=[ordered]@{};foreach($a in @($f.Attributes|Sort-Object Name)){$o[$a.Name]=[string]$a.Value};return [pscustomobject]$o}
function Set-XmlFontTarget([string]$xml,[string]$fontName,$pointSize){$d=New-Object System.Xml.XmlDocument;$d.PreserveWhitespace=$true;$d.LoadXml($xml);$f=$d.SelectSingleNode('/*/*[local-name()="Font"]');if($null -eq $f -or -not $f.HasAttribute('FontName') -or -not $f.HasAttribute('PointSize')){throw 'Text XML lacks direct Font FontName/PointSize.'};$f.SetAttribute('FontName',$fontName);if($null -ne $pointSize){$f.SetAttribute('PointSize',([double]$pointSize).ToString('0.000',$inv))};return [string]$d.OuterXml}
function New-FreshText($objects){$created=$null;try{$created=[LabelWorkbench.ComBridge]::Call($objects,'Create',[object[]]@(5));if($null -eq $created){throw 'DesignObjects.Create(5) returned null.'};$name=[string][LabelWorkbench.ComBridge]::Get($created,'Name',[object[]]@())}finally{Release-Com $created};$found=[LabelWorkbench.ComBridge]::Call($objects,'Find',[object[]]@($name));if($null -eq $found){throw ('Find failed: '+$name)};return ,$found}

$result=[ordered]@{schema='lwb-text-xml-normalization-diagnostic-v2';status='STARTED';runtime=[ordered]@{};targetFont='Arial';scenarios=@();persistence=$null;cleanup=@()}
$app=$null;$formats=$null;$format=$null;$objects=$null;$persistName=$null;$persistBeforeSave=$null;$ownedPid=$null
$preExisting=@(Get-Process -Name BarTend -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Id)
$candidate=Join-Path $outDir 'text-xml-normalization-disposable.btw'
try{
    $bridgePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\native\Label_Workbench_Native_Layout_ENGINE_V1\program\ComBridge.cs'))
    if(-not('LabelWorkbench.ComBridge' -as [type])){Add-Type -Path $bridgePath -ErrorAction Stop}
    $app=New-Object -ComObject BarTender.Application;$ownedPid=[int][LabelWorkbench.ComBridge]::Get($app,'ProcessID',[object[]]@());if($preExisting -contains $ownedPid){throw 'Diagnostic attached to pre-existing BarTender process.'}
    foreach($p in @('FullVersion','Edition','BuildNumber')){$result.runtime[$p]=[string][LabelWorkbench.ComBridge]::Get($app,$p,[object[]]@())};$result.runtime.ProcessID=$ownedPid
    $formats=[LabelWorkbench.ComBridge]::Get($app,'Formats',[object[]]@());$format=[LabelWorkbench.ComBridge]::Call($formats,'Add',[object[]]@());$objects=[LabelWorkbench.ComBridge]::Get($format,'Objects',[object[]]@())
    foreach($size in @(12.0,9.0,18.0)){
        $obj=$null;$row=[ordered]@{label=([string]$size+'pt');requestedPointSize=$size;status='STARTED';error=$null}
        try{
            $obj=New-FreshText $objects;$row.name=[string][LabelWorkbench.ComBridge]::Get($obj,'Name',[object[]]@());$row.type=[int][LabelWorkbench.ComBridge]::Get($obj,'Type',[object[]]@())
            $baseline=[string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true));$row.baselineFont=Get-FontState $baseline;$row.baselineXml=$baseline
            $request=Set-XmlFontTarget $baseline 'Arial' $size;$row.requestFont=Get-FontState $request;$row.requestXml=$request
            [void][LabelWorkbench.ComBridge]::Call($obj,'SetXML',[object[]]@($request))
            $after=[string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true));$row.afterFont=Get-FontState $after;$row.afterXml=$after;$row.forwardDiff=@(Compare-XmlText $baseline $after);$row.requestToReadbackDiff=@(Compare-XmlText $request $after)
            if($size -eq 12.0){
                $original=[string]$row.baselineFont.FontName;$revertRequest=Set-XmlFontTarget $after $original 12.0;$row.semanticRevertRequestXml=$revertRequest;[void][LabelWorkbench.ComBridge]::Call($obj,'SetXML',[object[]]@($revertRequest));$rev=[string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true));$row.semanticRevertFont=Get-FontState $rev;$row.revertDiffFromBaseline=@(Compare-XmlText $baseline $rev)
            }
            if($size -eq 9.0){$persistBeforeSave=$after;$persistName=$row.name}
            $row.status='COMPLETE'
        }catch{$row.status='FAILED';$row.error=$_.Exception.ToString()}finally{Release-Com $obj;$result.scenarios += [pscustomobject]$row}
    }
    if(-not [string]::IsNullOrWhiteSpace($persistName)){
        if(Test-Path -LiteralPath $candidate){Remove-Item -LiteralPath $candidate -Force};[void][LabelWorkbench.ComBridge]::Call($format,'SaveAs',[object[]]@($candidate,$false));Release-Com $objects;$objects=$null;[void][LabelWorkbench.ComBridge]::Call($format,'Close',[object[]]@(1));Release-Com $format;$format=$null
        $format=[LabelWorkbench.ComBridge]::OpenFormat($formats,$candidate,$false,'');$objects=[LabelWorkbench.ComBridge]::Get($format,'Objects',[object[]]@());$obj=[LabelWorkbench.ComBridge]::Call($objects,'Find',[object[]]@($persistName))
        try{if($null -eq $obj){throw 'Persistence object missing after reopen.'};$reopen=[string][LabelWorkbench.ComBridge]::Call($obj,'GetXML',[object[]]@($true,$true));$result.persistence=[ordered]@{name=$persistName;beforeSaveFont=(Get-FontState $persistBeforeSave);reopenFont=(Get-FontState $reopen);diff=@(Compare-XmlText $persistBeforeSave $reopen);reopenXml=$reopen}}finally{Release-Com $obj}
    }
    $result.status='COMPLETE'
}catch{$result.status='FAILED';$result.error=$_.Exception.ToString()}finally{
    Release-Com $objects;if($null -ne $format){try{[void][LabelWorkbench.ComBridge]::Call($format,'Close',[object[]]@(1))}catch{$result.cleanup+=('Close: '+$_.Exception.Message)};Release-Com $format};Release-Com $formats
    if($null -ne $app){try{[void][LabelWorkbench.ComBridge]::Call($app,'Quit',[object[]]@(1))}catch{$result.cleanup+=('Quit: '+$_.Exception.Message)};Release-Com $app};Start-Sleep -Milliseconds 500
    if($ownedPid -and -not($preExisting -contains $ownedPid)){$left=Get-Process -Id $ownedPid -ErrorAction SilentlyContinue;if($null -ne $left){try{Stop-Process -Id $ownedPid -Force -ErrorAction Stop;$result.cleanup+='Owned diagnostic BarTender process force-stopped after Quit.'}catch{$result.cleanup+=('Stop-Process: '+$_.Exception.Message)}}}
    if(Test-Path -LiteralPath $candidate){Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue};$result|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
Write-Host ('Text XML normalization diagnostic written: '+$OutputPath)
if($result.status -ne 'COMPLETE'){exit 1};exit 0
