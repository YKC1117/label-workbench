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
const pngs=all(bin,png),iends=all(bin,iend);
console.log('SEED',api.ID,api.BUILD,'bytes=',bin.length);
console.log('SHA metadata=',api.SHA256,'decoded=',actualSha,'same=',api.SHA256===actualSha);
console.log('PNG_MAGIC offsets=',pngs.join(','));
console.log('IEND text offsets=',iends.join(','));
if(!bin.length)throw new Error('decoded seed is empty');
if(!pngs.length)throw new Error('seed has no preview PNG signature');
