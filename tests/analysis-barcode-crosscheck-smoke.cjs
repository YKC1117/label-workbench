const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const source=fs.readFileSync('assets/analysis-barcode-crosscheck.js','utf8');
const window={LabelWorkbenchInterpreter:{analyze:async()=>({labels:[]})}};
const context={window,document:{getElementById:()=>null},console,setInterval,clearInterval,setTimeout,clearTimeout};
vm.createContext(context);vm.runInContext(source,context,{filename:'analysis-barcode-crosscheck.js'});
const A=window.LabelWorkbenchBarcodeCrosscheck;
assert(A,'barcode cross-check API should export');
const barcode={text:'(1P)W25NO1GWZEIR(30P)T(31P)D(Q)4000(10D)2628(21L)G(16D)20260722(31T)6612D7800(33P)1(23L)G(24L)PS(1Y)105T43B'};
assert.deepStrictEqual(Array.from(A.extractCodeValues('1P',barcode)),['W25NO1GWZEIR']);
assert.deepStrictEqual(Array.from(A.extractCodeValues('Q',barcode)),['4000']);
assert.deepStrictEqual(Array.from(A.extractCodeValues('31T',barcode)),['6612D7800']);
const label={fields:[
 {code:'1P',name:'PART NO',value:'W25NO1GWZEIR',alternatives:['W25NO1GWZE1R']},
 {code:'31T',name:'MLOT NO',value:'6612D7800',alternatives:[]},
 {code:'Q',name:'QTY',value:'4000',alternatives:[]}
],barcodes:[barcode]};
A.refineLabel(label);
assert.strictEqual(label.fields[0].barcodeVerified,true);
assert.strictEqual(label.fields[1].barcodeVerified,true);
assert.strictEqual(label.fields[2].barcodeVerified,true);
const corrected={fields:[{code:'1P',name:'PART NO',value:'WRONG',alternatives:[]}],barcodes:[{text:'(1P)RIGHTPART'}]};
A.refineLabel(corrected);
assert.strictEqual(corrected.fields[0].value,'RIGHTPART');
assert.strictEqual(corrected.fields[0].barcodeVerified,true);
const conflict={fields:[{code:'1T',name:'LOT NO',value:'OLD',alternatives:[]}],barcodes:[{text:'(1T)ABC'},{text:'(1T)ABD'}]};
A.refineLabel(conflict);
assert.strictEqual(conflict.fields[0].barcodeVerified,false);
assert.strictEqual(conflict.fields[0].__barcodeConflict,true);
console.log('analysis barcode cross-check smoke: ok');
