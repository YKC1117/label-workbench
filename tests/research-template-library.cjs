const zlib=require('zlib');
const assert=require('assert');

const TARGETS={
  79797:'CEA Code128/DataMatrix',
  79738:'Code39 + QR',
  79740:'QR',
  80092:'Small Height / PDF417 candidate',
  79726:'Amazon PDF417 candidate',
  79962:'Material / GS1-128 candidate',
  80046:'Retail UPC-A candidate',
  80047:'Retail Food / ITF candidate',
  80008:'PDQ / pallet candidate'
};
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1');
const END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
function skipZeroPadding(data,offset){let p=offset;while(p+4<=data.length&&data.readUInt32LE(p)===0)p+=4;return p}
function parseBtw(data){
  assert(data.subarray(0,SOF.length).equals(SOF),'BTW signature mismatch');
  const metaEnd=data.indexOf(END_META,SOF.length);assert(metaEnd>=0,'metadata end marker missing');
  let p=skipZeroPadding(data,metaEnd+END_META.length);
  for(let i=0;i<2;i++){const size=data.readUInt32LE(p),end=p+4+size;assert(size>0&&end<=data.length,`PNG ${i+1} invalid`);p=skipZeroPadding(data,end)}
  const tagged=data[p]===0&&data[p+1]===1;if(tagged)p+=2;
  const compressed=data.subarray(p),container=tagged?zlib.inflateSync(compressed):compressed;
  const head=data.subarray(0,Math.min(metaEnd,1800)).toString('latin1').replace(/\0/g,'');
  return{container,tagged,head};
}
function scanTags(buf){
  const out=[];
  for(let i=0;i+8<buf.length;i++){
    if(buf[i]!==0xff||buf[i+1]!==0xff||buf[i+2]!==0x01||buf[i+3]!==0x00)continue;
    const len=buf.readUInt16LE(i+4);if(len<3||len>80||i+6+len>buf.length)continue;
    const raw=buf.subarray(i+6,i+6+len);if(!raw.every(b=>b>=0x20&&b<=0x7e))continue;
    const type=raw.toString('ascii');if(/Data$/i.test(type)&&!out.includes(type))out.push(type);
  }
  return out;
}
(async()=>{
  for(const[id,label]of Object.entries(TARGETS)){
    const url=`https://www.bartendersoftware.com/download-resource?resourceId=${id}`;
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/compact'}}),b=Buffer.from(await r.arrayBuffer());
    const filename=(r.headers.get('content-disposition')||'').match(/filename="?([^";]+)"?/i)?.[1]||'';
    try{
      const p=parseBtw(b),app=/Application:\s*Version=([^;\r\n]+)/i.exec(p.head)?.[1]?.trim()||'',compat=/Document:\s*CompatibleVersion=([^;\r\n]+)/i.exec(p.head)?.[1]?.trim()||'';
      console.log(JSON.stringify({id,label,filename,bytes:b.length,version:app,compatible:compat,tags:scanTags(p.container)}));
    }catch(err){console.log(JSON.stringify({id,label,filename,bytes:b.length,skip:String(err?.message||err)}))}
  }
  console.log('PASS: compact native symbology scan');
})().catch(err=>{console.error(err);process.exit(1)});
