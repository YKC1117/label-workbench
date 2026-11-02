using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using TYPEATTR = System.Runtime.InteropServices.ComTypes.TYPEATTR;
using FUNCDESC = System.Runtime.InteropServices.ComTypes.FUNCDESC;
using ELEMDESC = System.Runtime.InteropServices.ComTypes.ELEMDESC;
namespace LabelWorkbench {
    // Only the first two IDispatch slots are needed. IUnknown slots are implicit.
    [ComImport, Guid("00020400-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IDispatchMetadata {
        [PreserveSig] int GetTypeInfoCount(out uint count);
        [PreserveSig] int GetTypeInfo(uint index, int lcid, out ITypeInfo info);
    }
    public sealed class MemberMetadata {
        public string Name { get; set; }
        public string TypeName { get; set; }
        public int DispId { get; set; }
        public string InvokeKind { get; set; }
        public int ReturnVariantType { get; set; }
        public string Documentation { get; set; }
        public string[] ParameterNames { get; set; }
        public int[] ParameterVariantTypes { get; set; }
        public int[] ParameterFlags { get; set; }
    }
    public static class ComMetadata {
        [DllImport("oleaut32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
        private static extern void LoadTypeLibEx(string path, int regKind, out ITypeLib library);
        public static MemberMetadata[] ReadLibrary(string path) {
            ITypeLib library;
            LoadTypeLibEx(path, 2, out library); // REGKIND_NONE: never register or change the system
            var result = new List<MemberMetadata>();
            try {
                for (int i=0; i<library.GetTypeInfoCount(); i++) {
                    ITypeInfo info; library.GetTypeInfo(i, out info);
                    result.AddRange(ReadInfo(info)); // ReadInfo releases this reference
                }
            } finally { Marshal.ReleaseComObject(library); }
            return result.ToArray();
        }
        public static MemberMetadata[] Read(object instance) {
            if (instance == null || !Marshal.IsComObject(instance)) throw new ArgumentException("A native COM object is required.");
            var dispatch = (IDispatchMetadata)instance;
            uint count;
            Marshal.ThrowExceptionForHR(dispatch.GetTypeInfoCount(out count));
            if (count == 0) throw new InvalidOperationException("This object exposes no ITypeInfo.");
            ITypeInfo info;
            Marshal.ThrowExceptionForHR(dispatch.GetTypeInfo(0, 0, out info));
            return ReadInfo(info);
        }
        private static MemberMetadata[] ReadInfo(ITypeInfo info) {
            var members = new List<MemberMetadata>();
            IntPtr attrPointer = IntPtr.Zero;
            try {
                info.GetTypeAttr(out attrPointer);
                var attr = (TYPEATTR)Marshal.PtrToStructure(attrPointer, typeof(TYPEATTR));
                string typeName, typeDoc, typeHelp; int typeContext;
                info.GetDocumentation(-1, out typeName, out typeDoc, out typeContext, out typeHelp);
                for (int i = 0; i < attr.cFuncs; i++) {
                    IntPtr funcPointer = IntPtr.Zero;
                    try {
                        info.GetFuncDesc(i, out funcPointer);
                        var func = (FUNCDESC)Marshal.PtrToStructure(funcPointer, typeof(FUNCDESC));
                        string name, doc, helpFile; int helpContext;
                        info.GetDocumentation(func.memid, out name, out doc, out helpContext, out helpFile);
                        string[] names = new string[func.cParams + 1]; int namesRead;
                        info.GetNames(func.memid, names, names.Length, out namesRead);
                        var paramNames = new string[func.cParams];
                        var paramTypes = new int[func.cParams];
                        var paramFlags = new int[func.cParams];
                        int stride = Marshal.SizeOf(typeof(ELEMDESC));
                        for (int j = 0; j < func.cParams; j++) {
                            var elem = (ELEMDESC)Marshal.PtrToStructure(IntPtr.Add(func.lprgelemdescParam, j * stride), typeof(ELEMDESC));
                            paramNames[j] = j + 1 < namesRead ? names[j + 1] : "arg" + j;
                            paramTypes[j] = elem.tdesc.vt;
                            paramFlags[j] = (int)elem.desc.paramdesc.wParamFlags;
                        }
                        members.Add(new MemberMetadata { Name=name, TypeName=typeName, DispId=func.memid, InvokeKind=func.invkind.ToString(),
                            ReturnVariantType=func.elemdescFunc.tdesc.vt, Documentation=doc,
                            ParameterNames=paramNames, ParameterVariantTypes=paramTypes, ParameterFlags=paramFlags });
                    } finally { if (funcPointer != IntPtr.Zero) info.ReleaseFuncDesc(funcPointer); }
                }
            } finally {
                if (attrPointer != IntPtr.Zero) info.ReleaseTypeAttr(attrPointer);
                if (info != null && Marshal.IsComObject(info)) Marshal.ReleaseComObject(info);
            }
            return members.ToArray();
        }
    }
}
