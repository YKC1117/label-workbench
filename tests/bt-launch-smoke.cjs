const fs=require('fs');
const vm=require('vm');

function context(){
  const c={console,window:{},navigator:{},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},Blob:function(){},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Promise,Date,Math,document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null,createElement:()=>({}),head:{appendChild(){}},body:{appendChild(){}}},globalThis:null};
  c.globalThis=c;c.window.window=c.window;return c;
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
  for(const marker of ['bartend.exe','/F="%TEMPLATE%"','/D="%DATA%"','/DbTextHeader=1','BT_Data.csv','BT_Open.cmd'])if(!cmd.includes(marker))throw new Error(`Launch helper missing ${marker}`);
  if(/(?:^|\s)\/P(?:\s|$)/im.test(cmd))throw new Error('Launch helper must never auto-print');
  if(/(?:^|\s)\/X(?:\s|$)/im.test(cmd))throw new Error('Launch helper must not auto-close BarTender');
  if(!api.templateBaseName(d).endsWith('.btw'))throw new Error('Template recommendation must map to a BTW filename');
  const readme=api.buildReadme(d);
  if(!readme.includes('BT_Open.cmd')||!readme.includes('不包含自動列印參數'))throw new Error('Production instructions must explain safe non-printing launch behavior');
  console.log('PASS: BT_Open.cmd opens a real template with BT_Data.csv and never auto-prints');
}

{
  const c=context();vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/bt-bridge.js','utf8'),c,{filename:'bt-bridge.js'});
  const api=c.window.LabelWorkbenchBtBridge;if(!api)throw new Error('BT bridge API missing');
  if(typeof api.downloadProductionPack!=='function')throw new Error('BT bridge must expose one-click production pack export');
  const result=api.tableResult(['PART NO','QTY'],[['A001','100'],['A002','200']],'data.csv');
  if(result.labels.length!==2)throw new Error('CSV/Excel table rows must become two BT label rows');
  if(result.labels[0].fields[0].name!=='PART NO'||result.labels[1].fields[1].value!=='200')throw new Error('Table-to-BT field conversion failed');
  const src=fs.readFileSync('assets/bt-bridge.js','utf8');
  for(const marker of ['建立 BT 製作包（自動下載）','downloadProductionPack','BT_製作包_','BT_Data.csv','ZIP 建立失敗，已改下載 BT_Data.csv'])if(!src.includes(marker))throw new Error(`BT bridge auto-export marker missing: ${marker}`);
  console.log('PASS: BT quick action has one-click ZIP export with BT_Data.csv fallback');
}
