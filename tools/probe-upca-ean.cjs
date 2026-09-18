const fs=require('fs');
const vm=require('vm');

const RESOURCES=[
  {key:'upca-rich',seed:'upca-rich',owner:'BcUPCAData',type:'UPC-A',payload:'036602301972'},
];
const EAN_PAGES=[
  'https://www.bartendersoftware.com/resources/library/branded-food-label-with-date',
  'https://www.bartendersoftware.com/resources/library/accessory-box',
  'https://www.bartendersoftware.com/resources/library/canning-jar-label'
];

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
async function seedBytes(seed){
  const c=cloud(),r=await fetch(c.url+'/functions/v1/btw-seed?seed='+encodeURIComponent(seed),{headers:{apikey:c.key}});
  if(!r.ok)throw new Error(seed+' seed '+r.status);
  return new Uint8Array(await r.arrayBuffer())
}
function editableMirror(F,container,obj){
  const entries=F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true})
    .filter(e=>e.offset>=obj.recordStart&&e.offset<obj.recordEnd);
  const placeholder='(???) ???-????';
  const hits=[];
  for(let i=0;i<entries.length-1;i++){
    if(entries[i].text!==placeholder)continue;
    for(let j=i+1;j<Math.min(entries.length,i+5);j++){
      if(entries[j].text==='Sample Text'){hits.push(entries[j]);break}
    }
  }
  return hits;
}
async function probeUpc(){
  const C=ctx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  for(const r of RESOURCES){
    const bytes=await seedBytes(r.seed),parsed=F.parseStructure(bytes),container=await F.inflateContainer(parsed),map=M.mapContainer(container);
    const b=map.objects.find(o=>o.owner===r.owner);
    if(!b)throw new Error(r.owner+' missing');
    const mirrors=editableMirror(F,container,b);
    console.log('UPC_MIRROR_CANDIDATES',{seed:r.seed,header:parsed.header.applicationVersion,record:[b.recordStart,b.recordEnd],count:mirrors.length,mirrors:mirrors.map(x=>({offset:x.offset,text:x.text}))});
    for(const m of mirrors){
      try{
        const edited=F.replaceStringAt(container,m,r.payload),rebuilt=await F.rebuild(parsed,edited),rp=F.parseStructure(rebuilt),rc=await F.inflateContainer(rp),rm=M.mapContainer(rc),rb=rm.objects.find(o=>o.owner===r.owner);
        const strings=F.scanUtf16Strings(rc,{minLength:0,maxLength:10000,includeEmpty:true}).filter(e=>e.offset>=rb.recordStart&&e.offset<rb.recordEnd).map(e=>e.text);
        console.log('UPC_MIRROR_EDIT',{
          seed:r.seed,offset:m.offset,payload:r.payload,ownerAfter:rb?.owner,typeAfter:rb?.barcodeType,
          componentAfter:rb?.components,resolvedAfter:rb?.resolvedPreview,
          payloadPresentInRecord:strings.includes(r.payload),sampleTextStillPresent:strings.includes('Sample Text'),
          bytes:rebuilt.byteLength
        });
      }catch(e){console.log('UPC_MIRROR_EDIT_FAIL',{seed:r.seed,offset:m.offset,error:String(e?.message||e)})}
    }
  }
}
async function discoverEan(){
  const C=ctx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  for(const page of EAN_PAGES){
    try{
      const h=await (await fetch(page,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchEANProbe/1.0'}})).text();
      const ids=[...new Set([
        ...[...h.matchAll(/download-resource\?resourceId=(\d{4,8})/gi)].map(m=>m[1]),
        ...[...h.matchAll(/(?:resourceId|resource_id|resource-id|resource|download|asset|entry)[^0-9]{0,40}(\d{4,8})/gi)].map(m=>m[1]),
        ...[...h.matchAll(/["']?id["']?\s*[:=]\s*["']?(\d{4,8})/gi)].map(m=>m[1]),
        ...[...h.matchAll(/value=["'](\d{4,8})["']/gi)].map(m=>m[1])
      ])].filter(id=>Number(id)>1000&&Number(id)<99999999);
      console.log('EAN_PAGE',page,'ids',ids.slice(0,60));
      for(const id of ids.slice(0,40)){
        try{
          const rr=await fetch('https://www.bartendersoftware.com/download-resource?resourceId='+id,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchEANProbe/1.0'}});
          const bytes=new Uint8Array(await rr.arrayBuffer());
          const p=F.parseStructure(bytes),ct=await F.inflateContainer(p),map=M.mapContainer(ct),bars=map.objects.filter(o=>o.kind==='barcode');
          console.log('EAN_RESOURCE',{page,id,app:p.header.applicationVersion,compatible:p.header.compatibleVersion,types:bars.map(x=>x.barcodeType),owners:bars.map(x=>x.owner),bytes:bytes.length});
        }catch(e){console.log('EAN_RESOURCE_SKIP',page,id,String(e?.message||e))}
      }
    }catch(e){console.log('EAN_PAGE_FAIL',page,String(e?.message||e))}
  }
}
(async()=>{await probeUpc();await discoverEan()})().catch(e=>{console.error(e);process.exit(1)});
