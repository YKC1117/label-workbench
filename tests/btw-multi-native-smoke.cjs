const fs=require('fs');
const vm=require('vm');
function assert(c,m){if(!c)throw new Error(m)}

const c={
  console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,
  CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,Promise,Date,Math,
  atob,btoa,URL,navigator:{},
  document:{readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},
  window:null,globalThis:null
};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of[
  'assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js',
  'assets/btw-layout-map.js','assets/btw-family-native.js','assets/btw-multi-native.js'
])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,G=c.LabelWorkbenchBtwMultiNative,L=c.LabelWorkbenchBtwLayout;
const t=(text,x,y)=>({text,sourceBox:{x,y,w:.18,h:.05}});

async function verify(label,expected){
  assert(G.canGenerate(label),'multi label should be accepted: '+label.sourceName);
  const out=await G.generateOne(label,0);
  const p=F.parseStructure(out.bytes),ct=await F.inflateContainer(p),map=M.mapContainer(ct),visible=map.objects.filter(o=>Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil<50000&&o.yMil<50000);
  for(const e of expected){
    const o=visible.find(x=>x.kind==='barcode'&&x.barcodeType===e.type&&x.resolvedPreview===e.value);
    assert(o,`missing ${e.type}: ${e.value}; got ${JSON.stringify(visible.filter(x=>x.kind==='barcode').map(x=>[x.barcodeType,x.resolvedPreview]))}`);
    const pos=L.boxToLayout(e.box,{width:label.sourceGeometry.widthMm,height:label.sourceGeometry.heightMm}).mil;
    assert(o.xMil===pos.x&&o.yMil===pos.y,`${e.type} position mismatch`);
  }
  for(const tx of label.textObjects){
    const o=visible.find(x=>x.kind==='text'&&x.value===tx.text);
    assert(o,'missing text '+tx.text);
    const pos=L.boxToLayout(tx.sourceBox,{width:label.sourceGeometry.widthMm,height:label.sourceGeometry.heightMm}).mil;
    assert(o.xMil===pos.x&&o.yMil===pos.y,'text position mismatch '+tx.text);
  }
  const tag=`<TemplateSize>${label.sourceGeometry.widthMm} x ${label.sourceGeometry.heightMm} mm</TemplateSize>`;
  assert(p.header.text.includes(tag),'TemplateSize mismatch '+tag);
  return out
}

(async()=>{
  assert(G?.BUILD==='20260918-btw-multi-native-100-qrc39-pdfc128','unexpected multi build');

  const qrBox={x:.08,y:.48,w:.22,h:.28},c39Box={x:.42,y:.58,w:.46,h:.10};
  const qrc39={
    sourceName:'mixed-qr-code39.png',
    sourceGeometry:{widthMm:80,heightMm:45},
    fields:[],
    textObjects:[t('ITEM ZX-901',.05,.08),t('MADE IN TAIWAN',.05,.18)],
    barcodes:[
      {format:'QR Code',text:'https://example.test/item/ZX-901?lot=A1',sourceBox:qrBox},
      {format:'Code 39',text:'ZX-901-A1',sourceBox:c39Box}
    ]
  };
  const q=await verify(qrc39,[
    {type:'QR Code',value:'https://example.test/item/ZX-901?lot=A1',box:qrBox},
    {type:'Code 39',value:'ZX-901-A1',box:c39Box}
  ]);
  assert(q.seed==='QR-C39-2022-R4','QR+C39 seed mismatch');

  const pdfBox={x:.55,y:.08,w:.34,h:.32},aBox={x:.08,y:.56,w:.38,h:.09},bBox={x:.52,y:.56,w:.38,h:.09};
  const pdfc128={
    sourceName:'mixed-pdf-c128.png',
    sourceGeometry:{widthMm:110,heightMm:70},
    fields:[],
    textObjects:[t('CUSTOMER A',.05,.08),t('PART ABC-777',.05,.18),t('QTY 240',.05,.28)],
    barcodes:[
      {format:'PDF417',text:'PDF417-MULTI-PAYLOAD-20260918',sourceBox:pdfBox},
      {format:'Code 128',text:'C128-MULTI-A-111',sourceBox:aBox},
      {format:'Code 128',text:'C128-MULTI-B-222',sourceBox:bBox}
    ]
  };
  const p=await verify(pdfc128,[
    {type:'PDF417',value:'PDF417-MULTI-PAYLOAD-20260918',box:pdfBox},
    {type:'Code 128',value:'C128-MULTI-A-111',box:aBox},
    {type:'Code 128',value:'C128-MULTI-B-222',box:bBox}
  ]);
  assert(p.seed==='PDF417-RICH-2022-R5','PDF+C128 seed mismatch');

  const unsupported={sourceName:'unsupported.png',textObjects:[],fields:[],barcodes:[
    {format:'QR Code',text:'QR-1'},{format:'EAN-13',text:'4006381333931'}
  ]};
  assert(!G.canGenerate(unsupported),'unverified QR+EAN mix must remain gated');

  console.log('PASS: complete official BarTender 2022 donors round-trip independent QR+Code39 and PDF417+2xCode128 mixed barcode labels');
})().catch(e=>{console.error(e);process.exit(1)});
