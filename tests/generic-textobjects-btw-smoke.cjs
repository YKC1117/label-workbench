const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-second-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const textObjects=[
  {text:'客戶代碼',sourceBox:{x:.05,y:.06,w:.15,h:.04}},
  {text:'ZX-901',sourceBox:{x:.28,y:.06,w:.16,h:.04}},
  {text:'塗裝色',sourceBox:{x:.05,y:.14,w:.14,h:.04}},
  {text:'銀灰',sourceBox:{x:.28,y:.14,w:.10,h:.04}},
  {text:'Inspection Level',sourceBox:{x:.05,y:.22,w:.22,h:.04}},
  {text:'AQL II',sourceBox:{x:.31,y:.22,w:.13,h:.04}},
  {text:'Made in Taiwan',sourceBox:{x:.05,y:.31,w:.24,h:.04}},
  {text:'CUSTOMER FREE TEXT 2026',sourceBox:{x:.05,y:.39,w:.34,h:.04}}
];

const label={
  sourceName:'unknown-customer-label.png',
  sourceGeometry:{widthMm:95,heightMm:55},
  fields:[],
  textObjects,
  barcodes:[
    {format:'Data Matrix',text:'DM-GENERIC-456',sourceBox:{x:.72,y:.08,w:.16,h:.20}},
    {format:'Code 128',text:'GENERIC-C128-123',sourceBox:{x:.08,y:.58,w:.42,h:.08}}
  ]
};

(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,L=c.LabelWorkbenchBtwLayout;
  if(!S.canGenerate(label))throw new Error('generic textObjects label unexpectedly rejected');
  const out=await S.generateOne(label,0);
  const parsed=F.parseStructure(out.bytes);
  if(parsed.header.applicationVersion!=='2022 R2'||parsed.header.compatibleVersion!=='2022 R1')throw new Error('BarTender version changed');
  if(!parsed.header.text.includes('<TemplateSize>95 x 55 mm</TemplateSize>'))throw new Error('generic label TemplateSize not rewritten');

  const objects=M.mapContainer(await F.inflateContainer(parsed)).objects;
  const visible=objects.filter(o=>(o.kind==='text'&&String(o.value||'').trim())||(o.kind==='barcode'&&String(o.resolvedPreview||o.components?.join('')||'').trim()));
  const visibleText=visible.filter(o=>o.kind==='text');
  if(visibleText.length!==textObjects.length)throw new Error(`visible text count ${visibleText.length}/${textObjects.length}`);

  for(const t of textObjects){
    const o=visibleText.find(x=>x.value===t.text);
    if(!o)throw new Error(`missing generic text object: ${t.text}`);
    const pos=L.boxToLayout(t.sourceBox,{width:95,height:55}).mil;
    if(o.xMil!==pos.x||o.yMil!==pos.y)throw new Error(`generic text position mismatch: ${t.text}`);
  }

  const c128=visible.find(o=>o.kind==='barcode'&&o.barcodeType==='Code 128'&&o.resolvedPreview==='GENERIC-C128-123');
  const dm=visible.find(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix'&&o.resolvedPreview==='DM-GENERIC-456');
  if(!c128||!dm)throw new Error('generic barcode objects missing after BTW round-trip');

  console.log('PASS: arbitrary customer textObjects and source positions round-trip into independent editable BarTender Text objects');
})().catch(e=>{console.error(e);process.exit(1)});
