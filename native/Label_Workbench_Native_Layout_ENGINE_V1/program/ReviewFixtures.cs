using System;
using System.IO;
using System.Xml;
using System.Collections;
using System.Collections.Generic;
namespace LwbReviewFixture {
 public class Obj {
  public string Name {get;set;} public int Type {get;set;} public double X {get;set;} public double Y {get;set;}
  public double Width {get;set;} public double Height {get;set;} public double FontSize {get;set;} public double RotationAngle {get;set;} public bool DoNotPrint {get;set;}
  public bool IgnoreIndex, Dirty, EmptyTransforms, AlwaysDpiMismatch;
  public int MismatchDpiIndex=-1, ThrowIndex=-1, CaptionIndex=-1, BadDpiExportCall=-1, ExportCalls;
  public bool OmitHumanReadable, DuplicateHumanReadable, IgnoreHumanReadable, DirtyOnHide;

  public string HumanReadableVisibility="None";
  public string Payload="old", Root="BarCode-Code-128"; public int Index=2;
  public string Value {get{return Payload;}}
  public string GetXML(bool p,bool d) {
   XmlDocument x=new XmlDocument();x.LoadXml("<"+Root+"><DataSources><EmbeddedDataSource ID='source'><Value/></EmbeddedDataSource></DataSources><XDimension/><HumanReadable/></"+Root+">");
   ((XmlElement)x.SelectSingleNode("//HumanReadable")).SetAttribute("Visibility",HumanReadableVisibility);
   x.DocumentElement.SetAttribute("Name",Name);x.SelectSingleNode("//Value").InnerText=Payload;
   XmlElement xd=(XmlElement)x.SelectSingleNode("//XDimension");
   xd.SetAttribute("Index",Index.ToString());double mils=(Index+1)*10.0/3;
   xd.SetAttribute("Mils",mils.ToString("0.000",System.Globalization.CultureInfo.InvariantCulture));
   xd.SetAttribute("Millimeters",(mils*0.0254).ToString("0.000",System.Globalization.CultureInfo.InvariantCulture));
   if(Dirty || EmptyTransforms){XmlElement t=x.CreateElement("Transforms");x.SelectSingleNode("//EmbeddedDataSource").AppendChild(t);if(Dirty)t.AppendChild(x.CreateElement("DataEntryTransform"));}
   if(OmitHumanReadable)x.DocumentElement.RemoveChild(x.SelectSingleNode("//HumanReadable"));
   else if(DuplicateHumanReadable)x.DocumentElement.AppendChild(x.SelectSingleNode("//HumanReadable").CloneNode(true));
   return x.OuterXml;
  }
  public void SetXML(string s){
   XmlDocument x=new XmlDocument();x.LoadXml(s);
   int target=Int32.Parse(((XmlElement)x.SelectSingleNode("//XDimension")).GetAttribute("Index"));
   if(!IgnoreIndex)Index=target;
   XmlElement hr=(XmlElement)x.SelectSingleNode("//HumanReadable");
   if(hr!=null && hr.HasAttribute("Visibility") && !IgnoreHumanReadable)HumanReadableVisibility=hr.GetAttribute("Visibility");
   Dirty=x.SelectSingleNode("//DataSources//DataEntryTransform")!=null;
   if(DirtyOnHide && hr!=null && hr.GetAttribute("Visibility")=="None")Dirty=true;
   if(target==CaptionIndex)HumanReadableVisibility="Visible";
   if(target==ThrowIndex)throw new InvalidOperationException("Injected failure after Index write");
  }
  public void ExportToFile(string path,string type,int color,int dpi,int save){
   ExportCalls++;double headerDpi=(AlwaysDpiMismatch || Index==MismatchDpiIndex || ExportCalls==BadDpiExportCall)?300.0:dpi;
   Bmp.WriteWithDpi(path,100*(Index+1),80,10,10,100*(Index+1)-20,60,false,headerDpi,headerDpi);
  }
 }
 public class Objects : IEnumerable {
  public List<Obj> Data=new List<Obj>();public bool FailDelete;
  public int Count{get{return Data.Count;}}
  public IEnumerator GetEnumerator(){return Data.GetEnumerator();}
  public Obj Item(object index){return Data[Convert.ToInt32(index)-1];}
  public Obj Find(string name){return Data.Find(delegate(Obj o){return o.Name==name;});}
  public bool Delete(string name){if(FailDelete)return false;return Data.Remove(Find(name));}
  public string ExportDataSourceValuesToXML(){
   XmlDocument x=new XmlDocument();x.LoadXml("<Command/>");
   foreach(Obj o in Data){XmlElement el=x.CreateElement("Object");el.SetAttribute("Name",o.Name);XmlElement v=x.CreateElement("Value");v.InnerText=o.Payload;el.AppendChild(v);x.DocumentElement.AppendChild(el);}return x.OuterXml;
  }
  public bool ImportDataSourceValuesFromXML(string xml){XmlDocument x=new XmlDocument();x.LoadXml(xml);foreach(XmlElement el in x.SelectNodes("//Object")){Find(el.GetAttribute("Name")).Payload=el.SelectSingleNode("Value").InnerText;}return true;}
 }
 public class Document {
  public int MeasurementUnits {get;set;}
  public Objects Objects {get;set;}
  public int Saves,Closes;public bool BadCleanup, FailInsert;public string Printer {get{return "Fixture printer";}}
  public static Dictionary<string,Document> Saved=new Dictionary<string,Document>();
  public Document Clone(){Document d=new Document();foreach(Obj o in Objects.Data){Obj n=new Obj();n.Name=o.Name;n.Type=o.Type;n.X=o.X;n.Y=o.Y;n.Width=o.Width;n.Height=o.Height;n.FontSize=o.FontSize;n.RotationAngle=o.RotationAngle;n.DoNotPrint=o.DoNotPrint;n.Root=o.Root;n.Index=o.Index;n.Payload=o.Payload;n.Dirty=o.Dirty;n.EmptyTransforms=o.EmptyTransforms;n.HumanReadableVisibility=o.HumanReadableVisibility;n.AlwaysDpiMismatch=o.AlwaysDpiMismatch;n.MismatchDpiIndex=o.MismatchDpiIndex;d.Objects.Data.Add(n);}return d;}
  public Document(){Objects=new Objects();}
  public bool InsertComponent(string path,double x,double y){
   if(FailInsert)return false;
   string f=Path.GetFileName(path);Obj o=new Obj();o.Name="條碼 7";o.Type=4;Objects.Data.Add(o);
   if(f.Contains("dirty"))o.Dirty=true;
   if(f.Contains("wrong"))o.Root="BarCode-Code39-FullAscii";
   if(f.Contains("empty"))o.EmptyTransforms=true;
   if(f.Contains("visible"))o.HumanReadableVisibility="Visible";
   if(f.Contains("multi")){Obj q=new Obj();q.Name="extra";q.Type=4;Objects.Data.Add(q);}
   if(f.Contains("throw"))throw new Exception("partial insertion exception");
   if(BadCleanup)Objects.FailDelete=true;
   return !f.Contains("false");
  }
  public void SaveAs(string path,bool overwrite){Saves++;File.WriteAllText(path,"MOCK NOT BTW");Saved[path]=Clone();}
  public void Close(int option){Closes++;}
 }
 public class Formats {
  public Document Last;public bool BadCleanup;public int Adds;public string Corrupt;
  public Document Open(string path,bool close,string printer){Document d=Document.Saved[path].Clone();Obj o=d.Objects.Find("條碼 7");if(o!=null){if(Corrupt=="payload")o.Payload="CORRUPT";if(Corrupt=="root")o.Root="BarCode-Code39-FullAscii";if(Corrupt=="source")o.Dirty=true;if(Corrupt=="geometry")o.X+=1;if(Corrupt=="xdim")o.Index+=1;if(Corrupt=="type")o.Type=5;if(Corrupt=="caption")o.HumanReadableVisibility="Visible";if(Corrupt=="height")o.Height+=1;}return d;}
  public Document Add(){Adds++;Last=new Document();Last.BadCleanup=BadCleanup;return Last;}
 }
 public static class Bmp {
  public static void Write(string p,int w,int h,int l,int t,int iw,int ih,bool invert) { WriteWithDpi(p,w,h,l,t,iw,ih,invert,600.0,600.0); }
  public static void WriteWithDpi(string p,int w,int h,int l,int t,int iw,int ih,bool invert,double dpiX,double dpiY) {
   int stride=((w+31)/32)*4;byte[] b=new byte[62+stride*h];
   b[0]=66;b[1]=77;Put(b,2,b.Length);Put(b,10,62);Put(b,14,40);Put(b,18,w);Put(b,22,h);b[26]=1;b[28]=1;Put(b,38,(int)Math.Round(dpiX/0.0254));Put(b,42,(int)Math.Round(dpiY/0.0254));
   int white=invert?54:58;b[white]=255;b[white+1]=255;b[white+2]=255;
   for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    bool ink=x>=l && x<l+iw && y>=t && y<t+ih;int index=(ink==invert)?1:0;
    if(index==1)b[62+(h-1-y)*stride+x/8]|=(byte)(1<<(7-x%8));
   }
   File.WriteAllBytes(p,b);
  }
  static void Put(byte[] b,int p,int n){Array.Copy(BitConverter.GetBytes(n),0,b,p,4);}
 }
}
