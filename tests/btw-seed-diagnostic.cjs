const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,atob,btoa,window:null,globalThis:null};
c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-seed-2022r2.js','utf8'),c,{filename:'assets/btw-seed-2022r2.js'});
const api=c.LabelWorkbenchBtwSeed2022R2;
if(!api?.BASE64)throw new Error('seed api missing');
const bin=Buffer.from(api.BASE64.replace(/\s+/g,''),'base64');
const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const iend=Buffer.from('IEND','ascii');
const zlibCandidates=[Buffer.from([0x00,0x01,0x78,0x9c]),Buffer.from([0x78,0x9c]),Buffer.from([0x78,0x01]),Buffer.from([0x78,0xda])];
function all(hay,needle){const out=[];let p=0;while((p=hay.indexOf(needle,p))>=0){out.push(p);p++}return out}
function hexAround(pos,before=16,after=48){const a=Math.max(0,pos-before),b=Math.min(bin.length,pos+after);return `${a}..${b}: ${bin.subarray(a,b).toString('hex').match(/.{1,2}/g).join(' ')}`}
const pngs=all(bin,png),iends=all(bin,iend);
console.log('SEED',api.ID,api.BUILD,'bytes=',bin.length,'sha=',api.SHA256);
console.log('PNG_MAGIC offsets=',pngs.join(','));
console.log('IEND text offsets=',iends.join(','));
for(const [i,p] of pngs.entries()){
  const le=p>=4?bin.readUInt32LE(p-4):null;
  const be=p>=4?bin.readUInt32BE(p-4):null;
  console.log(`PNG#${i+1} start=${p} prev4LE=${le} prev4BE=${be}`);
  console.log(hexAround(p));
  const nextMagic=pngs[i+1]??bin.length;
  const localIends=iends.filter(x=>x>p&&x<nextMagic);
  console.log(`PNG#${i+1} local IEND offsets=${localIends.join(',')}`);
  for(const x of localIends) console.log('IEND around',hexAround(x,12,24));
}
for(const sig of zlibCandidates){console.log('SIG',sig.toString('hex'),'offsets=',all(bin,sig).slice(0,20).join(','))}
console.log('TAIL',hexAround(bin.length-96,0,96));
