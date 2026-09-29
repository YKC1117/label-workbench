const fs=require('fs'),vm=require('vm');
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of ['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
(async()=>{
 const D=c.LabelWorkbenchBtwControlledDonor,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
 const b=new Uint8Array(await D.bytes()),p=F.parseStructure(b),container=await F.inflateContainer(p),map=M.mapContainer(container);
 const entries=F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true});
 const texts=map.objects.filter(o=>o.kind==='text');
 const names=['文字 28','文字 1','文字 5','文字 26'];
 for(const name of names){
   const o=texts.find(x=>x.name===name);if(!o)continue;
   const strings=entries.filter(e=>e.offset>=o.recordStart&&e.offset<o.recordEnd).map(e=>String(e.text??'')).filter(Boolean);
   const interesting=strings.filter(v=>/Wrap|Auto|Fit|Normal|Word|Text|Box|Transform|Scale|Width|Height|Anchor|Align|Paragraph|DataSource|Screen|General|None|Control|Rotation|Spacing|Font/i.test(v));
   console.log('TEXT_PROTO_STRUCT '+JSON.stringify({
     name:o.name,index:o.index,root:o.rootPath,owner:o.owner,recordLength:o.recordEnd-o.recordStart,
     x:o.xMil,y:o.yMil,boxX:o.textBoxXMil,boxY:o.textBoxYMil,boxDx:o.textBoxXMil-o.xMil,boxDy:o.textBoxYMil-o.yMil,
     font:o.fontName,size:o.fontSize,sizeOffset:o.fontSizeOffset,stringsCount:o.stringsCount,
     interesting,allStrings:strings
   }));
 }
})().catch(e=>{console.error(e);process.exit(1)});