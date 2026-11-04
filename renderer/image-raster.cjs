'use strict';
const zlib=require('node:zlib'),crypto=require('node:crypto');
function png(dataUri){
 if(typeof dataUri!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUri))throw Error('CAPABILITY_UNSUPPORTED: embedded non-interlaced 8-bit PNG required');
 const b=Buffer.from(dataUri.slice(dataUri.indexOf(',')+1),'base64');if(b.length>16e6||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG');
 let w,h,channels,parts=[],ended=false;
 for(let p=8;p+12<=b.length;){const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);if(p+12+n>b.length)throw Error('Truncated PNG');const chunk=b.subarray(p+8,p+8+n);
  if(type==='IHDR'){w=chunk.readUInt32BE(0);h=chunk.readUInt32BE(4);channels={0:1,2:3,4:2,6:4}[chunk[9]];if(n!==13||chunk[8]!==8||!channels||chunk[10]||chunk[11]||chunk[12]||!w||!h||w*h>8e6)throw Error('CAPABILITY_UNSUPPORTED: PNG encoding');}
  else if(type==='IDAT')parts.push(chunk);else if(type==='IEND'){ended=true;break;}p+=12+n;
 }
 if(!ended||!w||!parts.length)throw Error('Incomplete PNG');const raw=zlib.inflateSync(Buffer.concat(parts),{maxOutputLength:(w*channels+1)*h});if(raw.length!==(w*channels+1)*h)throw Error('PNG raster length');
 let binary=true;const rows=[];let prior=Buffer.alloc(w*channels),offset=0;
 for(let y=0;y<h;y++){const filter=raw[offset++],r=Buffer.from(raw.subarray(offset,offset+w*channels));offset+=r.length;
  if(filter>4)throw Error('PNG filter');for(let x=0;x<r.length;x++){const a=x>=channels?r[x-channels]:0,c=x>=channels?prior[x-channels]:0,v=prior[x];let f=0;if(filter===1)f=a;if(filter===2)f=v;if(filter===3)f=Math.floor((a+v)/2);if(filter===4){const p=a+v-c,aa=Math.abs(p-a),bb=Math.abs(p-v),cc=Math.abs(p-c);f=aa<=bb&&aa<=cc?a:bb<=cc?v:c;}r[x]=(r[x]+f)&255;}
  const mask=Buffer.alloc(w);for(let x=0;x<w;x++){const k=x*channels,gray=channels<3,alpha=channels===2?r[k+1]:channels===4?r[k+3]:255;let sum=0;for(let j=0;j<3;j++)sum+=(r[k+(gray?0:j)]*alpha+255*(255-alpha))/255;if(!((sum===0)||(sum===765)))binary=false;mask[x]=+(sum<384);}rows.push(mask);prior=r;
 }
 const ys=rows.flatMap((r,y)=>r.some(v=>v)?[y]:[]);if(!ys.length)throw Error('Blank image has no measurable ink');const left=Math.min(...rows.map(r=>r.indexOf(1)).filter(x=>x>=0)),right=Math.max(...rows.map(r=>r.lastIndexOf(1)));
 return {bytes:b,binary,sha256:crypto.createHash('sha256').update(b).digest('hex').toUpperCase(),width:w,height:h,rows,ink:{x:left,y:ys[0],width:right-left+1,height:ys.at(-1)-ys[0]+1}};
}
module.exports={png};
