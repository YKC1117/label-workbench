const fs=require('fs'),vm=require('vm');

function loadInterpreter(){
  const c={console,Math,Date,setInterval,clearInterval,setTimeout,Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,
    window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},createElement(){return{}},head:{appendChild(){}}}};
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

const c2={console,Math,Date,setInterval,clearInterval,setTimeout,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,Promise,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){}}};
c2.window=c2;c2.globalThis=c2;vm.createContext(c2);
vm.runInContext(fs.readFileSync('assets/btw-rich-native.js','utf8'),c2,{filename:'btw-rich-native.js'});
const R=c2.LabelWorkbenchBtwRichNative;
if(!R?.sourceFontSize)throw new Error('sourceFontSize missing');
const small=R.sourceFontSize({mm:{h:2.6}},12),large=R.sourceFontSize({mm:{h:6.2}},12);
if(!(small>=5&&large>small&&large<=42))throw new Error('source font scaling invalid '+JSON.stringify({small,large}));

console.log('PASS: single-photo label stays cropped and source text height drives non-uniform editable font sizes');
