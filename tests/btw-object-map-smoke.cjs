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
function obj({root,name,x,y,value,fontName='Arial',fontSize=10,components=[]}){
  const strings=[F.encodeBtwString(root),F.encodeBtwString(name)];
  if(value!==undefined)strings.push(F.encodeBtwString('(???) ???-????'),F.encodeBtwString(value));
  for(const v of components)strings.push(F.encodeBtwString('(???) ???-????'),F.encodeBtwString(v));
  return concat([i32(x),i32(y),new Uint8Array(12),...strings,font(fontName,fontSize),new Uint8Array(12)]);
}

let container=concat([
  obj({root:'Root.MasterSelectedObject.DataSourceGeneral.DataSource',name:'文字 1',x:62,y:254,value:'(1P) PART NO :'}),
  obj({root:'Root.MasterSelectedObject.DataSourceGeneral.DataSource',name:'文字 2',x:737,y:254,value:'ABC123'}),
  obj({root:'Root.MasterSelectedObject.Barcode',name:'條碼 1',x:62,y:343,value:undefined,fontName:'Microsoft JhengHei',fontSize:6,components:['1P','文字 2']})
]);

let map=M.mapContainer(container);
if(map.objects.length!==3)throw new Error(`object count ${map.objects.length}`);
const t=map.objects.find(o=>o.name==='文字 2'),bc=map.objects.find(o=>o.name==='條碼 1');
if(!t||t.value!=='ABC123'||t.xMil!==737||t.yMil!==254)throw new Error('text decode mismatch');
if(t.fontName!=='Arial'||t.fontSize!==10)throw new Error('font decode mismatch');
if(!bc||bc.kind!=='barcode'||bc.resolvedPreview!=='1PABC123')throw new Error(`barcode relation mismatch: ${bc?.resolvedPreview}`);
console.log('PASS: BTW object names, values, coordinates, font and barcode references decode');

container=M.editContainer(container,[{name:'文字 2',value:'LONGER-PART-987654',xMm:25.4,yMil:400,fontSize:14}]);
map=M.mapContainer(container);
const edited=map.objects.find(o=>o.name==='文字 2'),after=map.objects.find(o=>o.name==='條碼 1');
if(edited.value!=='LONGER-PART-987654')throw new Error('variable-length value edit failed');
if(edited.xMil!==1000||edited.yMil!==400)throw new Error(`position edit failed ${edited.xMil}/${edited.yMil}`);
if(edited.fontSize!==14)throw new Error(`font edit failed ${edited.fontSize}`);
if(after.resolvedPreview!=='1PLONGER-PART-987654')throw new Error('downstream object offsets broken after longer edit');
console.log('PASS: variable-length BTW text + X/Y + font-size edits keep later objects decodable');
console.log('PASS: BTW object map smoke tests');
