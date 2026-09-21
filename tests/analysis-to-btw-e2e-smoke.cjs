const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}
const clone=v=>JSON.parse(JSON.stringify(v));

const window={};
const document={
  getElementById(){return null},
  querySelector(){return null},
  querySelectorAll(){return[]},
  readyState:'loading',
  addEventListener(){}
};
const c={
  console,window,document,globalThis:null,
  Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,
  DecompressionStream,CompressionStream,atob,btoa,
  setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,
  MutationObserver:undefined,requestAnimationFrame:undefined,cancelAnimationFrame:undefined
};
c.globalThis=window;
window.window=window;window.globalThis=window;
window.document=document;window.console=console;
window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;window.setInterval=setInterval;window.clearInterval=clearInterval;
window.Uint8Array=Uint8Array;window.ArrayBuffer=ArrayBuffer;window.DataView=DataView;window.TextDecoder=TextDecoder;window.TextEncoder=TextEncoder;
window.Blob=Blob;window.Response=Response;window.DecompressionStream=DecompressionStream;window.CompressionStream=CompressionStream;window.atob=atob;window.btoa=btoa;

const fieldData=[
  ['1P','PART NO','W25NO1GWZE1R',['W25NO1GWZEIR']],
  ['30P','SHAPE','T#31PD#Q4000',[]],
  ['31P','GP','D',[]],
  ['Q','QTY','4000',[]],
  ['10D','DATE NO','2628#21LG#16D20260722',[]],
  ['21L','ASSY','G',[]],
  ['16D','DATE','20260722',[]],
  ['31T','MLOT NO','6612D7800#33P1#23LG#24LPS',[]],
  ['33P','BIN','1',[]],
  ['23L','MC','G',[]],
  ['24L','VC','PS',[]],
  ['1T','LOT NO','6612D7800ZZ',['6612D78002Z']]
];
const fields=fieldData.map((x,i)=>({
  code:x[0],name:x[1],value:x[2],alternatives:x[3],repeat:i===0||i===11?1:2,spatial:true,
  sourceBox:{x:.04+(i%3)*.28,y:.04+Math.floor(i/3)*.105,w:.20,h:.045}
}));
const barcodePayloads=[
  '(1P)W25NO1GWZEIR(30P)T(31P)D(Q)4000(10D)2628(21L)G(16D)20260722(31T)6612D7800(33P)1(23L)G(24L)PS',
  '(1P)W25NO1GWZEIR',
  '(Q)4000',
  '(10D)2628(16D)20260722',
  '(31T)6612D7800',
  '(30P)T(31P)D'
];
const barcodes=barcodePayloads.map((text,i)=>({
  format:i===0?'Data Matrix':'Code 128',text,
  sourceBox:i===0?{x:.75,y:.05,w:.16,h:.22}:{x:.05+(i-1)%2*.48,y:.53+Math.floor((i-1)/2)*.105,w:.38,h:.06}
}));
const raw={files:1,pages:1,labels:[{sourceName:'第一個.pdf',page:1,index:1,sourceGeometry:{widthMm:140,heightMm:38},fields,barcodes,marks:[]}]};

let rendered=0,staged=0;
window.LabelWorkbenchInterpreter={
  analyze:async()=>clone(raw),
  async interpretFiles(){return clone(raw)},
  renderResult(_files,result){rendered++;return result}
};
window.LabelWorkbenchPdfNative={async refine(_files,result){return result}};
window.LabelWorkbenchAnalysisGeometry={async refine(_files,result){return result}};
window.LabelWorkbenchAnalysisCopy={decorate(){}};
window.LabelWorkbenchFinalDisplay={enforce(){}};
window.LabelWorkbenchBtBridge={stage(result){staged++;return result}};
window.LabelWorkbenchBtNativePrimary={refresh(){}};
window.LabelWorkbenchBtwNative={downloadFromAnalysis:async()=>({ok:true})};

vm.createContext(c);
for(const f of[
  'assets/analysis-accuracy.js',
  'assets/analysis-field-consistency.js',
  'assets/analysis-confidence-guard.js',
  'assets/analysis-barcode-crosscheck.js',
  'assets/btw-production-gate.js',
  'assets/analysis-core-v2.js',
  'assets/btw-format.js',
  'assets/btw-object-map.js',
  'assets/btw-layout-map.js',
  'assets/btw-second-donor.js',
  'assets/btw-second-native.js'
]) vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

(async()=>{
  const core=window.LabelWorkbenchAnalysisCoreV2;
  const gate=window.LabelWorkbenchBtwProductionGate;
  const second=window.LabelWorkbenchBtwSecondNative;
  const F=window.LabelWorkbenchBtwFormat;
  const M=window.LabelWorkbenchBtwObjectMap;
  const L=window.LabelWorkbenchBtwLayout;
  assert(core?.run&&gate?.prepareResult&&second?.generateOne,'E2E components missing');

  const result=await core.run([{name:'第一個.pdf',type:'application/pdf'}]);
  assert(rendered===1&&staged===1,`analysis must render/stage once; got ${rendered}/${staged}`);
  const label=result.labels[0];
  const byCode=Object.fromEntries(label.fields.map(f=>[f.code,f]));
  assert(byCode['1P'].value==='W25NO1GWZEIR','barcode-confirmed PART NO mismatch');
  assert(byCode['1P'].barcodeVerified===true,'PART NO is not barcode verified');
  assert(byCode['1P'].conflict===false&&byCode['1P'].alternatives.length===0,'stale OCR PART conflict survived barcode confirmation');
  assert(byCode['30P'].value==='T','SHAPE boundary leak survived');
  assert(byCode['10D'].value==='2628','DATE NO boundary leak survived');
  assert(byCode['31T'].value==='6612D7800','MLOT boundary leak survived');
  assert(byCode['1T'].barcodeVerified!==true,'unconfirmed LOT must not be barcode verified');

  const prepared=gate.prepareResult(result);
  assert(prepared.report.acceptedTotal===11,`expected 11 production fields, got ${prepared.report.acceptedTotal}`);
  assert(prepared.report.pendingTotal===1,`expected 1 pending field, got ${prepared.report.pendingTotal}`);
  const prod=prepared.result.labels[0];
  assert(!prod.fields.some(f=>f.code==='1T'),'pending LOT leaked into production label');
  assert(prod.fields.some(f=>f.code==='1P'&&f.value==='W25NO1GWZEIR'),'verified PART missing from production label');
  assert(second.canGenerate(prod),'production label unexpectedly exceeds 5C128+1DM donor capacity');

  const out=await second.generateOne(prod,0);
  assert(out.seed==='LW-SECOND-SANITIZED-2022-R2','wrong production donor');
  const parsed=F.parseStructure(out.bytes);
  assert(parsed.header.applicationVersion==='2022 R2'&&parsed.header.compatibleVersion==='2022 R1','BarTender 2022 header changed');
  assert(parsed.header.text.includes('<TemplateSize>140 x 38 mm</TemplateSize>'),'100 x 65 mm TemplateSize missing');
  const mapped=M.mapContainer(await F.inflateContainer(parsed));
  const visible=mapped.objects.filter(o=>Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil<50000&&o.yMil<50000);
  const textObjects=visible.filter(o=>o.kind==='text');
  const barcodeObjects=visible.filter(o=>o.kind==='barcode');
  assert(mapped.objects.length===17,`expected only 11 Text + 6 barcode roots, got ${mapped.objects.length}`);
  assert(!mapped.objects.some(o=>Number(o.xMil)===50000||Number(o.yMil)===50000),'unused donor roots must be removed, not hidden at 50000 mil');
  assert(textObjects.length===11,`visible text count ${textObjects.length}`);
  assert(barcodeObjects.filter(o=>o.barcodeType==='Code 128').length===5,'expected 5 visible Code128 objects');
  assert(barcodeObjects.filter(o=>o.barcodeType==='Data Matrix').length===1,'expected 1 visible Data Matrix object');

  prod.fields.forEach((f,i)=>{
    const expected=out.layout.text[i],pos=L.boxToLayout(f.sourceBox,{width:140,height:38}).mil;
    const obj=textObjects.find(o=>String(o.value??'')===f.value&&o.xMil===pos.x&&o.yMil===pos.y);
    assert(obj,`BTW missing production text object ${f.code}:${f.value} at ${pos.x},${pos.y}`);
    assert(expected&&expected.value===f.value&&expected.xMil===pos.x&&expected.yMil===pos.y,`BTW layout plan mismatch ${f.code}:${f.value}`);
  });
  for(const b of prod.barcodes){
    const obj=barcodeObjects.find(o=>String(o.resolvedPreview||'')===b.text);
    assert(obj,`BTW missing independent barcode ${b.text}`);
    const pos=L.boxToLayout(b.sourceBox,{width:140,height:38}).mil;
    assert(obj.xMil===pos.x&&obj.yMil===pos.y,`BTW barcode position mismatch ${b.text}`);
  }
  const visibleValues=textObjects.map(o=>String(o.value??''));
  assert(!visibleValues.includes('6612D7800ZZ')&&!visibleValues.includes('6612D78002Z'),'unresolved LOT leaked into visible BTW text');
  assert(!visibleValues.includes('W25NO1GWZE1R'),'stale wrong OCR PART leaked into visible BTW text');
  assert(new Set(barcodeObjects.map(o=>o.resolvedPreview)).size===6,'barcode objects are not independent');

  console.log('PASS: 第一個.pdf style analysis -> production gate -> BarTender 2022 BTW stays value-identical, excludes unresolved LOT, preserves 11 text + 5 Code128 + 1 Data Matrix objects and source positions');
})().catch(e=>{console.error(e);process.exit(1)});
