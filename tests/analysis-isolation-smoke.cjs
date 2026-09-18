const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}

const out={innerHTML:'',textContent:''};
const document={
  getElementById(id){return id==='analysisResult'?out:null}
};
const window={};
const context={console,document,window,globalThis:window,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math};
window.window=window;

const pending=new Map(),rendered=[],staged=[];
window.LabelWorkbenchInterpreter={
  interpretFiles(files){
    const name=files[0].name;
    return new Promise(resolve=>pending.set(name,resolve));
  },
  renderResult(files){rendered.push(files[0].name)}
};
window.LabelWorkbenchBtBridge={stage(_result,files){staged.push(files[0].name)}};
window.LabelWorkbenchBtNativePrimary={refresh(){}};

vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/analysis-core-v2.js','utf8'),context,{filename:'analysis-core-v2.js'});

const makeResult=name=>({files:1,pages:1,labels:[{sourceName:name,fields:[],textObjects:[{text:name}],barcodes:[],marks:[]}]});

(async()=>{
  const core=window.LabelWorkbenchAnalysisCoreV2;
  const oldFile={name:'old.pdf',type:'application/pdf'};
  const newFile={name:'new.pdf',type:'application/pdf'};

  const oldRun=core.run([oldFile]);
  assert(pending.has('old.pdf'),'old OCR job did not start');
  const newRun=core.run([newFile]);
  assert(pending.has('new.pdf'),'new OCR job did not start');

  pending.get('new.pdf')(makeResult('new.pdf'));
  await newRun;
  pending.get('old.pdf')(makeResult('old.pdf'));
  await oldRun;

  assert(core.latestFiles.length===1&&core.latestFiles[0]===newFile,'late old OCR replaced latest file selection');
  assert(core.latestResult?.labels?.[0]?.sourceName==='new.pdf','late old OCR replaced latest analysis result');
  assert(rendered.length===1&&rendered[0]==='new.pdf','late old OCR rendered over the new result');
  assert(staged.length===1&&staged[0]==='new.pdf','late old OCR staged an obsolete BTW result');

  core.invalidate();
  assert(core.latestResult===null&&core.latestFiles.length===0,'invalidate did not clear deterministic analysis state');
  console.log('PASS: stale OCR work cannot render, stage or replace a newer file selection');
})().catch(err=>{console.error(err);process.exit(1)});
