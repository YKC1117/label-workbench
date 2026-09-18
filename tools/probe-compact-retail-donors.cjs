const fs=require('fs');
const vm=require('vm');

const TERMS=['UPC-E','UPCE','EAN-8','EAN8'];
const BASE='https://www.bartendersoftware.com';

function uniq(a){return [...new Set(a)]}
async function get(url){
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchCompactRetailProbe/1.0'}});
  return{status:r.status,url:r.url,type:r.headers.get('content-type')||'',text:await r.text()}
}
function idsFrom(text){
  return uniq([
    ...[...text.matchAll(/download-resource\?resourceId=(\d{4,8})/gi)].map(m=>m[1]),
    ...[...text.matchAll(/(?:resourceId|resource_id|resource-id|resource|download|asset|entry)[^0-9]{0,40}(\d{4,8})/gi)].map(m=>m[1]),
    ...[...text.matchAll(/["']?id["']?\s*[:=]\s*["']?(\d{4,8})/gi)].map(m=>m[1]),
    ...[...text.matchAll(/value=["'](\d{4,8})["']/gi)].map(m=>m[1])
  ]).filter(id=>Number(id)>1000&&Number(id)<99999999)
}
function urlsFrom(text){
  return uniq([...text.matchAll(/https?:\/\/[^"'<>\s]+/gi)].map(m=>m[0].replace(/&amp;/g,'&')))
}
async function inspectDiscovery(){
  const urls=[
    BASE+'/robots.txt',
    BASE+'/sitemap.xml',
    BASE+'/sitemap_index.xml',
    BASE+'/resources/library',
    BASE+'/resources/library?search=UPC-E',
    BASE+'/resources/library?search=EAN-8',
    BASE+'/resources/library?q=UPC-E',
    BASE+'/resources/library?q=EAN-8'
  ];
  const pageCandidates=[];
  const ids=[];
  for(const url of urls){
    try{
      const r=await get(url);
      console.log('\nDISCOVERY_PAGE',url,'=>',r.status,r.url,r.type,'chars',r.text.length);
      for(const term of TERMS){
        const idx=r.text.toUpperCase().indexOf(term.toUpperCase());
        if(idx>=0)console.log('TERM_HIT',term,r.text.slice(Math.max(0,idx-500),idx+1200).replace(/\s+/g,' '));
      }
      ids.push(...idsFrom(r.text));
      for(const u of urlsFrom(r.text)){
        if(/sitemap|resources\/library/i.test(u))pageCandidates.push(u)
      }
      const endpoints=uniq([...r.text.matchAll(/["']([^"']*(?:api|search|resource)[^"']*)["']/gi)].map(m=>m[1]))
        .filter(v=>v.length<300).slice(0,80);
      if(endpoints.length)console.log('ENDPOINT_HINTS',endpoints);
    }catch(e){console.log('DISCOVERY_FAIL',url,String(e?.message||e))}
  }
  console.log('DISCOVERY_IDS',uniq(ids).slice(0,200));
  console.log('DISCOVERY_URLS',uniq(pageCandidates).slice(0,200));
  return{ids:uniq(ids),pages:uniq(pageCandidates)}
}

function ctx(){
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
  c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of['assets/btw-format.js','assets/btw-object-map.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return c
}
async function inspectResources(ids){
  const C=ctx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  for(const id of ids.slice(0,120)){
    try{
      const r=await fetch(BASE+'/download-resource?resourceId='+id,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchCompactRetailProbe/1.0'}});
      const bytes=new Uint8Array(await r.arrayBuffer());
      if(bytes.length<1024)continue;
      let p,ct,map;try{p=F.parseStructure(bytes);ct=await F.inflateContainer(p);map=M.mapContainer(ct)}catch{continue}
      const bars=map.objects.filter(o=>o.kind==='barcode');
      const hits=bars.filter(o=>o.owner==='BcUPCEData'||o.owner==='BcEAN8Data'||o.barcodeType==='UPC-E'||o.barcodeType==='EAN-8');
      if(hits.length)console.log('NATIVE_COMPACT_DONOR',{
        id,app:p.header.applicationVersion,compatible:p.header.compatibleVersion,
        template:(/<TemplateSize>([^<]+)/i.exec(p.header.text||'')||[])[1]||'',
        bytes:bytes.length,
        bars:bars.map(o=>({name:o.name,owner:o.owner,type:o.barcodeType,resolved:o.resolvedPreview,components:o.components,record:[o.recordStart,o.recordEnd]})),
        writableText:map.objects.filter(o=>o.kind==='text'&&o.valueEntry&&/^Text\s+\d+/i.test(o.name||'')).length
      })
    }catch{}
  }
}
(async()=>{
  const d=await inspectDiscovery();
  await inspectResources(d.ids);
})().catch(e=>{console.error(e);process.exit(1)});
