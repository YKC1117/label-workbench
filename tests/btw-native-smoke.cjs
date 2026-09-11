const fs=require('fs');
const vm=require('vm');

const c={
  console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,
  CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,Promise,Date,Math,
  document:{readyState:'loading',addEventListener(){},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},
  navigator:{},URL,window:null,globalThis:null
};
c.window=c;c.globalThis=c;
vm.createContext(c);
for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

function objectByName(M,container,name){const o=M.mapContainer(container).objects.find(x=>x.name===name);if(!o)throw new Error(`missing native object ${name}`);return o}
function assertPos(o,x,y,label){if(o.xMil!==x||o.yMil!==y)throw new Error(`${label} position mismatch ${o.xMil},${o.yMil} != ${x},${y}`)}
async function verify(label,expected){
  const N=c.LabelWorkbenchBtwNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  if(!N?.generateOne||!F?.parseStructure||!M?.mapContainer)throw new Error('native BTW APIs missing');
  if(N.BUILD!=='20260911-btwn230-root-layout')throw new Error(`unexpected native build ${N.BUILD}`);
  if(N.SEED_ID!=='CEA-2022-R5')throw new Error('official CEA seed identity missing');
  const ep=N.seedEndpoint();if(!/\/functions\/v1\/btw-seed$/.test(ep.url)||!ep.key.startsWith('sb_publishable_'))throw new Error('seed proxy is not wired to browser cloud config');
  const out=await N.generateOne(label,0);if(!out?.bytes?.length||out.name.slice(-4).toLowerCase()!=='.btw')throw new Error('BTW output missing');
  if(out.seed!=='CEA-2022-R5'||out.kind!==expected.kind)throw new Error(`output identity/kind mismatch ${out.seed} ${out.kind}`);
  const parsed=F.parseStructure(out.bytes),container=await F.inflateContainer(parsed),strings=F.scanUtf16Strings(container,{minLength:1,maxLength:6000}),tags=N.scanTags(container).map(x=>x.type);
  for(const type of['TextData','BcDatamatrixData','BcC128Data'])if(!tags.includes(type))throw new Error(`native section missing: ${type}`);
  if(parsed.header.applicationVersion!=='2022 R5'||parsed.header.compatibleVersion!=='2022')throw new Error('BarTender version changed after rebuild');
  if(!strings.some(x=>x.text===out.summary))throw new Error('editable text summary missing after rebuild');
  for(const value of expected.values)if(!strings.some(x=>x.text===value))throw new Error(`native barcode value missing: ${value}`);
  for(const [name,pos] of Object.entries(expected.positions||{})){const o=objectByName(M,container,name);assertPos(o,pos.x,pos.y,name)}
  console.log(`PASS ${expected.kind}: ${out.name} values=${expected.values.length} roots=${Object.keys(expected.positions||{}).length}`);
}

(async()=>{
  await verify({sourceName:'code128.pdf',fields:[{code:'1P',name:'PART NO',value:'W25N01KVZEIR'}],barcodes:[{format:'Code 128',text:'W25N01KVZEIR',sourceBox:{x:.1,y:.2,w:.3,h:.1}}]},
    {kind:'c128',values:['W25N01KVZEIR'],positions:{LW_CODE128_01:{x:300,y:400},LW_CODE128_UNUSED_02:{x:50000,y:50000},LW_CODE128_UNUSED_03:{x:50000,y:50000},LW_DATAMATRIX_UNUSED:{x:50000,y:50000}}});

  await verify({sourceName:'dm.pdf',fields:[{code:'1T',name:'LOT NO',value:'66068W100ZZ'}],barcodes:[{format:'Data Matrix',text:'66068W100ZZ',sourceBox:{x:.5,y:.25,w:.2,h:.2}}]},
    {kind:'dm',values:['66068W100ZZ'],positions:{LW_DATAMATRIX:{x:1500,y:500},LW_CODE128_UNUSED_01:{x:50000,y:50000},LW_CODE128_UNUSED_02:{x:50000,y:50000},LW_CODE128_UNUSED_03:{x:50000,y:50000}}});

  await verify({sourceName:'mixed.pdf',fields:[{code:'1P',name:'PART NO',value:'W25N01KVZEIR'},{code:'1T',name:'LOT NO',value:'66068W100ZZ'}],barcodes:[
    {format:'Code 128',text:'W25N01KVZEIR',sourceBox:{x:.1,y:.55,w:.5,h:.12}},
    {format:'Code 128',text:'66068W100ZZ',sourceBox:{x:.1,y:.72,w:.5,h:.12}},
    {format:'Data Matrix',text:'[)>06|W25N01KVZEIR|66068W100ZZ',sourceBox:{x:.72,y:.12,w:.18,h:.25}}
  ]},{kind:'mixed',values:['W25N01KVZEIR','66068W100ZZ','[)>06|W25N01KVZEIR|66068W100ZZ'],positions:{LW_CODE128_01:{x:300,y:1100},LW_CODE128_02:{x:300,y:1440},LW_CODE128_UNUSED_03:{x:50000,y:50000},LW_DATAMATRIX:{x:2160,y:240}}});

  await verify({sourceName:'three-code128.pdf',fields:[],barcodes:[
    {format:'Code 128',text:'C128-A',sourceBox:{x:.1,y:.1,w:.6,h:.1}},
    {format:'Code 128',text:'C128-B',sourceBox:{x:.1,y:.4,w:.6,h:.1}},
    {format:'Code 128',text:'C128-C',sourceBox:{x:.1,y:.7,w:.6,h:.1}}
  ]},{kind:'c128',values:['C128-A','C128-B','C128-C'],positions:{LW_CODE128_01:{x:300,y:200},LW_CODE128_02:{x:300,y:800},LW_CODE128_03:{x:300,y:1400},LW_DATAMATRIX_UNUSED:{x:50000,y:50000}}});

  let fourRejected=false;
  try{await c.LabelWorkbenchBtwNative.generateOne({sourceName:'four.pdf',fields:[],barcodes:[1,2,3,4].map(n=>({format:'Code 128',text:'X'+n}))},0)}catch(err){fourRejected=/最多建立 3 個原生 Code 128/.test(String(err?.message||err))}
  if(!fourRejected)throw new Error('four Code128 objects must be rejected');
  let mixedThreeRejected=false;
  try{await c.LabelWorkbenchBtwNative.generateOne({sourceName:'mixed-three.pdf',fields:[],barcodes:[{format:'Code 128',text:'A'},{format:'Code 128',text:'B'},{format:'Code 128',text:'C'},{format:'Data Matrix',text:'DM'}]},0)}catch(err){mixedThreeRejected=/最多建立 2 個原生 Code 128/.test(String(err?.message||err))}
  if(!mixedThreeRejected)throw new Error('three Code128 plus Data Matrix must be rejected for the verified CEA wiring');
  let qrRejected=false;
  try{await c.LabelWorkbenchBtwNative.generateOne({sourceName:'qr.pdf',fields:[],barcodes:[{format:'QR Code',text:'ABC'}]},0)}catch(err){qrRejected=/不支援/.test(String(err?.message||err))}
  if(!qrRejected)throw new Error('unsupported native barcode must fall back instead of being silently rewritten');
  console.log('PASS: independent CEA Code128 roots preserve separate values/positions; unused roots are moved off canvas');
})().catch(err=>{console.error(err);process.exit(1)});
