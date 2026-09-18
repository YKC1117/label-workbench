const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}

const out={innerHTML:'',textContent:''};
const document={
  getElementById(id){return id==='analysisResult'?out:null},
  querySelectorAll(){return[]},
  querySelector(){return null}
};
const window={};
const context={
  console,document,window,globalThis:null,
  setTimeout,clearTimeout,setInterval,clearInterval,
  Promise,Date,Math
};
window.window=window;
context.globalThis=window;

// Raw "第一個.pdf" style result deliberately contains OCR leakage and a wrong PART NO.
// Barcode evidence must win only for its own field.
const raw={
  files:1,pages:1,
  labels:[{
    sourceName:'第一個.pdf',page:1,index:1,
    fields:[
      {code:'1P',name:'PART NO',value:'W25NO1GWZE1R',alternatives:['W25NO1GWZEIR'],repeat:1,spatial:true},
      {code:'30P',name:'SHAPE',value:'T#31PD#Q4000',alternatives:[],repeat:2,spatial:true},
      {code:'31P',name:'GP',value:'D',alternatives:[],repeat:2,spatial:true},
      {code:'Q',name:'QTY',value:'4000',alternatives:[],repeat:2,spatial:true},
      {code:'10D',name:'DATE NO',value:'2628#21LG#16D20260722',alternatives:[],repeat:2,spatial:true},
      {code:'21L',name:'ASSY',value:'G',alternatives:[],repeat:2,spatial:true},
      {code:'16D',name:'DATE',value:'20260722',alternatives:[],repeat:2,spatial:true},
      {code:'31T',name:'MLOT NO',value:'6612D7800#33P1#23LG#24LPS',alternatives:[],repeat:2,spatial:true},
      {code:'33P',name:'BIN',value:'1',alternatives:[],repeat:2,spatial:true},
      {code:'23L',name:'MC',value:'G',alternatives:[],repeat:2,spatial:true},
      {code:'24L',name:'VC',value:'PS',alternatives:[],repeat:2,spatial:true},
      {code:'1T',name:'LOT NO',value:'6612D7800ZZ',alternatives:['6612D78002Z'],repeat:1,spatial:true}
    ],
    barcodes:[{
      format:'Data Matrix',
      text:'(1P)W25NO1GWZEIR(30P)T(31P)D(Q)4000(10D)2628(21L)G(16D)20260722(31T)6612D7800(33P)1(23L)G(24L)PS'
    }],
    marks:[]
  }]
};

let rendered=0,staged=0,geometry=0,finalized=0,renderedResult=null,stagedResult=null;

window.LabelWorkbenchInterpreter={
  analyze:async()=>raw,
  async interpretFiles(){return JSON.parse(JSON.stringify(raw))},
  renderResult(_files,result){rendered++;renderedResult=result;out.innerHTML='rendered';return result}
};
window.LabelWorkbenchPdfNative={async refine(_files,result){return result}};
window.LabelWorkbenchAnalysisGeometry={async refine(_files,result){
  geometry++;
  for(const l of result.labels||[])l.sourceGeometry={widthMm:100,heightMm:65,method:'test'};
  return result
}};
window.LabelWorkbenchAnalysisCopy={decorate(){}};
window.LabelWorkbenchFinalDisplay={enforce(){finalized++}};
window.LabelWorkbenchBtBridge={stage(result){staged++;stagedResult=result;return result}};
window.LabelWorkbenchBtNativePrimary={refresh(){}};
window.LabelWorkbenchBtwNative={downloadFromAnalysis:async()=>({ok:true})};

vm.createContext(context);
for(const f of[
  'assets/analysis-accuracy.js',
  'assets/analysis-field-consistency.js',
  'assets/analysis-confidence-guard.js',
  'assets/analysis-barcode-crosscheck.js',
  'assets/btw-production-gate.js',
  'assets/analysis-core-v2.js'
]){
  vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
}

(async()=>{
  const core=window.LabelWorkbenchAnalysisCoreV2;
  assert(core?.BUILD==='20260918-analysis-core-v2-200','unexpected deterministic core build');

  const file={name:'第一個.pdf',type:'application/pdf'};
  const result=await core.run([file]);
  const fields=result.labels[0].fields;
  const byCode=Object.fromEntries(fields.map(f=>[f.code,f]));

  assert(byCode['1P'].value==='W25NO1GWZEIR','PART NO was not corrected by same-field barcode evidence');
  assert(byCode['1P'].barcodeVerified===true,'PART NO should be barcode verified');
  assert(byCode['30P'].value==='T','SHAPE boundary leakage was not removed');
  assert(byCode['10D'].value==='2628','DATE NO boundary leakage was not removed');
  assert(byCode['31T'].value==='6612D7800','MLOT boundary leakage was not removed');
  assert(byCode['Q'].value==='4000','QTY changed unexpectedly');
  assert(byCode['16D'].value==='20260722','DATE changed unexpectedly');

  assert(rendered===1,'analysis result must render exactly once');
  assert(finalized===1,'final confidence display must run exactly once');
  assert(geometry===1,'geometry refinement must run exactly once');
  assert(staged===1,'BTW bridge must stage exactly once and only after final analysis');
  assert(renderedResult===stagedResult,'rendered and staged results must be the same final object');
  assert(stagedResult.labels[0].sourceGeometry?.widthMm===100,'final geometry was not preserved into staged result');

  const gate=window.LabelWorkbenchBtwProductionGate;
  const prepared=gate.prepareResult(result);
  assert(prepared.result.labels[0].fields.some(f=>f.code==='1P'&&f.value==='W25NO1GWZEIR'),'verified PART NO missing from production result');
  assert(!prepared.result.labels[0].fields.some(f=>f.code==='1T'),'conflicting LOT NO must not leak into BTW production result');

  console.log('PASS: 第一個.pdf style result follows one deterministic analysis pipeline, corrects same-field barcode evidence, renders once, stages once, and excludes unresolved LOT from BTW');
})().catch(err=>{console.error(err);process.exit(1)});
