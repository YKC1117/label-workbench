const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}

const calls=[];
const c={
  console,Uint8Array,ArrayBuffer,Blob,Promise,Date,Math,setTimeout,clearTimeout,setInterval,clearInterval,
  URL:{createObjectURL(){return'blob:test'},revokeObjectURL(){}},
  document:{
    createElement(tag){return tag==='script'?{}:{click(){},remove(){},style:{}}},
    head:{appendChild(){}},body:{appendChild(){}},
    querySelector(){return null},querySelectorAll(){return[]},getElementById(){return null},
    readyState:'loading',addEventListener(){}
  },
  window:null,globalThis:null,
  LabelWorkbenchInterpreter:{analyze:async()=>({labels:[]})},
  LabelWorkbenchBtwFamilyNative:{
    canGenerate(label){return (label?.barcodes||[]).some(b=>/^(?:QR Code|Code 39)$/i.test(String(b?.format||'')))},
    generateOne:async(label,index)=>{calls.push(['family',label,index]);return{name:'family.btw',bytes:new Uint8Array([10,11,12])}}
  },
  LabelWorkbenchBtwNative:{
    generateOne:async(label,index)=>{calls.push(['native',label,index]);return{name:'native.btw',bytes:new Uint8Array([1,2,3])}},
    downloadFromAnalysis:async()=>{throw new Error('legacy native downloadFromAnalysis must not be used by production core')}
  },
  LabelWorkbenchBtwSecondNative:{
    canGenerate:()=>true,
    generateOne:async(label,index)=>{calls.push(['second',label,index]);return{name:'second.btw',bytes:new Uint8Array([4,5,6])}}
  },
  LabelWorkbenchBtwRichNative:{
    canGenerate:()=>true,
    generateOne:async(label,index)=>{calls.push(['rich',label,index]);return{name:'rich.btw',bytes:new Uint8Array([7,8,9])}}
  }
};
c.window=c;c.globalThis=c;
vm.createContext(c);
for(const f of['assets/analysis-confidence-guard.js','assets/btw-production-gate.js','assets/btw-production-core.js']){
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
}

(async()=>{
  const P=c.LabelWorkbenchBtwProductionCore;
  assert(P?.BUILD==='20260918-btw-production-core-110-family-first','unexpected production core build');

  const result={labels:[{sourceName:'第一個.pdf',fields:[
    {code:'1P',name:'PART NO',value:'W25NO1GWZEIR',barcodeVerified:true,alternatives:[],conflict:false},
    {code:'1T',name:'LOT NO',value:'6612D7800ZZ',alternatives:['6612D78002Z'],conflict:true}
  ],barcodes:[{format:'Code 128',text:'W25NO1GWZEIR'}]}]};

  const qrResult={labels:[{sourceName:'qr.png',fields:[],textObjects:[{text:'QR TEST',sourceBox:{x:.1,y:.1,w:.2,h:.05}}],barcodes:[{format:'QR Code',text:'https://example.test/qr'}]}]};
  const qrGenerated=await P.generate(qrResult,[{name:'qr.png',type:'image/png'}],()=>{});
  assert(qrGenerated.routes[0]==='family'&&calls[0][0]==='family','QR must route to native family generator before other BTW generators');

  calls.length=0;
  const progress=[];
  const generated=await P.generate(result,[{name:'第一個.pdf',type:'application/pdf'}],m=>progress.push(m));
  assert(generated.routes.length===1&&generated.routes[0]==='second','second donor must be first production choice');
  assert(calls.length===1&&calls[0][0]==='second','wrong generator was called');
  const passed=calls[0][1];
  assert(passed.fields.length===1,'production gate did not filter pending field');
  assert(passed.fields[0].code==='1P','verified PART NO missing after gate');
  assert(generated.prepared.report.pendingTotal===1,'pending count mismatch');
  assert(progress.some(x=>/略過 1 個待核對欄位/.test(x)),'gate progress message missing');

  calls.length=0;
  c.LabelWorkbenchBtwSecondNative.canGenerate=()=>false;
  const rich=await P.generate(result,[],()=>{});
  assert(rich.routes[0]==='rich'&&calls[0][0]==='rich','rich donor must be second choice');

  calls.length=0;
  c.LabelWorkbenchBtwRichNative.canGenerate=()=>false;
  const native=await P.generate(result,[],()=>{});
  assert(native.routes[0]==='native'&&calls[0][0]==='native','native generator must be final fallback');

  console.log('PASS: deterministic BTW production core routes family -> second -> rich -> native while preserving the production safety gate');
})().catch(err=>{console.error(err);process.exit(1)});
