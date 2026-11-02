using System;
using System.IO;
using System.Xml;
using System.Globalization;
using System.Collections;
using System.Collections.Generic;
namespace NativeReviewFixture {
 public class Page {
  public Dictionary<string,double> Values=new Dictionary<string,double>();
  public Page(){foreach(string k in new string[]{"PaperWidth","LabelWidth"})Values[k]=140;foreach(string k in new string[]{"PaperHeight","LabelHeight"})Values[k]=38;foreach(string k in new string[]{"MarginLeft","MarginRight","MarginTop","MarginBottom"})Values[k]=0;Values["LabelRows"]=1;Values["LabelColumns"]=1;}
 }
 public class Obj {
  public string Name {get;set;} public int Type {get;set;} public double X {get;set;} public double Y {get;set;}
  public double RotationAngle {get;set;} public double Height {get;set;} public double FontSize {get;set;}
  string _fontName; public bool RejectFontNameSet=true; public int FontNameSetCalls, SetXmlCalls, FontXmlChangeCalls;
  public string FontName {get{return _fontName;} set{FontNameSetCalls++;if(RejectFontNameSet)throw new InvalidOperationException("Mock COM FontName PUT rejected");_fontName=value;}} public bool DoNotPrint {get;set;}
  public string Root="Text", Payload="old", SourceId=Guid.NewGuid().ToString(), Caption="None";
  public int Index=2; public bool IgnoreIndex, BadDpi;
  public string Value {get{return Payload;}}
  public Obj(){_fontName="Arial";FontSize=8;Height=4.5;}
  static string F(double d){return d.ToString("R",CultureInfo.InvariantCulture);}
  public string GetXML(bool a,bool b){
   XmlDocument x=new XmlDocument();string font=Root=="Text"?"<Font/>":"";x.LoadXml("<"+Root+">"+font+"<DataSources><EmbeddedDataSource><Value/></EmbeddedDataSource></DataSources><XDimension/><HumanReadable/></"+Root+">");
   XmlElement e=x.DocumentElement;e.SetAttribute("Name",Name);e.SetAttribute("X",F(X));e.SetAttribute("Y",F(Y));e.SetAttribute("Height",F(Height));e.SetAttribute("Rotation",F(RotationAngle));e.SetAttribute("FontSize",F(FontSize));if(Root!="Text")e.SetAttribute("FontName",_fontName);e.SetAttribute("DoNotPrint",DoNotPrint.ToString());e.SetAttribute("ReferencePoint","BottomLeft");
   if(Root=="Text"){XmlElement f=(XmlElement)x.SelectSingleNode("/*/Font");f.SetAttribute("PointSize",F(FontSize));f.SetAttribute("FontName",_fontName);}
   ((XmlElement)x.SelectSingleNode("//EmbeddedDataSource")).SetAttribute("ID",SourceId);x.SelectSingleNode("//Value").InnerText=Payload;
   XmlElement xd=(XmlElement)x.SelectSingleNode("//XDimension");xd.SetAttribute("Index",Index.ToString());xd.SetAttribute("Mils",F((Index+1)*10));xd.SetAttribute("Millimeters",F((Index+1)*.254));
   ((XmlElement)x.SelectSingleNode("//HumanReadable")).SetAttribute("Visibility",Caption);return x.OuterXml;
  }
  public void SetXML(string value){
   SetXmlCalls++;string oldFont=_fontName;
   XmlDocument x=new XmlDocument();x.LoadXml(value);XmlElement e=x.DocumentElement;
   Name=e.GetAttribute("Name");X=Double.Parse(e.GetAttribute("X"),CultureInfo.InvariantCulture);Y=Double.Parse(e.GetAttribute("Y"),CultureInfo.InvariantCulture);Height=Double.Parse(e.GetAttribute("Height"),CultureInfo.InvariantCulture);RotationAngle=Double.Parse(e.GetAttribute("Rotation"),CultureInfo.InvariantCulture);FontSize=Double.Parse(e.GetAttribute("FontSize"),CultureInfo.InvariantCulture);_fontName=e.GetAttribute("FontName");DoNotPrint=Boolean.Parse(e.GetAttribute("DoNotPrint"));
   XmlElement f=(XmlElement)x.SelectSingleNode("/*/Font");if(f!=null){if(f.HasAttribute("PointSize"))FontSize=Double.Parse(f.GetAttribute("PointSize"),CultureInfo.InvariantCulture);if(f.HasAttribute("FontName"))_fontName=f.GetAttribute("FontName");}
   if(_fontName!=oldFont)FontXmlChangeCalls++;
   Payload=x.SelectSingleNode("//Value").InnerText;SourceId=((XmlElement)x.SelectSingleNode("//EmbeddedDataSource")).GetAttribute("ID");
   if(!IgnoreIndex)Index=Int32.Parse(((XmlElement)x.SelectSingleNode("//XDimension")).GetAttribute("Index"));Caption=((XmlElement)x.SelectSingleNode("//HumanReadable")).GetAttribute("Visibility");
  }
  public Obj Clone(){return (Obj)MemberwiseClone();}
  public void ExportToFile(string path,string type,int color,int dpi,int overwrite){
   int iw=(Index+1)*100,ih=Root=="BarCode-DataMatrix"?iw:Math.Max(1,(int)Math.Round(Height*dpi/25.4));
   double theta=RotationAngle*Math.PI/180;int w=Math.Max(1,(int)Math.Ceiling(Math.Abs(iw*Math.Cos(theta))+Math.Abs(ih*Math.Sin(theta))));int h=Math.Max(1,(int)Math.Ceiling(Math.Abs(ih*Math.Cos(theta))+Math.Abs(iw*Math.Sin(theta))));
   Bmp.Write(path,w+20,h+20,10,10,w,h,BadDpi?300:dpi);
  }
 }
 public class Objects : IEnumerable {
  public List<Obj> Data=new List<Obj>();public string Fault="";
  public int Count {get{return Data.Count;}}
  public IEnumerator GetEnumerator(){return Data.GetEnumerator();}
  public Obj Item(object index){return Data[Convert.ToInt32(index)-1];}
  public Obj Find(string name){return Data.Find(delegate(Obj o){return o.Name==name;});}
  public Obj Create(int type){Obj o=new Obj();o.Type=Fault=="wrong-create"?4:type;o.Root=Fault=="wrong-create"?"BarCode-Code-128":"Text";o.Name="Object "+(Data.Count+1);Data.Add(o);return o;}
  public string ExportDataSourceValuesToXML(){XmlDocument x=new XmlDocument();x.LoadXml("<Export/>");foreach(Obj o in Data){XmlElement e=x.CreateElement("Source");e.SetAttribute("ID",o.SourceId);XmlElement v=x.CreateElement("Value");v.InnerText=o.Payload;e.AppendChild(v);x.DocumentElement.AppendChild(e);}return x.OuterXml;}
  public bool ImportDataSourceValuesFromXML(string value){XmlDocument x=new XmlDocument();x.LoadXml(value);foreach(XmlElement e in x.SelectNodes("//Source")){Obj o=Data.Find(delegate(Obj q){return q.SourceId==e.GetAttribute("ID");});o.Payload=e.SelectSingleNode("Value").InnerText;}if(Fault=="peer-payload" && Data.Count>1)Data[0].Payload="CORRUPT";return true;}
 }
 public class Document {
  public Objects Objects {get;set;} public Page PageSetup {get;set;} public int MeasurementUnits {get;set;} public string Printer {get;set;}
  public int CloseCalls;public string Fault="";
  public static Dictionary<string,Document> Saved=new Dictionary<string,Document>();
  public Document(){Objects=new Objects();PageSetup=new Page();Printer="Fixture printer";}
  public bool InsertComponent(string path,double x,double y){Obj o=new Obj();o.Type=4;o.Root=Path.GetFileName(path)=="Data Matrix.btc"?"BarCode-DataMatrix":"BarCode-Code-128";o.Name="Object "+(Objects.Count+1);o.Caption=o.Root=="BarCode-Code-128"?"Visible":"None";o.X=x;o.Y=y;o.IgnoreIndex=Fault=="noop-index";o.BadDpi=Fault=="bad-dpi";
   if(Fault=="duplicate-source" && Objects.Count>0)o.SourceId=Objects.Data[0].SourceId;
   if(Fault=="duplicate-name" && Objects.Count>0)o.Name=Objects.Data[0].Name;
   Objects.Data.Add(o);if(Fault=="partial-insert")throw new Exception("Partial insertion fault");return true;}
  public Document Clone(){Document d=new Document();d.MeasurementUnits=MeasurementUnits;d.Printer=Printer;foreach(var p in PageSetup.Values)d.PageSetup.Values[p.Key]=p.Value;foreach(Obj o in Objects.Data)d.Objects.Data.Add(o.Clone());return d;}
  public void SaveAs(string path,bool overwrite){File.WriteAllText(path,"MOCK ONLY NOT BTW");Saved[path]=Clone();}
  public void Close(int option){CloseCalls++;}
 }
 public class Formats {
  public string Fault="";public Document Added,Reopened;
  public Document Add(){Added=new Document();Added.Fault=Fault;Added.Objects.Fault=Fault;return Added;}
  public Document Open(string path,bool close,string printer){Document d=Document.Saved[path].Clone();Reopened=d;
   if(Fault=="reopen-printer")d.Printer="Other";if(Fault=="reopen-margin")d.PageSetup.Values["MarginLeft"]=1;
   if(d.Objects.Count>0){Obj o=d.Objects.Data[0];if(Fault=="reopen-type")o.Type=4;if(Fault=="reopen-payload")o.Payload="BROKEN";if(Fault=="reopen-nan")o.X=Double.NaN;}
   foreach(Obj o in d.Objects.Data){if(o.Type==4 && Fault=="reopen-dpi")o.BadDpi=true;}
   return d;
  }
 }
 // Fault injection probe backed by a captured Text XML document. The fields
 // below model test behavior only, not BarTender's undocumented SetXML semantics.
 public class FontProbe {
  XmlDocument xml; string originalFont, fontName;
  public string Mode="xml-success"; public int FontNameSetCalls, SetXmlCalls, ChangeCalls, RestoreCalls;
  public FontProbe(string text){xml=new XmlDocument();xml.PreserveWhitespace=true;xml.LoadXml(text);XmlElement f=(XmlElement)xml.SelectSingleNode("/*/Font");originalFont=f==null?"Arial":f.GetAttribute("FontName");fontName=originalFont;}
  public string Name {get{return xml.DocumentElement.GetAttribute("Name");} set{xml.DocumentElement.SetAttribute("Name",value);}}
  public int Type {get{return 5;}}
  static double N(string v){if(String.IsNullOrEmpty(v))return 0;string[] p=v.Split(' ');double n=Double.Parse(p[0],CultureInfo.InvariantCulture);return p.Length>1 && p[1]=="in"?n*25.4:n;}
  public double X {get{return N(xml.DocumentElement.GetAttribute("Position.X"));} set{xml.DocumentElement.SetAttribute("Position.X",value.ToString("R",CultureInfo.InvariantCulture));}}
  public double Y {get{return N(xml.DocumentElement.GetAttribute("Position.Y"));} set{xml.DocumentElement.SetAttribute("Position.Y",value.ToString("R",CultureInfo.InvariantCulture));}}
  public double RotationAngle {get{return N(xml.DocumentElement.GetAttribute("Rotation"));} set{xml.DocumentElement.SetAttribute("Rotation",value.ToString("R",CultureInfo.InvariantCulture));}}
  public double FontSize {get{XmlElement f=(XmlElement)xml.SelectSingleNode("/*/Font");return f==null?6:N(f.GetAttribute("PointSize"));} set{((XmlElement)xml.SelectSingleNode("/*/Font")).SetAttribute("PointSize",value.ToString("R",CultureInfo.InvariantCulture));if(Mode=="geometry-font-reset"){fontName=originalFont;((XmlElement)xml.SelectSingleNode("/*/Font")).SetAttribute("FontName",originalFont);}}}
  public string FontName {get{return fontName;} set{
   FontNameSetCalls++;
   if(Mode=="com-success"){fontName=value;((XmlElement)xml.SelectSingleNode("/*/Font")).SetAttribute("FontName",value);return;}
   if(Mode=="com-noop")return;
   if(Mode=="com-partial"){X=999;fontName="PARTIAL";}
   if(Mode=="com-hidden-partial"){fontName="PARTIAL";}
   throw new InvalidOperationException("FontProbe COM setter rejected");
  }}
  public string Value {get{return xml.SelectSingleNode("/*/DataSources/EmbeddedDataSource/Value").InnerText;}}
  public string GetXML(bool properties,bool dataSources){return xml.OuterXml;}
  public void SetXML(string text){
   SetXmlCalls++;XmlDocument next=new XmlDocument();next.PreserveWhitespace=true;next.LoadXml(text);
   string requested=((XmlElement)next.SelectSingleNode("/*/Font")).GetAttribute("FontName");
   bool restoring=requested==originalFont;if(restoring)RestoreCalls++;else ChangeCalls++;
   if(restoring && Mode=="rollback-failure")throw new InvalidOperationException("FontProbe rollback rejected");
   if(!restoring && Mode=="xml-noop")return;
   xml=next;fontName=requested;
   if(!restoring){
    if(Mode=="xml-partial" || Mode=="rollback-failure"){X=999;throw new InvalidOperationException("FontProbe partial SetXML failure");}
    if(Mode=="xml-position")X=999;
    if(Mode=="xml-name")Name="CORRUPT";
    if(Mode=="xml-id")xml.DocumentElement.SetAttribute("ID","CORRUPT");
    if(Mode=="xml-payload")xml.SelectSingleNode("/*/DataSources/EmbeddedDataSource/Value").InnerText="CORRUPT";
    if(Mode=="xml-source")((XmlElement)xml.SelectSingleNode("/*/DataSources/EmbeddedDataSource")).SetAttribute("ID","CORRUPT");
    if(Mode=="xml-source-attribute")((XmlElement)xml.SelectSingleNode("/*/DataSources/EmbeddedDataSource")).SetAttribute("CultureID","999");
    if(Mode=="xml-fontsize")FontSize=77;
    if(Mode=="xml-font-readback")((XmlElement)xml.SelectSingleNode("/*/Font")).SetAttribute("FontName",originalFont);
    if(Mode=="xml-other-node")xml.DocumentElement.AppendChild(xml.CreateElement("Unexpected"));
    if(Mode=="xml-fit-bounds"){xml.DocumentElement.SetAttribute("FitWidth","2.000 in");xml.DocumentElement.SetAttribute("FitHeight","0.200 in");}
   }
  }
 }
 public static class Bmp {
  static void Put(byte[] b,int p,int n){Array.Copy(BitConverter.GetBytes(n),0,b,p,4);}
  public static void Write(string path,int w,int h,int left,int top,int iw,int ih,int dpi){
   int stride=((w+31)/32)*4;byte[] b=new byte[62+stride*h];b[0]=66;b[1]=77;Put(b,2,b.Length);Put(b,10,62);Put(b,14,40);Put(b,18,w);Put(b,22,h);b[26]=1;b[28]=1;Put(b,38,(int)Math.Round(dpi/.0254));Put(b,42,(int)Math.Round(dpi/.0254));b[58]=255;b[59]=255;b[60]=255;
   for(int y=0;y<h;y++)for(int x=0;x<w;x++){bool ink=x>=left && x<left+iw && y>=top && y<top+ih;if(!ink)b[62+(h-1-y)*stride+x/8]|=(byte)(1<<(7-x%8));}File.WriteAllBytes(path,b);
  }
 }
}
