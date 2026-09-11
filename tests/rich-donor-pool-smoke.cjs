const fs=require('fs');
const vm=require('vm');
const zlib=require('zlib');

const DONORS=[['gtl-a5',79885],['ford-gtl-mixed-master',79858]];
const MARKER=Buffer.from([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82,0x00,0x01]);
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,setInterval,clearInterval,Date,Math,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-format.js','utf8'),c,{filename:'btw-format.js'});
vm.runInContext(fs.readFileSync('assets/btw-object-map.js','utf8'),c,{filename:'btw-object-map.js'});
const M=c.LabelWorkbenchBtwObjectMap;
function split(file){const at=file.indexOf(MARKER);if(at<0)throw new Error('marker missing');return new Uint8Array(zlib.inflateSync(file.subarray(at+MARKER.length)))}
function visibleCandidate(o){return Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil>-10000&&o.xMil<50000&&o.yMil>-10000&&o.yMil<50000}
(async()=>{
 for(const [slug,id] of DONORS){
  const r=await fetch(`https://www.bartendersoftware.com/download-resource?resourceId=${id}`,{redirect:'follow',headers:{'User-Agent':'LabelWorkbench/1.0'}});if(!r.ok)throw new Error(`${slug} ${r.status}`);
  const map=M.mapContainer(split(Buffer.from(await r.arrayBuffer()))),candidates=map.objects.filter(visibleCandidate),kinds={};
  for(const o of candidates)kinds[o.kind]=(kinds[o.kind]||0)+1;
  const nonText=candidates.filter(o=>o.kind!=='text'&&o.kind!=='barcode').map(o=>({index:o.index,kind:o.kind,name:o.name,owner:o.owner,root:o.rootPath,x:o.xMil,y:o.yMil}));
  console.log('POOL',slug,JSON.stringify({totalRoots:map.objects.length,positioned:candidates.length,kinds,texts:candidates.filter(o=>o.kind==='text').length,barcodes:candidates.filter(o=>o.kind==='barcode').length,nonText},null,2));
 }
 console.log('PASS: rich donor visible object pool diagnostic complete');
})().catch(e=>{console.error(e);process.exit(1)});
