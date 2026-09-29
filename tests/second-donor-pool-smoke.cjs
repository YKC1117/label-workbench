const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

(async()=>{
  const D=c.LabelWorkbenchBtwControlledDonor,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  if(!D?.bytes||!F?.parseStructure||!M?.mapContainer)throw new Error('controlled donor dependencies missing');
  const bytes=new Uint8Array(await D.bytes());
  if(bytes.length!==42466)throw new Error(`donor length ${bytes.length}`);
  const parsed=F.parseStructure(bytes);
  if(parsed.header.applicationVersion!=='2022 R2')throw new Error(`app ${parsed.header.applicationVersion}`);
  if(parsed.header.compatibleVersion!=='2022 R1')throw new Error(`compat ${parsed.header.compatibleVersion}`);
  const container=await F.inflateContainer(parsed),map=M.mapContainer(container),objects=map.objects;
  const texts=objects.filter(o=>o.kind==='text'&&/^(?:Text|文字)\s*\d+/i.test(o.name||'')&&/DataSourceGeneral/i.test(String(o.rootPath||''))&&o.valueEntry);
  const c128=objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128');
  const dm=objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix');
  const marks=objects.filter(o=>o.kind==='text'&&/\.Border$/i.test(String(o.rootPath||'')));
  if(texts.length!==29)throw new Error(`text pool ${texts.length}`);
  if(c128.length!==5)throw new Error(`Code128 pool ${c128.length}`);
  if(dm.length!==1)throw new Error(`DataMatrix pool ${dm.length}`);
  if(marks.length<3)throw new Error(`controlled donor mark roots ${marks.length}`);
  for(const o of [...c128,...dm])if(!o.componentEntries?.length)throw new Error(`${o.name} missing writable component slots`);
  const raw=Buffer.from(bytes).toString('utf8');
  for(const token of['FTUSER5','FTWIN10-PC','6612D7800','20260722','W25N01GWZEIR','+090PI3K0_PS'])if(raw.includes(token))throw new Error(`sensitive donor token leaked: ${token}`);
  console.log('PASS: controlled donor = 29 ordinary Text + 5 Code128 + 1 DataMatrix, sanitized BarTender 2022 R2/R1');
})().catch(e=>{console.error(e);process.exit(1)});