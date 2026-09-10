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
  if(!api.validate('Code 39','ABC_DEF'))throw new Error('Unsupported Code 39 underscore accepted');
  if(api.validate('EAN-13','4006381333931'))throw new Error('Valid EAN-13 rejected');
  if(!api.validate('EAN-13','4006381333932'))throw new Error('Bad EAN-13 check digit accepted');
  if(api.validate('GS1-128','(01)04712345678903'))throw new Error('GS1 bracket notation rejected');
  const linear=api.buildOptions('Code 128','ABC123');
  if(linear.height!==4)throw new Error(`Unexpected default linear height: ${linear.height}`);
  const qr=api.buildOptions('QR Code','ABC123');
  if(qr.scale!==3)throw new Error(`Unexpected default 2D scale: ${qr.scale}`);
  if(!api.TWO_D.has('Data Matrix'))throw new Error('Data Matrix must use adjustable 2D size');

  const plan=api.layoutPlan([
    {width:180,height:80},{width:180,height:80},{width:180,height:80}
  ],420,20,20);
  if(plan.length!==3)throw new Error('Layout plan item count mismatch');
  if(plan[0].x!==20||plan[0].y!==20)throw new Error('Layout plan first item position mismatch');
  if(plan[1].y!==20||plan[1].x<=plan[0].x)throw new Error('Layout plan should place second item on the first row');
  if(plan[2].y<=plan[0].y)throw new Error('Layout plan should wrap overflowing items to a new row');
  for(const fn of ['copyLayoutImage','downloadLayoutPng','renderComposite','autoLayout']){
    if(typeof api[fn]!=='function')throw new Error(`Generator layout API missing ${fn}`);
  }
  console.log('PASS: barcode generator type, validation, size controls and layout planning smoke tests');
}

{
  const c=context();vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/layout-shortcuts.js','utf8'),c,{filename:'layout-shortcuts.js'});
  const api=c.window.LabelWorkbenchLayoutShortcuts;
  if(!api)throw new Error('Layout shortcut API missing');
  const tests=[
    [{key:'c',ctrlKey:true},'copy'],
    [{key:'v',ctrlKey:true},'paste'],
    [{key:'d',ctrlKey:true},'duplicate'],
    [{key:'c',metaKey:true},'copy'],
    [{key:'ArrowLeft'},'move'],
    [{key:'ArrowDown',shiftKey:true},'move'],
    [{key:'Delete'},'delete'],
    [{key:'Escape'},'escape']
  ];
  for(const [event,expected] of tests){
    const actual=api.commandFor(event);
    if(actual!==expected)throw new Error(`Shortcut ${JSON.stringify(event)} -> ${actual}, expected ${expected}`);
  }
  if(api.commandFor({key:'c'})!=='')throw new Error('Plain C must not trigger a layout shortcut');
  if(!api.editableTarget({tagName:'INPUT'}))throw new Error('Input fields must be protected from layout shortcuts');
  if(!api.editableTarget({tagName:'TEXTAREA'}))throw new Error('Textarea fields must be protected from layout shortcuts');
  if(api.editableTarget({tagName:'DIV',closest:()=>null}))throw new Error('Plain layout div should accept layout shortcuts');
  console.log('PASS: barcode layout Ctrl/Cmd copy-paste, duplicate, delete, arrows and escape shortcuts');
}

{
  const c=context();vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/label-interpreter.js','utf8'),c,{filename:'label-interpreter.js'});
  const api=c.window.LabelWorkbenchInterpreter;
  if(!api)throw new Error('Label interpreter API missing');

  const simple=api.parseFields('(1P) PART NO : ABC123\n(Q) QTY : 4000\n(16D) DATE : 20260722');
  if(simple.length!==3)throw new Error(`Expected 3 simple fields, got ${simple.length}`);
  if(simple[0].code!=='1P'||simple[0].value!=='ABC123')throw new Error('Coded field parse failed');

  const compound=api.parseFields('(1P)PART NO : W25N01KVZEIR   (1T)LOT NO : 66068W100ZZ\n(30P)SHAPE : T   (31P)GP : D   (Q)QTY : 4000\n(10D)DATE NO: 2628   (21L)ASSY: G   (16D)DATE: 20260722');
  const expected={
    '1P':'W25N01KVZEIR','1T':'66068W100ZZ','30P':'T','31P':'D','Q':'4000','10D':'2628','21L':'G','16D':'20260722'
  };
  for(const [code,value] of Object.entries(expected)){
    const hit=compound.find(f=>f.code===code);
    if(!hit||hit.value!==value)throw new Error(`Compound field parse failed for ${code}: ${hit?.value}`);
  }
  if(compound.some(f=>/\(1T\)|\(30P\)|\(31P\)/.test(f.value)))throw new Error('Next field code leaked into previous value');

  const generic=api.parseFields('LOT NO: LOT001\nMODEL: ZT610\nQTY: 1212');
  if(generic.length!==3)throw new Error(`Generic field parse failed: ${JSON.stringify(generic)}`);

  const consensus=api.aggregateFields([
    {text:'(1P)PART NO: ABC123\n(Q)QTY: 4000',confidence:80},
    {text:'(1P)PART NO: ABC123\n(Q)QTY: 4000',confidence:72}
  ]);
  const part=consensus.find(f=>f.code==='1P');
  if(!part||part.repeat!==2||part.conflict)throw new Error('Repeated-read consensus failed');

  const summary=api.productionText({labels:[{sourceName:'LABEL.pdf',fields:simple,barcodes:[{format:'Code 128',text:'ABC123'}],marks:['RoHS']}]});
  if(!summary.includes('PART NO')||!summary.includes('ABC123')||!summary.includes('RoHS'))throw new Error('Production summary missing useful content');
  console.log('PASS: v1.8 compound-row, consensus and action-focused interpretation smoke tests');
}
