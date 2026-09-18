const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}
let coreCalls=0,priorityCalls=0;
const result={innerHTML:'',textContent:''};
const input={dataset:{},files:[],value:'',addEventListener(){}};
const document={
  readyState:'complete',
  getElementById(id){if(id==='analysisFiles')return input;if(id==='analysisResult')return result;return null},
  addEventListener(){}
};
const window={
  LabelWorkbenchModuleLoader:{ready:false},
  LabelWorkbenchAnalysisCoreV2:{async run(files){coreCalls++;return{labels:[],files:[...files]}}},
  LabelWorkbenchPriority:{async runQuickAnalysis(){priorityCalls++;return{labels:[]}}}
};
const c={console,document,window,setTimeout,clearTimeout,setInterval,clearInterval,Date,Promise};
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/analysis-entry.js','utf8'),c,{filename:'analysis-entry.js'});

(async()=>{
  const file={name:'customer.pdf',type:'application/pdf'};
  await window.LabelWorkbenchAnalysisEntry.dispatch([file]);
  assert(coreCalls===1,'ready deterministic core was incorrectly blocked by loader.ready=false');
  assert(priorityCalls===0,'media file fell back to priority route even though deterministic core was ready');
  console.log('PASS: ready Analysis Core v2 runs immediately even when the aggregate loader flag has not flipped yet');
})().catch(err=>{console.error(err);process.exit(1)});
