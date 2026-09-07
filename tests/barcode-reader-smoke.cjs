const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('assets/barcode-reader.js','utf8');
const context={
  console,
  setTimeout:()=>0,
  clearTimeout:()=>{},
  window:{},
  document:{
    readyState:'loading',
    addEventListener:()=>{},
    getElementById:()=>null,
    querySelector:()=>null,
    createElement:()=>({dataset:{},appendChild(){},addEventListener(){},style:{}}),
    head:{appendChild(){}},
    body:{appendChild(){}}
  },
  navigator:{},
  globalThis:null,
  URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},
  Image:function(){},
  Date,
  Math
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'assets/barcode-reader.js'});

const api=context.window.LabelWorkbenchBarcodeReader;
if(!api)throw new Error('Barcode reader API was not exposed');
if(api.formatName('CODE_128')!=='Code 128')throw new Error('CODE_128 format mapping failed');
if(api.formatName('qr_code')!=='QR Code')throw new Error('QR format mapping failed');
if(api.visibleText('A'+String.fromCharCode(29)+'B\r\n')!=='A[GS]B[CR][LF]')throw new Error('Control character display failed');
const deduped=api.dedupeResults([
  {format:'CODE_39',text:'ABC123',engine:'a'},
  {format:'Code 39',text:'ABC123',engine:'b'},
  {format:'QR_CODE',text:'HELLO',engine:'a'}
]);
if(deduped.length!==2)throw new Error(`Expected 2 deduped results, got ${deduped.length}`);
if(deduped[0].format!=='Code 39')throw new Error('Normalized format should be used in dedupe output');
if(api.resultKey({format:'QR Code',text:'A'})===api.resultKey({format:'QR Code',text:'B'}))throw new Error('Result key must include content');

console.log('PASS: barcode format normalization');
console.log('PASS: GS/CR/LF visible control characters');
console.log('PASS: duplicate barcode result removal');
