const fs=require('fs');
const vm=require('vm');
function assert(cond,msg){if(!cond)throw new Error(msg)}
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,atob,btoa,setTimeout,setInterval,clearInterval,Date,Math,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of ['assets/btw-format.js','assets/btw-object-map.js','assets/btw-second-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

(async()=>{
  const D=c.LabelWorkbenchBtwSecondDonor,M=c.LabelWorkbenchBtwObjectMap;
  const bytes=new Uint8Array(await D.bytes());
  const before=await M.decodeBtw(bytes);
  const text=before.map.objects.find(o=>o.kind==='text'&&Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&Number.isFinite(o.textBoxXMil)&&Number.isFinite(o.textBoxYMil));
  assert(text,'real donor Text Box Options position was not detected');

  const dx=777,dy=333,newX=text.xMil+dx,newY=text.yMil+dy;
  const moved=await M.rebuildBtw(bytes,[{index:text.index,xMil:newX,yMil:newY}]);
  const after=moved.objects.find(o=>o.index===text.index);
  assert(after?.xMil===newX&&after?.yMil===newY,'primary Text X/Y move failed');
  assert(after.textBoxXMil===text.textBoxXMil+dx,'Text Box Options X did not translate with primary X');
  assert(after.textBoxYMil===text.textBoxYMil+dy,'Text Box Options Y did not translate with primary Y');
  assert(after.textBoxXMil-after.xMil===text.textBoxXMil-text.xMil,'Text Box relative X offset changed');
  assert(after.textBoxYMil-after.yMil===text.textBoxYMil-text.yMil,'Text Box relative Y offset changed');

  const parked=await M.rebuildBtw(bytes,[{index:text.index,xMil:50000,yMil:50000}]);
  const po=parked.objects.find(o=>o.index===text.index);
  assert(po.xMil===50000&&po.yMil===50000,'primary Text object was not parked');
  assert(po.textBoxXMil>45000&&po.textBoxYMil>45000,'internal Text Box stayed on-label after parking');
  assert(po.textBoxXMil-po.xMil===text.textBoxXMil-text.xMil,'parked Text Box relative X offset changed');
  assert(po.textBoxYMil-po.yMil===text.textBoxYMil-text.yMil,'parked Text Box relative Y offset changed');

  console.log('PASS: real donor Text Box Options geometry follows primary X/Y and parks off-canvas consistently');
})().catch(e=>{console.error(e);process.exit(1)});