const fs=require('fs');
const vm=require('vm');

const targets=[
  {key:'qr-vcard',kind:'binary',url:'https://support.seagullsoftware.com/hc/en-us/article_attachments/360048733973'},
  {key:'qr-code39-template',kind:'html',url:'https://www.bartendersoftware.com/resources/library/asset-label-2-x-1-code-39-qr-code'},
  {key:'code39-template',kind:'html',url:'https://www.bartendersoftware.com/resources/library/inventory-stock'},
  {key:'upca-template',kind:'html',url:'https://www.bartendersoftware.com/resources/library/retail-upc-a-label'},
  {key:'qr-code39-resource-79738',kind:'parsed',url:'https://www.bartendersoftware.com/download-resource?resourceId=79738'},
  {key:'code39-resource-79914',kind:'parsed',url:'https://www.bartendersoftware.com/download-resource?resourceId=79914'},
  {key:'upca-resource-80046',kind:'parsed',url:'https://www.bartendersoftware.com/download-resource?resourceId=80046'},
  {key:'qr-vcard-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/vcard'},
  {key:'qr-2x4-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/asset-label-2-x-4-qr-code'},
  {key:'qr-idbadge-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/id-badge-qrcode'},
  {key:'c39-retail-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/retail-label-2-5-x-1-5'},
  {key:'c39-job-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/joblabel'},
  {key:'upca-sku-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/sku-label'},
  {key:'upca-box-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/box-label'},
  {key:'upca-inside-library',kind:'discover',url:'https://www.bartendersoftware.com/resources/library/inside-label'}
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
  const rawTags=[];
  for(let i=0;i+8<container.length;i++){
    if(container[i]!==0xff||container[i+1]!==0xff||container[i+2]!==0x01||container[i+3]!==0x00)continue;
    const len=container[i+4]|(container[i+5]<<8);if(len<3||len>80||i+6+len>container.length)continue;
    let type='',ok=true;for(let j=0;j<len;j++){const b=container[i+6+j];if(b<0x20||b>0x7e){ok=false;break}type+=String.fromCharCode(b)}
    if(ok&&/^Bc[A-Za-z0-9]+Data$/.test(type))rawTags.push({offset:i,type});
  }
  console.log('ALL_BC_TAGS',rawTags);
  const tagStrings=F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true});
  for(const tag of rawTags){
    const near=tagStrings.filter(e=>e.offset>=Math.max(0,tag.offset-2200)&&e.offset<=tag.offset+4200)
      .map(e=>({offset:e.offset,text:e.text}))
      .filter(e=>String(e.text??'').length);
    console.log('RAW_TAG_WINDOW',tag.type,tag.offset,near.slice(0,140));
  }
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
  const writableText=map.objects.filter(o=>o.kind==='text'&&o.valueEntry);
  console.log('POOL_SUMMARY',{
    totalObjects:map.objects.length,
    writableText:writableText.length,
    writableNames:writableText.map(o=>o.name),
    barcodeTypes:map.objects.filter(o=>o.kind==='barcode').map(o=>o.barcodeType),
    barcodeOwners:map.objects.filter(o=>o.kind==='barcode').map(o=>o.owner),
    linkedWritable:map.objects.filter(o=>o.kind==='barcode').map(o=>({
      type:o.barcodeType,owner:o.owner,
      refs:(o.linkedDataSourceRefs||[]).map(r=>({ref:r.ref,value:r.value,writable:!!map.objects.find(x=>x.index===r.index)?.valueEntry}))
    }))
  });
  console.log('ALL_OBJECTS',map.objects.map(o=>({index:o.index,kind:o.kind,name:o.name,owner:o.owner,value:o.value,valueEntry:o.valueEntry,components:o.components,xMil:o.xMil,yMil:o.yMil})));
  const linkInfo=analyzeLinks(map,container,F);
  for(const link of linkInfo){
    const ref=link.refs[0];
    if(!ref)continue;
    const target=map.objects.find(o=>o.index===ref.index);
    const token=(link.barcode.owner==='BcQrcodeData'?'QR_NATIVE_123':link.barcode.owner==='BcC39RegularData'?'CODE39_NATIVE_123':'036602301972');
    try{
      const edited=M.editContainer(container,[{index:target.index,value:token,xMil:50000,yMil:50000}]);
      const rebuilt=await F.rebuild(parsed,edited);
      const reparsed=F.parseStructure(rebuilt),recontainer=await F.inflateContainer(reparsed),remap=M.mapContainer(recontainer);
      const rb=remap.objects.find(o=>o.owner===link.barcode.owner);
      const rt=remap.objects.find(o=>o.index===target.index);
      console.log('DATASOURCE_EDIT_EXPERIMENT',{
        owner:link.barcode.owner,
        ref:target.name,
        token,
        refBefore:target.value,
        hasValueEntry:!!target.valueEntry,
        refAfter:rt?.value,
        refPosAfter:[rt?.xMil,rt?.yMil],
        barcodeStillNative:!!rb,
        barcodeOwnerAfter:rb?.owner,
        barcodeTypeAfter:rb?.barcodeType,
        rebuiltBytes:rebuilt.byteLength
      });
    }catch(error){
      console.log('DATASOURCE_EDIT_EXPERIMENT_FAIL',{
        owner:link.barcode.owner,ref:target?.name,token,
        hasValueEntry:!!target?.valueEntry,
        error:String(error?.message||error)
      });
    }
  }
  fs.writeFileSync('/tmp/'+t.key+'.btw',Buffer.from(bytes));
}

async function discoverAndParse(t){
  const res=await fetch(t.url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchDonorProbe/1.2'}});
  const html=await res.text();
  const ids=[...new Set([...html.matchAll(/download-resource\?resourceId=(\d{4,8})/gi)].map(m=>m[1]))];
  if(!ids.length){
    for(const m of html.matchAll(/(?:resourceId|resource_id|resource-id)[^0-9]{0,40}(\d{4,8})/gi))ids.push(m[1])
  }
  console.log('\n=== DISCOVER',t.key,'===',t.url,'ids',ids.slice(0,10));
  for(const id of ids.slice(0,3)){
    await parseOfficialBtw({key:`${t.key}-resource-${id}`,url:`https://www.bartendersoftware.com/download-resource?resourceId=${id}`});
  }
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
      else if(t.kind==='discover')await discoverAndParse(t);
      else await inspectHtml(t);
    }
    catch(err){console.error('PROBE_FAIL',t.key,err?.stack||err)}
  }
})().catch(err=>{console.error(err);process.exit(1)});
