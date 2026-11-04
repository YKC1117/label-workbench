'use strict';
// Offline regression for the Run52 Designer multi-line / alignment verdict.
// Synthetic rasters exercise the decision rules only; not BarTender evidence.
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {verdict,classify,fieldContrast}=require('../review/renderer-prototype/multiline-contract-verdict.cjs');

const PX=600/25.4;
// lines: [{w(mm)}]; align: LEFT|CENTER|RIGHT -> placed inside max width.
function bmp(file,lines,align){
  const max=Math.max(...lines.map(l=>l.w)),w=Math.ceil(max*PX)+6,lh=Math.round(2.5*PX),gap=Math.round(1*PX);
  const h=lines.length*(lh+gap)+4,stride=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+stride*h,0xff);
  b.write('BM',0);b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);
  b.writeInt32LE(w,18);b.writeInt32LE(-h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(0,30);
  lines.forEach((l,i)=>{const lw=Math.round(l.w*PX),mx=Math.round(max*PX);
    const x=2+(align==='CENTER'?Math.round((mx-lw)/2):align==='RIGHT'?mx-lw:0),y=2+i*(lh+gap);
    for(let j=y;j<y+lh;j++)b.fill(0,54+j*stride+x*3,54+j*stride+(x+lw)*3);});
  fs.writeFileSync(file,b);
}
const TX='\u6587\u5b57 ';
function fixture(opt={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mlv-'));
  const B=(n,lines,al)=>{bmp(path.join(dir,n),lines,al);return n;};
  const editAlign=opt.editAlign||'RIGHT';
  const fm=(extra={})=>({'/Text/@Name':'x','/Text/Font[1]/@PointSize':'8',...extra});
  const harvestObjs=lbl=>[
    {name:TX+'30',root:'Text',type:5,value:'RoHS\rCOMPLIANT',dataSourceCount:2,fieldMap:fm({'/Text/@Align':'Center'}),bmp:B(lbl+'30.bmp',[{w:10},{w:14}],'CENTER')},
    {name:TX+'33',root:'Text',type:5,value:'120824\rC.K. QA ACC',dataSourceCount:1,fieldMap:fm({'/Text/@Align':'Right'}),bmp:B(lbl+'33.bmp',[{w:8},{w:16}],'RIGHT')},
    {name:TX+'1',root:'Text',type:5,value:'(1P)',dataSourceCount:1,fieldMap:fm(),bmp:B(lbl+'1.bmp',[{w:12}],'LEFT')},
    {name:TX+'29',root:'Text',type:5,value:'N2',dataSourceCount:1,fieldMap:fm(),bmp:B(lbl+'29.bmp',[{w:4}],'LEFT')}];
  const r={status:'DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE',hardFailures:[],ownership:{allOwned:true},
    harvest:['designer-base','original-template'].map(l=>({label:l,sha256:'S',shaOk:true,targetNames:[TX+'30',TX+'33'],referenceNames:[TX+'1',TX+'29'],
      objects:harvestObjs(l),integrity:{snapshotEqual:true,shaBefore:'S',shaAfter:'S'}})),
    edit:{status:'DONE',target:TX+'33',restoreXmlExact:true,restoreBmpExact:true,steps:[
      {label:'baseline',readbackExact:true,bmp:B('e0.bmp',[{w:8},{w:16}],'RIGHT')},
      {label:'edit-short-first',readbackExact:true,bmp:B('e1.bmp',[{w:2},{w:30}],editAlign)},
      {label:'edit-long-first',readbackExact:true,bmp:B('e2.bmp',[{w:28},{w:2}],editAlign)},
      {label:'restore',readbackExact:true,bmp:'e0.bmp'}]},
    cold:{status:'DONE',distinctPid:true,targetXmlEqual:true,targetValueEqual:true,targetBmpEqual:true,formatBmpEqual:true,peerXmlEqual:true,shaBefore:'A',shaAfter:'A'},
    peerAudits:[{tag:'t',name:'p',status:'EXACT'}]};
  if(opt.mut)opt.mut(r);
  fs.writeFileSync(path.join(dir,'multiline-contract-report.json'),JSON.stringify(r));
  return verdict(dir);
}
const cls=(lines,al)=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'mlc-'));bmp(path.join(d,'x.bmp'),lines,al);
  return classify(require('../review/renderer-prototype/paragraph-contract-verdict.cjs').inkBands(path.join(d,'x.bmp'))).class;};
let n=0;const t=(name,fn)=>{fn();n++;};

t('classify left',()=>assert.strictEqual(cls([{w:10},{w:20}],'LEFT'),'LEFT'));
t('classify center',()=>assert.strictEqual(cls([{w:10},{w:20}],'CENTER'),'CENTER'));
t('classify right',()=>assert.strictEqual(cls([{w:10},{w:20}],'RIGHT'),'RIGHT'));
t('single band not observable',()=>assert.strictEqual(cls([{w:10}],'LEFT'),'NOT_OBSERVABLE_SINGLE_BAND'));
t('equal widths not observable',()=>assert.strictEqual(cls([{w:20},{w:20}],'RIGHT'),'NOT_OBSERVABLE_EQUAL_WIDTHS'));
t('width difference within tolerance is not observable',()=>assert.strictEqual(cls([{w:20},{w:20.3}],'RIGHT'),'NOT_OBSERVABLE_EQUAL_WIDTHS'));
t('small width difference satisfying two classes is AMBIGUOUS',()=>assert.strictEqual(cls([{w:20},{w:20.8}],'LEFT'),'AMBIGUOUS'));
t('unmeasured raster',()=>assert.strictEqual(classify({status:'MISSING'}).class,'UNMEASURED'));
t('field contrast lists target-only fields',()=>{const c=fieldContrast({fieldMap:{'/Text/@A':'1','/Text/@Align':'Right'}},[{fieldMap:{'/Text/@A':'2'}}]);
  assert.deepStrictEqual(c.onlyInTarget,[{field:'/Text/@Align',value:'Right'}]);});
t('field contrast lists fields missing from target',()=>{const c=fieldContrast({fieldMap:{'/Text/@A':'1'}},[{fieldMap:{'/Text/@A':'2','/Text/@B':'x'}},{fieldMap:{'/Text/@B':'y'}}]);
  assert.deepStrictEqual(c.presentInAllRefsButNotTarget,['/Text/@B']);});
t('field contrast ignores sibling index differences',()=>{const c=fieldContrast({fieldMap:{'/Text/DataSources[1]/E[2]/@ID':'a'}},[{fieldMap:{'/Text/DataSources[1]/E[1]/@ID':'b'}}]);assert.strictEqual(c.onlyInTarget.length,0);});
t('harvest classifies targets',()=>{const v=fixture();const h=v.harvest['designer-base'].targets;
  assert.strictEqual(h[TX+'30'].alignment.class,'CENTER');assert.strictEqual(h[TX+'33'].alignment.class,'RIGHT');assert.strictEqual(h[TX+'30'].dataSourceCount,2);});
t('right preserved after edit is contract-evidenced',()=>{const v=fixture();assert.strictEqual(v.overall,'DISCOVERY_COMPLETE');
  assert.strictEqual(v.edit.result,'ALIGNMENT_PRESERVED_AFTER_EDIT:RIGHT');assert.strictEqual(v.capability.nativeJustification.right,'CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED');
  assert.strictEqual(v.rendererCertified,false);assert.strictEqual(v.productAcceptance,'NOT_COMPLETE');});
t('read-only center observation is never certified',()=>{const v=fixture();assert.strictEqual(v.capability.nativeJustification.center,'NOT_CERTIFIED');
  assert(v.observedReadOnlyAlignment.some(o=>o.class==='CENTER'));});
t('wrap and fixed frame never certified here',()=>{const v=fixture();assert.strictEqual(v.capability.widthControlledWrap,'NOT_CERTIFIED');assert.strictEqual(v.capability.fixedFrame,'NOT_CERTIFIED');});
t('explicit multiline evidenced',()=>assert.strictEqual(fixture().capability.nativeExplicitMultiline,'CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED'));
t('alignment lost after edit',()=>{const v=fixture({editAlign:'LEFT'});assert.strictEqual(v.edit.result,'ALIGNMENT_NOT_PRESERVED_OR_NOT_OBSERVABLE');assert.strictEqual(v.capability.nativeJustification.right,'NOT_CERTIFIED');assert.strictEqual(v.overall,'DISCOVERY_COMPLETE');});
t('only one edit is not enough',()=>{const v=fixture({mut:r=>{r.edit.steps.splice(2,1);}});assert.strictEqual(v.capability.nativeJustification.right,'NOT_CERTIFIED');});
t('restore xml inexact fails closed',()=>{const v=fixture({mut:r=>{r.edit.restoreXmlExact=false;}});assert.strictEqual(v.overall,'FAIL_CLOSED');assert.strictEqual(v.capability.nativeJustification.right,'NOT_CERTIFIED');});
t('restore bmp inexact fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.edit.restoreBmpExact=false;}}).overall,'FAIL_CLOSED'));
t('edit readback mismatch fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.edit.steps[1].readbackExact=false;}}).overall,'FAIL_CLOSED'));
t('peer contamination fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.peerAudits.push({tag:'x',name:'q',status:'CHANGED'});}}).overall,'FAIL_CLOSED'));
t('edit without peer audits fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.peerAudits=[];}}).overall,'FAIL_CLOSED'));
t('harvest mutation fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.harvest[0].integrity.snapshotEqual=false;}}).overall,'FAIL_CLOSED'));
t('harvest file sha change fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.harvest[1].integrity.shaAfter='T';}}).overall,'FAIL_CLOSED'));
t('source sha mismatch fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.harvest[1].shaOk=false;}}).overall,'FAIL_CLOSED'));
t('cold sha mismatch fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.cold.shaAfter='B';}}).overall,'FAIL_CLOSED'));
t('cold same pid fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.cold.distinctPid=false;}}).overall,'FAIL_CLOSED'));
t('cold not run means no capability',()=>{const v=fixture({mut:r=>{r.cold={status:'NOT_RUN'};}});assert.strictEqual(v.capability.nativeJustification.right,'NOT_CERTIFIED');assert.strictEqual(v.capability.nativeExplicitMultiline,'NOT_CERTIFIED');});
t('non-owned process fails closed',()=>assert.strictEqual(fixture({mut:r=>{r.ownership.allOwned=false;}}).overall,'FAIL_CLOSED'));
t('edit not eligible is complete but uncertified',()=>{const v=fixture({mut:r=>{r.edit={status:'NOT_RUN',reason:'EDIT_TARGET_NOT_CLEAN:TRANSFORM_PRESENT'};r.cold={status:'NOT_RUN'};r.peerAudits=[];}});
  assert.strictEqual(v.overall,'DISCOVERY_COMPLETE');assert.strictEqual(v.edit.reason,'EDIT_TARGET_NOT_CLEAN:TRANSFORM_PRESENT');assert.deepStrictEqual(Object.values(v.capability.nativeJustification),['NOT_CERTIFIED','NOT_CERTIFIED','NOT_CERTIFIED']);});
t('probe failure propagates',()=>assert.strictEqual(fixture({mut:r=>{r.status='DISCOVERY_FAILED_CLOSED';}}).overall,'FAIL_CLOSED'));
t('missing target reported',()=>{const v=fixture({mut:r=>{r.harvest[0].objects.splice(1,1);}});assert.strictEqual(v.harvest['designer-base'].targets[TX+'33'].present,false);});
t('tolerance basis is existing visual QA',()=>assert.strictEqual(fixture().tolerances.edgeMm,0.5));
console.log('Designer multiline contract verdict regression: '+n+'/'+n+' PASS');
