$ErrorActionPreference='Stop'
$p=$PSScriptRoot
Import-Module "$p/Core.psm1" -Force
Add-Type @'
using System;
using System.IO;
using System.Collections.Generic;
public class FakeSlot { public string Name {get;set;} public int Type {get;set;} public double Height {get;set;} public string Value {get;set;} }
public class FakeObjects {public Dictionary<string,FakeSlot> Slots=new Dictionary<string,FakeSlot>(); public FakeSlot Find(string n){return Slots[n];}}
public class FakeSources { public FakeDocument Doc; public bool Enabled; public string GetAll(string a,string b){if(!Enabled)return "";return "T"+a+Doc.Objects.Slots["文字 1"].Value+b+"C"+a+Doc.Objects.Slots["條碼 1"].Value+b+"D"+a+Doc.Objects.Slots["條碼 3"].Value;} }
public class FakeDocument {
 public int MeasurementUnits {get;set;} public FakeSources NamedSubStrings {get;set;} =new FakeSources();
 public FakeObjects Objects {get;set;} =new FakeObjects();
 public void SetNamedSubStringValue(string n,string v){Objects.Slots[n=="T"?"文字 1":n=="C"?"條碼 1":"條碼 3"].Value=v;}
 public string GetNamedSubStringValue(string n){return Objects.Slots[n=="T"?"文字 1":n=="C"?"條碼 1":"條碼 3"].Value;}
 public FakeDocument(){NamedSubStrings.Doc=this;Objects.Slots.Add("文字 1",new FakeSlot{Name="文字 1",Type=5,Value="text"});Objects.Slots.Add("條碼 1",new FakeSlot{Name="條碼 1",Type=4,Value="barcode",Height=3});Objects.Slots.Add("條碼 3",new FakeSlot{Name="條碼 3",Type=4,Value="matrix",Height=12});}
 public void SaveAs(string p,bool overwrite){File.WriteAllText(p,"test fixture only");} public void Close(int option){}
}
public class FakeFormats {public FakeDocument Doc; public bool Corrupt; public FakeDocument Open(string p,bool b,string printer){if(Corrupt)Doc.Objects.Slots["條碼 1"].Height=1;return Doc;}}
'@
# Native registry/type-library discovery is deliberately absent on Linux; it must not mask the height test.
for($i=0;$i -lt 3;$i++){
 $dir=Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($dir)
 try{
  $template=Join-Path $dir 'source.btw';Set-Content $template 'fixture'
  $doc=New-Object FakeDocument;$formats=New-Object FakeFormats;$formats.Doc=$doc;$doc.NamedSubStrings.Enabled=($i -eq 2);$formats.Corrupt=($i -eq 1)
  $r=[ordered]@{status='NOT_RUN';stage='';output=$null}
  $failed=$false
  try {Invoke-CoreTest $doc $formats $r $dir $p $template (Get-FileHash $template).Hash} catch {$failed=$true;if($i -ne 1){throw}}
  if($i -eq 0 -and ($r.status -ne 'CORE_PARTIAL_READBACK_OK' -or $r.core.verified.Count -ne 1 -or -not(Test-Path "$dir/output.btw"))){throw 'Expected explicitly partial height output with no sources.'}
  if($i -eq 2 -and ($r.core.verified.Count -ne 4 -or $r.core.tests[0].payload -ne 'SAVE_REOPEN_READBACK_OK')){throw 'Named source payload roundtrip failed.'}
  if($i -eq 1 -and (-not $failed -or (Test-Path "$dir/output.btw"))){throw 'Corrupt readback must not publish output.'}
 }finally{Remove-Item $dir -Recurse -Force}
}
'PASS: core partial output, named-source payloads and corrupted-readback rejection (mock only).'
