const fs=require('fs');
const vm=require('vm');

function assert(c,m){if(!c)throw new Error(m)}
function ctx(){
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
  c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return c
}
function cloud(){
  const t=fs.readFileSync('assets/cloud-config.js','utf8');
  return{url:(/url:\s*'([^']+)'/.exec(t)||[])[1],key:(/key:\s*'([^']+)'/.exec(t)||[])[1]}
}
async function seed(seedKey){
  const c=cloud(),r=await fetch(c.url+'/functions/v1/btw-seed?seed='+encodeURIComponent(seedKey),{headers:{apikey:c.key}});
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(!r.ok)throw new Error(seedKey+' '+r.status+' '+Buffer.from(bytes).toString('utf8').slice(0,400));
  return{bytes,headers:Object.fromEntries(r.headers.entries())}
}
function summarize(o){
  return{
    index:o.index,name:o.name,owner:o.owner,type:o.barcodeType,
    value:o.value,components:o.components,resolvedPreview:o.resolvedPreview,
    linked:o.linkedDataSourceRefs,
    entries:(o.componentEntries||[]).map(e=>({value:e.value,entry:e.entry,readEntry:e.readEntry})),
    record:[o.recordStart,o.recordEnd]
  }
}
function candidateMirrors(F,container,b){
  return F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true})
    .filter(e=>e.offset>=b.recordStart&&e.offset<b.recordEnd)
    .filter(e=>['Sample Text','Enter Data','Item # ','Item #','Text'].includes(String(e.text||'')));
}
async function round(C,parsed,container,editDesc,edited,owner,type,payload){
  const F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  const rebuilt=await F.rebuild(parsed,edited),rp=F.parseStructure(rebuilt),rc=await F.inflateContainer(rp),rm=M.mapContainer(rc),rb=rm.objects.find(o=>o.owner===owner&&o.barcodeType===type);
  console.log('WRITE_EXPERIMENT',{
    edit:editDesc,owner,type,payload,
    ownerAfter:rb?.owner,typeAfter:rb?.barcodeType,
    componentsAfter:rb?.components,resolvedAfter:rb?.resolvedPreview,
    linkedAfter:rb?.linkedDataSourceRefs,bytes:rebuilt.byteLength
  });
  return{rebuilt,rb,rm,rc}
}
async function inspect({seedKey,owner,type,payload}){
  const C=ctx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  const got=await seed(seedKey),parsed=F.parseStructure(got.bytes),container=await F.inflateContainer(parsed),map=M.mapContainer(container);
  const b=map.objects.find(o=>o.owner===owner&&o.barcodeType===type);
  assert(b,seedKey+' native barcode missing');
  console.log('\nFAMILY_DONOR',{
    seedKey,header:parsed.header.applicationVersion,compatible:parsed.header.compatibleVersion,
    template:(/<TemplateSize>([^<]+)/i.exec(parsed.header.text||'')||[])[1]||'',
    headers:got.headers,barcode:summarize(b),
    writableTexts:map.objects.filter(o=>o.kind==='text'&&o.valueEntry).map(o=>({index:o.index,name:o.name,value:o.value,owner:o.owner}))
  });

  if(b.componentEntries?.length){
    try{
      const comps=b.componentEntries.map((_,i)=>i===0?payload:'');
      const ed=M.editContainer(container,[{index:b.index,barcodeComponents:comps}]);
      await round(C,parsed,container,'barcodeComponents:first-payload-rest-empty',ed,owner,type,payload);
    }catch(e){console.log('WRITE_FAIL',{seedKey,mode:'components',error:String(e?.message||e)})}
  }

  for(const ref of b.linkedDataSourceRefs||[]){
    const o=map.objects.find(x=>x.index===ref.index);
    if(!o?.valueEntry)continue;
    try{
      const ed=M.editContainer(container,[{index:o.index,value:payload}]);
      await round(C,parsed,container,'linked-text:'+o.name,ed,owner,type,payload);
    }catch(e){console.log('WRITE_FAIL',{seedKey,mode:'linked',name:o.name,error:String(e?.message||e)})}
  }

  for(const m of candidateMirrors(F,container,b)){
    try{
      const ed=F.replaceStringAt(container,m,payload);
      await round(C,parsed,container,'mirror@'+m.offset+':'+JSON.stringify(m.text),ed,owner,type,payload);
    }catch(e){console.log('WRITE_FAIL',{seedKey,mode:'mirror',offset:m.offset,error:String(e?.message||e)})}
  }
}
(async()=>{
  await inspect({seedKey:'gs1128-rich',owner:'BcUCCEAN128Data',type:'GS1-128',payload:'010950110153000310ABC123'});
  await inspect({seedKey:'pdf417-rich',owner:'BcPdf417Data',type:'PDF417',payload:'PDF417_NATIVE_PAYLOAD_20260918'});
})().catch(e=>{console.error(e);process.exit(1)});
