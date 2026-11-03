'use strict';
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.argv[2]||path.join(process.cwd(),'hybrid-text-pool.btw'));
fs.mkdirSync(path.dirname(out),{recursive:true});
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const rel of ['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js']){
  const file=path.join(root,rel);
  vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
}
(async()=>{
  const D=c.LabelWorkbenchBtwControlledDonor;
  if(!D||typeof D.bytes!=='function')throw Error('Controlled Designer Text donor unavailable');
  const b=new Uint8Array(await D.bytes());
  fs.writeFileSync(out,Buffer.from(b));
  const result={schema:'lwb-text-pool-materialize-v1',output:out,bytes:b.length,sha256:String(D.EXPECTED_SHA256||'').toUpperCase(),id:D.ID||null};
  if(result.sha256!=='73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B')throw Error('Controlled Designer Text donor hash contract changed');
  process.stdout.write(JSON.stringify(result));
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
