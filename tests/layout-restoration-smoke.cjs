const fs=require('fs'),vm=require('vm');

function loadInterpreter(){
  const c={console,Math,Date,setInterval,clearInterval,setTimeout,Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,
    window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},createElement(tag){if(tag!=='canvas')return{};const canvas={width:1,height:1,getContext(){return{fillStyle:'#fff',fillRect(){},drawImage(){},getImageData(){return{data:new Uint8ClampedArray(canvas.width*canvas.height*4)}}}}};return canvas},head:{appendChild(){}}}};
  c.window=c;c.globalThis=c;vm.createContext(c);
  vm.runInContext(fs.readFileSync('assets/label-interpreter.js','utf8'),c,{filename:'label-interpreter.js'});
  return c.LabelWorkbenchInterpreter;
}
function fakeCanvas(w,h,band){
  const data=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=245;data[i+3]=255}
  for(let y=band.y;y<band.y+band.h;y++)for(let x=band.x;x<band.x+band.w;x++){
    const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=80;data[i+3]=255;
  }
  return {width:w,height:h,getContext(){return{getImageData(){return{data}},fillStyle:'#fff',fillRect(){},drawImage(){}}}};
}
const I=loadInterpreter();
if(!I?.detectLabelBands)throw new Error('detectLabelBands missing');
const bands=I.detectLabelBands(fakeCanvas(1000,600,{x:140,y:220,w:720,h:130}));
if(bands.length!==1)throw new Error('single label should remain one detected region');
const b=bands[0];
if(b.y<=80||b.y+b.h>=520)throw new Error('single label was expanded back to full image: '+JSON.stringify(b));

const deduped=I.dedupeSpatialTextObjects([
  {text:'MLOT NO ABC123',confidence:82,repeat:2,sourceBox:{x:.10,y:.20,w:.34,h:.10}},
  {text:'MLOT NO',confidence:90,repeat:2,sourceBox:{x:.10,y:.20,w:.14,h:.10}},
  {text:'ABC123',confidence:91,repeat:2,sourceBox:{x:.25,y:.20,w:.19,h:.10}},
  {text:'BIN',confidence:88,repeat:2,sourceBox:{x:.10,y:.48,w:.09,h:.08}},
  {text:'BIN',confidence:87,repeat:2,sourceBox:{x:.70,y:.48,w:.09,h:.08}}
]);
if(deduped.some(o=>o.text==='MLOT NO ABC123'))throw new Error('parent whole-line duplicate should yield to reliable child caption/value objects');
if(deduped.filter(o=>o.text==='BIN').length!==2)throw new Error('same legal text at distinct positions must not be deduped');

const c2={console,Math,Date,setInterval,clearInterval,setTimeout,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,Promise,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){}}};
c2.window=c2;c2.globalThis=c2;vm.createContext(c2);
vm.runInContext(fs.readFileSync('assets/btw-rich-native.js','utf8'),c2,{filename:'btw-rich-native.js'});
const R=c2.LabelWorkbenchBtwRichNative;
if(!R?.sourceFontSize)throw new Error('sourceFontSize missing');
const small=R.sourceFontSize({mm:{h:2.6}},12),large=R.sourceFontSize({mm:{h:6.2}},12);
if(!(small>=5&&large>small&&large<=42))throw new Error('source font scaling invalid '+JSON.stringify({small,large}));

console.log('PASS: single-photo crop, spatial OCR dedupe, distinct repeated text, and source-driven font sizing');
