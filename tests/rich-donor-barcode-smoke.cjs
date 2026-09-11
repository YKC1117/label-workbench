const fs=require('fs');
const vm=require('vm');
const zlib=require('zlib');

const DONORS=[
  {name:'gtl-a5',id:79885,barcodes:[{name:'Barcode 1',type:'Data Matrix',payload:'LW_DM_PAYLOAD_01'},{name:'Barcode 2',type:'Code 128',payload:'LW_C128_PAYLOAD_01'}]},
  {name:'ford-gtl-mixed-master',id:79858,barcodes:[{name:'Barcode 1',type:'Code 128',payload:'LW_C128_FORD_01'},{name:'Barcode 2',type:'Code 128',payload:'LW_C128_FORD_02'}]}
];
const PLACEHOLDER='(???) ???-????';
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
function scanTags(buf){
  const out=[];
  for(let i=0;i+8<buf.length;i++){
    if(buf[i]!==0xff||buf[i+1]!==0xff||buf[i+2]!==1||buf[i+3]!==0)continue;
    const len=buf[i+4]|buf[i+5]<<8;
    if(len<3||len>80||i+6+len>buf.length)continue;
    let ok=true;for(let j=0;j<len;j++){const b=buf[i+6+j];if(b<0x20||b>0x7e){ok=false;break}}
    if(!ok)continue;
    const type=Buffer.from(buf.buffer,buf.byteOffset+i+6,len).toString('ascii');
    if(/Data$/i.test(type))out.push({offset:i,type});
  }
  return out;
}
function ownerFor(tags,offset){let hit='';for(const t of tags){if(t.offset<=offset)hit=t.type;else break}return hit}
function groupsFor(entries){
  const groups=[];
  for(let i=0;i<entries.length;i++){
    if(entries[i].text!==PLACEHOLDER)continue;
    let end=entries.length;
    for(let j=i+1;j<entries.length;j++){if(entries[j].text===PLACEHOLDER){end=j;break}}
    groups.push({placeholderOffset:entries[i].offset,immediate:entries[i+1]?.text||'',next:entries.slice(i+1,Math.min(end,i+16)).map(e=>e.text)});
  }
  return groups;
}

async function loadDonor(donor){
  const url=`https://www.bartendersoftware.com/download-resource?resourceId=${donor.id}`;
  const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'LabelWorkbench/1.0','Accept':'application/octet-stream,*/*'}});
  if(!r.ok)throw new Error(`${donor.name} fetch ${r.status}`);
  const file=Buffer.from(await r.arrayBuffer()),parts=splitOfficial(file),before=M.mapContainer(parts.container),allStrings=F.scanUtf16Strings(parts.container,{minLength:1,maxLength:10000}),tags=scanTags(parts.container);
  return{donor,file,parts,before,allStrings,tags};
}
function emitDiagnostics(ctx){
  for(const spec of ctx.donor.barcodes){
    const obj=ctx.before.objects.find(o=>o.name===spec.name);
    if(!obj){console.log('BARCODE_DIAGNOSTIC',ctx.donor.name,spec.name,JSON.stringify({error:'missing object'}));continue}
    const entries=ctx.allStrings.filter(e=>e.offset>=obj.rootOffset&&e.offset<obj.recordEnd);
    console.log('BARCODE_DIAGNOSTIC',ctx.donor.name,spec.name,JSON.stringify({expectedType:spec.type,owner:ownerFor(ctx.tags,obj.recordStart),rootPath:obj.rootPath,kind:obj.kind,xMil:obj.xMil,yMil:obj.yMil,formalComponents:obj.components,formalComponentCount:obj.componentEntries.length,groups:groupsFor(entries),tail:entries.slice(-25).map(e=>e.text)},null,2));
  }
}
function mutationCheck(ctx){
  const edits=[];
  ctx.donor.barcodes.forEach((spec,i)=>{
    const obj=ctx.before.objects.find(o=>o.name===spec.name);
    if(!obj)throw new Error(`${ctx.donor.name} missing ${spec.name}`);
    if(obj.kind!=='barcode')throw new Error(`${ctx.donor.name} ${spec.name} not classified barcode: ${obj.kind}`);
    if(!obj.componentEntries.length)throw new Error(`${ctx.donor.name} ${spec.name} has no editable datasource components`);
    const components=obj.componentEntries.map((_,j)=>j===0?spec.payload:'');
    edits.push({name:spec.name,barcodeComponents:components,xMil:420+i*911,yMil:360+i*733});
  });
  const edited=M.editContainer(ctx.parts.container,edits),rebuilt=rebuild(ctx.parts.prefix,edited),round=splitOfficial(rebuilt),after=M.mapContainer(round.container);
  ctx.donor.barcodes.forEach((spec,i)=>{
    const obj=after.objects.find(o=>o.name===spec.name),expectedX=420+i*911,expectedY=360+i*733;
    if(!obj)throw new Error(`${ctx.donor.name} ${spec.name} lost after rebuild`);
    if(obj.components.join('')!==spec.payload)throw new Error(`${ctx.donor.name} ${spec.name} payload mismatch: ${obj.components.join('|')}`);
    if(obj.xMil!==expectedX||obj.yMil!==expectedY)throw new Error(`${ctx.donor.name} ${spec.name} coordinate mismatch ${obj.xMil}/${obj.yMil}`);
  });
  if(!rebuilt.subarray(0,80).toString('latin1').includes('Bar Tender Format File'))throw new Error(`${ctx.donor.name} rebuilt header lost`);
  console.log('PASS',ctx.donor.name,'production barcode round-trip');
}

(async()=>{
  const contexts=[];
  for(const donor of DONORS){try{contexts.push(await loadDonor(donor))}catch(err){contexts.push({donor,loadError:err})}}
  for(const ctx of contexts){if(ctx.loadError)console.error('BARCODE_LOAD_ERROR',ctx.donor.name,ctx.loadError);else emitDiagnostics(ctx)}
  const errors=[];
  for(const ctx of contexts){
    if(ctx.loadError){errors.push(`${ctx.donor.name}: ${ctx.loadError.message}`);continue}
    try{mutationCheck(ctx)}catch(err){errors.push(`${ctx.donor.name}: ${err.message}`);console.error('BARCODE_GATE_ERROR',ctx.donor.name,err)}
  }
  if(errors.length)throw new Error(`rich donor barcode gate failed after full diagnostics: ${errors.join(' || ')}`);
  console.log('PASS: production object editor independently rewrites GTL A5 Data Matrix/Code128 and Ford dual Code128 donors');
})().catch(err=>{console.error(err);process.exit(1)});
