const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}

const c={
  console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,
  CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,Promise,Date,Math,
  atob,btoa,URL,navigator:{},
  document:{readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},
  window:null,globalThis:null
};
c.window=c;c.globalThis=c;
vm.createContext(c);
for(const f of[
  'assets/cloud-config.js',
  'assets/btw-format.js',
  'assets/btw-object-map.js',
  'assets/btw-layout-map.js',
  'assets/btw-family-native.js'
])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,G=c.LabelWorkbenchBtwFamilyNative;

function textObjects(values){
  return values.map((text,i)=>({text,sourceBox:{x:.05,y:.06+i*.10,w:.35,h:.05}}))
}
function barcode(map,format,text,box){map.barcodes=[{format,text,sourceBox:box}];return map}

async function verify(label,kind,owner,type,payload,size){
  assert(G.canGenerate(label),kind+' should be accepted');
  const out=await G.generateOne(label,0);
  const parsed=F.parseStructure(out.bytes),container=await F.inflateContainer(parsed),map=M.mapContainer(container);
  const b=map.objects.find(o=>o.owner===owner&&o.barcodeType===type);
  assert(b,kind+' native barcode missing after rebuild');
  assert(b.resolvedPreview===payload,kind+' payload mismatch: '+b.resolvedPreview);
  assert(parsed.header.text.includes(`<TemplateSize>${size.width} x ${size.height} mm</TemplateSize>`),kind+' TemplateSize mismatch');
  assert(G.adjacentSizePairs(container,{width:size.width,height:size.height}).length>=1,kind+' internal size pair missing');
  for(const t of label.textObjects){
    const hit=map.objects.find(o=>o.kind==='text'&&o.value===t.text&&o.xMil<50000&&o.yMil<50000);
    assert(hit,kind+' visible text missing: '+t.text);
    const pos=c.LabelWorkbenchBtwLayout.boxToLayout(t.sourceBox,size).mil;
    assert(hit.xMil===pos.x&&hit.yMil===pos.y,kind+' text position mismatch: '+t.text);
  }
  return{out,parsed,b,map}
}

(async()=>{
  assert(G?.BUILD==='20260918-btw-family-native-150-gs1-2d','unexpected family build');

  const qr=barcode({
    sourceName:'customer-qr.png',
    sourceGeometry:{widthMm:90,heightMm:50},
    fields:[],
    textObjects:textObjects(['客戶代碼','ZX-901','Made in Taiwan','檢驗完成'])
  },'QR Code','https://example.com/item/ZX-901?lot=20260918',{x:.62,y:.18,w:.22,h:.30});
  const q=await verify(qr,'qr','BcQrcodeData','QR Code','https://example.com/item/ZX-901?lot=20260918',{width:90,height:50});
  assert(q.out.seed==='QR-RICH-2022-R6','QR seed mismatch');

  const gs1Payload='010950110153000317261231';
  assert(G.compactGs1Safe(gs1Payload),'compact AI 01 + AI 17 payload should be recognized as GS1');

  const gs1qr=barcode({
    sourceName:'customer-gs1qr.png',
    sourceGeometry:{widthMm:100,heightMm:60},
    fields:[],
    textObjects:textObjects(['GTIN','09501101530003','EXP','2026-12-31'])
  },'QR Code',gs1Payload,{x:.64,y:.16,w:.22,h:.34});
  assert(G.kindFor(gs1qr.barcodes[0])==='gs1qr','GS1 QR semantic detection failed');
  const gq=await verify(gs1qr,'gs1qr','BcGS1QrcodeData','GS1 QR Code',gs1Payload,{width:100,height:60});
  assert(gq.out.seed==='GS1QR-RICH-2022-R6','GS1 QR seed mismatch');

  const gs1dm=barcode({
    sourceName:'customer-gs1dm.png',
    sourceGeometry:{widthMm:105,heightMm:65},
    fields:[],
    textObjects:textObjects(['GTIN','09501101530003','EXP','2026-12-31'])
  },'Data Matrix',gs1Payload,{x:.68,y:.18,w:.18,h:.28});
  assert(G.kindFor(gs1dm.barcodes[0])==='gs1dm','GS1 DataMatrix semantic detection failed');
  const gd=await verify(gs1dm,'gs1dm','BcGS1DatamatrixData','GS1 DataMatrix',gs1Payload,{width:105,height:65});
  assert(gd.out.seed==='GS1DM-RICH-2022-R6','GS1 DataMatrix seed mismatch');

  const plainDm=barcode({sourceName:'plain-dm.png',textObjects:[],fields:[]},'Data Matrix','DM-PLAIN-123',{x:.1,y:.1,w:.2,h:.2});
  assert(G.kindFor(plainDm.barcodes[0])==='','plain Data Matrix must remain on the existing non-family donor path');

  const explicitGs1Qr=barcode({sourceName:'gs1-explicit.png',textObjects:[],fields:[]},'QR Code','(01)09501101530003(17)261231',{x:.1,y:.1,w:.2,h:.2});
  assert(G.kindFor(explicitGs1Qr.barcodes[0])==='gs1qr','parenthesized GS1 AI form should select GS1 QR');

  const c39=barcode({
    sourceName:'customer-code39.png',
    sourceGeometry:{widthMm:80,heightMm:40},
    fields:[],
    textObjects:textObjects(['MODEL','AX-500','COLOR','BLACK','QTY','20'])
  },'Code 39','AX-500-LOT-2026',{x:.12,y:.68,w:.58,h:.12});
  const c9=await verify(c39,'c39','BcC39RegularData','Code 39','AX-500-LOT-2026',{width:80,height:40});
  assert(c9.out.seed==='C39-RICH-2022-R5','Code39 seed mismatch');

  const lower=barcode({sourceName:'bad.png',textObjects:[],fields:[]},'Code 39','abc123',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(lower),'regular Code39 must reject lowercase/unsupported payload rather than silently mutate it');

  const mixed={sourceName:'mixed.png',textObjects:[],fields:[],barcodes:[
    {format:'QR Code',text:'QR-1'},
    {format:'Code 39',text:'ABC123'}
  ]};
  assert(!G.canGenerate(mixed),'family generator must not pretend one donor can safely create two independent family barcodes');

  const upc=barcode({
    sourceName:'customer-upca.png',
    sourceGeometry:{widthMm:100,heightMm:55},
    fields:[],
    textObjects:textObjects(['SKU','A-100','品名','測試商品','產地','TAIWAN'])
  },'UPC-A','036000291452',{x:.08,y:.58,w:.62,h:.16});
  const ua=await verify(upc,'upca','BcUPCAData','UPC-A','036000291452',{width:100,height:55});
  assert(ua.out.seed==='UPCA-RICH-2022-R5','UPC-A seed mismatch');

  const badUpc=barcode({sourceName:'bad-upca.png',textObjects:[],fields:[]},'UPC-A','036000291453',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(badUpc),'UPC-A with invalid check digit must be rejected');

  const shortUpc=barcode({sourceName:'short-upca.png',textObjects:[],fields:[]},'UPC-A','03600029145',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(shortUpc),'UPC-A must require the complete 12 digit decoded payload');

  const ean=barcode({
    sourceName:'customer-ean13.png',
    sourceGeometry:{widthMm:85,heightMm:45},
    fields:[],
    textObjects:textObjects(['PRODUCT','EU FOOD','LOT','A2026','BEST BEFORE','2027-09'])
  },'EAN-13','4006381333931',{x:.10,y:.62,w:.58,h:.15});
  const e13=await verify(ean,'ean13','BcEAN13Data','EAN-13','4006381333931',{width:85,height:45});
  assert(e13.out.seed==='EAN13-RICH-2022-R8','EAN-13 seed mismatch');

  const badEan=barcode({sourceName:'bad-ean13.png',textObjects:[],fields:[]},'EAN-13','4006381333932',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(badEan),'EAN-13 with invalid check digit must be rejected');

  const shortEan=barcode({sourceName:'short-ean13.png',textObjects:[],fields:[]},'EAN-13','400638133393',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(shortEan),'EAN-13 must require the complete 13 digit decoded payload');

  const gs1=barcode({
    sourceName:'customer-gs1128.png',
    sourceGeometry:{widthMm:120,heightMm:80},
    fields:[],
    textObjects:textObjects(['SSCC / GS1','PALLET A','LOT','ABC123'])
  },'GS1-128','010950110153000310ABC123',{x:.08,y:.66,w:.70,h:.12});
  const g1=await verify(gs1,'gs1128','BcUCCEAN128Data','GS1-128','010950110153000310ABC123',{width:120,height:80});
  assert(g1.out.seed==='GS1128-RICH-2022-R7','GS1-128 seed mismatch');

  const badGs1=barcode({sourceName:'bad-gs1.png',textObjects:[],fields:[]},'GS1-128','0109501101530003\n10ABC123',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(badGs1),'GS1-128 must reject CR/LF payloads rather than silently normalize them');

  const pdf=barcode({
    sourceName:'customer-pdf417.png',
    sourceGeometry:{widthMm:110,heightMm:70},
    fields:[],
    textObjects:textObjects(['SHIPMENT','MIXED LOAD','DOCK','A-17'])
  },'PDF417','PDF417_NATIVE_PAYLOAD_20260918',{x:.58,y:.18,w:.30,h:.38});
  const p4=await verify(pdf,'pdf417','BcPdf417Data','PDF417','PDF417_NATIVE_PAYLOAD_20260918',{width:110,height:70});
  assert(p4.out.seed==='PDF417-RICH-2022-R5','PDF417 seed mismatch');

  const tooLongPdf=barcode({sourceName:'long-pdf417.png',textObjects:[],fields:[]},'PDF417','X'.repeat(1801),{x:.1,y:.1,w:.5,h:.3});
  assert(!G.canGenerate(tooLongPdf),'PDF417 safety cap must reject oversized payloads');

  const itf=barcode({
    sourceName:'customer-itf14.png',
    sourceGeometry:{widthMm:100,heightMm:150},
    fields:[],
    textObjects:textObjects(['GTIN','10012345000017','CASE','24 PCS','MADE IN TAIWAN'])
  },'ITF-14','10012345000017',{x:.08,y:.65,w:.70,h:.14});
  const it=await verify(itf,'itf14','BcITF14Data','ITF-14','10012345000017',{width:100,height:150});
  assert(it.out.seed==='ITF14-RICH-2022-R8','ITF-14 seed mismatch');

  const badItf=barcode({sourceName:'bad-itf14.png',textObjects:[],fields:[]},'ITF-14','10012345000018',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(badItf),'ITF-14 with invalid check digit must be rejected');

  const i25=barcode({sourceName:'i25.png',textObjects:[],fields:[]},'Interleaved 2 of 5','1234567890',{x:.1,y:.1,w:.5,h:.1});
  assert(!G.canGenerate(i25),'Interleaved 2 of 5 must stay out of production until a BarTender 2022 donor is verified');

  console.log('PASS: official BarTender 2022 QR, GS1 QR, GS1 DataMatrix, Code39, UPC-A, EAN-13, GS1-128, PDF417 and ITF-14 donors round-trip native payloads, text objects, source positions and physical label size');
})().catch(err=>{console.error(err);process.exit(1)});
