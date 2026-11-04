'use strict';
// Offline regression for the Text5 native paragraph verdict. Synthetic BMPs
// only exercise decision rules; this is not BarTender evidence.
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {verdict,alignmentAxis,inkBands}=require('../review/renderer-prototype/paragraph-contract-verdict.cjs');

const PX=600/25.4;
// bands: [{x(mm),w(mm),h(mm)}] stacked with 1 mm gaps; raster width in mm.
function bmp(file,rasterMm,bands){
  const w=Math.ceil(Math.max(rasterMm,...bands.map(b=>b.x+b.w))*PX)+6,lineGap=Math.round(1*PX);
  let y=2;const rects=bands.map(b=>{const r=[Math.round(b.x*PX)+2,y,Math.round(b.w*PX),Math.round(b.h*PX)];y+=r[3]+lineGap;return r;});
  const h=y+2,stride=Math.ceil(w*3/4)*4,buf=Buffer.alloc(54+stride*h,0xff);
  buf.write('BM',0);buf.writeUInt32LE(buf.length,2);buf.writeUInt32LE(54,10);buf.writeUInt32LE(40,14);
  buf.writeInt32LE(w,18);buf.writeInt32LE(-h,22);buf.writeUInt16LE(1,26);buf.writeUInt16LE(24,28);buf.writeUInt32LE(0,30);
  for(const [x,yy,ww,hh] of rects)for(let j=yy;j<yy+hh;j++)buf.fill(0,54+j*stride+x*3,54+j*stride+(x+ww)*3);
  fs.writeFileSync(file,buf);
}
const L='PARAGRAPH WRAP PROBE ALPHA BRAVO CHARLIE DELTA';
const getters=(over={})=>({Value:{ok:true,value:L},FontSize:{ok:true,value:8},FontScale:{ok:true,value:100},...over});
function fixture(mut={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pcv-'));
  const B=(n,r,b)=>{bmp(path.join(dir,n),r,b);return n;};
  const lh=2.2;
  const spec={single:[{x:0,w:80,h:lh}],w1:[{x:0,w:48,h:lh},{x:0,w:30,h:lh}],w2:[{x:0,w:29,h:lh},{x:0,w:25,h:lh},{x:0,w:20,h:lh}],
    h1:[{x:0,w:29,h:lh}],pre:[{x:0,w:29,h:lh},{x:0,w:25,h:lh},{x:0,w:20,h:lh}],short:[{x:0,w:15,h:lh}],two:[{x:0,w:28,h:lh},{x:0,w:27,h:lh}],...(mut.spec||{})};
  const r={status:'DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE',hardFailures:[],longText:L,designerBase:{shaOk:true},ownership:{allOwned:true},
    target:{type:5},
    steps:[
      {label:'font-size',property:'FontSize',requested:8,actual:8,status:'WROTE',gettersAfter:getters()},
      {label:'payload-long',kind:'payload',property:'Value',requested:L,actual:L,status:'WROTE',gettersAfter:getters(),bmp:B('s.bmp',82,spec.single)},
      {label:'width-1',property:'Width',requested:50.8,actual:50.8,status:'WROTE',gettersAfter:getters(),bmp:B('w1.bmp',50.8,spec.w1)},
      {label:'width-2',property:'Width',requested:30.48,actual:30.48,status:'WROTE',gettersAfter:getters(),bmp:B('w2.bmp',30.48,spec.w2)},
      {label:'height-1',property:'Height',requested:5.08,actual:null,status:'WRITE_REFUSED',gettersAfter:getters(),bmp:B('h1.bmp',30.48,spec.h1)}],
    challenge:{status:'DONE',preBmp:B('pre.bmp',30.48,spec.pre),restoreXmlExact:true,restoreBmpExact:true,
      steps:[{label:'edit-short',readbackExact:true,bmp:B('short.bmp',30.48,spec.short)},{label:'edit-two-paragraph',readbackExact:true,bmp:B('two.bmp',30.48,spec.two)},{label:'edit-restore',readbackExact:true,bmp:'pre.bmp'}]},
    cold:{status:'DONE',distinctPid:true,targetXmlEqual:true,targetValueEqual:true,targetBmpEqual:true,formatBmpEqual:true,peerXmlEqual:true,shaBefore:'AA',shaAfter:'AA'},
    peerAudits:[{tag:'t',name:'Text 2',status:'EXACT'}]};
  if(mut.report)mut.report(r);
  fs.writeFileSync(path.join(dir,'paragraph-contract-report.json'),JSON.stringify(r));
  return verdict(dir);
}
const step=(r,l)=>r.steps.find(s=>s.label===l);
let n=0;const t=(name,fn)=>{fn();n++;};

t('ink bands measured',()=>{const v=fixture();assert.strictEqual(v.ink['width-2'].bands,3);assert.strictEqual(v.ink['payload-long'].bands,1);});
t('wrap evidenced only with every condition',()=>{const v=fixture();assert.strictEqual(v.axes.P3_wrap.result,'WIDTH_CONTROLLED_WRAP_EVIDENCED');
  assert.strictEqual(v.capability.widthControlledWrap,'CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED');assert.strictEqual(v.rendererCertified,false);assert.strictEqual(v.overall,'DISCOVERY_COMPLETE');});
t('justification never certified',()=>assert.strictEqual(fixture().capability.nativeJustification,'NOT_CERTIFIED'));
t('width refused',()=>{const v=fixture({report:r=>{for(const l of ['width-1','width-2']){step(r,l).status='WRITE_REFUSED';step(r,l).actual=46.99;}}});
  assert.strictEqual(v.axes.P3_wrap.result,'NOT_EVIDENCED_TYPED_WIDTH_REFUSED');assert.strictEqual(v.capability.widthControlledWrap,'NOT_CERTIFIED');assert.strictEqual(v.overall,'DISCOVERY_COMPLETE');});
t('width accepted but readback unchanged',()=>{const v=fixture({report:r=>{step(r,'width-1').actual=46.99;}});assert.ok(v.axes.P3_wrap.misses.includes('WIDTH_READBACK_NOT_WITHIN_QUANTUM'));});
t('autofit font shrink is not wrap',()=>{const v=fixture({report:r=>{step(r,'width-2').gettersAfter=getters({FontSize:{ok:true,value:5.5}});}});
  assert.strictEqual(v.axes.P3_wrap.result,'NOT_EVIDENCED');assert.ok(v.axes.P3_wrap.misses.some(m=>m.startsWith('FONTSIZE_CHANGED')));});
t('horizontal FontScale compression is not wrap',()=>{const v=fixture({report:r=>{step(r,'width-1').gettersAfter=getters({FontScale:{ok:true,value:60}});}});assert.ok(v.axes.P3_wrap.misses.some(m=>m.startsWith('FONTSCALE_CHANGED')));});
t('single band compressed into width is not wrap',()=>{const v=fixture({spec:{w1:[{x:0,w:50,h:2.2}],w2:[{x:0,w:30,h:2.2}]}});
  assert.strictEqual(v.axes.P3_wrap.result,'NOT_EVIDENCED');assert.ok(v.axes.P3_wrap.misses.includes('WIDTH1_NOT_MULTIBAND'));});
t('value rewritten by width is not native wrap',()=>{const v=fixture({report:r=>{step(r,'width-1').gettersAfter=getters({Value:{ok:true,value:'PARAGRAPH WRAP\r\nPROBE'}});}});assert.ok(v.axes.P3_wrap.misses.some(m=>m.startsWith('VALUE_CHANGED_BY_WIDTH')));});
t('ink beyond frame',()=>{const v=fixture({spec:{w2:[{x:0,w:34,h:2.2},{x:0,w:25,h:2.2},{x:0,w:20,h:2.2}]}});assert.ok(v.axes.P3_wrap.misses.includes('WIDTH2_INK_EXCEEDS_FRAME'));});
t('wrap not exercised when single line already fits',()=>{const v=fixture({spec:{single:[{x:0,w:45,h:2.2}]}});assert.ok(v.axes.P3_wrap.misses.includes('SINGLE_LINE_NOT_WIDER_THAN_WIDTH1_WRAP_NOT_EXERCISED'));});
t('bands must increase when width decreases',()=>{const v=fixture({spec:{w2:[{x:0,w:29,h:2.2},{x:0,w:25,h:2.2}]}});assert.ok(v.axes.P3_wrap.misses.includes('WIDTH2_BANDS_NOT_INCREASED'));});
t('scaled-up lines rejected',()=>{const v=fixture({spec:{w1:[{x:0,w:48,h:4},{x:0,w:30,h:4}]}});assert.ok(v.axes.P3_wrap.misses.includes('BAND_TALLER_THAN_SINGLE_LINE:width-1'));});
t('missing raster',()=>{const v=fixture({report:r=>{step(r,'width-2').bmp='nope.bmp';}});assert.strictEqual(v.axes.P3_wrap.result,'NOT_EVIDENCED_RASTER_UNAVAILABLE');});
// Alignment: only the default can be observed.
const al=bb=>alignmentAxis({status:'MEASURED',bands:bb.length,bandBoxes:bb.map(([l,r])=>({left:l,right:r,center:(l+r)/2}))});
t('default left',()=>assert.strictEqual(al([[0,29],[0,20]]).default,'DEFAULT_LEFT_OBSERVED'));
t('default center',()=>assert.strictEqual(al([[0,30],[5,25]]).default,'DEFAULT_CENTER_OBSERVED'));
t('default right',()=>assert.strictEqual(al([[0,30],[10,30]]).default,'DEFAULT_RIGHT_OBSERVED'));
t('equal widths ambiguous',()=>assert.strictEqual(al([[0,30],[0,30]]).default,'UNKNOWN_BANDS_SAME_WIDTH'));
t('center/right never attempted',()=>{const a=al([[0,29],[0,20]]);assert.strictEqual(a.center,'UNKNOWN_NOT_ATTEMPTED');assert.strictEqual(a.right,'UNKNOWN_NOT_ATTEMPTED');});
// Height / fixed frame.
t('height refused',()=>assert.strictEqual(fixture().axes.P5_fixedHeight.result,'NOT_AVAILABLE_TYPED_HEIGHT_REFUSED'));
t('height clip evidenced',()=>{const v=fixture({report:r=>{const h=step(r,'height-1');h.status='WROTE';h.actual=5.08;}});
  assert.strictEqual(v.axes.P5_fixedHeight.result,'FIXED_HEIGHT_CLIP_EVIDENCED');assert.strictEqual(v.capability.fixedFrame,'CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED');});
t('height accepted but overflow',()=>{const v=fixture({spec:{h1:[{x:0,w:29,h:2.2},{x:0,w:25,h:2.2},{x:0,w:20,h:2.2}]},report:r=>{const h=step(r,'height-1');h.status='WROTE';h.actual=5.08;}});
  assert.strictEqual(v.axes.P5_fixedHeight.result,'HEIGHT_NOT_ENFORCED_INK_OVERFLOWS');assert.strictEqual(v.capability.fixedFrame,'NOT_CERTIFIED');});
t('height via font shrink is autofit not clip',()=>{const v=fixture({report:r=>{const h=step(r,'height-1');h.status='WROTE';h.actual=5.08;h.gettersAfter=getters({FontSize:{ok:true,value:4}});}});
  assert.strictEqual(v.axes.P5_fixedHeight.result,'FIXED_HEIGHT_WITH_FONT_CHANGE_AUTOFIT_EVIDENCED');assert.strictEqual(v.capability.fixedFrame,'NOT_CERTIFIED');});
// Edit challenge / hard failures.
t('edit relayout recorded',()=>assert.deepStrictEqual(fixture().axes.P6_editChallenge.relayout,['SHORT_RELAYOUT_OK','EXPLICIT_BREAK_MULTIBAND']));
t('restore xml inexact fails closed',()=>{const v=fixture({report:r=>{r.challenge.restoreXmlExact=false;}});assert.strictEqual(v.overall,'FAIL_CLOSED');assert.strictEqual(v.capability.widthControlledWrap,'NOT_CERTIFIED');});
t('restore bmp inexact fails closed',()=>assert.strictEqual(fixture({report:r=>{r.challenge.restoreBmpExact=false;}}).overall,'FAIL_CLOSED'));
t('peer contamination fails closed',()=>assert.strictEqual(fixture({report:r=>{r.peerAudits.push({tag:'x',name:'Box',status:'CHANGED'});}}).overall,'FAIL_CLOSED'));
t('no peer audits fails closed',()=>assert.strictEqual(fixture({report:r=>{r.peerAudits=[];}}).overall,'FAIL_CLOSED'));
t('cold sha mismatch fails closed',()=>assert.strictEqual(fixture({report:r=>{r.cold.shaAfter='BB';}}).overall,'FAIL_CLOSED'));
t('cold same pid fails closed',()=>assert.strictEqual(fixture({report:r=>{r.cold.distinctPid=false;}}).overall,'FAIL_CLOSED'));
t('designer base sha fails closed',()=>assert.strictEqual(fixture({report:r=>{r.designerBase.shaOk=false;}}).overall,'FAIL_CLOSED'));
t('non-owned process fails closed',()=>assert.strictEqual(fixture({report:r=>{r.ownership.allOwned=false;}}).overall,'FAIL_CLOSED'));
t('cold not run means no capability',()=>{const v=fixture({report:r=>{r.cold={status:'NOT_RUN'};}});assert.strictEqual(v.capability.widthControlledWrap,'NOT_CERTIFIED');});
t('probe failure propagates',()=>assert.strictEqual(fixture({report:r=>{r.status='DISCOVERY_FAILED_CLOSED';}}).overall,'FAIL_CLOSED'));
t('tolerance basis is existing visual QA',()=>{const v=fixture();assert.strictEqual(v.tolerances.edgeMm,0.5);assert.match(v.tolerances.edgeBasis,/visual-qa/);});
t('missing bmp file',()=>assert.strictEqual(inkBands('/nonexistent.bmp').status,'MISSING'));
console.log('Native paragraph contract verdict regression: '+n+'/'+n+' PASS');
