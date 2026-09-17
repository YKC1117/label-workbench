const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-second-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

(async()=>{
  const D=c.LabelWorkbenchBtwSecondDonor,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  if(!D?.bytes||!F?.parseStructure||!M?.mapContainer)throw new Error('second donor dependencies missing');
  const bytes=new Uint8Array(await D.bytes());
  if(bytes.length!==43030)throw new Error(`donor length ${bytes.length}`);
  const parsed=F.parseStructure(bytes);
  if(parsed.header.applicationVersion!=='2022 R2')throw new Error(`app ${parsed.header.applicationVersion}`);
  if(parsed.header.compatibleVersion!=='2022 R1')throw new Error(`compat ${parsed.header.compatibleVersion}`);
  const container=await F.inflateContainer(parsed),map=M.mapContainer(container),objects=map.objects;
  const texts=objects.filter(o=>o.kind==='text'&&/^(?:Text|文字)\s*\d+/i.test(o.name||'')&&o.valueEntry);
  const c128=objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128');
  const dm=objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix');
  const lines=objects.filter(o=>o.kind==='line');
  if(texts.length!==33)throw new Error(`text pool ${texts.length}`);
  if(c128.length!==5)throw new Error(`Code128 pool ${c128.length}`);
  if(dm.length!==1)throw new Error(`DataMatrix pool ${dm.length}`);
  if(lines.length!==1)throw new Error(`line pool ${lines.length}`);
  for(const o of [...c128,...dm])if(!o.componentEntries?.length)throw new Error(`${o.name} missing writable component slots`);
  const raw=Buffer.from(bytes).toString('utf8');
  for(const token of['FTUSER5','FTWIN10-PC','第二個.pdf','W668GG6TB-06','K5494D9CJ','+105T43B0_PS','+105T45C0_PS','932437','C.K.B   QA  ACC','PKAA129'])if(raw.includes(token))throw new Error(`sensitive donor token leaked: ${token}`);
  console.log('PASS: sanitized donor = 33 Text + 5 Code128 + 1 DataMatrix + 1 line, BarTender 2022 R2/R1');
})().catch(e=>{console.error(e);process.exit(1)});
