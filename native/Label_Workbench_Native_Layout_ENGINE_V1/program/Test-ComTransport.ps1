# Regression tests for reflection transport and pipeline collection preservation.
# Uses .NET test objects; this is NOT a Windows BarTender test.
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Com.psm1') -Force
Add-Type -TypeDefinition @'
using System;
using System.Collections;
namespace TransportRegression {
    public class Collection : IEnumerable {
        public int Count { get { return 2; } }
        public IEnumerator GetEnumerator() { return new string[] {"not", "the collection"}.GetEnumerator(); }
        public string Item(ref object index) { return "slot-" + index; }
    }
    public static class WrappedArguments {
        public static object[] Create() {
            return new object[] { new System.Management.Automation.PSObject("中文 label.btw"),
                new System.Management.Automation.PSObject(false), new System.Management.Automation.PSObject("") };
        }
    }
    public class Application {
        private Collection formats = new Collection();
        public Collection Formats { get { return formats; } }
        public Collection Open(string path, bool close, string printer) { return formats; }
        public bool Visible { get; set; }
        public double this[int unit] { get { return width; } set { width = value; } }
        private double width = 0;
        public string Join(string a, string b) { return a + b; }
        public void Fail() { throw new InvalidOperationException("server-side error"); }
    }
}
'@
function Check($ok,$message) { if (-not $ok) { throw $message } }
$app=New-Object TransportRegression.Application
$formats=Read-Property $app 'Formats'
Check ($formats -is [TransportRegression.Collection]) 'COM-style enumerable property was expanded by the pipeline'
Check ((Read-Property $formats 'Count') -eq 2) 'Count read failed'
$opened=Invoke-ComMethod $app 'Open' @('C:\Chinese label.btw',$false,'')
Check ([object]::ReferenceEquals($formats,$opened)) 'Method return collection was expanded'
Check ((Invoke-ComMethod $formats 'Item' @([object]1)) -eq 'slot-1') 'By-ref object argument failed'
Write-Property $app 'Visible' $true
Check (Read-Property $app 'Visible') 'Boolean setter failed'
Write-Property $app 'Item' ([double]140) @(3)
Check ((Read-Property $app 'Item' @(3)) -eq 140) 'Indexed property failed'
Check ((Invoke-ComMethod $app 'Join' @('中文','001')) -ceq '中文001') 'Unicode/string arguments corrupted'
$failed=$false
try { $null=Invoke-ComMethod $app 'Fail' } catch { $failed=$true }
Check $failed 'Required API failure was swallowed'
$wrapped=[TransportRegression.WrappedArguments]::Create()
$types=[LabelWorkbench.ComBridge]::ArgumentTypes($wrapped)
Check (($types -join ',') -ceq 'System.String,System.Boolean,System.String') 'PSObject wrappers were not normalized'
$opened=[LabelWorkbench.ComBridge]::Call($app,'Open',$wrapped)
Check ([object]::ReferenceEquals($formats,$opened)) 'Wrapped Open arguments failed'
$opened=[LabelWorkbench.ComBridge]::OpenFormat($app,'中文 label.btw',$false,'')
Check ([object]::ReferenceEquals($formats,$opened)) 'Strongly typed Open failed'
Add-Type -Path (Join-Path $PSScriptRoot 'ComMetadata.cs')
Write-Host 'PASS: 11 transport assertions + native metadata helper compilation. Windows COM: NOT RUN.'
