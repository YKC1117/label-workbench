const fs=require('fs'),vm=require('vm');
function assert(c,m){if(!c)throw new Error(m)}
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-controlled-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,D=c.LabelWorkbenchBtwControlledDonor;
  const full={text:'(16D)DATE: 20260722',confidence:95,sourceBox:{x:.42,y:.36,w:.22,h:.05}};
  const exact={text:'20260722',confidence:91,sourceBox:{x:.67,y:.36,w:.08,h:.05}};
  const sup=S.suppressStandaloneLinkedValues([full,exact],['20260722']);
  assert(sup.fields.length===1&&sup.fields[0].text==='(16D)DATE: 20260722','complete caption+value line was not preserved');
  assert(sup.omitted.length===1&&sup.omitted[0].text==='20260722','standalone linked value duplicate was not suppressed');

  const collision={text:'CAPTION:',sourceBox:{x:.1,y:.30,w:.18,h:.04}};
  const barcode={format:'Code 128',text:'ABC123',sourceBox:{x:.08,y:.24,w:.34,h:.08}};
  const moved=S.avoidBarcodeCollision(collision,[barcode]);
  assert(moved.sourceBox.y>=barcode.sourceBox.y+barcode.sourceBox.h,'nearest free collision slot should move this caption below the barcode');

  const seed=new Uint8Array(await D.bytes()),parsed=F.parseStructure(seed),container=await F.inflateContainer(parsed);
  const data=new Uint8Array(container),dv=new DataView(data.buffer,data.byteOffset,data.byteLength);
  let at=-1,x=0,y=0;
  for(let i=0;i+20<data.length;i++){
    if(data[i]!==0xff||data[i+1]!==0xff||data[i+2]!==0x01||data[i+3]!==0x00)continue;
    const len=data[i+4]|(data[i+5]<<8);if(len<3||len>80||i+6+len+8>data.length)continue;
    let type='';let ok=true;
    for(let j=0;j<len;j++){const b=data[i+6+j];if(b<0x20||b>0x7e){ok=false;break}type+=String.fromCharCode(b)}
    if(ok&&type==='LineData'){at=i+6+len;x=dv.getInt32(at,true);y=dv.getInt32(at+4,true);break}
  }
  assert(at>=0,'controlled donor LineData marker not found');
  const ep=S.lineEndpointOffsets(data,dv,at,x,y);
  assert(ep,'LineData endpoints not detected');
  assert(Math.abs((ep.x1+ep.x2)/2-x)<=2&&Math.abs((ep.y1+ep.y2)/2-y)<=2,'LineData endpoint midpoint mismatch');
  const parked=S.parkAuxiliaryGraphics(data),out=parked.container,dv2=new DataView(out.buffer,out.byteOffset,out.byteLength),line=parked.parked.find(x=>x.type==='LineData');
  assert(line?.lineEndpoints,'LineData was parked without translating endpoints');
  assert(dv2.getInt32(at,true)===S.OFF&&dv2.getInt32(at+4,true)===S.OFF,'LineData primary position was not parked');
  const x1=dv2.getInt32(ep.off,true),y1=dv2.getInt32(ep.off+4,true),x2=dv2.getInt32(ep.off+8,true),y2=dv2.getInt32(ep.off+12,true);
  assert(Math.abs((x1+x2)/2-S.OFF)<=2&&Math.abs((y1+y2)/2-S.OFF)<=2,'LineData endpoints stayed on-label after parking');
  console.log('PASS: linked standalone suppression, nearest-free barcode avoidance, and native LineData endpoint parking');
})().catch(e=>{console.error(e);process.exit(1)});