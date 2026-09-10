const zlib=require('zlib');
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1');
const END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
const CANDIDATES=[
  ['Seagull-Scientific/bartender-cloud-api','Sample_Doc1.btw','https://raw.githubusercontent.com/Seagull-Scientific/bartender-cloud-api/main/Sample_Doc1.btw'],
  ['shibinshagit/MOTOCLUB','templates/product-label.btw','https://raw.githubusercontent.com/shibinshagit/MOTOCLUB/main/templates/product-label.btw'],
  ['TobithVanHadad/Administracion_contenedores_etiquetado','data/test-files/20873_label.btw','https://raw.githubusercontent.com/TobithVanHadad/Administracion_contenedores_etiquetado/main/data/test-files/20873_label.btw'],
  ['ssapj/BartenderSampleActivexCSharp','BTW/ProgramSample.btw','https://raw.githubusercontent.com/ssapj/BartenderSampleActivexCSharp/master/BTW/ProgramSample.btw']
];
function skip0(b,p){while(p+4<=b.length&&b.readUInt32LE(p)===0)p+=4;return p}
function parse(data){if(!data.subarray(0,SOF.length).equals(SOF))return null;const m=data.indexOf(END_META,SOF.length);if(m<0)return null;let p=skip0(data,m+4);for(let i=0;i<2;i++){if(p+4>data.length)return null;const n=data.readUInt32LE(p);if(!n||p+4+n>data.length)return null;p=skip0(data,p+4+n)}const tagged=data[p]===0&&data[p+1]===1;if(tagged)p+=2;let c=data.subarray(p);try{if(tagged)c=zlib.inflateSync(c)}catch{return null}return{container:c,meta:data.subarray(0,m).toString('latin1').replace(/\0/g,'')}}
function tags(buf){const out=[];for(let i=0;i+8<buf.length;i++){if(buf[i]!==255||buf[i+1]!==255||buf[i+2]!==1||buf[i+3]!==0)continue;const n=buf.readUInt16LE(i+4);if(n<3||n>80||i+6+n>buf.length)continue;const r=buf.subarray(i+6,i+6+n);if(!r.every(x=>x>=32&&x<=126))continue;const t=r.toString('ascii');if(/Data$/i.test(t))out.push({offset:i,type:t})}return out}
function strings(buf){const out=[];for(let i=0;i+4<buf.length;i++){if(buf[i]!==255||buf[i+1]!==254||buf[i+2]!==255)continue;let n,h;if(buf[i+3]===255){if(i+6>buf.length)continue;n=buf.readUInt16LE(i+4);h=6}else{n=buf[i+3];h=4}if(n<1||n>1024||i+h+n*2>buf.length)continue;const s=buf.subarray(i+h,i+h+n*2).toString('utf16le');if(s&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))out.push(s);i+=h+n*2-1}return out}
async function license(repo){const r=await fetch(`https://api.github.com/repos/${repo}/license`,{headers:{'User-Agent':'label-workbench'}});if(!r.ok)return null;const j=await r.json();return j?.license?.spdx_id||null}
(async()=>{
 for(const [repo,path,url] of CANDIDATES){
   const r=await fetch(url);if(!r.ok){console.log(JSON.stringify({repo,path,status:r.status}));continue}
   const data=Buffer.from(await r.arrayBuffer()),p=parse(data);if(!p){console.log(JSON.stringify({repo,path,barTender:false,bytes:data.length,license:await license(repo)}));continue}
   const ts=tags(p.container),ss=strings(p.container),app=/Application:\s*Version=([^;\r\n]+)(?:;\s*Build=([^;\r\n]+))?(?:;\s*Edition=([^;\r\n]+))?/i.exec(p.meta);
   console.log(JSON.stringify({repo,path,barTender:true,bytes:data.length,version:app?.[1]?.trim()||null,edition:app?.[3]?.trim()||null,types:ts.map(x=>x.type),textHints:ss.filter(s=>/Barcode|Text|Matrix|QR|Code|LOT|PART|QTY|SKU/i.test(s)).slice(0,30),license:await license(repo)}));
 }
})().catch(e=>{console.error(e);process.exit(1)});
