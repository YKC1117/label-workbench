const fs=require('fs');const vm=require('vm');
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,setInterval,clearInterval,Date,Math,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-format.js','utf8'),c,{filename:'btw-format.js'});vm.runInContext(fs.readFileSync('assets/btw-object-map.js','utf8'),c,{filename:'btw-object-map.js'});
const F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;if(!F?.encodeBtwString||!M?.mapContainer||!M?.editContainer)throw new Error('BTW APIs missing');
const enc=F.encodeBtwString;
function cat(parts){const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let a=0;for(const p of parts){o.set(p,a);a+=p.length}return o}
function i32(v){const a=new Uint8Array(4);new DataView(a.buffer).setInt32(0,v,true);return a}
function record(x,y,strings){return cat([i32(x),i32(y),new Uint8Array(12),...strings.map(enc),new Uint8Array(24)])}
const PH='(???) ???-????';
const text=record(100,200,['Root.MasterSelectedObject.DataSourceGeneral.DataSource','Text 1',PH,'ABC123']);
const barcode=record(300,400,['Root.MasterSelectedObject.Barcode','Barcode 1','TextTransforms',
  PH,'','1P','1P',
  PH,'','Text 1',
  PH,'','文字範例','DataSource',
  PH,'','Sample Text','Sample Prompt','Enter Data',
  PH,'','932437'
]);
let container=cat([text,barcode]),map=M.mapContainer(container),bc=map.objects.find(o=>o.name==='Barcode 1');
if(!bc||bc.kind!=='barcode'||bc.barcodeType!=='Code 128')throw new Error('barcode classification failed');
if(JSON.stringify(bc.components)!==JSON.stringify(['1P','Text 1','932437']))throw new Error('real-slot read mismatch '+JSON.stringify(bc.components));
if(bc.componentEntries.length!==3)throw new Error('sample/internal placeholder groups were not excluded');
if(bc.componentEntries.some(x=>!x.entry||x.entry.text!==''))throw new Error('write offsets must stay on original empty slots');
if(bc.resolvedPreview!=='1PABC123932437')throw new Error('resolved preview mismatch '+bc.resolvedPreview);
container=M.editContainer(container,[{name:'Barcode 1',barcodeComponents:['NEWP','Text 1','NEWSTATIC']}]);map=M.mapContainer(container);bc=map.objects.find(o=>o.name==='Barcode 1');
if(JSON.stringify(bc.components)!==JSON.stringify(['NEWP','Text 1','NEWSTATIC']))throw new Error('written slot must override mirrored old values '+JSON.stringify(bc.components));
if(bc.resolvedPreview!=='NEWPABC123NEWSTATIC')throw new Error('post-write resolved preview mismatch '+bc.resolvedPreview);
if(bc.componentEntries.some(x=>!x.entry||x.entry.text===''))throw new Error('written slots did not become readable datasource values');
console.log('PASS: real BTW empty write slots decode mirrored payloads, skip Chinese/English donor sample groups, and prefer new slot values after write');
