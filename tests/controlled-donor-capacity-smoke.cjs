const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-controlled-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

function makeText(i){
  const col=i%4,row=Math.floor(i/4);
  return{text:'TXT_'+String(i+1).padStart(2,'0'),sourceBox:{x:.03+col*.22,y:.03+row*.105,w:.16,h:.045}};
}
const label={
  sourceName:'real-capacity-regression.png',
  sourceGeometry:{widthMm:140,heightMm:38},
  fields:[],
  textObjects:Array.from({length:36},(_,i)=>makeText(i)),
  barcodes:[
    {format:'Data Matrix',text:'DM-CAP-001',sourceBox:{x:.86,y:.05,w:.08,h:.16}},
    {format:'Code 128',text:'C128-CAP-01',sourceBox:{x:.03,y:.88,w:.16,h:.05}},
    {format:'Code 128',text:'C128-CAP-02',sourceBox:{x:.21,y:.88,w:.16,h:.05}},
    {format:'Code 128',text:'C128-CAP-03',sourceBox:{x:.39,y:.88,w:.16,h:.05}},
    {format:'Code 128',text:'C128-CAP-04',sourceBox:{x:.57,y:.88,w:.16,h:.05}},
    {format:'Code 128',text:'C128-CAP-05',sourceBox:{x:.75,y:.88,w:.16,h:.05}}
  ]
};

(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  if(S.MAX_TEXT!==32)throw new Error('MAX_TEXT must be 32');
  if(!S.canGenerate(label))throw new Error('36 OCR Text + 5 Code128 + 1 DataMatrix should compact onto the controlled donor');
  const out=await S.generateOne(label,0);
  const parsed=F.parseStructure(out.bytes),objects=M.mapContainer(await F.inflateContainer(parsed)).objects;
  const visible=objects.filter(o=>Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil>=0&&o.yMil>=0&&o.xMil<S.OFF&&o.yMil<S.OFF);
  const visibleText=visible.filter(o=>o.kind==='text');
  if(visibleText.length!==32)throw new Error('visible Text count '+visibleText.length+'/32');
  if(out.layout?.textCompaction?.input!==36||out.layout?.textCompaction?.written!==32||out.layout?.textCompaction?.omitted?.length!==4)throw new Error('text compaction report is wrong');
  for(const t of label.textObjects.slice(0,32))if(!visibleText.some(o=>o.value===t.text)&&!out.layout.textCompaction.omitted.includes(t.text))throw new Error('text was neither written nor reported omitted: '+t.text);
  const usedOverflow=visibleText.filter(o=>/\.Border$/i.test(String(o.rootPath||'')));
  if(usedOverflow.length!==3)throw new Error('expected exactly 3 overflow Border-backed Text slots, got '+usedOverflow.length);
  const dm=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix');
  const dmIds=new Set(dm.map(o=>o.index));
  const c128=visible.filter(o=>o.kind==='barcode'&&!dmIds.has(o.index)&&o.componentEntries?.length);
  if(dm.length!==1||c128.length!==5)throw new Error('barcode capacity mismatch');
  console.log('PASS: 36 OCR Text compacts transparently to 32 editable Text + 5 Code128 + 1 DataMatrix on controlled donor path');
})().catch(e=>{console.error(e);process.exit(1)});