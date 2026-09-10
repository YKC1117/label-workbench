const zlib=require('zlib');
const assert=require('assert');

const SAMPLES=[
  ['official2022','https://raw.githubusercontent.com/Seagull-Scientific/bartender-cloud-api/main/Sample_Doc1.btw'],
  ['activexSample','https://raw.githubusercontent.com/ssapj/BartenderSampleActivexCSharp/master/BTW/ProgramSample.btw']
];
const END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1');

function skipZeroPadding(data,offset){let p=offset;while(p+4<=data.length&&data.readUInt32LE(p)===0)p+=4;return p}
function parse(data){
  assert(data.subarray(0,SOF.length).equals(SOF),'BTW signature mismatch');
  const metaEnd=data.indexOf(END_META,SOF.length);assert(metaEnd>=0,'metadata end marker missing');
  let p=skipZeroPadding(data,metaEnd+END_META.length),png=[];
  for(let i=0;i<2;i++){
    const size=data.readUInt32LE(p),start=p+4,end=start+size;assert(size>0&&end<=data.length,`PNG ${i+1} invalid`);
    png.push({size,start,end,magic:data.subarray(start,start+8).toString('hex')});p=skipZeroPadding(data,end);
  }
  const tagged=data[p]===0&&data[p+1]===1;if(tagged)p+=2;
  const compressed=data.subarray(p),container=tagged?zlib.inflateSync(compressed):compressed;
  return{metaEnd,png,containerStart:p,tagged,container};
}
function scanStrings(buf){
  const out=[];
  for(let i=0;i+4<=buf.length;i++){
    if(buf[i]!==0xff||buf[i+1]!==0xfe||buf[i+2]!==0xff)continue;
    let chars,head;
    if(buf[i+3]===0xff){if(i+6>buf.length)continue;chars=buf.readUInt16LE(i+4);head=6}else{chars=buf[i+3];head=4}
    if(chars<1||chars>4096)continue;
    const start=i+head,end=start+chars*2;if(end>buf.length)continue;
    const text=buf.subarray(start,end).toString('utf16le');
    if(text&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))out.push({offset:i,head,chars,text,end});
    i=end-1;
  }
  return out;
}
function hexContext(buf,offset,before=48,after=112){const s=Math.max(0,offset-before),e=Math.min(buf.length,offset+after);return`${s.toString(16).padStart(8,'0')}: ${buf.subarray(s,e).toString('hex').match(/.{1,2}/g).join(' ')}`}
function likelyObjects(strings){return strings.filter(s=>/^(Text|Barcode|Box|Line|Picture|Shape|obj|datacomment|Template|Layer|Background)/i.test(s.text)||/DataSource|Code 128|Data Matrix|QR Code/i.test(s.text))}

async function inspect(name,url){
  const res=await fetch(url);assert(res.ok,`${name} download ${res.status}`);const data=Buffer.from(await res.arrayBuffer());
  const parsed=parse(data),strings=scanStrings(parsed.container),objects=likelyObjects(strings);
  console.log(`=== ${name} ===`);
  console.log(`BTW bytes=${data.length} metaEnd=${parsed.metaEnd} containerStart=${parsed.containerStart} zlib=${parsed.tagged}`);
  console.log('PNG blobs:',JSON.stringify(parsed.png));
  console.log(`container bytes=${parsed.container.length}; identified strings=${strings.length}; object-like=${objects.length}`);
  console.log('OBJECT_LIKE_START');
  for(const s of objects.slice(0,220))console.log(`${s.offset}\t${JSON.stringify(s.text)}\t${hexContext(parsed.container,s.offset)}`);
  console.log('OBJECT_LIKE_END');
  const special=strings.filter(s=>/NDS_|Sample Text|Screen Data|datacomment|objcomment|12345678|Code 128|Data Matrix|QR Code/i.test(s.text));
  console.log('SPECIAL_START');for(const s of special.slice(0,180))console.log(`${s.offset}\t${JSON.stringify(s.text)}\t${hexContext(parsed.container,s.offset)}`);console.log('SPECIAL_END');
  const recompressed=zlib.deflateSync(parsed.container),prefix=data.subarray(0,parsed.containerStart),rebuilt=Buffer.concat([prefix,recompressed]),again=parse(rebuilt);
  assert(again.container.equals(parsed.container),`${name} round-trip container mismatch`);
  console.log(`PASS ${name}: round-trip container; rebuilt=${rebuilt.length}`);
  return{data,parsed,strings,objects};
}

(async()=>{
  for(const [name,url] of SAMPLES)await inspect(name,url);
  console.log('PASS: public BTW samples parsed and round-tripped');
})().catch(err=>{console.error(err);process.exit(1)});
