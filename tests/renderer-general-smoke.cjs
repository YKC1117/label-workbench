'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {nativeRequest}=require('../renderer/adapter.cjs'),{preview}=require('../renderer/preview.cjs'),{expand}=require('../renderer/text-layout.cjs'),{evaluate}=require('../renderer/visual-qa.cjs'),G=require('../renderer/geometry.cjs'),{comparePattern,rotate}=require('../renderer/rotation-qa.cjs');
const clone=o=>JSON.parse(JSON.stringify(o));
const models=['A-text','B-barcode','C-rotation'].map(n=>require('../review/renderer-prototype/general-candidate/'+n+'.json'));
for(const m of models){
 const before=clone(m),req=nativeRequest(m),drawing=preview(m);assert.deepEqual(m,before);assert.deepEqual(req.objects.map(o=>o.id),drawing.objects.map(o=>o.id));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lwb-general-'));
 try {const run=spawnSync(process.execPath,[path.resolve('renderer/prepare.cjs'),path.resolve('review/renderer-prototype/general-candidate/'+['A-text','B-barcode','C-rotation'][models.indexOf(m)]+'.json'),dir],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'renderer-request.json'))),req);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 const actual=drawing.objects.map(p=>{
  if(p.type!=='text')return {id:p.id,status:'MEASURED',actual:clone(p.symbolBounds)};
  const o=expand(m).objects.find(o=>o.id===p.id),width=o.widthMm*.6,height=o.heightMm*.6,shift=o.alignment==='center'?(o.widthMm-width)/2:o.alignment==='right'?o.widthMm-width:0,offset=G.rotatePoint(shift,0,o.rotation);
  return {id:p.id,status:'MEASURED',actual:G.bounds({...o,xMm:o.xMm+offset.x,yMm:o.yMm+offset.y,widthMm:width,heightMm:height})};
 });
 const readback=drawing.objects.map(o=>({id:o.id,rotationDeg:-o.rotation,referencePoint:'TopLeft',referencePointPresent:true}));
 assert.equal(evaluate(drawing,actual,readback).status,'PASS_PLACEMENT_AND_SIZE');
 for(const p of drawing.objects){const bad=clone(actual),row=bad.find(r=>r.id===p.id);const d=p.type==='text'?G.rotatePoint(2,0,p.rotation):{x:2,y:0};row.actual.x+=d.x;row.actual.y+=d.y;assert.equal(evaluate(drawing,bad,readback).status,'FAIL',p.id+' displacement');}
}
assert.equal(nativeRequest(models[0]).objects.length,8);
assert.equal(nativeRequest(models[0]).objects[0].bold,true);assert.equal(nativeRequest(models[0]).objects[1].italic,true);
assert.deepEqual(nativeRequest(models[0]).objects.filter(o=>o.parentId).map(o=>o.yMm),[55,63]);
for(const angle of [90,180,270]){const m=clone(models[0]);m.objects=[{...m.objects.at(-1),xMm:50,yMm:40,rotation:angle}];const lines=expand(m).objects,offset=G.rotatePoint(0,8,angle);assert.ok(Math.abs(lines[1].xMm-lines[0].xMm-offset.x)<1e-9);assert.ok(Math.abs(lines[1].yMm-lines[0].yMm-offset.y)<1e-9);}
for(const mutate of [m=>delete m.objects.at(-1).lineHeightMm,m=>m.objects.at(-1).heightMm=4,m=>m.objects.at(-1).text='A\n\nB',m=>m.objects.push({...m.objects[0],id:'MULTI_L1'}),m=>m.objects[0].rotation=45,m=>m.objects[0].frameMode='fixed']){const m=clone(models[0]);mutate(m);assert.throws(()=>nativeRequest(m));}
for(const m0 of models){const m=clone(m0);delete m.runtimeProfile;assert.throws(()=>nativeRequest(m));}
const bars=nativeRequest(models[1]).objects;assert.equal(bars[0].xMm,7.54);assert.equal(bars[0].widthMm,20.066);
const rotatedBar=nativeRequest(models[2]).objects[3];assert.equal(rotatedBar.rotationDeg,270);assert.equal(rotatedBar.xMm,30);assert.equal(rotatedBar.yMm,47.54);
for(const type of ['image','line','box']){const m=clone(models[0]);m.objects=[{...m.objects[0],type,strokeMm:.3,dataUri:'data:image/png;base64,AA=='}];assert.throws(()=>nativeRequest(m),/CAPABILITY_UNSUPPORTED/);}
const hri=clone(models[1]);hri.objects[0].humanReadable=true;assert.throws(()=>nativeRequest(hri),/CAPABILITY_UNSUPPORTED/);
const pattern=[[1,0,0],[1,1,0]].map(r=>Buffer.from(r));
for(const angle of [90,180,270]){assert.equal(comparePattern(pattern,rotate(pattern,angle),angle).status,'PASS');assert.equal(comparePattern(pattern,rotate(pattern,(angle+180)%360),angle).status,'FAIL');}
assert.throws(()=>rotate(pattern,45));
console.log('PASS general candidate: shared expansion/CLI parity, 8 styles/lines, three alignments, orthogonal transforms, modules/quiet zones, visual displacement rejection, exact optical pattern rotation, unsupported capabilities fail closed; NOT BarTender runtime evidence');
