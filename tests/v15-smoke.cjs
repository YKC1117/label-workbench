const fs = require('fs');
const vm = require('vm');

function context(){
  const c={
    console,
    window:{},
    navigator:{},
    URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},
    Image:function(){},
    ClipboardItem:function(){},
    setTimeout:()=>0,
    clearTimeout:()=>{},
    Promise,
    Uint8Array,
    Date,
    Math,
    document:{
      readyState:'loading',
      addEventListener:()=>{},
      getElementById:()=>null,
      querySelector:()=>null,
      createElement:()=>({}),
      head:{appendChild(){}},
      body:{appendChild(){}}
    },
    globalThis:null
  };
  c.globalThis=c;c.window.window=c.window;return c;
}

{
  const c=context();vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/barcode-generator.js','utf8'),c,{filename:'barcode-generator.js'});
  const api=c.window.LabelWorkbenchBarcodeGenerator;
  if(!api)throw new Error('Barcode generator API missing');
  for(const type of ['Code 128','Code 39','QR Code','Data Matrix','GS1-128','GS1 DataMatrix']){
    if(!api.TYPES[type])throw new Error(`Generator missing ${type}`);
  }
  if(api.validate('Code 39','ABC-123'))throw new Error('Valid Code 39 rejected');
  if(!api.validate('Code 39','abc123'))throw new Error('Invalid lowercase Code 39 accepted');
  if(api.validate('EAN-13','4006381333931'))throw new Error('Valid EAN-13 rejected');
  if(!api.validate('EAN-13','4006381333932'))throw new Error('Bad EAN-13 check digit accepted');
  if(api.validate('GS1-128','(01)04712345678903'))throw new Error('GS1 bracket notation rejected');
  console.log('PASS: barcode generator type and validation smoke tests');
}

{
  const c=context();vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/label-interpreter.js','utf8'),c,{filename:'label-interpreter.js'});
  const api=c.window.LabelWorkbenchInterpreter;
  if(!api)throw new Error('Label interpreter API missing');
  const fields=api.parseFields('(1P) PART NO : ABC123\n(Q) QTY : 4000\n(16D) DATE : 20260722');
  if(fields.length!==3)throw new Error(`Expected 3 fields, got ${fields.length}`);
  if(fields[0].code!=='1P'||fields[0].value!=='ABC123')throw new Error('Coded field parse failed');
  const generic=api.parseFields('LOT NO: LOT001\nMODEL: ZT610');
  if(generic.length!==2)throw new Error('Generic field parse failed');
  const summary=api.productionText({labels:[{sourceName:'LABEL.pdf',fields,barcodes:[{format:'Code 128',text:'ABC123'}],marks:['RoHS']}]});
  if(!summary.includes('PART NO')||!summary.includes('ABC123')||!summary.includes('RoHS'))throw new Error('Production summary missing useful content');
  console.log('PASS: action-focused label interpretation smoke tests');
}
