const zlib=require('zlib');
const assert=require('assert');

const TARGETS={79738:'Code39+QR',79726:'PDF417+GS1-128',79962:'GS1-128',80046:'UPC-A',80008:'ITF-14+GS1-128'};
const DISCOVERY=[
  'https://www.bartendersoftware.com/resources/library/library-tracking',
  'https://www.bartendersoftware.com/resources/library/medical-device-udi-gs1datamatrix',
  'https://www.bartendersoftware.com/resources/library/medical-device-gs1-data-matrix-landscape',
  'https://www.bartendersoftware.com/resources/library/traceability'
];
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1'),END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
function skip0(b,p){while(p+4<=b.length&&b.readUInt32LE(p)===0)p+=4;return p}
function parse(b){assert(b.subarray(0,SOF.length).equals(SOF));const m=b.indexOf(END_META,SOF.length);assert(m>=0);let p=skip0(b,m+4);for(let i=0;i<2;i++){const n=b.readUInt32LE(p);p=skip0(b,p+4+n)}const tagged=b[p]===0&&b[p+1]===1;if(tagged)p+=2;return zlib.inflateSync(b.subarray(p))}
function strings(b){const o=[];for(let i=0;i+4<b.length;i++){if(b[i]!==255||b[i+1]!==254||b[i+2]!==255)continue;let n,h;if(b[i+3]===255){n=b.readUInt16LE(i+4);h=6}else{n=b[i+3];h=4}if(n<1||n>1000)continue;const e=i+h+n*2;if(e>b.length)continue;const t=b.subarray(i+h,e).toString('utf16le');if(t&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t))o.push({offset:i,text:t});i=e-1}return o}
function tags(b){const o=[];for(let i=0;i+8<b.length;i++){if(b[i]!==255||b[i+1]!==255||b[i+2]!==1||b[i+3]!==0)continue;const n=b.readUInt16LE(i+4);if(n<3||n>80||i+6+n>b.length)continue;const r=b.subarray(i+6,i+6+n);if(!r.every(x=>x>=32&&x<=126))continue;const t=r.toString('ascii');if(/Data$/i.test(t))o.push({offset:i,type:t})}return o}
function endOf(ts,i,len){for(let j=i+1;j<ts.length;j++)if(/^(TextData|Bc|PictureData|BackgroundData)/.test(ts[j].type))return ts[j].offset;return len}
(async()=>{
  for(const page of DISCOVERY){const r=await fetch(page),html=await r.text(),id=[...html.matchAll(/data-download\s*=\s*["']?(\d+)/gi)][0]?.[1]||'';console.log(JSON.stringify({discover:page.split('/').pop(),resourceId:id}))}
  for(const[id,label]of Object.entries(TARGETS)){
    const r=await fetch(`https://www.bartendersoftware.com/download-resource?resourceId=${id}`,{headers:{'user-agent':'LabelWorkbenchResearch/slots'}}),raw=Buffer.from(await r.arrayBuffer()),b=parse(raw),ts=tags(b),ss=strings(b),file=(r.headers.get('content-disposition')||'').match(/filename="?([^";]+)/i)?.[1]||'';
    console.log(JSON.stringify({id,label,file,barcodeTypes:ts.filter(x=>/^Bc/.test(x.type)).map(x=>x.type)}));
    for(let i=0;i<ts.length;i++){if(!/^Bc/.test(ts[i].type))continue;const end=endOf(ts,i,b.length),vals=ss.filter(s=>s.offset>=ts[i].offset&&s.offset<end).map(s=>s.text).filter(t=>t.length<=90&&!/^(Root\.|Box Options|Box \d+|Functions and Subs|OnProcessData|OnPostSerialize|PromptOptionsPage|Enter Data|Sample Prompt|0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ|\(999\)|\(___|\[0-9A-Za-z|999999|1000000|Data ?Source|Text \d+)$/i.test(t));console.log(JSON.stringify({id,type:ts[i].type,strings:[...new Set(vals)].slice(0,30)}))}
  }
  console.log('PASS: native barcode payload slot map');
})().catch(e=>{console.error(e);process.exit(1)});
