const fs=require('fs'),vm=require('vm');
function assert(c,m){if(!c)throw new Error(m)}
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
(async()=>{
 const D=c.LabelWorkbenchBtwControlledDonor,M=c.LabelWorkbenchBtwObjectMap;
 const bytes=new Uint8Array(await D.bytes()),before=await M.decodeBtw(bytes),line=before.map.objects.find(o=>o.kind==='line');
 assert(line,'controlled donor line missing');
 assert([line.lineX1Mil,line.lineY1Mil,line.lineX2Mil,line.lineY2Mil].every(Number.isFinite),'native line endpoints were not detected');
 assert(Math.abs((line.lineX1Mil+line.lineX2Mil)/2-line.xMil)<=2,'line endpoint midpoint X does not match primary X');
 assert(Math.abs((line.lineY1Mil+line.lineY2Mil)/2-line.yMil)<=2,'line endpoint midpoint Y does not match primary Y');
 const out=await M.rebuildBtw(bytes,[{index:line.index,xMil:50000,yMil:50000}]),moved=out.objects.find(o=>o.index===line.index);
 assert(moved.xMil===50000&&moved.yMil===50000,'line primary position was not parked');
 assert(moved.lineX1Mil>45000&&moved.lineX2Mil>45000&&moved.lineY1Mil>45000&&moved.lineY2Mil>45000,'line endpoints remained on-label');
 assert(Math.abs((moved.lineX1Mil+moved.lineX2Mil)/2-moved.xMil)<=2,'moved line midpoint X broke');
 assert(Math.abs((moved.lineY1Mil+moved.lineY2Mil)/2-moved.yMil)<=2,'moved line midpoint Y broke');
 console.log('PASS: native Line endpoints follow primary X/Y and park fully off-canvas');
})().catch(e=>{console.error(e);process.exit(1)});