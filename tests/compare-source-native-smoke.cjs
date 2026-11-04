'use strict';
// Self-check of tools/compare-source-native.cjs with synthetic "native" pages
// rendered from the source itself. Not BarTender evidence.
const assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {extract}=require('../tools/pdf-to-canonical.cjs'),{compare}=require('../tools/compare-source-native.cjs');
const PDF=path.join(__dirname,'fixtures/vector-minimal.pdf'),CAN=path.join(__dirname,'fixtures/vector-minimal.canonical.json');
function bmp(file,w,h,ink){const stride=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+stride*h,0);b.fill(0xff,54);b.write('BM',0);b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(-h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(ink(x,y))b.fill(0,54+y*stride+x*3,54+y*stride+x*3+3);fs.writeFileSync(file,b);}
(async()=>{
  const r=(await extract(PDF)).input.raster,dir=fs.mkdtempSync(path.join(os.tmpdir(),'csn-')),g=(x,y)=>x>=0&&y>=0&&x<r.width&&y<r.height&&r.gray[y*r.width+x]<128;
  const can=JSON.parse(fs.readFileSync(CAN,'utf8')),dm=can.objects.find(o=>o.type==='barcode2d'),mm=25.4/600;
  const cases=[['identity',(x,y)=>g(x,y),'PASS',null],['one-pixel page shift',(x,y)=>g(x-1,y),'PASS',null],['ten-pixel page shift',(x,y)=>g(x-10,y-10),'FAIL','PAGE_REGISTRATION_EXCEEDS_ONE_PRINTER_DOT'],
    ['text object moved 1 mm',(x,y)=>{const inT=y*mm>=7.5&&y*mm<=11.5&&x*mm<60;return inT?g(x-24,y):g(x,y);},'FAIL','OBJECT_DEVIATION TEXT_001'],
    ['missing Data Matrix',(x,y)=>{const inD=x*mm>=dm.xMm-.5&&x*mm<=dm.xMm+dm.widthMm+.5&&y*mm>=dm.yMm-.5&&y*mm<=dm.yMm+dm.heightMm+.5;return inD?false:g(x,y);},'FAIL','INK_NOT_FOUND DATAMATRIX_001']];
  let n=0;
  for(const [name,ink,status,code] of cases){const f=path.join(dir,n+'.bmp');bmp(f,r.width,r.height,ink);const c=await compare(PDF,CAN,f);
    assert.strictEqual(c.status,status,name+' '+c.failures.join('|'));if(code)assert.ok(c.failures.some(x=>x.startsWith(code)),name+' '+c.failures.join('|'));
    if(name==='identity')for(const o of c.objects)assert.deepStrictEqual(o.raw,{dx:0,dy:0,dw:0,dh:0},o.id);n++;}
  console.log('Source vs native comparison self-check: '+n+'/'+n+' PASS');
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
