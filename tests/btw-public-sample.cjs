const zlib=require('zlib');
const assert=require('assert');

const SAMPLES=[
  ['official2022','https://raw.githubusercontent.com/Seagull-Scientific/bartender-cloud-api/main/Sample_Doc1.btw'],
  ['activexSample','https://raw.githubusercontent.com/ssapj/BartenderSampleActivexCSharp/master/BTW/ProgramSample.btw'],
  ['transparencyWide','https://support.seagullsoftware.com/hc/en-us/article_attachments/360011164514']
];
const END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1');
function skipZeroPadding(data,offset){let p=offset;while(p+4<=data.length&&data.readUInt32LE(p)===0)p+=4;return p}
function parse(data){assert(data.subarray(0,SOF.length).equals(SOF),'BTW signature mismatch');const metaEnd=data.indexOf(END_META,SOF.length);assert(metaEnd>=0,'metadata end marker missing');let p=skipZeroPadding(data,metaEnd+END_META.length),png=[];for(let i=0;i<2;i++){const size=data.readUInt32LE(p),start=p+4,end=start+size;assert(size>0&&end<=data.length,`PNG ${i+1} invalid`);png.push({size,start,end});p=skipZeroPadding(data,end)}const tagged=data[p]===0&&data[p+1]===1;if(tagged)p+=2;const compressed=data.subarray(p),container=tagged?zlib.inflateSync(compressed):compressed;return{metaEnd,png,containerStart:p,tagged,container}}
function scanStrings(buf){const out=[];for(let i=0;i+4<=buf.length;i++){if(buf[i]!==0xff||buf[i+1]!==0xfe||buf[i+2]!==0xff)continue;let chars,head;if(buf[i+3]===0xff){if(i+6>buf.length)continue;chars=buf.readUInt16LE(i+4);head=6}else{chars=buf[i+3];head=4}if(chars<1||chars>4096)continue;const start=i+head,end=start+chars*2;if(end>buf.length)continue;const text=buf.subarray(start,end).toString('utf16le');if(text&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))out.push({offset:i,head,chars,text,end});i=end-1}return out}
function scanAsciiTags(buf){const out=[];for(let i=0;i+8<buf.length;i++){if(buf[i]!==0xff||buf[i+1]!==0xff||buf[i+2]!==0x01||buf[i+3]!==0x00)continue;const len=buf.readUInt16LE(i+4);if(len<3||len>80||i+6+len>buf.length)continue;const raw=buf.subarray(i+6,i+6+len);if(!raw.every(b=>b>=0x20&&b<=0x7e))continue;const text=raw.toString('ascii');if(/(?:Data|Control|Object|Template|Source)$/i.test(text)||/^(?:Text|Bc|Barcode|Line|Box|Picture|Shape)/i.test(text))out.push({offset:i,len,text,after:i+6+len})}return out}
function hexRows(buf,start,end,width=16){const lines=[];for(let p=Math.max(0,start);p<Math.min(buf.length,end);p+=width){const row=buf.subarray(p,Math.min(end,p+width));lines.push(`${p.toString(16).padStart(8,'0')}  ${row.toString('hex').match(/.{1,2}/g).join(' ')}`)}return lines.join('\n')}
function findFFPairs(buf,start,end){const out=[];for(let i=Math.max(0,start);i<Math.min(buf.length-1,end);i++)if(buf[i]===0xff&&buf[i+1]===0xff)out.push(i);return out}
function boundaryProbe(buf,label,offset,before=128,after=48){const s=Math.max(0,offset-before),e=Math.min(buf.length,offset+after);console.log(`PROBE ${label} @${offset} range=${s}-${e} ffff=${findFFPairs(buf,s,e).join(',')}`);console.log(hexRows(buf,s,e))}

async function inspect(name,url){
  const res=await fetch(url,{redirect:'follow'});assert(res.ok,`${name} download ${res.status}`);const data=Buffer.from(await res.arrayBuffer()),parsed=parse(data),strings=scanStrings(parsed.container),tags=scanAsciiTags(parsed.container);
  console.log(`=== ${name} === bytes=${data.length} container=${parsed.container.length} tags=${tags.length}`);
  for(const t of tags)console.log(`TAG ${t.offset} ${t.text}`);
  const template=strings.find(s=>s.text==='Template 1'||/^Template \d+$/.test(s.text));if(template){boundaryProbe(parsed.container,'Template',template.offset,48,80);const roots=strings.filter(s=>s.offset>template.offset&&s.offset<template.offset+18000&&/^Root\./.test(s.text));for(const r of roots.slice(0,20))boundaryProbe(parsed.container,`ROOT:${r.text}`,r.offset,96,24)}
  for(const t of tags.filter(t=>/TextData|BcC128Data|BcDatamatrixData|PictureData/.test(t.text)))boundaryProbe(parsed.container,`TAG:${t.text}`,t.offset,48,48);
  const recompressed=zlib.deflateSync(parsed.container),prefix=data.subarray(0,parsed.containerStart),rebuilt=Buffer.concat([prefix,recompressed]),again=parse(rebuilt);assert(again.container.equals(parsed.container),`${name} round-trip mismatch`);console.log(`PASS ${name}`);
}
(async()=>{for(const [name,url] of SAMPLES)await inspect(name,url);console.log('PASS: BTW boundary diagnostics')})().catch(err=>{console.error(err);process.exit(1)});
