const fs=require('fs');
const path=require('path');
const vm=require('vm');

const code=fs.readFileSync(path.join(__dirname,'..','assets','analysis-entry.js'),'utf8');

let changeHandler=null;
let coreCalled=0;
let priorityCalled=0;
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
const context={console,document,window,setTimeout,clearTimeout,setInterval,clearInterval,Date,Promise};
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
  window.LabelWorkbenchAnalysisCoreV2={
    async run(files){coreCalled++;received=[...files];return {labels:[]}}
  };
  window.LabelWorkbenchPriority={
    async runQuickAnalysis(){priorityCalled++;return {labels:[]}}
  };
  window.LabelWorkbenchModuleLoader={ready:true};
},20);

setTimeout(()=>{
  if(coreCalled!==1)throw new Error('PDF selection did not reach deterministic Analysis Core v2 exactly once');
  if(priorityCalled!==0)throw new Error('PDF selection leaked back into legacy priority analysis route');
  if(received?.length!==1||received[0]!==file)throw new Error('captured File object was lost before Analysis Core v2 became ready');
  console.log('PASS: Quick Analysis captures PDF immediately and routes it exactly once through Analysis Core v2');
},180);
