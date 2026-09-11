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
function all(hay,needle){const out=[];let p=0;while((p=hay.indexOf(needle,p))>=0){out.push(p);p++}return out}
function hexRange(a,b){a=Math.max(0,a);b=Math.min(bin.length,b);return `${a}..${b}: ${bin.subarray(a,b).toString('hex').match(/.{1,2}/g).join(' ')}`}
function asciiRange(a,b){return bin.subarray(a,b).toString('latin1').replace(/[^\x20-\x7e]/g,'.')}
const pngs=all(bin,png),iends=all(bin,iend);
console.log('SEED',api.ID,api.BUILD,'bytes=',bin.length,'sha=',api.SHA256);
console.log('PNG_MAGIC offsets=',pngs.join(','));
console.log('IEND text offsets=',iends.join(','));
for(const [i,p] of pngs.entries()){
  const le=p>=4?bin.readUInt32LE(p-4):null;
  console.log(`PNG#${i+1} start=${p} prev4LE=${le} declaredEnd=${p+le}`);
  console.log(hexRange(p-16,p+64));
}
const first=pngs[0];
const declared=first>=4?bin.readUInt32LE(first-4):0;
const dEnd=first+declared;
console.log('AROUND declaredEnd',hexRange(dEnd-64,dEnd+128));
console.log('ASCII declaredEnd',asciiRange(dEnd-64,dEnd+128));
for(let p=dEnd-32;p<dEnd+96;p++){
  if(p>=0&&p+4<=bin.length){
    const le=bin.readUInt32LE(p);
    if(le>0&&le<20000)console.log('plausible LE32 at',p,'=',le,'next=',p+4+le);
  }
}
const candidates=[];
for(let p=0;p<bin.length-2;p++){
  const cmf=bin[p],flg=bin[p+1];
  if((cmf&0x0f)===8&&((cmf<<8)+flg)%31===0)candidates.push(p);
}
console.log('zlib-header candidates tail=',candidates.filter(x=>x>3000).slice(-30).join(','));
for(const p of candidates.filter(x=>x>12000).slice(-10))console.log('zlib around',p,hexRange(p-16,p+32));
console.log('12000..14107 ASCII sparse=',asciiRange(12000,14107));
console.log('around 13783',hexRange(13740,13820));
