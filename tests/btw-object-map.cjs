const zlib=require('zlib');
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1'),END=Buffer.from([255,254,255,0]);
const S=[
 ['c128','https://raw.githubusercontent.com/Seagull-Scientific/bartender-cloud-api/main/Sample_Doc1.btw',['TextData','BcC128Data']],
 ['dm','https://support.seagullsoftware.com/hc/en-us/article_attachments/360011164514',['BcDatamatrixData','TextData']]
];
function skip(b,p){while(p+4<=b.length&&b.readUInt32LE(p)===0)p+=4;return p}
function parse(d){const m=d.indexOf(END,SOF.length);let p=skip(d,m+4);for(let i=0;i<2;i++){const n=d.readUInt32LE(p);p=skip(d,p+4+n)}if(d[p]===0&&d[p+1]===1)p+=2;return zlib.inflateSync(d.subarray(p))}
function tags(b){const o=[];for(let i=0;i+8<b.length;i++){if(b[i]!==255||b[i+1]!==255||b[i+2]!==1||b[i+3]!==0)continue;const n=b.readUInt16LE(i+4);if(n<3||n>80||i+6+n>b.length)continue;const r=b.subarray(i+6,i+6+n);if(!r.every(x=>x>=32&&x<=126))continue;const t=r.toString('ascii');if(/Data$/i.test(t))o.push({offset:i,type:t})}return o}
function strings(b,start,end){const o=[];for(let i=start;i+4<end;i++){if(b[i]!==255||b[i+1]!==254||b[i+2]!==255)continue;let n,h;if(b[i+3]===255){n=b.readUInt16LE(i+4);h=6}else{n=b[i+3];h=4}if(n<1||n>4096||i+h+n*2>end)continue;const s=b.subarray(i+h,i+h+n*2).toString('utf16le');if(s&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))o.push({offset:i,text:s});i+=h+n*2-1}return o}
function logicalObjectEnd(ts,idx,c){for(let j=idx+1;j<ts.length;j++)if(/^(?:TextData|Bc|PictureData|BackgroundData)/.test(ts[j].type))return ts[j].offset;return c.length}
(async()=>{for(const [name,url,wants] of S){const r=await fetch(url);const c=parse(Buffer.from(await r.arrayBuffer())),ts=tags(c);for(const want of wants){const idx=ts.findIndex(t=>t.type===want);if(idx<0)continue;const t=ts[idx],end=logicalObjectEnd(ts,idx,c);console.log(`===${name} ${want} ${t.offset}-${end} len=${end-t.offset}===`);for(const s of strings(c,t.offset,end))console.log(`${s.offset}\t${JSON.stringify(s.text)}`)}}})().catch(e=>{console.error(e);process.exit(1)});
