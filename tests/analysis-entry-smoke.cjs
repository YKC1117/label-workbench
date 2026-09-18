const fs=require('fs');
const path=require('path');
const vm=require('vm');

const code=fs.readFileSync(path.join(__dirname,'..','assets','analysis-entry.js'),'utf8');

let changeHandler=null;
let called=0;
let received=null;

const input={
  dataset:{},
  files:[],
  value:'',
  addEventListener(type,fn){if(type==='change')changeHandler=fn}
};
const result={innerHTML:'',textContent:''};
const document={
  readyState:'complete',
  getElementById(id){if(id==='analysisFiles')return input;if(id==='analysisResult')return result;return null},
  addEventListener(){}
};
const window={};
const context={
  console,
  document,
  window,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Promise
};
window.window=window;
vm.createContext(context);
vm.runInContext(code,context,{filename:'analysis-entry.js'});

if(typeof changeHandler!=='function')throw new Error('analysisFiles change handler was not bound immediately');
if(input.dataset.analysisEntryBound!=='true')throw new Error('analysis entry marker missing');
if(input.dataset.priorityBound!=='true')throw new Error('priority duplicate-bind guard missing');

const file={name:'first.pdf',type:'application/pdf'};
input.files=[file];
input.value='first.pdf';
changeHandler({currentTarget:input,target:input});

if(!/first\.pdf/.test(result.innerHTML)||!/已收到檔案/.test(result.innerHTML)){
  throw new Error('selected file was not acknowledged immediately before late modules became ready');
}
if(input.value!=='')throw new Error('file input was not reset after File references were captured');

setTimeout(()=>{
  window.LabelWorkbenchModuleLoader={ready:true};
  window.LabelWorkbenchBarcodeCrosscheck={};
  window.LabelWorkbenchFinalDisplay={};
  window.LabelWorkbenchConfidenceGuard={};
  window.LabelWorkbenchPriority={
    async runQuickAnalysis(files){called++;received=[...files];return {ok:true}}
  };
},20);

setTimeout(()=>{
  if(called!==1)throw new Error('queued selection did not reach Quick Analysis exactly once');
  if(received?.length!==1||received[0]!==file)throw new Error('captured File object was lost before analysis modules became ready');
  console.log('PASS: Quick Analysis captures the file immediately and survives late module loading');
},180);
