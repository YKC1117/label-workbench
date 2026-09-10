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
vm.runInContext(fs.readFileSync('assets/btw-format.js','utf8'),c,{filename:'btw-format.js'});
vm.runInContext(fs.readFileSync('assets/btw-native.js','utf8'),c,{filename:'btw-native.js'});

async function verify(label,wantType,wantBarcode){
  const N=c.LabelWorkbenchBtwNative,F=c.LabelWorkbenchBtwFormat;
  if(!N?.generateOne||!F?.parseStructure)throw new Error('native BTW APIs missing');
  const out=await N.generateOne(label,0);
  if(!out?.bytes?.length||out.name.slice(-4).toLowerCase()!=='.btw')throw new Error('BTW output missing');
  const parsed=F.parseStructure(out.bytes),container=await F.inflateContainer(parsed),strings=F.scanUtf16Strings(container,{minLength:1,maxLength:5000});
  const tags=N.scanTags(container).map(x=>x.type);
  if(!tags.includes(wantType))throw new Error(`native object missing: ${wantType}`);
  if(!strings.some(x=>x.text===out.summary))throw new Error('editable text value missing after rebuild');
  if(wantBarcode&&!strings.some(x=>x.text===wantBarcode))throw new Error('editable barcode value missing after rebuild');
  if(!parsed.header?.applicationVersion)throw new Error('BarTender header missing after rebuild');
  console.log(`PASS ${wantType}: ${out.name} bytes=${out.bytes.length} header=${parsed.header.applicationVersion}`);
}

(async()=>{
  await verify({sourceName:'sample.pdf',fields:[{code:'1P',name:'PART NO',value:'W25N01KVZEIR'},{code:'Q',name:'QTY',value:'4000'}],barcodes:[{format:'Code 128',text:'W25N01KVZEIR'}]},'BcC128Data','W25N01KVZEIR');
  await verify({sourceName:'sample.pdf',fields:[{code:'1T',name:'LOT NO',value:'66068W100ZZ'},{code:'16D',name:'DATE',value:'20260722'}],barcodes:[{format:'Data Matrix',text:'66068W100ZZ'}]},'BcDatamatrixData','66068W100ZZ');
  console.log('PASS: native editable BTW generation smoke tests');
})().catch(err=>{console.error(err);process.exit(1)});
