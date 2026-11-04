const fs=require('fs');
const vm=require('vm');
const path=require('path');

const out=path.resolve(process.argv[2]||'review/renderer-prototype/runner-evidence/controlled-donor.btw');
fs.mkdirSync(path.dirname(out),{recursive:true});
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of ['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
(async()=>{
  const D=c.LabelWorkbenchBtwControlledDonor;
  const b=new Uint8Array(await D.bytes());
  fs.writeFileSync(out,Buffer.from(b));
  console.log(JSON.stringify({output:out,bytes:b.length,sha256:D.EXPECTED_SHA256||null,id:D.ID||null}));
})().catch(e=>{console.error(e);process.exit(1)});
