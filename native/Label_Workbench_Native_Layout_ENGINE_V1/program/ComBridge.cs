using System;
using System.Reflection;
namespace LabelWorkbench {
    // Keep COM invocation inside compiled .NET code. PowerShell pipeline values can
    // carry PSObject wrappers even when GetType() in PowerShell reports String.
    public static class ComBridge {
        public static object Unwrap(object value) {
            // Do not take a compile-time dependency on System.Management.Automation.
            // Windows PowerShell 5.1 Add-Type can therefore compile this helper using only
            // the .NET Framework reference set. PSObject wrappers are unwrapped by name.
            while (value != null && value.GetType().FullName == "System.Management.Automation.PSObject") {
                PropertyInfo p = value.GetType().GetProperty("BaseObject", BindingFlags.Instance | BindingFlags.Public);
                if (p == null) break;
                object next = p.GetValue(value, null);
                if (Object.ReferenceEquals(next, value)) break;
                value = next;
            }
            return value;
        }
        public static object[] Normalize(object[] arguments) {
            if (arguments == null) return new object[0];
            object[] clean = new object[arguments.Length];
            for (int i = 0; i < arguments.Length; i++) clean[i] = Unwrap(arguments[i]);
            return clean;
        }
        public static string[] ArgumentTypes(object[] arguments) {
            object[] clean = Normalize(arguments);
            string[] types = new string[clean.Length];
            for (int i=0; i<clean.Length; i++) types[i] = clean[i] == null ? "null" : clean[i].GetType().FullName;
            return types;
        }
        private static string Describe(Exception ex) {
            string text = ""; int depth = 0;
            while (ex != null && depth < 6) {
                if (depth > 0) text += " -> ";
                text += ex.GetType().FullName + " HResult=0x" + ex.HResult.ToString("X8") + ": " + ex.Message;
                ex = ex.InnerException; depth++;
            }
            return text;
        }
        private static object Invoke(object target, string name, BindingFlags flags, object[] arguments) {
            target = Unwrap(target);
            if (target == null) throw new ArgumentNullException("target", "No COM target for " + name);
            object[] clean = Normalize(arguments);
            try {
                return target.GetType().InvokeMember(name, flags, null, target, clean);
            } catch (Exception ex) {
                throw new InvalidOperationException("COM " + name + "(" + String.Join(", ", ArgumentTypes(clean)) + ") failed: " + Describe(ex), ex);
            }
        }
        public static object Get(object target, string name, object[] arguments) {
            return Invoke(target, name, BindingFlags.GetProperty, arguments);
        }
        public static void Set(object target, string name, object[] arguments) {
            Invoke(target, name, BindingFlags.SetProperty, arguments);
        }
        public static object Call(object target, string name, object[] arguments) {
            return Invoke(target, name, BindingFlags.InvokeMethod, arguments);
        }
        // Match BarTender's documented Formats.Open signature exactly. No PSObject
        // can enter this arguments array, regardless of the caller's adapter.
        public static object OpenFormat(object formats, string fileName, bool closeOutFirstDocument, string printer) {
            return Call(formats, "Open", new object[] {fileName, closeOutFirstDocument, printer});
        }
    }
}
