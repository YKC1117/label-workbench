'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {nativeRequest}=require('../renderer/adapter.cjs'),{preview}=require('../renderer/preview.cjs'),{evaluate}=require('../renderer/visual-qa.cjs'),{png}=require('../renderer/image-raster.cjs'),{plan}=require('../renderer/primitive-plan.cjs'),{check}=require('../renderer/primitive-qa.cjs'),{split}=require('../renderer/hri-qa.cjs'),{locateInk}=require('../native/Label_Workbench_Native_Layout_ENGINE_V1/program/compare-render.cjs');
const model=require('../review/renderer-prototype/primitive-candidate/mixed.json'),clone=v=>JSON.parse(JSON.stringify(v));
const request=nativeRequest(model),drawing=preview(model);assert.equal(request.objects.length,7);assert.deepEqual(request.objects.map(o=>o.id),drawing.objects.map(o=>o.id));
for(const [id,type,ref] of [['RULE',2,'Center'],['BORDER',3,'TopLeft'],['LOGO',6,'TopLeft']]){const p=request.objects.find(o=>o.id===id);assert.equal(p.nativeType,type);assert.equal(p.referencePoint,ref);}
const border=drawing.objects.find(o=>o.id==='BORDER');assert.equal(border.bounds.x,3-.508/2);assert.equal(border.bounds.width,114+.508);
const image=model.objects.find(o=>o.id==='LOGO'),source=png(image.dataUri);assert.equal(source.width,120);assert.equal(source.height,60);assert.equal(source.binary,true);assert.ok(/^[A-F0-9]{64}$/.test(source.sha256));
assert.equal(check(image,source.rows,300).status,'PASS');assert.throws(()=>check(image,source.rows,203));
const mirrored=source.rows.map(r=>Buffer.from(r).reverse());assert.equal(check(image,mirrored,300).status,'FAIL');assert.throws(()=>png('data:image/jpeg;base64,AA=='));assert.throws(()=>png('data:image/png;base64,AA=='));
for(const edit of [m=>m.objects.find(o=>o.id==='LOGO').rotation=90,m=>m.objects.find(o=>o.id==='BORDER').strokeMm=100,m=>delete m.objects.find(o=>o.id==='HRI_1').caption,m=>m.objects.find(o=>o.id==='HRI_1').caption.fontSizePt=9]){const m=clone(model);edit(m);assert.throws(()=>nativeRequest(m));}
const legacy=clone(model);legacy.runtimeProfile='candidate-general-v1';assert.throws(()=>nativeRequest(legacy));
const actual=drawing.objects.map(o=>({id:o.id,status:'MEASURED',actual:clone(o.bounds)})),readback=request.objects.map(o=>({id:o.id,rotationDeg:o.rotationDeg,referencePoint:o.referencePoint,referencePointPresent:true}));
const text=actual.find(o=>o.id==='TITLE');text.actual.width*=.7;text.actual.height*=.7;
for(const p of drawing.objects.filter(o=>o.symbolBounds)){const a=actual.find(a=>a.id===p.id);if(p.captionFrame){a.symbolActual=clone(p.symbolBounds);a.captionActual={...p.captionFrame,height:3,width:Math.min(20,p.captionFrame.width),x:p.captionFrame.x+(p.captionFrame.width-Math.min(20,p.captionFrame.width))/2};}else a.actual=clone(p.symbolBounds);}
assert.equal(evaluate(drawing,actual,readback).status,'PASS_PLACEMENT_AND_SIZE');
const missing=clone(actual);delete missing.find(o=>o.id==='HRI_1').captionActual;assert.equal(evaluate(drawing,missing,readback).status,'FAIL');
const captionShift=clone(actual);captionShift.find(o=>o.id==='HRI_1').captionActual.y+=2;assert.equal(evaluate(drawing,captionShift,readback).status,'FAIL');
const wrongAnchor=clone(readback);wrongAnchor.find(o=>o.id==='RULE').referencePoint='TopLeft';assert.equal(evaluate(drawing,actual,wrongAnchor).status,'UNRESOLVED');
const frame=Array.from({length:30},(_,y)=>Buffer.from(Array.from({length:60},(_,x)=>+(x<2||x>=58||y<2||y>=28)))),page=Array.from({length:90},()=>Buffer.alloc(120));
for(let y=0;y<30;y++)frame[y].copy(page[y+7],11);page[20][30]=1;
assert.deepEqual(locateInk(page,frame),{x:11,y:7});
for(let y=0;y<30;y++)frame[y].copy(page[y+50],11);assert.equal(locateInk(page,frame),null);
const broken=frame.map(r=>Buffer.from(r));broken[0][25]=0;const p2=Array.from({length:50},()=>Buffer.alloc(90));broken.forEach((r,y)=>r.copy(p2[y+8],10));assert.equal(locateInk(p2,frame),null);
assert.equal(check({type:'box',strokeMm:.08},frame).status,'PASS');assert.equal(check({type:'box',strokeMm:.08},frame.map(r=>Buffer.alloc(r.length,1))).status,'FAIL');
const bar=Array.from({length:80},(_,y)=>Buffer.from(Array.from({length:60},(_,x)=>+(y<35?(x%5<2):y>=43&&y<52&&x>=12&&x<=48))));const parts=split(bar);assert.equal(parts.symbol.height,35);assert.equal(parts.caption.y,43);assert.throws(()=>split(Array.from({length:50},()=>Buffer.alloc(50))));
console.log('PASS typed native primitive planner, PNG identity, stroke footprint, endpoint anchor, hollow overlay registration + ambiguity/missing-ink rejection, actual image pattern, segmented HRI + caption displacement, unsupported profiles fail closed; no BarTender execution');
