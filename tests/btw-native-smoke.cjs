const fs=require('fs');
const vm=require('vm');

const c={
  console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,
  CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,Promise,Date,Math,atob,btoa,
  document:{readyState:'loading',addEventListener(){},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},
  navigator:{},URL,window:null,globalThis:null
};
c.window=c;c.globalThis=c;
vm.createContext(c);
for(const file of ['assets/btw-format.js','assets/btw-seed-2022r2.js','assets/btw-native.js'])
  vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});

async function verify(label,expectedValues){
  const N=c.LabelWorkbenchBtwNative,F=c.LabelWorkbenchBtwFormat;
  if(!N?.generateOne||!F?.parseStructure)throw new Error('native BTW APIs missing');
  if(N.BUILD!=='20260911-btwn320-safe-no-demo')throw new Error(`unexpected native build ${N.BUILD}`);
  if(N.SEED_ID!=='LW-2022R2-100x65-SANITIZED')throw new Error(`unexpected seed ${N.SEED_ID}`);
  const out=await N.generateOne(label,0);
  if(!out?.bytes?.length||!out.name.toLowerCase().endsWith('.btw'))throw new Error('BTW output missing');
  const parsed=F.parseStructure(out.bytes);
  if(parsed.header.applicationVersion!=='2022 R2')throw new Error(`not BarTender 2022 R2: ${parsed.header.applicationVersion}`);
  if(parsed.header.compatibleVersion!=='2022 R1')throw new Error(`not BarTender 2022 R1 compatible: ${parsed.header.compatibleVersion}`);
  if(parsed.pngs.length!==2||parsed.pngs.some(x=>!x.isPng))throw new Error('preview PNG structure invalid');
  const container=await F.inflateContainer(parsed),strings=F.scanUtf16Strings(container,{minLength:1,maxLength:6000}).map(x=>x.text);
  for(const value of expectedValues)if(!strings.includes(value))throw new Error(`real analyzed value missing: ${value}`);
  for(const bad of ['VALUE-1','ABC-123456','LOT-20260911','DM-ABC-123456-LOT-20260911'])if(strings.some(x=>x.includes(bad)))throw new Error(`demo value leaked: ${bad}`);
  console.log(`PASS: ${out.name} bytes=${out.bytes.length} values=${expectedValues.length}`);
}

(async()=>{
  await verify({sourceName:'customer-label.pdf',page:1,fields:[
    {name:'品名',value:'PROD-A7788'},{name:'批號',value:'BATCH-260911'},{name:'數量',value:'120PCS'}
  ],barcodes:[{format:'Code 128',text:'PROD-A7788'},{format:'Data Matrix',text:'DM|A7788|260911'}]},
  ['PROD-A7788','BATCH-260911','120PCS','DM|A7788|260911']);

  let rejected=false;
  try{await c.LabelWorkbenchBtwNative.generateOne({sourceName:'empty.pdf',fields:[],barcodes:[]},0)}catch(err){rejected=/沒有辨識到|避免塞入假資料/.test(String(err?.message||err))}
  if(!rejected)throw new Error('empty analysis must stop instead of fabricating data');
  console.log('PASS: local 2022 R2 editable BTW generation + no-demo safety');
})().catch(err=>{console.error(err);process.exit(1)});
