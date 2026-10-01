const fs=require('fs'),vm=require('vm');
function assert(c,m){if(!c)throw new Error(m)}
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-second-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,D=c.LabelWorkbenchBtwSecondDonor;
  const full={text:'(16D)DATE: 20260722',confidence:95,sourceBox:{x:.42,y:.36,w:.22,h:.05}};
  const parts=S.splitCaptionValueField(full,['20260722']);
  assert(parts.length===2,'caption+linked value line was not split');
  assert(parts[0].text==='(16D)DATE:'&&parts[1].text==='20260722','caption/value split content is wrong');
  assert(parts[0].sourceBox.w<full.sourceBox.w&&parts[1].sourceBox.x>parts[0].sourceBox.x,'caption/value geometry was not partitioned');

  const collision={text:'CAPTION:',sourceBox:{x:.1,y:.30,w:.18,h:.04}};
  const barcode={format:'Code 128',text:'ABC123',sourceBox:{x:.08,y:.24,w:.34,h:.08}};
  const safe=S.paddedBarcodeBox(barcode,collision.sourceBox),moved=S.avoidBarcodeCollision(collision,[barcode]);
  assert(moved.sourceBox.y>=safe.y+safe.h||moved.sourceBox.y+moved.sourceBox.h<=safe.y,'caption was not moved outside padded barcode safety area');

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
  console.log('PASS: caption/value splitting, padded barcode avoidance, and native LineData endpoint parking');
})().catch(e=>{console.error(e);process.exit(1)});