const fs=require('fs');
const vm=require('vm');

const ids=[
  ...Array.from({length:21},(_,i)=>79765+i),
  ...Array.from({length:16},(_,i)=>80040+i)
];

function ctx(){
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
  c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of['assets/btw-format.js','assets/btw-object-map.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return c;
}

async function fetchOne(id){
  const url='https://www.bartendersoftware.com/download-resource?resourceId='+id;
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchEAN8UPCEProbe/1.0'}});
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(bytes.length<1024)return null;
    const C=ctx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
    const p=F.parseStructure(bytes),container=await F.inflateContainer(p),map=M.mapContainer(container);
    const bars=map.objects.filter(o=>o.kind==='barcode');
    if(!bars.length)return null;
    return{
      id,
      app:p.header.applicationVersion,
      compatible:p.header.compatibleVersion,
      size:(/<TemplateSize>([^<]+)/i.exec(p.header.text||'')||[])[1]||'',
      bytes:bytes.length,
      bars:bars.map(b=>({owner:b.owner,type:b.barcodeType,preview:b.resolvedPreview,components:b.components,x:b.xMil,y:b.yMil})),
      writableText:map.objects.filter(o=>o.kind==='text'&&o.valueEntry&&/^Text\s+\d+$/i.test(String(o.name||''))).length
    };
  }catch(e){return null}
}

(async()=>{
  const found=[];
  for(let i=0;i<ids.length;i+=6){
    const batch=await Promise.all(ids.slice(i,i+6).map(fetchOne));
    for(const row of batch.filter(Boolean)){
      console.log('VALID_RESOURCE',JSON.stringify(row));
      found.push(row);
    }
  }
  const targets=found.filter(r=>r.bars.some(b=>b.owner==='BcEAN8Data'||b.owner==='BcUPCEData'||b.type==='EAN-8'||b.type==='UPC-E'));
  console.log('TARGETS',JSON.stringify(targets,null,2));
  if(!targets.length)console.log('NO_TARGET_IN_PRIMARY_WINDOWS');
})().catch(e=>{console.error(e);process.exit(1)});
