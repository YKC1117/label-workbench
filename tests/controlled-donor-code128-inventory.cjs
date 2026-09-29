const fs=require('fs'),vm=require('vm');
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of ['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

function round(v,n=6){const p=10**n;return Math.round(v*p)/p}
function read(rec,off,type){
 const dv=new DataView(rec.buffer,rec.byteOffset,rec.byteLength);
 if(type==='i16'&&off+2<=rec.length)return dv.getInt16(off,true);
 if(type==='u16'&&off+2<=rec.length)return dv.getUint16(off,true);
 if(type==='i32'&&off+4<=rec.length)return dv.getInt32(off,true);
 if(type==='u32'&&off+4<=rec.length)return dv.getUint32(off,true);
 if(type==='f32'&&off+4<=rec.length)return round(dv.getFloat32(off,true));
 return null;
}
function plausible(type,v){
 if(v==null||!Number.isFinite(v))return false;
 if(type==='f32')return Math.abs(v)>=0.001&&Math.abs(v)<=100;
 return Math.abs(v)>=1&&Math.abs(v)<=5000;
}
(async()=>{
 const D=c.LabelWorkbenchBtwControlledDonor,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
 const bytes=new Uint8Array(await D.bytes()),p=F.parseStructure(bytes),container=await F.inflateContainer(p),m=M.mapContainer(container);
 fs.mkdirSync('artifacts/btw-diagnostic',{recursive:true});
 fs.writeFileSync('artifacts/btw-diagnostic/controlled-donor.btw',Buffer.from(bytes));
 fs.writeFileSync('artifacts/btw-diagnostic/controlled-donor-container.bin',Buffer.from(container));
 fs.writeFileSync('artifacts/btw-diagnostic/controlled-donor-object-map.json',JSON.stringify(m,null,2));
 const dm=m.objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix'&&o.componentEntries?.length);
 const dmIds=new Set(dm.map(o=>o.index));
 const bars=m.objects.filter(o=>o.kind==='barcode'&&!dmIds.has(o.index)&&o.componentEntries?.length).slice(0,5);
 if(bars.length!==5)throw new Error('expected 5 writable Code128 roots, got '+bars.length);
 console.log('CODE128_OBJECTS '+JSON.stringify(bars.map(o=>({index:o.index,name:o.name,x:o.xMil,y:o.yMil,value:o.resolvedPreview||o.components?.join('')||'',recordLength:o.recordEnd-o.recordStart,owner:o.owner,root:o.rootPath}))));
 const recs=bars.map(o=>container.slice(o.recordStart,o.recordEnd));
 const max=Math.min(...recs.map(r=>r.length),1024);
 for(const type of ['i16','u16','i32','u32','f32']){
   const step=type.includes('16')?2:4,size=step;
   for(let off=8;off+size<=max;off+=step){
     const vals=recs.map(r=>read(r,off,type));
     if(!vals.every(v=>plausible(type,v)))continue;
     const unique=new Set(vals.map(String));
     if(unique.size<2)continue;
     console.log('CODE128_CANDIDATE '+JSON.stringify({type,off,vals}));
   }
 }
})().catch(e=>{console.error(e);process.exit(1)});