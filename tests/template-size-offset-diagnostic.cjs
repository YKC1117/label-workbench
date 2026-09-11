// Diagnostic: correlate header TemplateSize with serialized-container numeric fields across official BTW files.
const fs=require('fs');const vm=require('vm');const zlib=require('zlib');
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,Promise,Date,Math,navigator:{},URL:global.URL,document:{readyState:'loading',addEventListener(){},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},window:null,globalThis:null};c.window=c;c.globalThis=c;vm.createContext(c);for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
const F=c.LabelWorkbenchBtwFormat,N=c.LabelWorkbenchBtwNative,BASE='https://www.bartendersoftware.com/resources/library/';
const slugs=['material-label','retailfoodlabel','pallet-label','individual-carton-label','mixed-pallet-label','small-package-master-carton-label'];
function parseSize(head){
  const raw=/<TemplateSize>([^<]+)<\/TemplateSize>/i.exec(head)?.[1]?.trim()||'';
  if(!raw)return null;
  const m=/([0-9.]+)\s*(?:"|in(?:ch(?:es)?)?|mm|cm)?\s*x\s*([0-9.]+)\s*(?:"|in(?:ch(?:es)?)?|mm|cm)?/i.exec(raw);
  if(!m)return null;
  let w=+m[1],h=+m[2];
  const lower=raw.toLowerCase(),isCm=/\bcm\b/.test(lower),isMm=/\bmm\b/.test(lower),isInch=raw.includes('"')||/\bin(?:ch(?:es)?)?\b/.test(lower);
  if(isCm){w*=10;h*=10}else if(isInch||(!isMm&&!isCm)){w*=25.4;h*=25.4}
  return{raw,wMm:w,hMm:h}
}
function findI32(buf,target,tol=1){const out=[];for(let i=0;i<=buf.length-4;i++){const v=buf.readInt32LE(i);if(Math.abs(v-target)<=tol)out.push({o:i,v})}return out}
function findF32(buf,target,tol){const out=[];for(let i=0;i<=buf.length-4;i++){const v=buf.readFloatLE(i);if(Number.isFinite(v)&&Math.abs(v-target)<=tol)out.push({o:i,v})}return out}
function findF64(buf,target,tol){const out=[];for(let i=0;i<=buf.length-8;i++){const v=buf.readDoubleLE(i);if(Number.isFinite(v)&&Math.abs(v-target)<=tol)out.push({o:i,v})}return out}
function pairs(a,b,maxDelta=160){const out=[];for(const x of a)for(const y of b){const d=y.o-x.o;if(Math.abs(d)<=maxDelta)out.push({wOff:x.o,hOff:y.o,delta:d,w:x.v,h:y.v})}return out.sort((x,y)=>Math.abs(x.delta)-Math.abs(y.delta)).slice(0,30)}
function hexAround(buf,off){const s=Math.max(0,off-16),e=Math.min(buf.length,off+40);return buf.subarray(s,e).toString('hex')}
function scanSize(buf,size){const w=size.wMm,h=size.hMm,wi=w/25.4,hi=h/25.4,wm=w/0.0254,hm=h/0.0254;const reps=[
  ['i32-mil',findI32(buf,Math.round(wm),2),findI32(buf,Math.round(hm),2)],
  ['i32-um',findI32(buf,Math.round(w*1000),2),findI32(buf,Math.round(h*1000),2)],
  ['i32-0.01mm',findI32(buf,Math.round(w*100),2),findI32(buf,Math.round(h*100),2)],
  ['f32-mm',findF32(buf,w,.02),findF32(buf,h,.02)],
  ['f32-inch',findF32(buf,wi,.002),findF32(buf,hi,.002)],
  ['f64-mm',findF64(buf,w,.0001),findF64(buf,h,.0001)],
  ['f64-inch',findF64(buf,wi,.00001),findF64(buf,hi,.00001)]
];return reps.map(([kind,ws,hs])=>{const ps=pairs(ws,hs);return{kind,wHits:ws.length,hHits:hs.length,pairs:ps.map(p=>({...p,hex:hexAround(buf,Math.min(p.wOff,p.hOff))}))}})}
async function fromResource(slug){const page=await fetch(BASE+slug,{headers:{'User-Agent':'LabelWorkbench-size-diagnostic/1.0'}});if(!page.ok)return{slug,error:`page ${page.status}`};const html=await page.text(),id=/data-download\s*=\s*["']?(\d+)/i.exec(html)?.[1];if(!id)return{slug,error:'resource id missing'};const r=await fetch(`https://www.bartendersoftware.com/download-resource?resourceId=${id}`,{redirect:'follow',headers:{'User-Agent':'LabelWorkbench-size-diagnostic/1.0'}});if(!r.ok)return{slug,resourceId:id,error:`download ${r.status}`};const bytes=Buffer.from(await r.arrayBuffer()),p=F.parseStructure(bytes),size=parseSize(p.header.text||'');if(!size)return{slug,resourceId:id,version:p.header.applicationVersion,error:'TemplateSize missing',header:(p.header.text||'').slice(0,900)};const container=Buffer.from(await F.inflateContainer(p));return{slug,resourceId:id,version:p.header.applicationVersion,size,containerBytes:container.length,scan:scanSize(container,size)}}
(async()=>{const rows=[];const ceaBytes=Buffer.from(await N.fetchSeed()),cp=F.parseStructure(ceaBytes),cs=parseSize(cp.header.text||'')||{raw:'3 x 2 in (known CEA)',wMm:76.2,hMm:50.8},cc=Buffer.from(await F.inflateContainer(cp));rows.push({slug:'CEA-SEED',resourceId:'79797',version:cp.header.applicationVersion,size:cs,containerBytes:cc.length,scan:scanSize(cc,cs)});for(const slug of slugs){try{rows.push(await fromResource(slug))}catch(e){rows.push({slug,error:e.message})}await new Promise(r=>setTimeout(r,180))}console.log('SIZE_DIAGNOSTIC',JSON.stringify(rows,null,2));const signatures={};for(const row of rows){if(!row.scan)continue;for(const s of row.scan)for(const p of s.pairs){const key=`${s.kind}:delta=${p.delta}`;signatures[key]=(signatures[key]||0)+1}}console.log('SIZE_PAIR_SIGNATURES',JSON.stringify(Object.entries(signatures).filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,50),null,2));if(!rows.some(r=>r.scan&&r.slug!=='CEA-SEED'))throw new Error('no additional official BTW size samples parsed');console.log('PASS: official multi-template size diagnostic completed')})().catch(e=>{console.error(e);process.exit(1)});
