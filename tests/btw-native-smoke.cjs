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
vm.runInContext(fs.readFileSync('assets/cloud-config.js','utf8'),c,{filename:'cloud-config.js'});
vm.runInContext(fs.readFileSync('assets/btw-format.js','utf8'),c,{filename:'btw-format.js'});
vm.runInContext(fs.readFileSync('assets/btw-native.js','utf8'),c,{filename:'btw-native.js'});

async function verify(label,expected){
  const N=c.LabelWorkbenchBtwNative,F=c.LabelWorkbenchBtwFormat;
  if(!N?.generateOne||!F?.parseStructure)throw new Error('native BTW APIs missing');
  if(N.BUILD!=='20260910-btwn210')throw new Error(`unexpected native build ${N.BUILD}`);
  if(N.SEED_ID!=='CEA-2022-R5')throw new Error('official CEA seed identity missing');
  const ep=N.seedEndpoint();
  if(!/\/functions\/v1\/btw-seed$/.test(ep.url)||!ep.key.startsWith('sb_publishable_'))throw new Error('seed proxy is not wired to browser cloud config');

  const out=await N.generateOne(label,0);
  if(!out?.bytes?.length||out.name.slice(-4).toLowerCase()!=='.btw')throw new Error('BTW output missing');
  if(out.seed!=='CEA-2022-R5')throw new Error('generated BTW seed identity missing');
  if(out.kind!==expected.kind)throw new Error(`kind mismatch ${out.kind} != ${expected.kind}`);

  const parsed=F.parseStructure(out.bytes),container=await F.inflateContainer(parsed),strings=F.scanUtf16Strings(container,{minLength:1,maxLength:6000}),tags=N.scanTags(container).map(x=>x.type);
  for(const type of['TextData','BcDatamatrixData','BcC128Data'])if(!tags.includes(type))throw new Error(`native object missing: ${type}`);
  if(parsed.header.applicationVersion!=='2022 R5')throw new Error(`not BarTender 2022 R5: ${parsed.header.applicationVersion}`);
  if(parsed.header.compatibleVersion!=='2022')throw new Error(`not BarTender 2022 compatible: ${parsed.header.compatibleVersion}`);
  if(!strings.some(x=>x.text===out.summary))throw new Error('editable text summary missing after rebuild');
  for(const value of expected.values)if(!strings.some(x=>x.text===value))throw new Error(`native barcode value missing: ${value}`);
  for(const marker of expected.markers)if(!strings.some(x=>x.text===marker))throw new Error(`native object marker missing: ${marker}`);
  console.log(`PASS ${expected.kind}: ${out.name} bytes=${out.bytes.length} header=${parsed.header.applicationVersion} values=${expected.values.length}`);
}

(async()=>{
  await verify({sourceName:'code128.pdf',fields:[{code:'1P',name:'PART NO',value:'W25N01KVZEIR'},{code:'Q',name:'QTY',value:'4000'}],barcodes:[{format:'Code 128',text:'W25N01KVZEIR'}]},
    {kind:'c128',values:['W25N01KVZEIR'],markers:['LW_CODE128_01','LW_DATAMATRIX_UNUSED']});

  await verify({sourceName:'dm.pdf',fields:[{code:'1T',name:'LOT NO',value:'66068W100ZZ'},{code:'16D',name:'DATE',value:'20260722'}],barcodes:[{format:'Data Matrix',text:'66068W100ZZ'}]},
    {kind:'dm',values:['66068W100ZZ'],markers:['LW_DATAMATRIX','LW_CODE128_UNUSED_01']});

  await verify({sourceName:'mixed.pdf',fields:[{code:'1P',name:'PART NO',value:'W25N01KVZEIR'},{code:'1T',name:'LOT NO',value:'66068W100ZZ'}],barcodes:[{format:'Code 128',text:'W25N01KVZEIR'},{format:'Code 128',text:'66068W100ZZ'},{format:'Data Matrix',text:'[)>06|W25N01KVZEIR|66068W100ZZ'}]},
    {kind:'mixed',values:['W25N01KVZEIR','66068W100ZZ','[)>06|W25N01KVZEIR|66068W100ZZ'],markers:['LW_CODE128_01','LW_CODE128_02','LW_DATAMATRIX']});

  let rejected=false;
  try{await c.LabelWorkbenchBtwNative.generateOne({sourceName:'qr.pdf',fields:[],barcodes:[{format:'QR Code',text:'ABC'}]},0)}catch(err){rejected=/不支援/.test(String(err?.message||err))}
  if(!rejected)throw new Error('unsupported native barcode must fall back instead of being silently rewritten');

  console.log('PASS: official 2022 R5 native text + Code128 + DataMatrix generation smoke tests');
})().catch(err=>{console.error(err);process.exit(1)});
