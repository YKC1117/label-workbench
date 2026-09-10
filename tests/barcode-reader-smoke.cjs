const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('assets/barcode-reader-core.js','utf8');
const context={
  console,
  window:{},
  document:{querySelector:()=>null,createElement:()=>({dataset:{},addEventListener(){},getContext(){return{}}}),head:{appendChild(){}}},
  globalThis:null,
  URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},
  Image:function(){},
  Promise,Uint8Array,Blob:global.Blob,Math,String,Set
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'assets/barcode-reader-core.js'});

const api=context.window.LabelWorkbenchBarcodeCore;
if(!api)throw new Error('Barcode core API was not exposed');
if(api.ZXING_VERSION!=='3.1.3')throw new Error('ZXing version pin changed');
if(api.formatName('CODE_128')!=='Code 128')throw new Error('CODE_128 format mapping failed');
if(api.formatName('qr_code')!=='QR Code')throw new Error('QR format mapping failed');
if(api.visibleText('A'+String.fromCharCode(29)+'B\r\n')!=='A[GS]B[CR][LF]')throw new Error('Control character display failed');
const deduped=api.dedupe([
  {format:'CODE_39',text:'ABC123',engine:'a'},
  {format:'Code 39',text:'ABC123',engine:'b'},
  {format:'QR_CODE',text:'HELLO',engine:'a'}
]);
if(deduped.length!==2)throw new Error(`Expected 2 deduped results, got ${deduped.length}`);
if(deduped[0].format!=='Code 39')throw new Error('Normalized format should be used in dedupe output');
if(api.key({format:'QR Code',text:'A'})===api.key({format:'QR Code',text:'B'}))throw new Error('Result key must include content');
if(typeof api.selfTest!=='function'||typeof api.scanCanvas!=='function')throw new Error('Diagnostic/manual scan APIs missing');
if(!source.includes("fillStyle='#fff'")||!source.includes('標準化全圖'))throw new Error('Barcode canvas must normalize transparent images onto white before decode');
if(!source.includes('longSide<1600')||!source.includes('1600/Math.max'))throw new Error('Deep scan must upscale small clipboard-style images');

class MockFile extends Blob{
  constructor(parts,name,options={}){super(parts,options);this.name=name;this.lastModified=Date.now()}
}
const uiSource=fs.readFileSync('assets/barcode-reader-ui.js','utf8');
const uiContext={
  console,
  window:{addEventListener(){}},
  navigator:{clipboard:{}},
  document:{readyState:'loading',addEventListener(){},getElementById(){return null}},
  File:MockFile,
  Blob:global.Blob,
  Promise,Date,Math,String,Set
};
vm.createContext(uiContext);
vm.runInContext(uiSource,uiContext,{filename:'assets/barcode-reader-ui.js'});
const uiApi=uiContext.window.LabelWorkbenchBarcodeUI;
if(!uiApi||typeof uiApi.clipboardFiles!=='function'||typeof uiApi.pasteFromClipboard!=='function')throw new Error('Clipboard barcode reader APIs missing');
const clip=new MockFile(['image'],'clipboard.png',{type:'image/png'});
const pasted=uiApi.clipboardFiles({items:[{kind:'file',type:'image/png',getAsFile:()=>clip}],files:[]});
if(pasted.length!==1||!pasted[0].name.startsWith('clipboard-')||pasted[0].type!=='image/png')throw new Error('Clipboard image normalization failed');
const ignored=uiApi.clipboardFiles({items:[{kind:'string',type:'text/plain',getAsFile:()=>null}],files:[]});
if(ignored.length!==0)throw new Error('Clipboard text must not be treated as a direct image');
if(typeof uiApi.imageSourcesFromStrings!=='function'||typeof uiApi.filesFromClipboardData!=='function')throw new Error('Robust clipboard helpers missing');
const htmlSources=uiApi.imageSourcesFromStrings('<div><img src="data:image/png;base64,AAAA"><img src="https://example.com/barcode.png"></div>','','');
if(htmlSources.length!==2||!htmlSources[0].startsWith('data:image/png')||htmlSources[1]!=='https://example.com/barcode.png')throw new Error('Clipboard HTML image source extraction failed');
if(!uiSource.includes("run(files,{deep:true,mode:'paste'})"))throw new Error('Pasted images must automatically use deep scan');
if(uiSource.includes('id="barcodePasteBtn"'))throw new Error('Redundant clipboard paste button must not return');

console.log('PASS: barcode format normalization');
console.log('PASS: transparent/clipboard images normalize onto white');
console.log('PASS: small images are upscaled for deep scan');
console.log('PASS: direct clipboard image extraction');
console.log('PASS: clipboard HTML/data-url image source extraction');
console.log('PASS: pasted images auto-run deep scan without redundant button');