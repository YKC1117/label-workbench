'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {preview}=require('../renderer/preview.cjs'),{nativeRequest}=require('../renderer/adapter.cjs');
const model=require('../canonical.json');
function bmp(rows,dpi){
  const h=rows.length,w=rows[0].length,stride=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+h*stride);
  b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);
  b.writeInt32LE(Math.round(dpi/0.0254),38);b.writeInt32LE(Math.round(dpi/0.0254),42);
  rows.forEach((r,y)=>r.forEach((v,x)=>b.fill(v?0:255,54+(h-1-y)*stride+x*3,57+(h-1-y)*stride+x*3)));
  return b;
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lwb-visual-cli-'));
try{
 const dpi=254,u=.1,page=Array.from({length:500},()=>Array(1000).fill(0)),drawing=preview(model);
 const expected=nativeRequest(model),ev={status:'PASS',requestedDpi:dpi,objects:[]};
 fs.writeFileSync(path.join(dir,'native-output.btw'),'SYNTHETIC_TEST_ONLY_NOT_BTW');
 const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'native-output.btw'))).digest('hex').toUpperCase();
 ev.candidateSha256Before=sha;ev.candidateSha256After=sha;
 for(const [i,o] of drawing.objects.entries()){
  const b=o.symbolBounds??o.bounds, width=Math.round((i<2?b.width*.7:b.width)/u),height=Math.round((i<2?b.height*.8:b.height)/u),x=Math.round(b.x/u),y=Math.round(b.y/u);
  const rows=Array.from({length:height},(_,yy)=>Array.from({length:width},(_,xx)=>+(yy===0||yy===height-1||xx===0||xx===width-1||((xx*3+yy*7+i)%13===0))));
  for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)page[y+yy][x+xx]=rows[yy][xx];
  fs.writeFileSync(path.join(dir,'visual-'+o.id+'.bmp'),bmp(rows,dpi));
  ev.objects.push({id:o.id,rotationDeg:0,referencePoint:'TopLeft',raster:{inkLeftPx:0,inkTopPx:0,inkWidthPx:width,inkHeightPx:height}});
 }
 const files={'canonical.json':model,'renderer-request.json':expected,'preview.json':{...drawing,svg:undefined},'native-visual-evidence.json':ev};
 for(const [file,value] of Object.entries(files))fs.writeFileSync(path.join(dir,file),JSON.stringify(value));
 fs.writeFileSync(path.join(dir,'native-format-preview.bmp'),bmp(page,dpi));
 const cli=path.resolve('native/Label_Workbench_Native_Layout_ENGINE_V1/program/probe-render.cjs');
 const run=()=>spawnSync(process.execPath,[cli,dir,path.join(dir,'renderer-request.json')],{encoding:'utf8'});
 let r=run();assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'dual-render-qa.json'))).status,'PASS_PLACEMENT_AND_SIZE');
 const bad=JSON.parse(fs.readFileSync(path.join(dir,'preview.json')));bad.objects[0].bounds.x+=2;fs.writeFileSync(path.join(dir,'preview.json'),JSON.stringify(bad));
 r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Preview provenance mismatch/);
 console.log('PASS synthetic BMP -> registration -> dual-render QA CLI; preview provenance mismatch rejected (not BarTender evidence)');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
