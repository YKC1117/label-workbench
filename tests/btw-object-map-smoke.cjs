const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,setInterval,clearInterval,Date,Math,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-format.js','utf8'),c,{filename:'btw-format.js'});
vm.runInContext(fs.readFileSync('assets/btw-object-map.js','utf8'),c,{filename:'btw-object-map.js'});
const F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
if(!F?.encodeBtwString||!M?.mapContainer||!M?.editContainer)throw new Error('BTW object APIs missing');

function concat(parts){const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let at=0;for(const p of parts){o.set(p,at);at+=p.length}return o}
function i32(v){const a=new Uint8Array(4);new DataView(a.buffer).setInt32(0,v,true);return a}
function f32(v){const a=new Uint8Array(4);new DataView(a.buffer).setFloat32(0,v,true);return a}
function font(name,size){const marker=new Uint8Array([3,2,1,0x22]),buf=new Uint8Array(64);for(let i=0;i<Math.min(name.length,32);i++){const code=name.charCodeAt(i);buf[i*2]=code&255;buf[i*2+1]=code>>>8}return concat([marker,buf,f32(size),new Uint8Array(24)])}
function obj({root,name,x,y,value,fontName='Arial',fontSize=10,components=[],markers=[]}){
  const strings=[F.encodeBtwString(root),F.encodeBtwString(name),...markers.map(F.encodeBtwString)];
  if(value!==undefined)strings.push(F.encodeBtwString('(???) ???-????'),F.encodeBtwString(value));
  for(const v of components)strings.push(F.encodeBtwString('(???) ???-????'),F.encodeBtwString(v));
  return concat([i32(x),i32(y),new Uint8Array(12),...strings,font(fontName,fontSize),new Uint8Array(12)]);
}

let container=concat([
  obj({root:'Root.MasterSelectedObject.DataSourceGeneral.DataSource',name:'文字 1',x:62,y:254,value:'(1P) PART NO :'}),
  obj({root:'Root.MasterSelectedObject.DataSourceGeneral.DataSource',name:'文字 2',x:737,y:254,value:'ABC123'}),
  obj({root:'Root.MasterSelectedObject.Barcode',name:'條碼 1',x:62,y:343,value:undefined,fontName:'Microsoft JhengHei',fontSize:6,markers:['TextTransforms'],components:['1P','文字 2']}),
  obj({root:'Root.MasterSelectedObject.DataSourceGeneral.DataSource',name:'條碼 2',x:3213,y:156,value:undefined,markers:['Screen Data','Data Matrix'],components:['DM-OLD']}),
  obj({root:'Root.MasterSelectedObject.Border',name:'文字 32',x:3486,y:933,value:'RoHS',fontSize:12}),
  obj({root:'Root.MasterSelectedObject.Barcode',name:'文字 26',x:417,y:2083,value:'P1',fontSize:10}),
  obj({root:'Root.MasterSelectedObject.Text Control',name:'Text 90',x:880,y:620,value:undefined,markers:['9','Company Name']}),
  obj({root:'Root.MasterSelectedObject.Barcode',name:'Barcode 90',x:1200,y:900,value:undefined,markers:['TextTransforms'],components:['EN-128']})
]);

let map=M.mapContainer(container);
if(map.objects.length!==8)throw new Error(`object count ${map.objects.length}`);
const t=map.objects.find(o=>o.name==='文字 2'),bc=map.objects.find(o=>o.name==='條碼 1'),dm=map.objects.find(o=>o.name==='條碼 2'),borderText=map.objects.find(o=>o.name==='文字 32'),barcodeRootText=map.objects.find(o=>o.name==='文字 26'),englishText=map.objects.find(o=>o.name==='Text 90'),englishBarcode=map.objects.find(o=>o.name==='Barcode 90');
if(!t||t.value!=='ABC123'||t.xMil!==737||t.yMil!==254)throw new Error('text decode mismatch');
if(t.fontName!=='Arial'||t.fontSize!==10)throw new Error('font decode mismatch');
if(!bc||bc.kind!=='barcode'||bc.barcodeType!=='Code 128'||bc.resolvedPreview!=='1PABC123')throw new Error(`Code128 relation mismatch: ${bc?.barcodeType}/${bc?.resolvedPreview}`);
if(!dm||dm.kind!=='barcode'||dm.barcodeType!=='Data Matrix'||dm.resolvedPreview!=='DM-OLD')throw new Error(`DataMatrix classification mismatch: ${dm?.barcodeType}/${dm?.resolvedPreview}`);
if(borderText?.kind!=='text'||borderText.value!=='RoHS')throw new Error('text name must override Border property root');
if(barcodeRootText?.kind!=='text'||barcodeRootText.value!=='P1')throw new Error('text name must override Barcode property root');
if(englishText?.kind!=='text'||englishText.value!=='Company Name')throw new Error(`English Text Control mismatch: ${englishText?.kind}/${englishText?.value}`);
if(englishBarcode?.kind!=='barcode'||englishBarcode.resolvedPreview!=='EN-128')throw new Error(`English Barcode mismatch: ${englishBarcode?.kind}/${englishBarcode?.resolvedPreview}`);
if(bc.componentEntries.length!==2||dm.componentEntries.length!==1)throw new Error('barcode component offsets missing');
console.log('PASS: BTW Chinese/English names, Text Control values, positions, fonts and barcode structures decode');

container=M.editContainer(container,[
  {name:'文字 2',value:'LONGER-PART-987654',xMm:25.4,yMil:400,fontSize:14},
  {name:'Text 90',value:'LW-CUSTOMER-FIELD-LONGER',xMil:777,yMil:888},
  {name:'條碼 1',barcodeComponents:['PREFIX-LONG-','CODE128-RAW-987654321']},
  {name:'條碼 2',barcodeValue:'[)>06|DM-NEW-LONG-PAYLOAD|987654321'}
]);
map=M.mapContainer(container);
const edited=map.objects.find(o=>o.name==='文字 2'),editedEnglish=map.objects.find(o=>o.name==='Text 90'),after=map.objects.find(o=>o.name==='條碼 1'),afterDm=map.objects.find(o=>o.name==='條碼 2'),last=map.objects.find(o=>o.name==='Barcode 90');
if(edited.value!=='LONGER-PART-987654')throw new Error('variable-length text edit failed');
if(edited.xMil!==1000||edited.yMil!==400)throw new Error(`position edit failed ${edited.xMil}/${edited.yMil}`);
if(edited.fontSize!==14)throw new Error(`font edit failed ${edited.fontSize}`);
if(editedEnglish.value!=='LW-CUSTOMER-FIELD-LONGER'||editedEnglish.xMil!==777||editedEnglish.yMil!==888)throw new Error('English Text Control round-trip edit failed');
if(after.components.join('|')!=='PREFIX-LONG-|CODE128-RAW-987654321')throw new Error(`Code128 payload write failed: ${after.components.join('|')}`);
if(after.resolvedPreview!=='PREFIX-LONG-CODE128-RAW-987654321')throw new Error('Code128 rebuilt preview mismatch');
if(afterDm.components[0]!=='[)>06|DM-NEW-LONG-PAYLOAD|987654321'||afterDm.resolvedPreview!==afterDm.components[0])throw new Error('DataMatrix payload write failed');
if(last?.resolvedPreview!=='EN-128')throw new Error('later English barcode corrupted after variable-length text edits');
console.log('PASS: variable-length Chinese/English text, Code128 datasource and DataMatrix payload edits keep later objects decodable');

let rejected=false;try{M.editContainer(container,[{name:'條碼 1',barcodeValue:'SHOULD-NOT-FLATTEN'}])}catch(err){rejected=/barcodeComponents/.test(String(err?.message||err))}
if(!rejected)throw new Error('multi-source Code128 must reject unsafe single barcodeValue flattening');
console.log('PASS: unsafe multi-source Code128 flattening is blocked');
console.log('PASS: BTW object map smoke tests');
