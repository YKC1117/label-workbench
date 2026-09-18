const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}
const source=fs.readFileSync('assets/label-interpreter.js','utf8');

const document={
  getElementById(){return null},
  createElement(){throw new Error('canvas should not be needed in parser smoke test')}
};
const window={};
const c={
  console,window,document,globalThis:null,
  setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,
  URL:{},Image:function(){}
};
c.globalThis=c;window.window=window;
vm.createContext(c);
vm.runInContext(source,c,{filename:'label-interpreter.js'});

const I=c.window.LabelWorkbenchInterpreter||c.LabelWorkbenchInterpreter;
assert(I?.BUILD==='20260918-v182-text-column-row-rescue','unexpected interpreter build');

// Real LABEL.pdf-style OCR: the 1T marker can disappear, leaving "T)LOT NO".
// PART must stop at the LOT caption instead of swallowing the whole line.
const top=I.parseFields('(1P)PART NO : W668GG6TB-06 T)LOT NO : K6025K700');
const part=top.find(f=>f.code==='1P');
const lot=top.find(f=>f.code==='1T');
assert(part?.value==='W668GG6TB-06',`PART boundary rescue failed: ${JSON.stringify(top)}`);
assert(lot?.value==='K6025K700',`LOT caption rescue failed: ${JSON.stringify(top)}`);

// Real narrow-row OCR from the second label. The first AI can be misread as Z0P,
// but the exact SHAPE caption must still map back to canonical 30P.
const middle=I.parseFields('(Z0P)SHAPE : E (31P)GP : L (Q)QTY : 1212 (10D)DATE NO: 2629 (21L)ASSY: 3 (16D)DATE: 20260722');
const byCode=Object.fromEntries(middle.map(f=>[f.code,f.value]));
for(const [code,value] of Object.entries({
  '30P':'E','31P':'L','Q':'1212','10D':'2629','21L':'3','16D':'20260722'
})){
  assert(byCode[code]===value,`row rescue parser mismatch ${code}: ${byCode[code]} != ${value}; ${JSON.stringify(middle)}`);
}

const lower=I.parseFields('(31T)MLOT NO: K6025K70000 (33P)BIN: 1 (23L)MC: 3 (24L)VC: PS');
const lowerBy=Object.fromEntries(lower.map(f=>[f.code,f.value]));
assert(lowerBy['31T']==='K6025K70000','MLOT parse failed');
assert(lowerBy['33P']==='1','BIN parse failed');
assert(lowerBy['23L']==='3','MC parse failed');
assert(lowerBy['24L']==='PS','VC parse failed');

const aux=I.parseFields('(1Y)P1: +105T43B0_PS (2Y)P2: +105T4430_PS (4Y)4Y: Y2');
const auxBy=Object.fromEntries(aux.map(f=>[f.code,f.value]));
assert(auxBy['1Y']==='+105T43B0_PS','P1 parse failed');
assert(auxBy['2Y']==='+105T4430_PS','P2 parse failed');
assert(auxBy['4Y']==='Y2','4Y parse failed');

// Structured labels with too few recovered fields should trigger text-column/row rescue.
// Simple non-structured labels should not pay the extra OCR cost merely for having <10 fields.
const structuredPass=[{text:'PART NO LOT NO SHAPE QTY DATE NO ASSY MLOT BIN',confidence:80,lines:[]}];
const eight=Array.from({length:8},(_,i)=>({code:'X'+i,name:'F'+i,value:'V'+i,conflict:false}));
assert(I.structuredFieldHints(structuredPass)>=4,'structured hint detection failed');
assert(I.needsTextRescue(eight,structuredPass)===true,'structured incomplete label should request rescue');

const stable=Array.from({length:10},(_,i)=>({code:'X'+i,name:'F'+i,value:'V'+i,conflict:false}));
assert(I.needsTextRescue(stable,structuredPass)===false,'stable structured label should not keep rescanning');

const simplePass=[{text:'MODEL: ABC SERIAL: 123',confidence:90,lines:[]}];
const seven=Array.from({length:7},(_,i)=>({code:'',name:'F'+i,value:'V'+i,conflict:false}));
assert(I.needsTextRescue(seven,simplePass)===false,'simple seven-field label should not trigger expensive row rescue');

console.log('PASS: real LABEL.pdf-style OCR boundaries and barcode-heavy text-row rescue heuristics are stable');
