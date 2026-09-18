const fs=require('fs');
const vm=require('vm');

const PAGES=[
  {key:'retailfoodlabel',url:'https://www.bartendersoftware.com/resources/library/retailfoodlabel'},
  {key:'dc-shipper',url:'https://www.bartendersoftware.com/resources/library/dc-shipper'},
  {key:'library-tracking',url:'https://www.bartendersoftware.com/resources/library/library-tracking'}
];

function makeCtx(){
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
  c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of['assets/btw-format.js','assets/btw-object-map.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return c;
}
function candidateIds(html){
  return [...new Set([
    ...[...html.matchAll(/download-resource\?resourceId=(\d{4,8})/gi)].map(m=>m[1]),
    ...[...html.matchAll(/(?:resourceId|resource_id|resource-id|resource|download|asset|entry)[^0-9]{0,40}(\d{4,8})/gi)].map(m=>m[1]),
    ...[...html.matchAll(/["']?id["']?\s*[:=]\s*["']?(\d{4,8})/gi)].map(m=>m[1]),
    ...[...html.matchAll(/value=["'](\d{4,8})["']/gi)].map(m=>m[1])
  ])].filter(x=>Number(x)>1000&&Number(x)<99999999);
}
function recordStrings(F,container,obj){
  return F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true})
    .filter(e=>e.offset>=obj.recordStart&&e.offset<obj.recordEnd);
}
function summarizeRecord(F,container,obj){
  const rows=recordStrings(F,container,obj);
  return rows.map(e=>e.text).filter(Boolean).slice(0,120);
}
function mirrorCandidates(F,container,obj){
  const rows=recordStrings(F,container,obj),out=[];
  for(let i=0;i<rows.length;i++){
    const t=String(rows[i].text||'');
    if(t==='Sample Text'||t==='Enter Data'||/^\d{6,18}$/.test(t))out.push({offset:rows[i].offset,text:t});
  }
  return out;
}
async function inspectResource(page,id){
  const C=makeCtx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  const url='https://www.bartendersoftware.com/download-resource?resourceId='+id;
  const res=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchITFProbe/1.0'}});
  const bytes=new Uint8Array(await res.arrayBuffer());
  try{
    const parsed=F.parseStructure(bytes),container=await F.inflateContainer(parsed),map=M.mapContainer(container),bars=map.objects.filter(o=>o.kind==='barcode');
    if(!bars.length)return;
    console.log('RESOURCE',{
      page:page.key,id,app:parsed.header.applicationVersion,compatible:parsed.header.compatibleVersion,
      size:(/<TemplateSize>([^<]+)/i.exec(parsed.header.text||'')||[])[1]||'',
      bytes:bytes.length,
      bars:bars.map(b=>({index:b.index,name:b.name,owner:b.owner,type:b.barcodeType,components:b.components,resolved:b.resolvedPreview,xMil:b.xMil,yMil:b.yMil,record:[b.recordStart,b.recordEnd]}))
    });
    for(const b of bars){
      console.log('BARCODE_RECORD',{
        page:page.key,id,owner:b.owner,type:b.barcodeType,
        mirrors:mirrorCandidates(F,container,b),
        strings:summarizeRecord(F,container,b)
      });
    }
  }catch{}
}
(async()=>{
  for(const page of PAGES){
    const html=await (await fetch(page.url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchITFProbe/1.0'}})).text();
    const ids=candidateIds(html);
    console.log('PAGE',page.key,'ids',ids.slice(0,80));
    for(const id of ids.slice(0,60))await inspectResource(page,id);
  }
})().catch(e=>{console.error(e);process.exit(1)});
