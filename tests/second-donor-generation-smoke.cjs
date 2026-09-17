const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-second-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const label={
  sourceName:'five-code-one-dm.pdf',
  sourceGeometry:{widthMm:120,heightMm:72},
  fields:Array.from({length:12},(_,i)=>({name:`FIELD_${i+1}`,value:`VALUE_${String(i+1).padStart(2,'0')}`,sourceBox:{x:.03+(i%3)*.2,y:.03+Math.floor(i/3)*.1,w:.15,h:.04}})),
  barcodes:[
    {format:'Data Matrix',text:'DM-TEST-001-ABC',sourceBox:{x:.72,y:.05,w:.12,h:.20}},
    {format:'Code 128',text:'C128-ONE-111',sourceBox:{x:.05,y:.52,w:.35,h:.06}},
    {format:'Code 128',text:'C128-TWO-222',sourceBox:{x:.05,y:.61,w:.35,h:.06}},
    {format:'Code 128',text:'C128-THREE-333',sourceBox:{x:.05,y:.70,w:.35,h:.06}},
    {format:'Code 128',text:'C128-FOUR-444',sourceBox:{x:.48,y:.61,w:.35,h:.06}},
    {format:'Code 128',text:'C128-FIVE-555',sourceBox:{x:.48,y:.70,w:.35,h:.06}}
  ]
};

(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,L=c.LabelWorkbenchBtwLayout;
  if(!S.canGenerate(label))throw new Error('5C128+1DM plan unexpectedly rejected');
  const out=await S.generateOne(label,0);
  if(out.seed!=='LW-SECOND-SANITIZED-2022-R2')throw new Error(`seed ${out.seed}`);
  const parsed=F.parseStructure(out.bytes);
  if(parsed.header.applicationVersion!=='2022 R2'||parsed.header.compatibleVersion!=='2022 R1')throw new Error('version changed');
  if(!parsed.header.text.includes('<TemplateSize>120 x 72 mm</TemplateSize>'))throw new Error('TemplateSize not rewritten');
  const map=M.mapContainer(await F.inflateContainer(parsed)),objects=map.objects;
  if(objects.length!==40)throw new Error(`root count ${objects.length}`);
  const visible=objects.filter(o=>Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil<50000&&o.yMil<50000);
  const visibleC128=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128'),visibleDm=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix');
  if(visibleC128.length!==5)throw new Error(`visible Code128 ${visibleC128.length}`);
  if(visibleDm.length!==1)throw new Error(`visible DataMatrix ${visibleDm.length}`);
  const wanted=label.barcodes.map(b=>b.text),actual=[...visibleDm,...visibleC128].map(o=>o.resolvedPreview);
  for(const value of wanted)if(!actual.includes(value))throw new Error(`missing independent barcode ${value}; got ${JSON.stringify(actual)}`);
  if(new Set(actual).size!==6)throw new Error('barcode values are not independent');
  for(const f of label.fields){const o=visible.find(x=>x.kind==='text'&&x.value===f.value);if(!o)throw new Error(`missing field ${f.value}`);const pos=L.boxToLayout(f.sourceBox,{width:120,height:72}).mil;if(o.xMil!==pos.x||o.yMil!==pos.y)throw new Error(`field position mismatch ${f.value}`)}
  for(const b of label.barcodes){const o=visible.find(x=>x.kind==='barcode'&&x.resolvedPreview===b.text);if(!o)throw new Error(`missing barcode ${b.text}`);const pos=L.boxToLayout(b.sourceBox,{width:120,height:72}).mil;if(o.xMil!==pos.x||o.yMil!==pos.y)throw new Error(`barcode position mismatch ${b.text}`)}
  const sizedContainer=await F.inflateContainer(parsed),dv=new DataView(sizedContainer.buffer,sizedContainer.byteOffset,sizedContainer.byteLength);let pairs=0;for(let i=0;i<=dv.byteLength-8;i++)if(dv.getInt32(i,true)===L.mmToMil(120)&&dv.getInt32(i+4,true)===L.mmToMil(72))pairs++;
  if(pairs<2)throw new Error(`internal size pair rewrite missing: ${pairs}`);
  console.log('PASS: generated BTW round-trips 12 Text + 5 independent Code128 + 1 DataMatrix at source positions and 120x72mm');
})().catch(e=>{console.error(e);process.exit(1)});