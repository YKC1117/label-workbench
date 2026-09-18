const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}
function word(text,x0,y0,x1,y1,confidence=92){return{text,confidence,bbox:{x0,y0,x1,y1}}}
function line(text,words,x0,y0,x1,y1,confidence=92){return{text,confidence,bbox:{x0,y0,x1,y1},words}}

const fakeBlocks=[{paragraphs:[{lines:[
  line('客戶代碼        ZX-901',[word('客戶代碼',20,20,100,45),word('ZX-901',240,20,330,45)],20,20,330,45),
  line('塗裝色          銀灰',[word('塗裝色',20,75,85,100),word('銀灰',240,75,290,100)],20,75,290,100),
  line('Inspection Level: AQL II',[word('Inspection',20,130,120,155),word('Level:',128,130,190,155),word('AQL',230,130,275,155),word('II',282,130,300,155)],20,130,300,155),
  line('Made in Taiwan',[word('Made',20,190,70,215),word('in',78,190,95,215),word('Taiwan',103,190,175,215)],20,190,175,215)
]}]}];

const document={
  readyState:'loading',
  getElementById(){return null},
  createElement(){return{getContext(){return{}},style:{},appendChild(){}}},
  head:{appendChild(){}},
  addEventListener(){},
  querySelector(){return null},
  querySelectorAll(){return[]}
};
const c={console,document,window:null,globalThis:null,setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Promise,Uint8Array};
c.window=c;c.globalThis=c;
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/label-interpreter.js','utf8'),c,{filename:'label-interpreter.js'});
vm.runInContext(fs.readFileSync('assets/btw-production-gate.js','utf8'),c,{filename:'btw-production-gate.js'});
vm.runInContext(fs.readFileSync('assets/btw-second-native.js','utf8'),c,{filename:'btw-second-native.js'});

const I=c.LabelWorkbenchInterpreter;
assert(I?.genericTextObjects,'generic text-object extractor missing');

const flat=I.genericTextObjects([
  {lines:I.spatialFields?[]:[],confidence:92}
],1000,500);

// flattenLines is internal, so reproduce the public OCR line shape it emits.
function flatLine(raw){
  const b=raw.bbox;
  return{
    text:raw.text,confidence:raw.confidence,
    x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,w:b.x1-b.x0,h:b.y1-b.y0,
    words:raw.words.map(w=>{const x=w.bbox;return{text:w.text,confidence:w.confidence,x0:x.x0,y0:x.y0,x1:x.x1,y1:x.y1,w:x.x1-x.x0,h:x.y1-x.y0}})
  }
}
const lines=fakeBlocks[0].paragraphs[0].lines.map(flatLine);
const passes=[{lines},{lines:JSON.parse(JSON.stringify(lines))},{lines:JSON.parse(JSON.stringify(lines))}];

const objects=I.genericTextObjects(passes,1000,500);
assert(objects.some(o=>o.text==='客戶代碼'),'custom Chinese caption was lost');
assert(objects.some(o=>o.text==='ZX-901'),'custom customer code value was lost');
assert(objects.some(o=>o.text==='塗裝色'),'custom Chinese field caption was lost');
assert(objects.some(o=>o.text==='銀灰'),'custom Chinese value was lost');
assert(objects.some(o=>/Made in Taiwan/.test(o.text)),'standalone fixed label text was lost');

const fields=I.genericFieldsFromTextObjects(objects);
assert(fields.some(f=>f.name==='客戶代碼'&&f.value==='ZX-901'),'generic spatial Chinese field pairing failed');
assert(fields.some(f=>f.name==='塗裝色'&&f.value==='銀灰'),'second generic Chinese field pairing failed');
assert(fields.every(f=>!['PART NO','LOT NO','QTY','DATE'].includes(f.name)),'test accidentally relied on built-in field dictionary');

const label={
  sourceName:'completely-unknown-customer.png',
  fields:[],
  textObjects:objects,
  barcodes:[
    {format:'Code 128',text:'ANY-CUSTOMER-123',sourceBox:{x:.1,y:.7,w:.5,h:.08}},
    {format:'Data Matrix',text:'DM-UNRELATED-FORMAT-456',sourceBox:{x:.68,y:.68,w:.15,h:.15}}
  ],
  sourceGeometry:{widthMm:95,heightMm:55}
};

const gate=c.LabelWorkbenchBtwProductionGate.prepareResult({labels:[label]});
assert(gate.result.labels.length===1,'production gate rejected a generic label with text objects');
assert(gate.result.labels[0].textObjects.length===objects.length,'production gate lost generic text objects');

const plan=c.LabelWorkbenchBtwSecondNative.plan(gate.result.labels[0]);
assert(plan,'single-donor generator rejected a generic text-object label within capacity');
assert(plan.fields.length===objects.length,'BTW generator did not prefer textObjects over semantic fields');
assert(plan.c128.length===1&&plan.dm.length===1,'generic label barcode plan changed unexpectedly');

console.log('PASS: unknown customer text, captions, values and layout objects survive generic analysis model and enter editable BTW planning without relying on known field names');
