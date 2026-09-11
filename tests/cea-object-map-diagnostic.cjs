const fs=require('fs');const vm=require('vm');
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,document:{readyState:'loading',addEventListener(){},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},navigator:{},URL,window:null,globalThis:null};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js','assets/btw-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
function ownerFor(tags,offset){let hit=null;for(const t of tags){if(t.offset<=offset)hit=t;else break}return hit?.type||''}
function slim(M,N,container){const tags=N.scanTags(container);return M.mapContainer(container).objects.map(o=>({index:o.index,kind:o.kind,name:o.name,owner:ownerFor(tags,o.recordStart),recordStart:o.recordStart,barcodeType:o.barcodeType,xMil:o.xMil,yMil:o.yMil,value:o.value,components:o.components,resolved:o.resolvedPreview}))}
(async()=>{
  const N=c.LabelWorkbenchBtwNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  const seed=await N.fetchSeed(),p=F.parseStructure(seed),container=await F.inflateContainer(p),objs=slim(M,N,container),barcodes=objs.filter(o=>/^Barcode\s*\d+/i.test(String(o.name||'')));
  console.log('CEA_SEED_MAP',JSON.stringify({header:{version:p.header.applicationVersion,compatible:p.header.compatibleVersion},objects:objs.length,barcodes,objs},null,2));if(!objs.length)throw new Error('CEA object map empty');
  const c128Instances=barcodes.filter(o=>o.owner==='BcC128Data'),dmInstances=barcodes.filter(o=>o.owner==='BcDatamatrixData');
  console.log('INSTANCE_COUNTS',JSON.stringify({code128:c128Instances.length,dataMatrix:dmInstances.length,code128Names:c128Instances.map(x=>x.name),dataMatrixNames:dmInstances.map(x=>x.name)}));
  const generated=await N.generateOne({sourceName:'layout-map.pdf',fields:[{code:'1P',name:'PART NO',value:'FIELD-PART-ABC'},{code:'1T',name:'LOT NO',value:'FIELD-LOT-XYZ'}],barcodes:[{format:'Code 128',text:'C128-FIRST-111'},{format:'Code 128',text:'C128-SECOND-222'},{format:'Data Matrix',text:'DM-PAYLOAD-333'}]},0);
  const gp=F.parseStructure(generated.bytes),gc=await F.inflateContainer(gp),gobjs=slim(M,N,gc);
  console.log('CEA_GENERATED_MAP',JSON.stringify(gobjs,null,2));
  for(const v of['C128-FIRST-111','C128-SECOND-222','DM-PAYLOAD-333'])if(!F.scanUtf16Strings(gc,{minLength:1,maxLength:5000}).some(x=>x.text===v))throw new Error('generated payload missing '+v);
  if(c128Instances.length<2)throw new Error(`CEA does not expose >=2 Code128 instances; found ${c128Instances.length}`);
  if(dmInstances.length<1)throw new Error(`CEA does not expose a Data Matrix instance; found ${dmInstances.length}`);
  console.log('PASS: CEA seed exposes multiple Code128 instances plus Data Matrix in separate native sections');
})().catch(e=>{console.error(e);process.exit(1)});
