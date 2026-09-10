const zlib=require('zlib');
const assert=require('assert');

const pages=[
  'https://www.bartendersoftware.com/resources/library/cea-label-code-128',
  'https://www.bartendersoftware.com/resources/library/cea-label',
  'https://www.bartendersoftware.com/resources/library/asset-label-2-x-1-code-39-qr-code',
  'https://www.bartendersoftware.com/resources/library/asset-label-2-x-4-qr-code',
  'https://www.bartendersoftware.com/resources/library/minimum-data-edi',
  'https://www.bartendersoftware.com/resources/library/small-height',
  'https://www.bartendersoftware.com/resources/library/amazon-barcode-packing-slip-pdf417',
  'https://www.bartendersoftware.com/resources/library/material-label',
  'https://www.bartendersoftware.com/resources/library/retail-upc-a-label',
  'https://www.bartendersoftware.com/resources/library/retailfoodlabel',
  'https://www.bartendersoftware.com/resources/library/pdq-display-pallet-label'
];
const assets=['https://www.bartendersoftware.com/dist/scripts.min.js?b=2ca5272896862c1d2e2daf3f439c2a1a8821344d'];
const SOF=Buffer.from('\r\nBar Tender Format File\r\n','latin1');
const END_META=Buffer.from([0xff,0xfe,0xff,0x00]);
function uniq(a){return[...new Set(a)]}
function snippets(text,needle,radius=900,max=12){const out=[];let p=0;while((p=text.toLowerCase().indexOf(needle.toLowerCase(),p))>=0&&out.length<max){out.push(text.slice(Math.max(0,p-radius),Math.min(text.length,p+needle.length+radius)));p+=needle.length}return out}
async function getText(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.6'}});return{r,text:await r.text()}}
function sig(bytes){return Buffer.from(bytes.slice(0,80)).toString('latin1').replace(/[^ -~\r\n]/g,'.')}
function skipZeroPadding(data,offset){let p=offset;while(p+4<=data.length&&data.readUInt32LE(p)===0)p+=4;return p}
function parseBtw(data){assert(data.subarray(0,SOF.length).equals(SOF),'BTW signature mismatch');const metaEnd=data.indexOf(END_META,SOF.length);assert(metaEnd>=0,'metadata end marker missing');let p=skipZeroPadding(data,metaEnd+END_META.length);for(let i=0;i<2;i++){const size=data.readUInt32LE(p),start=p+4,end=start+size;assert(size>0&&end<=data.length,`PNG ${i+1} invalid`);p=skipZeroPadding(data,end)}const tagged=data[p]===0&&data[p+1]===1;if(tagged)p+=2;const compressed=data.subarray(p),container=tagged?zlib.inflateSync(compressed):compressed;return{container,tagged,containerStart:p}}
function scanUtf16(buf){const out=[];for(let i=0;i+4<=buf.length;i++){if(buf[i]!==0xff||buf[i+1]!==0xfe||buf[i+2]!==0xff)continue;let chars,head;if(buf[i+3]===0xff){if(i+6>buf.length)continue;chars=buf.readUInt16LE(i+4);head=6}else{chars=buf[i+3];head=4}if(chars<1||chars>4096)continue;const start=i+head,end=start+chars*2;if(end>buf.length)continue;const text=buf.subarray(start,end).toString('utf16le');if(text&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))out.push({offset:i,text});i=end-1}return out}
function scanTags(buf){const out=[];for(let i=0;i+8<buf.length;i++){if(buf[i]!==0xff||buf[i+1]!==0xff||buf[i+2]!==0x01||buf[i+3]!==0x00)continue;const len=buf.readUInt16LE(i+4);if(len<3||len>80||i+6+len>buf.length)continue;const raw=buf.subarray(i+6,i+6+len);if(!raw.every(b=>b>=0x20&&b<=0x7e))continue;const text=raw.toString('ascii');if(/Data$/i.test(text))out.push({offset:i,type:text,coordOffset:i+6+len})}return out}
function topEnd(tags,i,len){for(let j=i+1;j<tags.length;j++)if(/^(?:TextData|Bc|PictureData|LineData|ShapeData|BoxData|BackgroundData)/.test(tags[j].type))return tags[j].offset;return len}
function inspectNative(id,data,res){const parsed=parseBtw(data),tags=scanTags(parsed.container),strings=scanUtf16(parsed.container);console.log(`NATIVE ${id} tagged=${parsed.tagged} container=${parsed.container.length} cors=${res.headers.get('access-control-allow-origin')}`);console.log('TAGS',JSON.stringify(tags.map(t=>[t.offset,t.type])));for(let i=0;i<tags.length;i++){const t=tags[i];if(!/^(?:TextData|Bc|PictureData|LineData|ShapeData|BoxData)/.test(t.type))continue;const end=topEnd(tags,i,parsed.container.length),near=strings.filter(s=>s.offset>=t.offset&&s.offset<end).map(s=>s.text).filter(v=>v.length<180);console.log(`OBJECT ${t.type} @${t.offset}-${end} xyRaw=${parsed.container.readInt32LE(t.coordOffset)},${parsed.container.readInt32LE(t.coordOffset+4)} STRINGS`,JSON.stringify(near.slice(0,80)))}
  const interesting=strings.filter(s=>/CEA|Code|Barcode|Data|Matrix|Serial|Part|Lot|Qty|Date|Label|Text|Template|NDS|Screen|EAN|UPC|ITF|GS1|PDF|QR|Aztec|[0-9]{6,}/i.test(s.text)&&s.text.length<180).slice(0,320);console.log('INTERESTING',JSON.stringify(interesting));
}
(async()=>{
  const ids=[];
  for(const url of pages){const {r,text:html}=await getText(url);console.log('\n=== PAGE',url,'status',r.status,'bytes',html.length,'===');const forms=[...html.matchAll(/<form[^>]*data-download\s*=\s*["']?(\d+)["']?[^>]*>/gi)].map(m=>({id:m[1],html:m[0]}));console.log('DOWNLOAD_FORMS',JSON.stringify(forms));ids.push(...forms.map(x=>x.id))}
  for(const url of assets){const {r,text}=await getText(url);console.log('\n=== ASSET',url,'status',r.status,'bytes',text.length,'===');snippets(text,'/download-resource?resourceId=').forEach((s,i)=>console.log(`DOWNLOAD_JS #${i+1}`,JSON.stringify(s)))}
  for(const id of uniq(ids)){
    const url=`https://www.bartendersoftware.com/download-resource?resourceId=${id}`;
    const manual=await fetch(url,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.6'}});console.log('\nDOWNLOAD_MANUAL',id,'status',manual.status,'location',manual.headers.get('location'),'type',manual.headers.get('content-type'),'disposition',manual.headers.get('content-disposition'),'cors',manual.headers.get('access-control-allow-origin'));
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.6'}}),ab=await r.arrayBuffer(),b=Buffer.from(ab);console.log('DOWNLOAD_FINAL',id,'status',r.status,'url',r.url,'type',r.headers.get('content-type'),'disposition',r.headers.get('content-disposition'),'cors',r.headers.get('access-control-allow-origin'),'bytes',b.length,'sig',JSON.stringify(sig(b)),'btw',b.subarray(0,27).toString('latin1').includes('Bar Tender Format File'));
    try{inspectNative(id,b,r)}catch(err){console.log('NATIVE_SKIP',id,String(err?.message||err))}
  }
  console.log('PASS: template library discovery completed across supported and legacy BTW containers');
})().catch(e=>{console.error(e);process.exit(1)});
