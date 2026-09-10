const fs=require('fs');
const zlib=require('zlib');
const assert=require('assert');

const cfg=fs.readFileSync('assets/cloud-config.js','utf8');
const url=/url:\s*['"]([^'"]+)['"]/.exec(cfg)?.[1];
const key=/key:\s*['"]([^'"]+)['"]/.exec(cfg)?.[1];
assert(url&&key&&key.startsWith('sb_publishable_'),'publishable cloud config missing');
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1'),END=Buffer.from([0xff,0xfe,0xff,0x00]);
function skip0(b,p){while(p+4<=b.length&&b.readUInt32LE(p)===0)p+=4;return p}
function parse(data){assert(data.subarray(0,SOF.length).equals(SOF),'seed is not BTW');const me=data.indexOf(END,SOF.length);assert(me>=0);let p=skip0(data,me+4);for(let i=0;i<2;i++){const n=data.readUInt32LE(p);assert(n>0&&p+4+n<=data.length);p=skip0(data,p+4+n)}if(data[p]===0&&data[p+1]===1)p+=2;return zlib.inflateSync(data.subarray(p))}
function tags(b){const out=[];for(let i=0;i+8<b.length;i++){if(b[i]!==255||b[i+1]!==255||b[i+2]!==1||b[i+3]!==0)continue;const n=b.readUInt16LE(i+4);if(n<3||n>80||i+6+n>b.length)continue;const raw=b.subarray(i+6,i+6+n);if(raw.every(x=>x>=32&&x<=126)){const s=raw.toString('ascii');if(/Data$/i.test(s))out.push(s)}}return out}
(async()=>{
 const endpoint=url.replace(/\/$/,'')+'/functions/v1/btw-seed';
 const r=await fetch(endpoint,{headers:{apikey:key}});
 assert.strictEqual(r.status,200,`proxy status ${r.status}: ${await r.text()}`);
 assert.strictEqual(r.headers.get('access-control-allow-origin'),'*','CORS missing');
 assert.strictEqual(r.headers.get('x-label-workbench-seed'),'CEA-2022-R5','seed identity missing');
 const data=Buffer.from(await r.arrayBuffer());assert(data.length>20000,'seed unexpectedly small');
 const head=data.subarray(0,900).toString('latin1').replace(/\0/g,'');
 assert(/Application:\s*Version=2022 R5/.test(head),'not official 2022 R5 seed');
 assert(/Document:\s*CompatibleVersion=2022/.test(head),'not 2022 compatible');
 const types=tags(parse(data));for(const t of ['TextData','BcDatamatrixData','BcC128Data'])assert(types.includes(t),`missing ${t}`);
 console.log('PASS: fixed CORS seed proxy returns official 2022 R5 Text + DataMatrix + Code128 BTW');
})().catch(e=>{console.error(e);process.exit(1)});
