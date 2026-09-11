const fs=require('fs');
const vm=require('vm');

function context(options={}){
  let stored=options.stored??null;
  const c={console,window:{},navigator:{},localStorage:{getItem:()=>stored,setItem:(_k,v)=>{stored=v},removeItem:()=>{stored=null}},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},Blob:function(){},CustomEvent:function(type,init){this.type=type;this.detail=init?.detail},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Promise,Date,Math,document:{readyState:options.readyState||'loading',addEventListener:()=>{},getElementById:options.getElementById||(()=>null),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({addEventListener(){},remove(){}}),head:{appendChild(){}},body:{appendChild(){}}},globalThis:null};
  c.globalThis=c;c.window.window=c.window;c.window.dispatchEvent=()=>{};return c;
}

{
  const c=context();vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/bt-quick.js','utf8'),c,{filename:'bt-quick.js'});
  const api=c.window.LabelWorkbenchBtQuick;if(!api)throw new Error('BT Quick API missing');
  const sample={labels:[
    {sourceName:'A.pdf',fields:[{code:'1P',name:'PART NO',value:'A001',repeat:2,conflict:false},{code:'Q',name:'QTY',value:'100',repeat:2,conflict:false}],barcodes:[{format:'Code 128',text:'A001'}]},
    {sourceName:'A.pdf',fields:[{code:'1P',name:'PART NO',value:'A002',repeat:2,conflict:false},{code:'Q',name:'QTY',value:'100',repeat:2,conflict:false}],barcodes:[{format:'Data Matrix',text:'A002'}]}
  ]};
  const d=api.buildDraft(sample,['A.pdf']);
  const cmd=api.buildOpenCmd(d);
  for(const marker of ['bartend.exe','/F="%TEMPLATE%"','/D="%DATA%"','/DbTextHeader=1','BT_Data.csv','No .btw template was found','Opening BarTender without a template'])if(!cmd.includes(marker))throw new Error(`Launch helper missing ${marker}`);
  if(/[^\x00-\x7F]/.test(cmd))throw new Error('BT_Open.cmd must stay ASCII-only for Windows CMD compatibility');
  if(/(?:^|\s)\/P(?:\s|$)/im.test(cmd))throw new Error('Launch helper must never auto-print');
  if(/(?:^|\s)\/X(?:\s|$)/im.test(cmd))throw new Error('Launch helper must not auto-close BarTender');
  if(!api.templateBaseName(d).endsWith('.btw'))throw new Error('Template recommendation must map to a BTW filename');
  console.log('PASS: optional table-pack BT_Open.cmd stays ASCII-safe and never auto-prints');
}

{
  const stale=JSON.stringify({version:1,labels:[{sourceName:'old.pdf',fields:[{code:'1P',name:'PART NO',value:'OLD001'}],barcodes:[]} ]});
  const c=context({readyState:'complete',stored:stale,getElementById:id=>id==='bartender'?{classList:{add(){throw new Error('simulated render failure')}}}:null});
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/bt-quick.js','utf8'),c,{filename:'bt-quick.js'});
  const api=c.window.LabelWorkbenchBtQuick;
  if(!api?.receiveAnalysis||!api?.normalizeDraft)throw new Error('BT Quick API must survive initialization/render failure');
  const repaired=api.normalizeDraft(JSON.parse(stale));
  if(!repaired||repaired.version!==3||!Array.isArray(repaired.columns)||repaired.columns[0]?.btName!=='PART_NO')throw new Error('Stale BT draft must be migrated to current derived fields');
  console.log('PASS: optional table-pack helper remains resilient');
}

{
  const c=context();vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/bt-bridge.js','utf8'),c,{filename:'bt-bridge.js'});
  const api=c.window.LabelWorkbenchBtBridge;if(!api)throw new Error('BT bridge API missing');
  if(typeof api.sendToBt!=='function'||typeof api.downloadProductionPack!=='function'||typeof api.ensureBtQuick!=='function'||typeof api.isMediaResult!=='function')throw new Error('BT bridge must expose editable-BTW/media routing and optional table-pack helpers');
  if('sendDirectToBt' in api||'ensureDirectImport' in api)throw new Error('Legacy PNG direct-import must not be exposed by the primary bridge');
  const result=api.tableResult(['PART NO','QTY'],[['A001','100'],['A002','200']],'data.csv');
  if(result.labels.length!==2||result.labels[1].fields[1].value!=='200')throw new Error('Table-to-BT field conversion failed');
  const src=fs.readFileSync('assets/bt-bridge.js','utf8');
  for(const marker of ['20260911-btb200-editable-btw-primary','labelworkbench:bt-stage','isMediaResult','downloadProductionPack','BT_Data.csv'])if(!src.includes(marker))throw new Error(`BT bridge editable/advanced marker missing: ${marker}`);
  for(const forbidden of ['sendDirectToBt','ensureDirectImport','LabelWorkbenchBtDirectImport'])if(src.includes(forbidden))throw new Error(`Legacy image-import bridge marker remains: ${forbidden}`);
  console.log('PASS: PDF/image route is editable BTW; CSV/Excel table pack remains optional');
}
