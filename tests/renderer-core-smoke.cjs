'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {validate,fromAnalysis}=require('../renderer/canonical.cjs'),G=require('../renderer/geometry.cjs'),{footprint}=require('../renderer/barcode.cjs'),{preview}=require('../renderer/preview.cjs'),{nativeRequest}=require('../renderer/adapter.cjs'),{evaluate}=require('../renderer/visual-qa.cjs'),{validatePool}=require('../renderer/pool-contract.cjs');
const fixture=require('../fixture.json'),canonical=require('../canonical.json');
const clone=v=>JSON.parse(JSON.stringify(v));
assert.deepEqual(fromAnalysis(fixture.label,fixture.styles,300),canonical);
assert.deepEqual(validate(clone(canonical)),canonical);
assert.equal(canonical.objects[0].fontSizePt,9);assert.equal(canonical.objects[1].fontSizePt,18);
const original=clone(canonical),request=nativeRequest(canonical);assert.deepEqual(canonical,original);
assert.equal(request.objects[2].heightMm,9);assert.equal(request.objects[0].fontName,'Arial');
assert.equal(request.objects[0].referencePoint,'TopLeft');assert.equal(request.objects[0].anchorPolicy,'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE');
assert.equal(request.objects[0].fontMutationPolicy,'DESIGNER_TEXT_POOL_AUTOMATION');assert.equal(request.objects[0].bold,undefined);assert.equal(request.objects[0].italic,undefined);
assert.equal(request.objects[2].referencePoint,'TopLeft');assert.equal(request.objects[3].referencePoint,'TopLeft');
assert.deepEqual(JSON.parse(JSON.stringify(request)),request);
for(const dpi of [203,300,600])for(const mm of [0,.031,3.38582,24.8,100])assert.ok(Math.abs(G.dotsToMm(G.mmToDots(mm,dpi),dpi)-mm)<=25.4/dpi/2+1e-10);
const box={xMm:10,yMm:20,widthMm:8,heightMm:4,rotation:90};
assert.deepEqual(G.anchor({...box,rotation:0},'BottomLeft'),{xMm:10,yMm:24,rotationCom:0});
assert.ok(Math.abs(G.bounds(box).width-4)<1e-10);assert.ok(Math.abs(G.bounds(box).x-6)<1e-10);
assert.ok(Math.abs(G.anchor(box,'BottomLeft').xMm-6)<1e-10);
assert.throws(()=>G.anchor(box,'BASELINE'));
const fp=footprint(canonical.objects[2]);assert.equal(fp.symbolWidthMm,20.066);assert.equal(fp.symbolHeightMm,9);
const dm=footprint(canonical.objects[3]);assert.equal(dm.rows,10);assert.equal(dm.columns,10);assert.equal(dm.widthMm,canonical.objects[3].moduleMm*10);
const numeric={...canonical.objects[2],value:'123456789012'};assert.ok(footprint(numeric).modules<11*(numeric.value.length+2)+13);
const drawing=preview(canonical),actual=drawing.objects.map(o=>({id:o.id,status:'MEASURED',actual:clone(o.symbolBounds??o.bounds)})),readback=drawing.objects.map(o=>({id:o.id,rotationDeg:-o.rotation,referencePoint:'TopLeft',referencePointPresent:true}));
assert.equal(evaluate(drawing,actual,readback).status,'PASS_PLACEMENT_AND_SIZE');
const documentedTextDefault=clone(readback);documentedTextDefault[0].referencePoint=null;documentedTextDefault[0].referencePointPresent=false;
assert.equal(evaluate(drawing,actual,documentedTextDefault).status,'PASS_PLACEMENT_AND_SIZE');
const missingBarcodeAnchor=clone(readback);missingBarcodeAnchor[2].referencePoint=null;missingBarcodeAnchor[2].referencePointPresent=false;
assert.equal(evaluate(drawing,actual,missingBarcodeAnchor).status,'UNRESOLVED');
for(const key of ['x','y','width','height']){const shifted=clone(actual);shifted[2].actual[key]+=2;assert.equal(evaluate(drawing,shifted,readback).status,'FAIL',key);}
const badAngle=clone(readback);badAngle[2].rotationDeg=90;assert.equal(evaluate(drawing,actual,badAngle).status,'FAIL');
assert.equal(evaluate(drawing,actual,[]).status,'UNRESOLVED');
assert.throws(()=>evaluate(drawing,[actual[0],actual[0],...actual.slice(2)],readback));
const ambiguous=clone(actual);ambiguous[2].actual=null;ambiguous[2].status='UNRESOLVED';assert.equal(evaluate(drawing,ambiguous,readback).status,'UNRESOLVED');
const outside=clone(actual);outside[2].actual.x=99;assert.equal(evaluate(drawing,outside,readback).objects[2].outOfBounds,true);
const overlap=clone(actual);overlap[1].actual=clone(overlap[0].actual);assert.ok(evaluate(drawing,overlap,readback).overlaps.some(p=>p.unexpected));
const textInk=clone(actual);textInk[0].actual.width=10;textInk[0].actual.height=3;assert.equal(evaluate(drawing,textInk,readback).status,'PASS_PLACEMENT_AND_SIZE');
const hidden=clone(canonical);hidden.objects[0].printable=false;assert.equal(preview(hidden).objects.length,3);assert.equal(nativeRequest(hidden).objects.length,3);
for(const edit of [m=>m.label.dpi=0,m=>m.objects[0].fontSizePt=NaN,m=>m.objects[2].moduleMm=0,m=>m.objects[3].rows=1,m=>m.objects[1].id=m.objects[0].id]){const m=clone(canonical);edit(m);assert.throws(()=>validate(m));}
for(const edit of [m=>m.objects[0].multiline=true,m=>m.objects[0].frameMode='fixed',m=>m.objects[0].bold=true,m=>m.objects[0].italic=true,m=>m.objects[1].rotation=90,m=>m.objects[2].humanReadable=true]){const m=clone(canonical);edit(m);assert.throws(()=>nativeRequest(m),/CAPABILITY_UNSUPPORTED/);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lwb-pool-'));
try{
 const file=path.join(dir,'pool.btw');fs.writeFileSync(file,'SYNTHETIC_CONTRACT_TEST_ONLY');
 const manifest={schema:'lwb-object-pool-v1',createdBy:'BarTender Designer',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),slots:request.objects.map(o=>({name:o.id,type:o.type,namedSubString:o.id+'_VALUE',referencePoint:'TopLeft'}))};
 assert.equal(validatePool(manifest,file,request).assignments.length,4);
 assert.throws(()=>validatePool({...manifest,sha256:'0'.repeat(64)},file,request));
 const alias=clone(manifest);alias.slots[1].namedSubString=alias.slots[0].namedSubString;assert.throws(()=>validatePool(alias,file,request));
 assert.throws(()=>validatePool({...manifest,slots:manifest.slots.slice(1)},file,request));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS canonical/schema, geometry, encoder footprint, explicit TopLeft Designer Text pool adapter, documented-default readback guard, two-renderer QA, pool contract; no BarTender execution');
