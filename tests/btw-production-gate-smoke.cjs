const fs=require('fs');
const vm=require('vm');

let captured=null;
const c={
  console,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,
  window:null,globalThis:null,
  LabelWorkbenchInterpreter:{analyze:async files=>({files,labels:[]})},
  LabelWorkbenchBtwNative:{
    downloadFromAnalysis:async(result,files,onProgress)=>{captured={result,files};onProgress?.('base called');return{ok:true,count:1}}
  }
};
c.window=c;c.globalThis=c;
vm.createContext(c);
for(const f of['assets/analysis-confidence-guard.js','assets/btw-production-gate.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

function assert(cond,msg){if(!cond)throw new Error(msg)}
const fields=[
  {code:'1P',name:'PART NO',value:'',candidates:['W25N01GWZEIR']},
  {code:'30P',name:'SHAPE',value:'T',barcodeAligned:true},
  {code:'31P',name:'GP',value:'D',barcodeAligned:true},
  {code:'Q',name:'QTY',value:'4000',barcodeVerified:true},
  {code:'10D',name:'DATE NO',value:'2628',barcodeVerified:true},
  {code:'21L',name:'ASSY',value:'G',barcodeAligned:true},
  {code:'16D',name:'DATE',value:'20260722',barcodeVerified:true},
  {code:'31T',name:'MLOT NO',value:'6612D7800',barcodeVerified:true},
  {code:'33P',name:'BIN',value:'1',barcodeAligned:true},
  {code:'23L',name:'MC',value:'G',barcodeAligned:true},
  {code:'24L',name:'VC',value:'PS',barcodeAligned:true},
  {code:'1T',name:'LOT NO',value:'6612D7800ZZ',alternatives:['6612D78002Z']}
];
const original={labels:[{sourceName:'第一個.pdf',fields,barcodes:[
  {format:'Data Matrix',text:'[)>06#Q4000#10D2628#16D20260722'},
  {format:'Code 128',text:'6612D7800'}
]}]};

(async()=>{
  const G=c.LabelWorkbenchBtwProductionGate,N=c.LabelWorkbenchBtwNative;
  assert(G?.BUILD==='20260911-btw-production-gate-100','unexpected production gate build');
  assert(G.installed===true&&N.__productionGateWrapped===true,'production gate did not wrap native download');

  const prepared=G.prepareResult(original);
  assert(prepared.report.acceptedTotal===10,`expected 10 accepted, got ${prepared.report.acceptedTotal}`);
  assert(prepared.report.pendingTotal===2,`expected 2 pending, got ${prepared.report.pendingTotal}`);
  assert(prepared.result.labels[0].fields.length===10,'filtered field count mismatch');
  const names=prepared.result.labels[0].fields.map(f=>f.name);
  assert(!names.includes('PART NO'),'unconfirmed PART NO leaked into production result');
  assert(!names.includes('LOT NO'),'conflicting LOT NO leaked into production result');
  for(const name of['SHAPE','GP','QTY','DATE NO','ASSY','DATE','MLOT NO','BIN','MC','VC'])assert(names.includes(name),`usable field missing: ${name}`);
  assert(prepared.result.labels[0].barcodes.length===2,'barcodes must be preserved');
  assert(original.labels[0].fields.length===12,'original result was destructively changed');
  assert(original.labels[0].fields[11].value==='6612D7800ZZ','original LOT value was mutated');
  assert(original.labels[0].fields[0].__finalEmpty===undefined,'original confidence metadata was mutated');

  const progress=[];
  const out=await N.downloadFromAnalysis(original,[{name:'第一個.pdf',type:'application/pdf'}],m=>progress.push(m));
  assert(out.ok===true,'wrapped production download failed');
  assert(captured?.result?.labels?.[0]?.fields?.length===10,'base native generator did not receive filtered fields');
  assert(!captured.result.labels[0].fields.some(f=>f.name==='LOT NO'),'pending LOT reached base native generator');
  assert(progress.some(x=>/略過 2 個待核對欄位/.test(x)),'pending-field progress notice missing');
  assert(G.lastReport?.acceptedTotal===10&&G.lastReport?.pendingTotal===2,'lastReport mismatch');

  let blocked=false;
  try{G.prepareResult({labels:[{sourceName:'blank.pdf',fields:[{name:'UNKNOWN',value:'',candidates:['MAYBE']}],barcodes:[]}]})}catch(err){blocked=/沒有可安全寫入 BTW/.test(String(err?.message||err))}
  assert(blocked,'blank/pending-only label must be blocked');

  console.log('PASS: 第一個.pdf regression keeps 10 usable fields, excludes 2 pending fields, preserves barcodes, and blocks unsafe blank output');
})().catch(err=>{console.error(err);process.exit(1)});
