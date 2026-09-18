const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}
const document={readyState:'loading',getElementById(){return null},createElement(){return{getContext(){return{}},style:{}}},head:{appendChild(){}},addEventListener(){}};
const c={console,document,window:null,globalThis:null,setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Promise,Uint8Array};
c.window=c;c.globalThis=c;
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/label-interpreter.js','utf8'),c,{filename:'label-interpreter.js'});
const I=c.LabelWorkbenchInterpreter;
assert(typeof I?.needsTileFallback==='function','needsTileFallback API missing');

const goodPasses=[
  {text:'客戶代碼 ZX-901 塗裝色 銀灰 Made in Taiwan',confidence:88},
  {text:'客戶代碼 ZX-901 塗裝色 銀灰',confidence:84},
  {text:'Customer ZX-901 Color Silver',confidence:80}
];
const goodObjects=[
  {text:'客戶代碼',confidence:91,repeat:3},
  {text:'ZX-901',confidence:90,repeat:3},
  {text:'塗裝色',confidence:86,repeat:2},
  {text:'銀灰',confidence:85,repeat:2}
];
const onlyTwoFields=[
  {name:'客戶代碼',value:'ZX-901',conflict:false},
  {name:'塗裝色',value:'銀灰',conflict:false}
];
assert(I.needsTileFallback(goodPasses,goodObjects,onlyTwoFields)===false,'a normal label with fewer than seven fields must not trigger four tile OCR passes');

assert(I.needsTileFallback(
  [{text:'',confidence:0},{text:'?',confidence:12},{text:'',confidence:0}],
  [],
  []
)===true,'blank/very weak OCR should trigger tile fallback');

assert(I.needsTileFallback(
  [{text:'LOT ABC123 LOT ABCI23',confidence:40}],
  [{text:'LOT',confidence:55,repeat:1}],
  [{name:'LOT',value:'ABC123',conflict:true}]
)===true,'unresolved low-evidence conflict should still trigger tile fallback');

assert(I.needsTileFallback(
  [{text:'MODEL X1',confidence:82}],
  [{text:'MODEL',confidence:90,repeat:2},{text:'X1',confidence:88,repeat:2}],
  [{name:'MODEL',value:'X1',conflict:false}]
)===false,'simple one-field customer labels must remain fast when evidence is clear');

console.log('PASS: OCR tile fallback is quality-driven and no longer assumes every customer label has at least seven fields');
