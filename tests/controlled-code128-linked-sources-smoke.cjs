const fs=require('fs'),vm=require('vm');
function assert(c,m){if(!c)throw new Error(m)}
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-second-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
const barcodes=[
  {format:'Data Matrix',text:'DM-CONTENT-001',sourceBox:{x:.80,y:.05,w:.12,h:.22}},
  {format:'Code 128',text:'C128-CLEAN-01',sourceBox:{x:.03,y:.20,w:.30,h:.06}},
  {format:'Code 128',text:'C128-CLEAN-02',sourceBox:{x:.03,y:.34,w:.34,h:.06}},
  {format:'Code 128',text:'C128-CLEAN-03',sourceBox:{x:.03,y:.48,w:.38,h:.06}},
  {format:'Code 128',text:'C128-CLEAN-04',sourceBox:{x:.48,y:.34,w:.34,h:.06}},
  {format:'Code 128',text:'C128-CLEAN-05',sourceBox:{x:.48,y:.48,w:.38,h:.06}}
];
const textObjects=Array.from({length:8},(_,i)=>({text:'VISIBLE_'+String(i+1).padStart(2,'0'),sourceBox:{x:.04+(i%2)*.28,y:.04+Math.floor(i/2)*.08,w:.20,h:.04}}));
const label={sourceName:'clean-code128.png',sourceGeometry:{widthMm:140,heightMm:38},textObjects,fields:[],barcodes};
(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  const out=await S.generateOne(label,0);
  assert(out.seed==='LW-CLEAN-100x65-2022-R2','production did not use clean donor');
  assert(out.layout?.linkedCode128===0,'clean donor must not use linked Code128 datasources');
  const parsed=F.parseStructure(out.bytes),mapped=M.mapContainer(await F.inflateContainer(parsed)),visible=mapped.objects.filter(o=>o.xMil>=0&&o.yMil>=0&&o.xMil<S.OFF&&o.yMil<S.OFF);
  const dm=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix'),dmIds=new Set(dm.map(o=>o.index)),c128=visible.filter(o=>o.kind==='barcode'&&!dmIds.has(o.index)&&o.componentEntries?.length);
  assert(c128.length===5&&dm.length===1,'clean donor barcode count mismatch');
  for(const o of c128){assert(o.componentEntries.length===1,'Code128 datasource is not independent');assert(!o.linkedDataSourceRefs?.length,'Code128 unexpectedly depends on Text datasource');assert([333,666,1000].includes(o.xDimension),'Code128 X-dimension invalid: '+o.xDimension)}
  for(const b of barcodes)assert(visible.some(x=>x.kind==='barcode'&&x.resolvedPreview===b.text),'missing clean native barcode '+b.text);
  assert(out.layout?.parkedRootlessText?.length===2,'rootless donor placeholders were not parked');
  console.log('PASS: production Code128 uses independent native datasources with sourceBox-driven X-dimension and no linked Text dependency');
})().catch(e=>{console.error(e);process.exit(1)});
