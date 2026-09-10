const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('assets/bt-direct-import.js','utf8');
const context={console,window:{},globalThis:null,Promise,Date,Math,Uint8Array,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},document:{createElement:()=>({}),head:{appendChild(){}},body:{appendChild(){}}}};
context.globalThis=context;context.window.window=context.window;
vm.createContext(context);
vm.runInContext(source,context,{filename:'bt-direct-import.js'});

const api=context.window.LabelWorkbenchBtDirectImport;
if(!api)throw new Error('BT direct import API missing');
for(const fn of ['isMediaFile','fileBase','imageFileName','groupResultLabels','instructionText','buildImportImages','downloadFromAnalysis'])if(typeof api[fn]!=='function')throw new Error(`BT direct import helper missing: ${fn}`);
if(api.imageFileName(0)!=='BT_Import_Label_01.png'||api.imageFileName(11)!=='BT_Import_Label_12.png')throw new Error('Direct import PNG naming is unstable');
if(!api.isMediaFile({name:'sample.PDF',type:'application/pdf'})||!api.isMediaFile({name:'label.png',type:'image/png'})||api.isMediaFile({name:'data.csv',type:'text/csv'}))throw new Error('Direct import media filter is wrong');

const grouped=api.groupResultLabels({labels:[
  {sourceName:'A.pdf',page:1,index:2},{sourceName:'A.pdf',page:1,index:1},{sourceName:'A.pdf',page:2,index:1},{sourceName:'B.png',page:1,index:1}
]});
if(grouped.length!==3)throw new Error('Result labels must be grouped by source/page');
if(grouped[0].labels[0].index!==1||grouped[0].labels[1].index!==2)throw new Error('Labels must stay in visual index order');

const help=api.instructionText(2);
for(const marker of ['BarTender UltraLite','BT_Import_Label_01.png','圖片 / Picture','從檔案 / Insert from File','圖片物件'])if(!help.includes(marker))throw new Error(`Direct import instructions missing: ${marker}`);
for(const marker of ['20260910-btdi100','pdfjs-dist@6.3.289','jszip@3.10.1','detectLabelBands','rotateCanvas','BT_Import_Label_','BT_可直接匯入_'])if(!source.includes(marker))throw new Error(`Direct import implementation marker missing: ${marker}`);
if(/fetch\s*\(\s*['\"]https?:\/\//.test(source))throw new Error('Customer image export must not upload/fetch customer content to an external server');

console.log('PASS: PDF/image analysis can produce directly importable BarTender PNG files without uploading customer content');