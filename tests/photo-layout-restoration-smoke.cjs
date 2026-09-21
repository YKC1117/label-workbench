const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}
const document={
  readyState:'loading',
  addEventListener(){},
  getElementById(){return null},
  querySelector(){return null},
  querySelectorAll(){return[]},
  createElement(){return{getContext(){return{}},style:{},appendChild(){}}},
  head:{appendChild(){}}
};
const c={console,document,window:null,globalThis:null,setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Promise,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder};
c.window=c;c.globalThis=c;
vm.createContext(c);
for(const f of ['assets/label-interpreter.js','assets/analysis-confidence-guard.js','assets/btw-production-gate.js','assets/btw-layout-map.js','assets/btw-second-native.js']){
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
}
const I=c.LabelWorkbenchInterpreter,L=c.LabelWorkbenchBtwLayout,G=c.LabelWorkbenchBtwProductionGate,S=c.LabelWorkbenchBtwSecondNative;
assert(I?.normalizeLabelRegions&&L?.validateSourceLayout&&G?.prepareResult&&S?.estimateFontSize,'layout restoration APIs missing');

// Regression: one detected middle label must stay the label region, not be replaced by the whole photo.
const single=I.normalizeLabelRegions([{x:140,y:360,w:1700,h:520}],2000,1400);
assert(single.length===1,'single label region count changed');
assert(single[0].x===140&&single[0].y===360&&single[0].w===1700&&single[0].h===520,'single label was expanded back to the full photo');
assert(single[0].w!==2000||single[0].h!==1400,'single label regression returned full source');

// Several OCR/content bands belonging to one horizontal label should coalesce.
const merged=I.normalizeLabelRegions([
  {x:150,y:360,w:1660,h:110},
  {x:145,y:500,w:1680,h:105},
  {x:155,y:640,w:1650,h:100}
],2000,1400);
assert(merged.length===1,'same-label horizontal bands were split into multiple fake labels');
assert(merged[0].y===360&&merged[0].h===380,'merged label extent is wrong '+JSON.stringify(merged[0]));

// Production object model: corrected field value replaces overlapping stale OCR, marks/noise do not leak.
const raw={labels:[{
  sourceName:'Image.jpg',page:1,index:1,coordinateSpace:'rectified-label',
  sourceGeometry:{widthPx:1700,heightPx:520,widthMm:100,heightMm:65,sizeSource:'user-confirmed',coordinateSpace:'rectified-label'},
  fields:[{id:'lw-field-part',code:'1P',name:'PART NO',value:'ABC123',barcodeVerified:true,repeat:2,sourceBox:{x:.12,y:.18,w:.22,h:.07,coordinateSpace:'rectified-label'}}],
  textObjects:[
    {id:'lw-text-stale',text:'ABC12B',confidence:93,repeat:2,sourceBox:{x:.12,y:.18,w:.22,h:.07,coordinateSpace:'rectified-label'}},
    {id:'lw-text-caption',text:'PART NO',confidence:96,repeat:2,sourceBox:{x:.03,y:.18,w:.07,h:.07,coordinateSpace:'rectified-label'}},
    {id:'lw-text-mark',text:'RoHS',confidence:98,repeat:2,sourceBox:{x:.72,y:.12,w:.08,h:.08,coordinateSpace:'rectified-label'}},
    {id:'lw-text-noise',text:'〈空〉',confidence:51,repeat:1,sourceBox:{x:.80,y:.12,w:.05,h:.04,coordinateSpace:'rectified-label'}}
  ],
  barcodes:[{id:'lw-barcode-1',format:'Code 128',text:'ABC123',sourceBox:{x:.12,y:.52,w:.48,h:.15,coordinateSpace:'rectified-label'}}],
  marks:['RoHS']
}]};
const prepared=G.prepareResult(raw),label=prepared.result.labels[0];
assert(label.textObjects.some(o=>o.text==='ABC123'),'barcode-confirmed field value was not promoted into production text object');
assert(!label.textObjects.some(o=>o.text==='ABC12B'),'stale overlapping OCR value leaked into production');
assert(!label.textObjects.some(o=>/ROHS|〈空〉/i.test(o.text)),'decorative/noise OCR leaked into editable text');
assert(prepared.report.graphicsPendingTotal===1,'graphic mark was not reported as pending');

// Source boxes must be valid and source-only severe overlaps/duplicate IDs must be caught.
const ok=L.validateSourceLayout(label);
assert(ok.ok,'clean rectified-label layout was rejected: '+JSON.stringify(ok.errors));
const bad=JSON.parse(JSON.stringify(label));
bad.textObjects.push({...bad.textObjects[0],text:'DIFFERENT',id:bad.textObjects[0].id,sourceBox:{...bad.textObjects[0].sourceBox}});
const badReport=L.validateSourceLayout(bad);
assert(!badReport.ok&&badReport.errors.some(e=>e.code==='duplicate-id')&&badReport.errors.some(e=>e.code==='severe-overlap'),'duplicate/overlap regression was not detected');

// Missing physical size must not silently fall back to the 100x65 donor.
let sizeBlocked=false;try{S.targetSize({sourceGeometry:{widthPx:1700,heightPx:520}})}catch(e){sizeBlocked=/實際尺寸/.test(String(e.message))}
assert(sizeBlocked,'missing photo mm size silently fell back to donor dimensions');
const target=S.targetSize(label);
const small=S.estimateFontSize({x:.1,y:.1,w:.2,h:.035},target),large=S.estimateFontSize({x:.1,y:.2,w:.2,h:.09},target);
assert(large>small,'text font size no longer follows source text-box height');

console.log('PASS: single-photo label region, clean object model, source-layout validation, explicit physical size and variable text sizing are guarded');
