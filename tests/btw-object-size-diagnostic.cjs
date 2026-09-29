const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-second-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const i32=(d,o)=>new DataView(d.buffer,d.byteOffset,d.byteLength).getInt32(o,true);
const u32=(d,o)=>new DataView(d.buffer,d.byteOffset,d.byteLength).getUint32(o,true);
const f32=(d,o)=>new DataView(d.buffer,d.byteOffset,d.byteLength).getFloat32(o,true);
const round=v=>Number.isFinite(v)?Math.round(v*1000)/1000:null;

(async()=>{
  const D=c.LabelWorkbenchBtwSecondDonor,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  const bytes=new Uint8Array(await D.bytes()),parsed=F.parseStructure(bytes),container=await F.inflateContainer(parsed),objects=M.mapContainer(container).objects;
  const selected=[
    ...objects.filter(o=>o.kind==='text'&&/^(?:Text|文字)\s*\d+/i.test(o.name||'')).slice(0,8),
    ...objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128').slice(0,5),
    ...objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix').slice(0,1)
  ];
  for(const o of selected){
    const words=[];
    for(let rel=0;rel<=80;rel+=4){
      const off=o.recordStart+rel;
      if(off+4>o.recordEnd)break;
      words.push({rel,i32:i32(container,off),u32:u32(container,off),f32:round(f32(container,off))});
    }
    console.log('SIZE_DIAG '+JSON.stringify({
      index:o.index,kind:o.kind,name:o.name,barcodeType:o.barcodeType||'',recordStart:o.recordStart,recordEnd:o.recordEnd,
      xMil:o.xMil,yMil:o.yMil,xMm:o.xMm,yMm:o.yMm,fontSize:o.fontSize,words
    }));
  }
  console.log('PASS: BTW object size diagnostic complete');
})().catch(e=>{console.error(e);process.exit(1)});