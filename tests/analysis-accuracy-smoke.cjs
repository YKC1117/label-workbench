const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const source=fs.readFileSync('assets/analysis-accuracy.js','utf8');
const window={
  LabelWorkbenchInterpreter:{analyze:async()=>({labels:[]})}
};
const context={
  window,
  document:{getElementById:()=>null},
  console,
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'analysis-accuracy.js'});

const A=window.LabelWorkbenchAnalysisAccuracy;
assert(A,'analysis accuracy guard should export an API');

const label={
  fields:[
    {code:'30P',name:'SHAPE',value:'T#31PD#Q4000',repeat:2,spatial:true,alternatives:[]},
    {code:'10D',name:'DATE NO',value:'2628#21LG#16D20260722',repeat:2,spatial:true,alternatives:[]},
    {code:'31T',name:'MLOT NO',value:'6612D7800#33P1#23LG#24LPS',repeat:2,spatial:true,alternatives:[]}
  ],
  barcodes:[]
};
A.refineLabel(label);
assert.strictEqual(label.fields[0].value,'T');
assert.strictEqual(label.fields[1].value,'2628');
assert.strictEqual(label.fields[2].value,'6612D7800');
assert.strictEqual(label.fields[0].__boundaryTrimmed,true);
assert.strictEqual(label.fields[1].__boundaryCode,'21L');
assert.strictEqual(label.fields[2].__boundaryCode,'33P');

const barcode={text:'30PT#31PD#Q4000#10D2628#21LG#16D20260722#31T6612D7800#33P1#23LG#24LPS'};
assert.deepStrictEqual([...A.extractCodeValuesFromBarcode('30P',barcode)],['T']);
assert.deepStrictEqual([...A.extractCodeValuesFromBarcode('31P',barcode)],['D']);
assert.deepStrictEqual([...A.extractCodeValuesFromBarcode('Q',barcode)],['4000']);
assert.deepStrictEqual([...A.extractCodeValuesFromBarcode('10D',barcode)],['2628']);
assert.deepStrictEqual([...A.extractCodeValuesFromBarcode('16D',barcode)],['20260722']);
assert.deepStrictEqual([...A.extractCodeValuesFromBarcode('31T',barcode)],['6612D7800']);

const verified={
  fields:[{code:'30P',name:'SHAPE',value:'T#31PD#Q4000',repeat:1,spatial:true,alternatives:[]}],
  barcodes:[barcode]
};
A.refineLabel(verified);
assert.strictEqual(verified.fields[0].value,'T');
assert.strictEqual(verified.fields[0].barcodeVerified,true);
assert.strictEqual(verified.fields[0].__boundaryTrimmed,false);

console.log('analysis accuracy smoke: ok');
