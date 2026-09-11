const fs=require('fs');
const vm=require('vm');
const zlib=require('zlib');

const DONORS=[
  {name:'gtl-a5',id:79885,barcodes:[{type:'Data Matrix',payload:'LW_DM_SANITIZE'},{type:'Code 128',payload:'LW_C128_SANITIZE'}]},
  {name:'ford-gtl-mixed-master',id:79858,barcodes:[{type:'Code 128',payload:'LW_C128_FORD_A'},{type:'Code 128',payload:'LW_C128_FORD_B'}]}
];
const OFF=50000;
const MARKER=Buffer.from([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82,0x00,0x01]);
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,setInterval,clearInterval,Date,Math,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-format.js','utf8'),c,{filename:'btw-format.js'});
vm.runInContext(fs.readFileSync('assets/btw-object-map.js','utf8'),c,{filename:'btw-object-map.js'});
const M=c.LabelWorkbenchBtwObjectMap;
if(!M?.mapContainer||!M?.editContainer)throw new Error('production BTW object editor missing');

function split(file){const at=file.indexOf(MARKER);if(at<0)throw new Error('official donor marker missing');return{prefix:file.subarray(0,at+MARKER.length),container:new Uint8Array(zlib.inflateSync(file.subarray(at+MARKER.length)))}}
function rebuild(prefix,container){return Buffer.concat([prefix,zlib.deflateSync(Buffer.from(container))])}
function findBarcode(objects,type,used){return objects.find(o=>o.kind==='barcode'&&o.barcodeType===type&&!used.has(o.index))||null}

async function inspect(donor){
  const r=await fetch(`https://www.bartendersoftware.com/download-resource?resourceId=${donor.id}`,{redirect:'follow',headers:{'User-Agent':'LabelWorkbench/1.0','Accept':'application/octet-stream,*/*'}});
  if(!r.ok)throw new Error(`${donor.name} fetch ${r.status}`);
  const file=Buffer.from(await r.arrayBuffer()),parts=split(file),before=M.mapContainer(parts.container),editsByIndex=new Map();
  for(const o of before.objects)editsByIndex.set(o.index,{index:o.index,xMil:OFF,yMil:OFF});

  const editable=before.objects.filter(o=>o.kind==='text'&&/^Text\s*\d+$/i.test(o.name||'')&&o.valueEntry).slice(0,29);
  if(editable.length<20)throw new Error(`${donor.name} only ${editable.length} reusable text objects`);
  const markers=[];
  editable.forEach((o,i)=>{
    const value=`LW_FIELD_${String(i+1).padStart(2,'0')}_${'X'.repeat(i%4+1)}`,xMil=260+(i%5)*880,yMil=220+Math.floor(i/5)*620;
    markers.push({index:o.index,value,xMil,yMil});
    editsByIndex.set(o.index,{index:o.index,value,xMil,yMil});
  });

  const usedBarcode=new Set(),activeBarcodes=[];
  donor.barcodes.forEach((spec,i)=>{
    const o=findBarcode(before.objects,spec.type,usedBarcode);if(!o)throw new Error(`${donor.name} missing ${spec.type}`);usedBarcode.add(o.index);
    const components=o.componentEntries.map((_,j)=>j===0?spec.payload:'');
    const xMil=700+i*1900,yMil=4100+i*700;
    activeBarcodes.push({index:o.index,type:spec.type,payload:spec.payload,xMil,yMil});
    editsByIndex.set(o.index,{index:o.index,barcodeComponents:components,xMil,yMil});
  });

  const edited=M.editContainer(parts.container,[...editsByIndex.values()]),rebuilt=rebuild(parts.prefix,edited),round=split(rebuilt),after=M.mapContainer(round.container);
  if(after.objects.length!==before.objects.length)throw new Error(`${donor.name} root count changed ${before.objects.length}->${after.objects.length}`);

  for(const m of markers){const o=after.objects.find(x=>x.index===m.index);if(!o)throw new Error(`${donor.name} text index ${m.index} lost`);if(o.value!==m.value)throw new Error(`${donor.name} text value mismatch ${m.index}: ${o.value}`);if(o.xMil!==m.xMil||o.yMil!==m.yMil)throw new Error(`${donor.name} text position mismatch ${m.index}`)}
  for(const b of activeBarcodes){const o=after.objects.find(x=>x.index===b.index);if(!o)throw new Error(`${donor.name} barcode index ${b.index} lost`);if(o.components.join('')!==b.payload)throw new Error(`${donor.name} barcode payload mismatch ${b.index}: ${o.components.join('|')}`);if(o.xMil!==b.xMil||o.yMil!==b.yMil)throw new Error(`${donor.name} barcode position mismatch ${b.index}`)}

  const active=new Set([...markers.map(x=>x.index),...activeBarcodes.map(x=>x.index)]),leaks=after.objects.filter(o=>!active.has(o.index)&&(o.xMil!==OFF||o.yMil!==OFF)).map(o=>({index:o.index,kind:o.kind,name:o.name,x:o.xMil,y:o.yMil}));
  if(leaks.length)throw new Error(`${donor.name} donor objects remained on canvas: ${JSON.stringify(leaks.slice(0,8))}`);
  if(!rebuilt.subarray(0,80).toString('latin1').includes('Bar Tender Format File'))throw new Error(`${donor.name} rebuilt header lost`);
  console.log('PASS',donor.name,JSON.stringify({roots:after.objects.length,reusedText:markers.length,reusedBarcodes:activeBarcodes.length,hiddenRoots:after.objects.length-active.size,bytes:rebuilt.length}));
}

(async()=>{for(const donor of DONORS)await inspect(donor);console.log('PASS: full rich donor sanitization hides every unused root and restores only selected editable Text/barcode objects')})().catch(e=>{console.error(e);process.exit(1)});
