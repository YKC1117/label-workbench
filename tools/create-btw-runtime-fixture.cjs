const fs=require('fs');
const path=require('path');
const vm=require('vm');

function makeContext(){
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
  c.window=c;c.globalThis=c;vm.createContext(c);return c;
}

function loadRuntime(root){
  const c=makeContext();
  for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-second-donor.js','assets/btw-second-native.js']){
    vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c,{filename:f});
  }
  return c;
}

function fixtureLabel(){
  return{
    sourceName:'LabelWorkbench_Runtime_Acceptance.pdf',
    sourceGeometry:{widthMm:100,heightMm:65},
    fields:[
      {name:'TEXT_1',value:'TEXT_EDIT_001',sourceBox:{x:.05,y:.05,w:.24,h:.05}},
      {name:'TEXT_2',value:'TEXT_EDIT_002',sourceBox:{x:.05,y:.13,w:.24,h:.05}},
      {name:'TEXT_3',value:'TEXT_EDIT_003',sourceBox:{x:.05,y:.21,w:.24,h:.05}},
      {name:'TEXT_4',value:'TEXT_EDIT_004',sourceBox:{x:.05,y:.29,w:.24,h:.05}},
      {name:'TEXT_5',value:'TEXT_EDIT_005',sourceBox:{x:.05,y:.37,w:.24,h:.05}},
      {name:'TEXT_6',value:'TEXT_EDIT_006',sourceBox:{x:.05,y:.45,w:.24,h:.05}}
    ],
    barcodes:[
      {format:'Code 128',text:'C128_ONE_111',sourceBox:{x:.35,y:.08,w:.40,h:.06}},
      {format:'Code 128',text:'C128_TWO_222',sourceBox:{x:.35,y:.18,w:.40,h:.06}},
      {format:'Code 128',text:'C128_THREE_333',sourceBox:{x:.35,y:.28,w:.40,h:.06}},
      {format:'Code 128',text:'C128_FOUR_444',sourceBox:{x:.35,y:.38,w:.40,h:.06}},
      {format:'Code 128',text:'C128_FIVE_555',sourceBox:{x:.35,y:.48,w:.40,h:.06}},
      {format:'Data Matrix',text:'DM_ONE_666',sourceBox:{x:.80,y:.10,w:.14,h:.22}}
    ]
  };
}

async function createFixture(outputPath){
  const root=path.resolve(__dirname,'..'),c=loadRuntime(root),S=c.LabelWorkbenchBtwSecondNative;
  if(!S?.generateOne)throw new Error('5C128+1DM native generator unavailable');
  const label=fixtureLabel();
  if(!S.canGenerate(label))throw new Error('runtime acceptance fixture was rejected by native generator');
  const out=await S.generateOne(label,0);
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});
  fs.writeFileSync(outputPath,Buffer.from(out.bytes));
  return{outputPath,bytes:out.bytes.length,seed:out.seed,header:out.header,label};
}

if(require.main===module){
  const output=path.resolve(process.argv[2]||path.join(process.cwd(),'artifacts','LabelWorkbench_Runtime_Acceptance.btw'));
  createFixture(output).then(info=>{
    console.log(`PASS: runtime acceptance fixture created: ${info.outputPath}`);
    console.log(`Bytes: ${info.bytes}`);
    console.log(`Seed: ${info.seed}`);
  }).catch(err=>{console.error(err);process.exit(1)});
}

module.exports={fixtureLabel,createFixture,loadRuntime};
