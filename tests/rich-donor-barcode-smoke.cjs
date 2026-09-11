const fs=require('fs');
const vm=require('vm');
const zlib=require('zlib');

const DONORS=[
  {name:'gtl-a5',id:79885,barcodes:[{name:'Barcode 1',type:'Data Matrix',payload:'LW_DM_PAYLOAD_01'},{name:'Barcode 2',type:'Code 128',payload:'LW_C128_PAYLOAD_01'}]},
  {name:'ford-gtl-mixed-master',id:79858,barcodes:[{name:'Barcode 1',type:'Code 128',payload:'LW_C128_FORD_01'},{name:'Barcode 2',type:'Code 128',payload:'LW_C128_FORD_02'}]}
];
const CONTAINER_MARKER=Buffer.from([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82,0x00,0x01]);
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,setInterval,clearInterval,Date,Math,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-format.js','utf8'),c,{filename:'btw-format.js'});
vm.runInContext(fs.readFileSync('assets/btw-object-map.js','utf8'),c,{filename:'btw-object-map.js'});
const F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
if(!M?.mapContainer||!M?.editContainer)throw new Error('BTW production object editor missing');

function splitOfficial(file){
  const at=file.indexOf(CONTAINER_MARKER);if(at<0)throw new Error('official donor container marker missing');
  return{prefix:file.subarray(0,at+CONTAINER_MARKER.length),container:new Uint8Array(zlib.inflateSync(file.subarray(at+CONTAINER_MARKER.length)))};
}
function rebuild(prefix,container){return Buffer.concat([prefix,zlib.deflateSync(Buffer.from(container))])}

async function inspect(donor){
  const url=`https://www.bartendersoftware.com/download-resource?resourceId=${donor.id}`;
  const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'LabelWorkbench/1.0','Accept':'application/octet-stream,*/*'}});
  if(!r.ok)throw new Error(`${donor.name} fetch ${r.status}`);
  const file=Buffer.from(await r.arrayBuffer()),parts=splitOfficial(file),before=M.mapContainer(parts.container),allStrings=F.scanUtf16Strings(parts.container,{minLength:1,maxLength:10000}),edits=[];
  const original=[];
  donor.barcodes.forEach((spec,i)=>{
    const obj=before.objects.find(o=>o.name===spec.name);
    if(!obj)throw new Error(`${donor.name} missing ${spec.name}`);
    const rawStrings=allStrings.filter(e=>e.offset>=obj.rootOffset&&e.offset<obj.recordEnd).map(e=>e.text).slice(0,120);
    console.log('BARCODE_RAW',donor.name,spec.name,JSON.stringify({rootPath:obj.rootPath,kind:obj.kind,components:obj.components,componentCount:obj.componentEntries.length,rawStrings},null,2));
    if(obj.kind!=='barcode')throw new Error(`${donor.name} ${spec.name} not classified barcode: ${obj.kind}`);
    if(!obj.componentEntries.length)throw new Error(`${donor.name} ${spec.name} has no editable datasource components`);
    const components=obj.componentEntries.map((_,j)=>j===0?spec.payload:'');
    const xMil=420+i*911,yMil=360+i*733;
    edits.push({name:spec.name,barcodeComponents:components,xMil,yMil});
    original.push({name:spec.name,type:spec.type,componentCount:obj.componentEntries.length,components:obj.components,xMil:obj.xMil,yMil:obj.yMil});
  });
  const edited=M.editContainer(parts.container,edits),rebuilt=rebuild(parts.prefix,edited),round=splitOfficial(rebuilt),after=M.mapContainer(round.container);
  donor.barcodes.forEach((spec,i)=>{
    const obj=after.objects.find(o=>o.name===spec.name),expectedX=420+i*911,expectedY=360+i*733;
    if(!obj)throw new Error(`${donor.name} ${spec.name} lost after rebuild`);
    if(obj.components.join('')!==spec.payload)throw new Error(`${donor.name} ${spec.name} payload mismatch: ${obj.components.join('|')}`);
    if(obj.xMil!==expectedX||obj.yMil!==expectedY)throw new Error(`${donor.name} ${spec.name} coordinate mismatch ${obj.xMil}/${obj.yMil}`);
  });
  if(!rebuilt.subarray(0,80).toString('latin1').includes('Bar Tender Format File'))throw new Error(`${donor.name} rebuilt header lost`);
  console.log('PASS',donor.name,JSON.stringify({original,after:donor.barcodes.map(spec=>{const o=after.objects.find(x=>x.name===spec.name);return{name:spec.name,type:spec.type,components:o.components,xMil:o.xMil,yMil:o.yMil}})},null,2));
}

(async()=>{
  for(const donor of DONORS)await inspect(donor);
  console.log('PASS: production object editor independently rewrites GTL A5 Data Matrix/Code128 and Ford dual Code128 donors');
})().catch(err=>{console.error(err);process.exit(1)});
