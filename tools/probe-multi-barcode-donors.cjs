const fs=require('fs');
const vm=require('vm');

const SEEDS=['qr-rich','c39-rich','upca-rich','ean13-rich','gs1128-rich','pdf417-rich','itf14-rich','qr-c39'];
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

async function fetchSeed(seed){
  const C=ctx(),F=C.LabelWorkbenchBtwFormat,M=C.LabelWorkbenchBtwObjectMap,c=cloud();
  const r=await fetch(c.url+'/functions/v1/btw-seed?seed='+encodeURIComponent(seed),{headers:{apikey:c.key}});
  if(!r.ok)throw new Error(seed+' seed '+r.status);
  const bytes=new Uint8Array(await r.arrayBuffer()),p=F.parseStructure(bytes),ct=await F.inflateContainer(p);
  return{C,F,M,bytes,p,ct,map:M.mapContainer(ct)}
}
function recordEntries(F,container,obj){
  return F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true})
    .filter(e=>e.offset>=obj.recordStart&&e.offset<obj.recordEnd);
}
function firstMirror(F,container,obj){
  const rows=recordEntries(F,container,obj);
  for(let i=0;i<rows.length-1;i++){
    if(rows[i].text!=='(???) ???-????')continue;
    for(let j=i+1;j<Math.min(rows.length,i+6);j++){
      if(rows[j].text==='Sample Text')return rows[j];
    }
  }
  return null
}
async function probeQrC39Independence(){
  const {F,M,p,ct,map}=await fetchSeed('qr-c39');
  const qr=map.objects.find(o=>o.owner==='BcQrcodeData'),c39=map.objects.find(o=>o.owner==='BcC39RegularData');
  if(!qr||!c39)throw new Error('qr-c39 donor missing target barcodes');
  const qm=firstMirror(F,ct,qr),cm=firstMirror(F,ct,c39);
  console.log('QRC39_MIRRORS',{qr:qm?.offset,c39:cm?.offset,same:qm?.offset===cm?.offset});
  if(!qm||!cm||qm.offset===cm.offset)return;
  let out=F.replaceStringAt(ct,cm,'C39-INDEPENDENT-123');
  // Re-map after variable length edit before locating the second record's mirror.
  let remap=M.mapContainer(out),qr2=remap.objects.find(o=>o.owner==='BcQrcodeData'),qm2=firstMirror(F,out,qr2);
  out=F.replaceStringAt(out,qm2,'QR-INDEPENDENT-456');
  const rebuilt=await F.rebuild(p,out),rp=F.parseStructure(rebuilt),rc=await F.inflateContainer(rp),rm=M.mapContainer(rc);
  const rq=rm.objects.find(o=>o.owner==='BcQrcodeData'),r39=rm.objects.find(o=>o.owner==='BcC39RegularData');
  console.log('QRC39_INDEPENDENCE',{
    qrPreview:rq?.resolvedPreview,qrComponents:rq?.components,
    c39Preview:r39?.resolvedPreview,c39Components:r39?.components,
    qrOwner:rq?.owner,c39Owner:r39?.owner,
    independent:rq?.resolvedPreview==='QR-INDEPENDENT-456'&&r39?.resolvedPreview==='C39-INDEPENDENT-123'
  });
}
async function probePdfC128Independence(){
  const {F,M,p,ct,map}=await fetchSeed('pdf417-rich');
  const pdf=map.objects.find(o=>o.owner==='BcPdf417Data');
  const c128=map.objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128').slice(0,2);
  if(!pdf||c128.length<2)throw new Error('pdf417-rich donor missing PDF417 + 2 Code128');
  const edits=[
    {index:pdf.index,barcodeComponents:pdf.componentEntries.map((_,i)=>i===0?'PDF-INDEPENDENT-789':'')},
    {index:c128[0].index,barcodeComponents:c128[0].componentEntries.map((_,i)=>i===0?'C128-INDEPENDENT-A':'')},
    {index:c128[1].index,barcodeComponents:c128[1].componentEntries.map((_,i)=>i===0?'C128-INDEPENDENT-B':'')}
  ];
  const out=M.editContainer(ct,edits),rebuilt=await F.rebuild(p,out),rp=F.parseStructure(rebuilt),rc=await F.inflateContainer(rp),rm=M.mapContainer(rc);
  const rpdf=rm.objects.find(o=>o.owner==='BcPdf417Data'),rc128=rm.objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128').slice(0,2);
  console.log('PDF_C128_INDEPENDENCE',{
    pdf:rpdf?.resolvedPreview,
    c128:rc128.map(x=>x.resolvedPreview),
    pdfOwner:rpdf?.owner,
    independent:rpdf?.resolvedPreview==='PDF-INDEPENDENT-789'&&rc128[0]?.resolvedPreview==='C128-INDEPENDENT-A'&&rc128[1]?.resolvedPreview==='C128-INDEPENDENT-B'
  });
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
(async()=>{await probeQrC39Independence();await probePdfC128Independence();for(const seed of SEEDS)await load(seed)})().catch(e=>{console.error(e);process.exit(1)});
