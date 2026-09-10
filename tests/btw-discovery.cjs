const zlib=require('zlib');
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1');
const END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
const CANDIDATES=[
  ['Seagull-Scientific/bartender-cloud-api','Sample_Doc1.btw','https://raw.githubusercontent.com/Seagull-Scientific/bartender-cloud-api/main/Sample_Doc1.btw'],
  ['Seagull Support','Transparency Rectangle - Wide.btw','https://support.seagullsoftware.com/hc/en-us/article_attachments/360011164514']
];
function skip0(b,p){while(p+4<=b.length&&b.readUInt32LE(p)===0)p+=4;return p}
function parse(data){if(!data.subarray(0,SOF.length).equals(SOF))return null;const m=data.indexOf(END_META,SOF.length);if(m<0)return null;let p=skip0(data,m+4);for(let i=0;i<2;i++){if(p+4>data.length)return null;const n=data.readUInt32LE(p);if(!n||p+4+n>data.length)return null;p=skip0(data,p+4+n)}const tagged=data[p]===0&&data[p+1]===1;if(tagged)p+=2;let c=data.subarray(p);try{if(tagged)c=zlib.inflateSync(c)}catch{return null}return{container:c,meta:data.subarray(0,m).toString('latin1').replace(/\0/g,'')}}
function tags(buf){const out=[];for(let i=0;i+8<buf.length;i++){if(buf[i]!==255||buf[i+1]!==255||buf[i+2]!==1||buf[i+3]!==0)continue;const n=buf.readUInt16LE(i+4);if(n<3||n>80||i+6+n>buf.length)continue;const r=buf.subarray(i+6,i+6+n);if(!r.every(x=>x>=32&&x<=126))continue;const t=r.toString('ascii');if(/Data$/i.test(t))out.push(t)}return [...new Set(out)]}
(async()=>{
 for(const [repo,path,url] of CANDIDATES){
   const r=await fetch(url,{redirect:'follow'});const cors=r.headers.get('access-control-allow-origin'),ct=r.headers.get('content-type');
   const data=Buffer.from(await r.arrayBuffer()),p=parse(data);
   console.log(JSON.stringify({repo,path,status:r.status,finalUrl:r.url,cors,contentType:ct,bytes:data.length,barTender:!!p,types:p?tags(p.container):[]}));
 }
})().catch(e=>{console.error(e);process.exit(1)});
