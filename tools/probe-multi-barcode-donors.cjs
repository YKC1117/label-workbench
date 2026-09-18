const fs=require('fs');
const vm=require('vm');

const SEEDS=['qr-rich','c39-rich','upca-rich','ean13-rich','gs1128-rich','pdf417-rich','itf14-rich','qr-c39','gtl-a5','ford-gtl'];
function ctx(){
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
  c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return c;
}
function cloud(){
  const t=fs.readFileSync('assets/cloud-config.js','utf8');
  return{url:(/url:\s*'([^']+)'/.exec(t)||[])[1],key:(/key:\s*'([^']+)'/.exec(t)||[])[1]}
}
async function load(seed){
  const C=ctx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap,c=cloud();
  const r=await fetch(c.url+'/functions/v1/btw-seed?seed='+encodeURIComponent(seed),{headers:{apikey:c.key}});
  if(!r.ok){console.log('SEED_FAIL',seed,r.status,await r.text());return}
  const bytes=new Uint8Array(await r.arrayBuffer()),p=F.parseStructure(bytes),ct=await F.inflateContainer(p),map=M.mapContainer(ct);
  const bars=map.objects.filter(o=>o.kind==='barcode').map(o=>({
    index:o.index,name:o.name,owner:o.owner,type:o.barcodeType,
    components:o.components,resolved:o.resolvedPreview,
    refs:o.linkedDataSourceRefs,
    x:o.xMil,y:o.yMil
  }));
  const text=map.objects.filter(o=>o.kind==='text'&&o.valueEntry&&/^Text\s+\d+/i.test(o.name||'')&&o.owner!=='EditControlData'&&o.owner!=='PictureData');
  console.log('DONOR_POOL',JSON.stringify({
    seed,seedId:r.headers.get('x-label-workbench-seed'),
    app:p.header.applicationVersion,compatible:p.header.compatibleVersion,
    template:(/<TemplateSize>([^<]+)/i.exec(p.header.text||'')||[])[1]||'',
    bytes:bytes.length,textSlots:text.length,
    barcodes:bars
  },null,2));
}
(async()=>{for(const seed of SEEDS)await load(seed)})().catch(e=>{console.error(e);process.exit(1)});
