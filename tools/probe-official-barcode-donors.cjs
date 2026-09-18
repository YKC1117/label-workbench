const fs=require('fs');
const vm=require('vm');

const targets=[
  {key:'qr-vcard',kind:'binary',url:'https://support.seagullsoftware.com/hc/en-us/article_attachments/360048733973'},
  {key:'qr-code39-template',kind:'html',url:'https://www.bartendersoftware.com/resources/library/asset-label-2-x-1-code-39-qr-code'},
  {key:'code39-template',kind:'html',url:'https://www.bartendersoftware.com/resources/library/inventory-stock'},
  {key:'upca-template',kind:'html',url:'https://www.bartendersoftware.com/resources/library/retail-upc-a-label'},
  {key:'qr-code39-resource-79738',kind:'parsed',url:'https://www.bartendersoftware.com/download-resource?resourceId=79738'},
  {key:'code39-resource-79914',kind:'parsed',url:'https://www.bartendersoftware.com/download-resource?resourceId=79914'},
  {key:'upca-resource-80046',kind:'parsed',url:'https://www.bartendersoftware.com/download-resource?resourceId=80046'}
];

function asciiHeader(bytes,n=1800){return Buffer.from(bytes.slice(0,n)).toString('latin1').replace(/[^\x20-\x7e\r\n\t]/g,'.')}
function utf16Strings(data,min=3){
  const out=[];
  for(let i=0;i+4<data.length;i++){
    let s='',j=i;
    while(j+1<data.length&&data[j+1]===0&&data[j]>=0x20&&data[j]<=0x7e){s+=String.fromCharCode(data[j]);j+=2}
    if(s.length>=min){out.push(s);i=j-1}
  }
  return [...new Set(out)]
}

async function inspectBinary(t){
  const res=await fetch(t.url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchDonorProbe/1.0'}});
  const bytes=new Uint8Array(await res.arrayBuffer());
  console.log('\n===',t.key,'===');
  console.log('status',res.status,'type',res.headers.get('content-type'),'url',res.url,'bytes',bytes.length);
  console.log('header',JSON.stringify(asciiHeader(bytes,900).slice(0,700)));
  if(bytes.length<1024)throw new Error(t.key+' binary too small');
  const text=Buffer.from(bytes.slice(0,4096)).toString('utf8');
  if(!/Bar Tender Format File/i.test(text))throw new Error(t.key+' is not a BarTender file');
  const strings=utf16Strings(bytes);
  const owners=strings.filter(s=>/^Bc[A-Za-z0-9]+Data$/.test(s));
  console.log('Bc owner strings',owners);
  console.log('barcode hints',strings.filter(s=>/QR|Code\s*39|UPC|EAN|Barcode/i.test(s)).slice(0,80));
  fs.writeFileSync('/tmp/'+t.key+'.btw',Buffer.from(bytes));
}

function analyzeLinks(map,container,F){
  const names=new Map(map.objects.filter(o=>o.name).map(o=>[o.name,o]));
  const all=F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true});
  const out=[];
  for(const b of map.objects.filter(o=>o.kind==='barcode')){
    const strings=all.filter(e=>e.offset>=b.recordStart&&e.offset<b.recordEnd);
    const refs=[];
    for(const e of strings){
      const v=String(e.text||'').trim();
      if(names.has(v)&&names.get(v)!==b){
        const target=names.get(v);
        refs.push({ref:v,index:target.index,kind:target.kind,value:target.value,owner:target.owner,rootPath:target.rootPath});
      }
    }
    out.push({
      barcode:{index:b.index,name:b.name,owner:b.owner,rootPath:b.rootPath,xMil:b.xMil,yMil:b.yMil},
      refs,
      likelyValues:strings.map(e=>String(e.text||'').trim()).filter(v=>v && !/^(?:Root\.|Screen Data|DataSource|Box Options|Enter Data|Functions and Subs|OnProcessData|OnPostSerialize)$/i.test(v)).slice(0,80)
    });
  }
  return out
}

async function parseOfficialBtw(t){
  const res=await fetch(t.url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchDonorProbe/1.1'}});
  const bytes=new Uint8Array(await res.arrayBuffer());
  console.log('\n===',t.key,'===');
  console.log('status',res.status,'type',res.headers.get('content-type'),'url',res.url,'bytes',bytes.length);
  if(bytes.length<1024)throw new Error(t.key+' too small');
  const ctx={
    console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,
    Blob,Response,CompressionStream,DecompressionStream,atob,btoa,
    window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}
  };
  ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
  for(const file of['assets/btw-format.js','assets/btw-object-map.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
  const F=ctx.LabelWorkbenchBtwFormat,M=ctx.LabelWorkbenchBtwObjectMap;
  const parsed=F.parseStructure(bytes),container=await F.inflateContainer(parsed),map=M.mapContainer(container);
  const barcodeObjects=map.objects.filter(o=>o.kind==='barcode');
  console.log('header',{
    applicationVersion:parsed.header.applicationVersion,
    compatibleVersion:parsed.header.compatibleVersion,
    templateSize:(/<TemplateSize>([^<]+)/i.exec(parsed.header.text||'')||[])[1]||''
  });
  console.log('tags',M.mapContainer(container).objects.filter(o=>o.kind==='barcode').map(o=>({index:o.index,name:o.name,owner:o.owner,barcodeType:o.barcodeType,components:o.components,resolvedPreview:o.resolvedPreview,xMil:o.xMil,yMil:o.yMil})));
  console.log('barcode owners',[...new Set(barcodeObjects.map(o=>o.owner))]);
  console.log('barcode types',[...new Set(barcodeObjects.map(o=>o.barcodeType))]);
  console.log('LINK_ANALYSIS',JSON.stringify(analyzeLinks(map,container,F),null,2));
  const allStrings=F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true});
  for(const o of barcodeObjects){
    const rows=allStrings.filter(e=>e.offset>=o.recordStart&&e.offset<o.recordEnd).map(e=>({offset:e.offset,text:e.text})).filter(e=>String(e.text??'').length||true);
    console.log('BARCODE_RECORD',o.name,o.owner,rows.slice(0,120));
  }
  console.log('ALL_OBJECTS',map.objects.map(o=>({index:o.index,kind:o.kind,name:o.name,owner:o.owner,value:o.value,components:o.components,xMil:o.xMil,yMil:o.yMil})));
  fs.writeFileSync('/tmp/'+t.key+'.btw',Buffer.from(bytes));
}

async function inspectHtml(t){
  const res=await fetch(t.url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchDonorProbe/1.0'}});
  const html=await res.text();
  console.log('\n===',t.key,'===');
  console.log('status',res.status,'type',res.headers.get('content-type'),'url',res.url,'chars',html.length);
  const pats=[
    /download-resource[^"'<>\s]{0,200}/gi,
    /resourceId.{0,120}/gi,
    /resource[_-]?id.{0,120}/gi,
    /(?:href|url|download)[^\n]{0,220}\.btw[^\n]{0,120}/gi,
    /"id"\s*:\s*\d{4,8}.{0,160}/gi
  ];
  for(const re of pats){
    const hits=[...html.matchAll(re)].map(m=>m[0]).slice(0,30);
    if(hits.length)console.log(String(re),hits);
  }
  const numeric=[...new Set([...html.matchAll(/(?:resource|download|asset|entry)[^0-9]{0,20}(\d{4,8})/gi)].map(m=>m[1]))];
  console.log('candidate numeric ids',numeric.slice(0,80));
}

(async()=>{
  for(const t of targets){
    try{
      if(t.kind==='binary')await inspectBinary(t);
      else if(t.kind==='parsed')await parseOfficialBtw(t);
      else await inspectHtml(t);
    }
    catch(err){console.error('PROBE_FAIL',t.key,err?.stack||err)}
  }
})().catch(err=>{console.error(err);process.exit(1)});
