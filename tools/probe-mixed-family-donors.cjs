const fs=require('fs');
const vm=require('vm');

const SEEDS=['cea','gtl-a5','ford-gtl','qr-c39'];

function makeCtx(){
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
  c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return c;
}
function cloud(){
  const t=fs.readFileSync('assets/cloud-config.js','utf8');
  return {url:(/url:\s*'([^']+)'/.exec(t)||[])[1],key:(/key:\s*'([^']+)'/.exec(t)||[])[1]};
}
async function fetchSeed(seed){
  const c=cloud(),r=await fetch(c.url+'/functions/v1/btw-seed?seed='+encodeURIComponent(seed),{headers:{apikey:c.key}});
  if(!r.ok)throw new Error(seed+' '+r.status+' '+await r.text());
  return {bytes:new Uint8Array(await r.arrayBuffer()),headers:Object.fromEntries(r.headers.entries())};
}
function writableTexts(map){
  return map.objects.filter(o=>o.kind==='text'&&o.valueEntry&&/^(?:Text|文字)\s*\d+/i.test(String(o.name||''))&&o.owner!=='EditControlData'&&o.owner!=='PictureData');
}
function refSummary(bar,map){
  return (bar.linkedDataSourceRefs||[]).map(r=>{
    const o=map.objects.find(x=>x.index===r.index);
    return {index:r.index,name:o?.name||'',kind:o?.kind||'',value:o?.value||'',owner:o?.owner||'',writable:!!o?.valueEntry}
  });
}
(async()=>{
  const C=makeCtx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  for(const seed of SEEDS){
    try{
      const {bytes,headers}=await fetchSeed(seed),p=F.parseStructure(bytes),container=await F.inflateContainer(p),map=M.mapContainer(container);
      const bars=map.objects.filter(o=>o.kind==='barcode');
      const texts=writableTexts(map);
      const rows=bars.map((b,i)=>({
        i,
        index:b.index,
        name:b.name,
        owner:b.owner,
        type:b.barcodeType,
        preview:b.resolvedPreview,
        components:b.components,
        componentCount:b.componentEntries?.length||0,
        x:b.xMil,y:b.yMil,
        linked:refSummary(b,map)
      }));
      const types=[...new Set(rows.map(x=>x.type).filter(Boolean))];
      const owners=[...new Set(rows.map(x=>x.owner).filter(Boolean))];
      const links=rows.flatMap(x=>x.linked.map(r=>r.index));
      const duplicateLinked=[...new Set(links.filter((v,i,a)=>a.indexOf(v)!==i))];
      console.log('MIXED_DONOR',JSON.stringify({
        seed,
        seedHeader:headers['x-label-workbench-seed']||'',
        resource:headers['x-label-workbench-resource']||'',
        app:p.header.applicationVersion,
        compatible:p.header.compatibleVersion,
        templateSize:(/<TemplateSize>([^<]+)/i.exec(p.header.text||'')||[])[1]||'',
        bytes:bytes.length,
        objectCount:map.objects.length,
        barcodeCount:bars.length,
        types,owners,
        writableTextCount:texts.length,
        duplicateLinked,
        barcodes:rows
      }));
    }catch(e){console.log('MIXED_DONOR_FAIL',seed,String(e?.stack||e))}
  }
})().catch(e=>{console.error(e);process.exit(1)});
