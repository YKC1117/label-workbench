'use strict';
// Text5 native paragraph contract: mechanical per-axis verdict.
// Discovery evidence only. Nothing here certifies a renderer capability; the
// strongest result is CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED.
//
// Usage: node paragraph-contract-verdict.cjs --verdict <evidenceDir>
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {mask}=require('../../native/Label_Workbench_Native_Layout_ENGINE_V1/program/compare-render.cjs');
const {TOLERANCE}=require('../../renderer/visual-qa.cjs');

const EXPORT_DPI=600;
const MM_PER_PX=25.4/EXPORT_DPI;
// Tolerance basis, all pre-existing (no tuned threshold):
// EDGE_MM   renderer/visual-qa.cjs TOLERANCE.edgeMm (ink-inside-frame rule already used by Visual QA)
// MIL_MM    BarTender 0.001 in literal; HybridPool Run43 one-mil setter truncation note
// FONT_PT   HybridPool Text FontSize readback tolerance
const EDGE_MM=TOLERANCE.edgeMm;
const MIL_MM=0.0254;
const FONT_PT=0.02;
const EPS=1e-9;
const mm=px=>+(px*MM_PER_PX).toFixed(4);

function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();}
// Ink geometry plus per-band horizontal extents (needed for alignment evidence).
function inkBands(file){
  if(!file||!fs.existsSync(file))return {status:'MISSING'};
  let rows;try{rows=mask(file);}catch(e){return {status:'UNREADABLE',error:String(e.message)};}
  const h=rows.length,w=h?rows[0].length:0;
  const rowRange=rows.map(r=>{let a=-1,b=-1;for(let x=0;x<w;x++)if(r[x]){if(a<0)a=x;b=x;}return a<0?null:[a,b];});
  const bands=[];let cur=null;
  rowRange.forEach((rr,y)=>{
    if(rr){if(!cur)cur={y0:y,y1:y,x0:rr[0],x1:rr[1]};else{cur.y1=y;cur.x0=Math.min(cur.x0,rr[0]);cur.x1=Math.max(cur.x1,rr[1]);}}
    else if(cur){bands.push(cur);cur=null;}
  });
  if(cur)bands.push(cur);
  if(!bands.length)return {status:'MEASURED',sha256:sha(file),rasterMm:[mm(w),mm(h)],bands:0,ink:null,bandBoxes:[]};
  const x0=Math.min(...bands.map(b=>b.x0)),x1=Math.max(...bands.map(b=>b.x1));
  const y0=bands[0].y0,y1=bands[bands.length-1].y1;
  return {status:'MEASURED',sha256:sha(file),rasterMm:[mm(w),mm(h)],bands:bands.length,
    ink:{x:mm(x0),y:mm(y0),width:mm(x1-x0+1),height:mm(y1-y0+1)},
    bandBoxes:bands.map(b=>({left:mm(b.x0),right:mm(b.x1+1),center:+((mm(b.x0)+mm(b.x1+1))/2).toFixed(4),height:mm(b.y1-b.y0+1)})),
    rasterWidthMm:mm(w)};
}
const num=v=>typeof v==='number'?v:Number(v);
function readback(step){
  if(!step)return 'NOT_RUN';
  if(step.status==='WRITE_REFUSED')return 'WRITE_REFUSED';
  if(step.status!=='WROTE')return 'NOT_RUN';
  if(typeof step.requested==='string'||typeof step.requested==='boolean')return step.actual===step.requested?'READBACK_EXACT':'READBACK_MISMATCH';
  const a=num(step.actual),r=num(step.requested);if(!Number.isFinite(a))return 'READBACK_UNAVAILABLE';
  const tol=step.property==='FontSize'?FONT_PT:MIL_MM,d=Math.abs(a-r);
  return d<EPS?'READBACK_EXACT':d<=tol+EPS?'READBACK_WITHIN_DOCUMENTED_QUANTUM':'READBACK_MISMATCH';
}
const okRead=j=>j==='READBACK_EXACT'||j==='READBACK_WITHIN_DOCUMENTED_QUANTUM';
const g=(step,side,key)=>{const o=step&&step['getters'+side]&&step['getters'+side][key];return o&&o.ok?o.value:undefined;};
const spread=a=>a.length?Math.max(...a)-Math.min(...a):0;

// Width-controlled wrap requires ALL of the following; any miss is reported by code.
function wrapAxis(r,ink){
  const single=r.steps.find(s=>s.label==='payload-long'),w1=r.steps.find(s=>s.label==='width-1'),w2=r.steps.find(s=>s.label==='width-2');
  const misses=[];
  if(!w1||!w2||!single)return {result:'NOT_RUN',misses:['STEP_MISSING']};
  const j1=readback(w1),j2=readback(w2);
  if(j1==='WRITE_REFUSED'||j2==='WRITE_REFUSED')return {result:'NOT_EVIDENCED_TYPED_WIDTH_REFUSED',misses:['WIDTH_WRITE_REFUSED'],width1:j1,width2:j2};
  if(!okRead(j1)||!okRead(j2))misses.push('WIDTH_READBACK_NOT_WITHIN_QUANTUM');
  const L=r.longText;
  for(const s of [w1,w2])if(g(s,'After','Value')!==L)misses.push('VALUE_CHANGED_BY_WIDTH:'+s.label);
  for(const s of [w1,w2]){
    for(const k of ['FontSize','FontScale']){const b=num(g(single,'After',k)),a=num(g(s,'After',k));
      if(!Number.isFinite(b)||!Number.isFinite(a))misses.push(k.toUpperCase()+'_UNREADABLE:'+s.label);
      else if(Math.abs(a-b)>FONT_PT+EPS)misses.push(k.toUpperCase()+'_CHANGED_AUTOFIT_OR_SHRINK:'+s.label);}
  }
  const b0=ink[single.label],b1=ink[w1.label],b2=ink[w2.label];
  if([b0,b1,b2].some(b=>!b||b.status!=='MEASURED'||!b.ink))return {result:'NOT_EVIDENCED_RASTER_UNAVAILABLE',misses};
  const W1=num(w1.requested),W2=num(w2.requested);
  if(!(b0.ink.width>W1+EDGE_MM))misses.push('SINGLE_LINE_NOT_WIDER_THAN_WIDTH1_WRAP_NOT_EXERCISED');
  if(b0.bands!==1)misses.push('BASELINE_NOT_SINGLE_BAND');
  if(!(b1.bands>=2))misses.push('WIDTH1_NOT_MULTIBAND');
  if(!(b2.bands>b1.bands))misses.push('WIDTH2_BANDS_NOT_INCREASED');
  if(b1.ink.width>W1+EDGE_MM)misses.push('WIDTH1_INK_EXCEEDS_FRAME');
  if(b2.ink.width>W2+EDGE_MM)misses.push('WIDTH2_INK_EXCEEDS_FRAME');
  const lineH=b0.ink.height;
  for(const [n,b] of [['width-1',b1],['width-2',b2]])for(const bb of b.bandBoxes){
    if(bb.height>lineH+EDGE_MM)misses.push('BAND_TALLER_THAN_SINGLE_LINE:'+n);
    if(bb.height<lineH*0.5)misses.push('BAND_SHRUNK_BELOW_HALF_LINE:'+n);
  }
  return {result:misses.length?'NOT_EVIDENCED':'WIDTH_CONTROLLED_WRAP_EVIDENCED',misses:[...new Set(misses)],width1:j1,width2:j2,
    bands:{single:b0.bands,width1:b1.bands,width2:b2.bands},inkWidthMm:{single:b0.ink.width,width1:b1.ink.width,width2:b2.ink.width}};
}
// Only the DEFAULT alignment can be observed; non-default values have no
// evidence-backed writer this round.
function alignmentAxis(b){
  if(!b||b.status!=='MEASURED'||b.bands<2)return {default:'UNKNOWN_INSUFFICIENT_BANDS',center:'UNKNOWN_NOT_ATTEMPTED',right:'UNKNOWN_NOT_ATTEMPTED'};
  const L=spread(b.bandBoxes.map(x=>x.left)),R=spread(b.bandBoxes.map(x=>x.right)),C=spread(b.bandBoxes.map(x=>x.center));
  const W=spread(b.bandBoxes.map(x=>x.right-x.left));
  let d='UNKNOWN_AMBIGUOUS';
  if(W<=EDGE_MM)d='UNKNOWN_BANDS_SAME_WIDTH';
  else if(L<=EDGE_MM&&R>EDGE_MM&&C>EDGE_MM)d='DEFAULT_LEFT_OBSERVED';
  else if(C<=EDGE_MM&&L>EDGE_MM&&R>EDGE_MM)d='DEFAULT_CENTER_OBSERVED';
  else if(R<=EDGE_MM&&L>EDGE_MM&&C>EDGE_MM)d='DEFAULT_RIGHT_OBSERVED';
  return {default:d,spreadsMm:{left:+L.toFixed(4),right:+R.toFixed(4),center:+C.toFixed(4),width:+W.toFixed(4)},center:'UNKNOWN_NOT_ATTEMPTED',right:'UNKNOWN_NOT_ATTEMPTED'};
}
function heightAxis(r,ink){
  const h=r.steps.find(s=>s.label==='height-1'),w2=r.steps.find(s=>s.label==='width-2');
  if(!h)return {result:'NOT_RUN'};
  const j=readback(h);
  if(j==='WRITE_REFUSED')return {result:'NOT_AVAILABLE_TYPED_HEIGHT_REFUSED',readback:j};
  if(!okRead(j))return {result:'NOT_EVIDENCED_READBACK',readback:j};
  const a=ink[h.label],b=ink[w2&&w2.label];
  if(!a||!b||a.status!=='MEASURED'||b.status!=='MEASURED'||!a.ink||!b.ink)return {result:'NOT_EVIDENCED_RASTER_UNAVAILABLE',readback:j};
  const H=num(h.requested);
  const fontSame=Math.abs(num(g(h,'After','FontSize'))-num(g(w2,'After','FontSize')))<=FONT_PT+EPS&&Math.abs(num(g(h,'After','FontScale'))-num(g(w2,'After','FontScale')))<=FONT_PT+EPS;
  const valueSame=g(h,'After','Value')===r.longText;
  if(!(b.ink.height>H+EDGE_MM))return {result:'NOT_EXERCISED_CONTENT_FITS_HEIGHT',readback:j};
  if(a.ink.height>H+EDGE_MM)return {result:'HEIGHT_NOT_ENFORCED_INK_OVERFLOWS',readback:j,inkHeightMm:a.ink.height};
  if(fontSame&&valueSame&&a.bands<b.bands)return {result:'FIXED_HEIGHT_CLIP_EVIDENCED',readback:j,bands:[b.bands,a.bands]};
  if(!fontSame)return {result:'FIXED_HEIGHT_WITH_FONT_CHANGE_AUTOFIT_EVIDENCED',readback:j};
  return {result:'NOT_EVIDENCED_AMBIGUOUS',readback:j};
}
function challengeAxis(r,ink){
  const c=r.challenge||{};
  if(c.status!=='DONE')return {result:'NOT_RUN'};
  const steps=c.steps||[];const misses=[];
  if(steps.some(s=>s.readbackExact!==true))misses.push('PAYLOAD_READBACK_MISMATCH');
  if(c.restoreXmlExact!==true)misses.push('RESTORE_XML_NOT_EXACT');
  if(c.restoreBmpExact!==true)misses.push('RESTORE_BMP_NOT_EXACT');
  const before=ink['challenge-pre'],short=ink['edit-short'],two=ink['edit-two-paragraph'];
  const relayout=[];
  if(short&&short.status==='MEASURED'&&before&&before.ink&&short.ink){relayout.push(short.bands===1&&short.ink.width<before.ink.width?'SHORT_RELAYOUT_OK':'SHORT_RELAYOUT_UNEXPECTED');}
  if(two&&two.status==='MEASURED'){relayout.push(two.bands>=2?'EXPLICIT_BREAK_MULTIBAND':'EXPLICIT_BREAK_NOT_MULTIBAND');}
  return {result:misses.length?'FAIL':'EDIT_RESTORE_EXACT',misses,relayout};
}

function verdict(dir){
  const r=JSON.parse(fs.readFileSync(path.join(dir,'paragraph-contract-report.json'),'utf8').replace(/^\uFEFF/,''));
  r.steps=r.steps||[];
  const f=n=>n?path.join(dir,n):null;
  const ink={};for(const s of r.steps)ink[s.label]=inkBands(f(s.bmp));
  for(const s of ((r.challenge&&r.challenge.steps)||[]))ink[s.label]=inkBands(f(s.bmp));
  if(r.challenge&&r.challenge.preBmp)ink['challenge-pre']=inkBands(f(r.challenge.preBmp));
  const hard=[...(r.hardFailures||[])];
  const audits=r.peerAudits||[];
  if(audits.some(a=>a.status!=='EXACT'))hard.push('PEER_CONTAMINATION');
  if(!audits.length)hard.push('NO_PEER_AUDIT_RECORDED');
  if(r.ownership&&r.ownership.allOwned!==true)hard.push('NON_OWNED_PROCESS');
  if(!r.designerBase||r.designerBase.shaOk!==true)hard.push('DESIGNER_BASE_SHA');
  const ch=challengeAxis(r,ink);if(ch.result==='FAIL')hard.push('EDIT_CHALLENGE_NOT_EXACT');
  const c=r.cold||{};
  const coldOk=c.status==='DONE'&&c.distinctPid===true&&c.targetXmlEqual===true&&c.targetValueEqual===true&&c.targetBmpEqual===true&&c.formatBmpEqual===true&&c.peerXmlEqual===true&&!!c.shaBefore&&c.shaBefore===c.shaAfter;
  if(c.status==='DONE'&&!coldOk)hard.push('COLD_REOPEN_OR_SHA_MISMATCH');
  const fonts=r.steps.filter(s=>/^font-/.test(s.label)).map(s=>({label:s.label,judgement:readback(s),error:s.error||null}));
  const axes={
    P0_designerBase:r.designerBase&&r.designerBase.shaOk===true?'PASS':'FAIL',
    P1_textSlot:r.target&&r.target.type===5?'PASS':'NOT_RUN',
    P2_fontSetters:!fonts.length?'NOT_RUN':fonts.every(x=>okRead(x.judgement))?'READBACK_PASS':'PARTIAL_OR_REFUSED',
    P3_wrap:wrapAxis(r,ink),
    P4_alignment:alignmentAxis(ink['width-2']),
    P5_fixedHeight:heightAxis(r,ink),
    P6_editChallenge:ch,
    P7_coldReopen:c.status==='DONE'?(coldOk?'PASS':'FAIL'):'NOT_RUN',
    peerIsolation:!audits.length?'NOT_RUN':audits.every(a=>a.status==='EXACT')?'PASS':'FAIL',
    observedXmlFields:(r.steps||[]).filter(s=>s.xmlDiff&&(s.xmlDiff.added.length||s.xmlDiff.removed.length||s.xmlDiff.changed.length)).map(s=>({label:s.label,...s.xmlDiff}))
  };
  const failed=hard.length>0||r.status!=='DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE';
  const contractOk=!failed&&axes.P7_coldReopen==='PASS'&&ch.result==='EDIT_RESTORE_EXACT';
  const out={schema:'lwb-paragraph-contract-verdict-v1',overall:failed?'FAIL_CLOSED':'DISCOVERY_COMPLETE',hardFailures:[...new Set(hard)],
    productAcceptance:'NOT_COMPLETE',rendererCertified:false,
    capability:{
      widthControlledWrap:contractOk&&axes.P3_wrap.result==='WIDTH_CONTROLLED_WRAP_EVIDENCED'?'CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED':'NOT_CERTIFIED',
      fixedFrame:contractOk&&axes.P5_fixedHeight.result==='FIXED_HEIGHT_CLIP_EVIDENCED'?'CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED':'NOT_CERTIFIED',
      nativeJustification:'NOT_CERTIFIED'},
    axes,fonts,ink,
    unknowns:[
      'Center/right justification: no evidence-backed writer (no typed member, no observed field values); not attempted.',
      'Overflow semantics beyond the single tested height are UNKNOWN.',
      'Line-break algorithm (hyphenation, long unbreakable words, CJK) is UNKNOWN; only ASCII words were exercised.'],
    tolerances:{edgeMm:EDGE_MM,edgeBasis:'renderer/visual-qa.cjs TOLERANCE.edgeMm',milMm:MIL_MM,fontPt:FONT_PT,exportDpi:EXPORT_DPI}};
  fs.writeFileSync(path.join(dir,'paragraph-verdict.json'),JSON.stringify(out,null,2));
  return out;
}
module.exports={verdict,inkBands,wrapAxis,alignmentAxis,heightAxis,challengeAxis,readback};
if(require.main===module){
  const [mode,a]=process.argv.slice(2);
  try{
    if(mode!=='--verdict')throw Error('usage: --verdict <dir>');
    const v=verdict(a);process.stdout.write(v.overall+'\n');process.exit(v.overall==='DISCOVERY_COMPLETE'?0:2);
  }catch(e){console.error(e&&e.stack||e);process.exit(1);}
}
