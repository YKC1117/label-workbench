const fs=require('fs'),vm=require('vm');
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of ['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
(async()=>{const D=c.LabelWorkbenchBtwControlledDonor,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,b=new Uint8Array(await D.bytes()),p=F.parseStructure(b),m=M.mapContainer(await F.inflateContainer(p));
for(const o of m.objects.filter(x=>x.kind==='text'&&/^(?:Text|文字)\s*\d+/i.test(x.name||''))){
 console.log(JSON.stringify({index:o.index,name:o.name,x:o.xMil,y:o.yMil,font:o.fontName,size:o.fontSize,root:o.rootPath,value:o.value,boxX:o.textBoxXMil,boxY:o.textBoxYMil}));
}})().catch(e=>{console.error(e);process.exit(1)});