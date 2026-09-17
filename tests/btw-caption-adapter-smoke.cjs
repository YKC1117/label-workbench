const fs=require('fs');const vm=require('vm');
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,URL,document:{readyState:'loading',addEventListener(){},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},navigator:{},window:null,globalThis:null};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-native.js','assets/btw-rich-native.js','assets/btw-caption-adapter.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
const A=c.LabelWorkbenchBtwCaptionAdapter,R=c.LabelWorkbenchBtwRichNative,M=c.LabelWorkbenchBtwObjectMap;
function ok(v,m){if(!v)throw new Error(m)}
(async()=>{
  ok(typeof A?.prepareLabel==='function','caption adapter build missing');ok(A.installed&&R.__captionAdapterWrapped===true,'caption adapter did not wrap rich generator');
  const label={sourceName:'caption-layout.pdf',sourceGeometry:{widthMm:100,heightMm:65},fields:[
    {code:'1P',name:'PART NO',value:'W25N01KVZEIR',sourceBox:{x:.28,y:.12,w:.24,h:.06}},
    {code:'1T',name:'LOT NO',value:'66068W100ZZ',sourceBox:{x:.28,y:.28,w:.22,h:.06}},
    {code:'Q',name:'QTY',value:'120',sourceBox:{x:.28,y:.44,w:.08,h:.06}}
  ],barcodes:[
    {format:'Data Matrix',text:'[)>06|W25N01KVZEIR|66068W100ZZ',sourceBox:{x:.7,y:.1,w:.2,h:.22}},
    {format:'Code 128',text:'W25N01KVZEIR',sourceBox:{x:.12,y:.68,w:.55,h:.1}}
  ]};
  const prep=A.prepareLabel(label);ok(prep.applied&&prep.originalFields===3&&prep.outputTexts===6&&prep.captions===3,'3 fields did not expand to 3 captions + 3 values');
  const captions=prep.label.fields.filter(x=>x.__lwCaption).map(x=>x.value);ok(JSON.stringify(captions)===JSON.stringify(['(1P)PART NO :','(1T)LOT NO :','(Q)QTY :']),'caption text mismatch '+JSON.stringify(captions));
  for(let i=0;i<3;i++){const cap=prep.label.fields[i*2],val=prep.label.fields[i*2+1];ok(cap.sourceBox&&val.sourceBox,'paired geometry missing');ok(cap.sourceBox.y===val.sourceBox.y||cap.sourceBox.y<val.sourceBox.y,'caption geometry not paired');ok(cap.sourceBox.x<val.sourceBox.x||cap.sourceBox.y<val.sourceBox.y,'caption is not before/above value')}
  ok(R.canGenerate(label),'captioned supported label rejected by rich generator');
  await require('node:assert/strict').rejects(R.generateOne(label,0), /BTW_BINARY_EXPORT_DISABLED/);
  const tooMany={fields:new Array(15).fill(0).map((_,i)=>({code:String(i+1),name:'FIELD'+(i+1),value:'V'+i})),barcodes:[]},fallback=A.prepareLabel(tooMany);ok(fallback.applied===false&&fallback.outputTexts===15,'caption overflow must preserve original value-only rich path');
  console.log('PASS: diagnostic caption transformation preserves paired geometry; production binary export remains blocked');
})().catch(e=>{console.error(e);process.exit(1)});
