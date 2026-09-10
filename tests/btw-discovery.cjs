const zlib=require('zlib');
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1');
const END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
function skip0(b,p){while(p+4<=b.length&&b.readUInt32LE(p)===0)p+=4;return p}
function parse(data){if(!data.subarray(0,SOF.length).equals(SOF))return null;const m=data.indexOf(END_META,SOF.length);if(m<0)return null;let p=skip0(data,m+4);for(let i=0;i<2;i++){if(p+4>data.length)return null;const n=data.readUInt32LE(p);p=skip0(data,p+4+n)}const tagged=data[p]===0&&data[p+1]===1;if(tagged)p+=2;let c=data.subarray(p);try{if(tagged)c=zlib.inflateSync(c)}catch{return null}return c}
function tags(buf){const out=[];for(let i=0;i+8<buf.length;i++){if(buf[i]!==255||buf[i+1]!==255||buf[i+2]!==1||buf[i+3]!==0)continue;const n=buf.readUInt16LE(i+4);if(n<3||n>80||i+6+n>buf.length)continue;const r=buf.subarray(i+6,i+6+n);if(!r.every(x=>x>=32&&x<=126))continue;const t=r.toString('ascii');if(/Data$/i.test(t))out.push(t)}return [...new Set(out)]}
async function json(url){const r=await fetch(url,{headers:{'User-Agent':'label-workbench-btw-discovery','Accept':'application/vnd.github+json'}});if(!r.ok)return null;return r.json()}
(async()=>{
  const q=await json('https://api.github.com/search/code?q=extension%3Abtw+in%3Apath&per_page=100');
  if(!q?.items)throw new Error('GitHub code search unavailable');
  for(const item of q.items){
    const meta=await json(item.url);if(!meta?.download_url)continue;
    const r=await fetch(meta.download_url);if(!r.ok)continue;const data=Buffer.from(await r.arrayBuffer()),container=parse(data);if(!container)continue;
    const typeTags=tags(container),license=await json(`https://api.github.com/repos/${item.repository.full_name}/license`);
    console.log(JSON.stringify({repo:item.repository.full_name,path:item.path,bytes:data.length,types:typeTags,license:license?.license?.spdx_id||null,raw:meta.download_url}));
  }
})().catch(e=>{console.error(e);process.exit(1)});
