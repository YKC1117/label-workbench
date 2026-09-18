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

async function probeItf14Edit(){
  const C=makeCtx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap;
  const res=await fetch('https://www.bartendersoftware.com/download-resource?resourceId=79807',{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchITFProbe/1.1'}});
  const bytes=new Uint8Array(await res.arrayBuffer()),parsed=F.parseStructure(bytes),container=await F.inflateContainer(parsed),map=M.mapContainer(container);
  const b=map.objects.find(o=>o.owner==='BcITF14Data');
  if(!b)throw new Error('ITF14 donor missing');
  const rows=recordStrings(F,container,b),mirrors=[];
  for(let i=0;i<rows.length-1;i++){
    if(rows[i].text!=='(???) ???-????')continue;
    for(let j=i+1;j<Math.min(rows.length,i+5);j++)if(rows[j].text==='Sample Text'){mirrors.push(rows[j]);break}
  }
  console.log('ITF14_EDIT_CANDIDATES',{app:parsed.header.applicationVersion,compatible:parsed.header.compatibleVersion,mirrors:mirrors.map(x=>x.offset)});
  const payload='10012345000017';
  for(const m of mirrors){
    const edited=F.replaceStringAt(container,m,payload),rebuilt=await F.rebuild(parsed,edited),rp=F.parseStructure(rebuilt),rc=await F.inflateContainer(rp),rm=M.mapContainer(rc),rb=rm.objects.find(o=>o.owner==='BcITF14Data');
    const dv=new DataView(rc.buffer,rc.byteOffset,rc.byteLength),pairs=[];
    for(const mm of [[100,150],[100.076,150.114],[101.6,150.114],[100,152.4]]){
      const w=Math.round(mm[0]/0.0254),h=Math.round(mm[1]/0.0254),offs=[];
      for(let i=0;i<=rc.byteLength-8;i++)if(dv.getInt32(i,true)===w&&dv.getInt32(i+4,true)===h)offs.push(i);
      if(offs.length)pairs.push({mm,offsets:offs.slice(0,20),count:offs.length});
    }
    const writable=rm.objects.filter(o=>o.kind==='text'&&o.valueEntry&&/^Text\s+\d+$/i.test(String(o.name||''))&&o.owner!=='EditControlData'&&o.owner!=='PictureData');
    console.log('ITF14_EDIT_RESULT',{
      offset:m.offset,payload,ownerAfter:rb?.owner,typeAfter:rb?.barcodeType,
      resolvedAfter:rb?.resolvedPreview,componentsAfter:rb?.components,
      template:(/<TemplateSize>([^<]+)/i.exec(rp.header.text||'')||[])[1]||'',
      internalPairs:pairs,writableText:writable.length,writableNames:writable.map(o=>o.name)
    });
  }
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
  await probeItf14Edit();
  for(const page of PAGES){
    const html=await (await fetch(page.url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchITFProbe/1.0'}})).text();
    const ids=candidateIds(html);
    console.log('PAGE',page.key,'ids',ids.slice(0,80));
    for(const id of ids.slice(0,60))await inspectResource(page,id);
  }
})().catch(e=>{console.error(e);process.exit(1)});
