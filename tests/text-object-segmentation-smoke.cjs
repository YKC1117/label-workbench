const fs=require('fs');
const vm=require('vm');
function assert(cond,msg){if(!cond)throw new Error(msg)}
function word(text,x0,y0,x1,y1,confidence=94){return{text,confidence,bbox:{x0,y0,x1,y1}}}
function flatWord(w){const b=w.bbox;return{text:w.text,confidence:w.confidence,x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,w:b.x1-b.x0,h:b.y1-b.y0}}
function line(text,words,x0,y0,x1,y1,confidence=94){return{text,confidence,x0,y0,x1,y1,w:x1-x0,h:y1-y0,words:words.map(flatWord)}}
const document={readyState:'loading',getElementById(){return null},createElement(){return{getContext(){return{}},style:{},appendChild(){}}},head:{appendChild(){}},addEventListener(){},querySelector(){return null},querySelectorAll(){return[]}};
const c={console,document,window:null,globalThis:null,setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Promise,Uint8Array};
c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/label-interpreter.js','utf8'),c,{filename:'label-interpreter.js'});
const I=c.LabelWorkbenchInterpreter;
assert(I?.assignmentSegments,'assignmentSegments missing');
const qty=line('(Q)QTY : 4000',[word('(Q)QTY',100,100,185,125),word(':',190,100,197,125),word('4000',235,100,295,125)],100,100,295,125);
const q=I.assignmentSegments(qty);
assert(q.length===2,'QTY caption/value was not split');
assert(/QTY/.test(q[0].text)&&q[0].text.includes(':'),'QTY caption split is wrong');
assert(q[1].text==='4000','QTY value split is wrong');
assert(q[0].x1<q[1].x0,'QTY geometry did not remain independent');
const compact=line('(4Y)D:N2',[word('(4Y)D:N2',500,220,610,246)],500,220,610,246);
const d=I.assignmentSegments(compact);
assert(d.length===2,'single-token Caption:Value was not split');
assert(d[0].text==='(4Y)D:','single-token caption split wrong');
assert(d[1].text==='N2','single-token value split wrong');
const unknown=line('Customer ID: ZX-901',[word('Customer',30,300,115,325),word('ID:',122,300,155,325),word('ZX-901',230,300,310,325)],30,300,310,325);
const u=I.assignmentSegments(unknown);
assert(u.length===2&&u[1].text==='ZX-901','generic unknown customer field did not split');
const passes=[0,1,2].map(()=>({lines:[qty,compact,unknown],canvas:{width:1000,height:500}}));
const objects=I.dedupeSpatialTextObjects(I.genericTextObjects(passes,1000,500));
const texts=objects.map(x=>x.text);
assert(texts.some(x=>/QTY/.test(x)&&x.includes(':')),'QTY caption missing after generic dedupe');
assert(texts.includes('4000'),'QTY value missing after generic dedupe');
assert(!texts.some(x=>/QTY/.test(x)&&/4000/.test(x)),'QTY composite survived');
assert(texts.includes('(4Y)D:')&&texts.includes('N2'),'compact D:N2 field did not remain split');
assert(texts.some(x=>/Customer ID:/.test(x))&&texts.includes('ZX-901'),'generic field split was lost');
const dup=I.dedupeSpatialTextObjects([
  {text:'(31T)MLOT NO :',confidence:92,repeat:2,sourceBox:{x:.15,y:.55,w:.18,h:.04}},
  {text:'T)MLOT NO :',confidence:84,repeat:1,sourceBox:{x:.151,y:.551,w:.17,h:.039}}
]);
assert(dup.length===1,'near-identical overlapping OCR variants were not deduped');
assert(/31T/.test(dup[0].text),'higher-confidence complete MLOT caption was not preserved');
console.log('PASS: generic Caption:Value segmentation and OCR variant dedupe');