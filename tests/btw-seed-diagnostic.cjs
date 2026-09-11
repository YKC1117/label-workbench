const fs=require('fs');
const vm=require('vm');
const crypto=require('crypto');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,atob,btoa,window:null,globalThis:null};
c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-seed-2022r2.js','utf8'),c,{filename:'assets/btw-seed-2022r2.js'});
const api=c.LabelWorkbenchBtwSeed2022R2;
if(!api?.BASE64)throw new Error('seed api missing');
const b64=(Array.isArray(api.BASE64)?api.BASE64.join(''):String(api.BASE64)).replace(/\s+/g,'');
const bin=Buffer.from(b64,'base64');
const actualSha=crypto.createHash('sha256').update(bin).digest('hex');
const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const iend=Buffer.from('IEND','ascii');
function all(hay,needle){const out=[];let p=0;while((p=hay.indexOf(needle,p))>=0){out.push(p);p++}return out}
function hexRange(a,b){a=Math.max(0,a);b=Math.min(bin.length,b);return `${a}..${b}: ${bin.subarray(a,b).toString('hex').match(/.{1,2}/g).join(' ')}`}
const pngs=all(bin,png),iends=all(bin,iend);
console.log('SEED',api.ID,api.BUILD,'bytes=',bin.length);
console.log('SHA declared=',api.SHA256,'actual=',actualSha,'match=',api.SHA256===actualSha);
console.log('PNG_MAGIC offsets=',pngs.join(','));
console.log('IEND text offsets=',iends.join(','));
for(const [i,p] of pngs.entries()){
  const le=p>=4?bin.readUInt32LE(p-4):null;
  console.log(`PNG#${i+1} start=${p} prev4LE=${le} declaredEnd=${p+le}`);
}
if(api.SHA256&&api.SHA256!==actualSha)process.exitCode=2;
