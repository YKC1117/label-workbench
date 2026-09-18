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
  assert(G?.BUILD==='20260918-btw-family-native-120-qr-c39-upca-ean13','unexpected family build');

  const qr=barcode({
    sourceName:'customer-qr.png',
    sourceGeometry:{widthMm:90,heightMm:50},
    fields:[],
    textObjects:textObjects(['客戶代碼','ZX-901','Made in Taiwan','檢驗完成'])
  },'QR Code','https://example.com/item/ZX-901?lot=20260918',{x:.62,y:.18,w:.22,h:.30});
  const q=await verify(qr,'qr','BcQrcodeData','QR Code','https://example.com/item/ZX-901?lot=20260918',{width:90,height:50});
  assert(q.out.seed==='QR-RICH-2022-R6','QR seed mismatch');

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

  console.log('PASS: official BarTender 2022 QR, Code39, UPC-A and EAN-13 donors round-trip native payloads, text objects, source positions and physical label size');
})().catch(err=>{console.error(err);process.exit(1)});
