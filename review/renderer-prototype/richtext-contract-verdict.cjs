'use strict';
// RichText9 contract discovery: mechanical value-model classification and
// per-axis verdicts. This tool never certifies fixed frame, wrap or native
// justification. It only states what one bounded probe observed.
//
// Usage:
//   node richtext-contract-verdict.cjs --classify <input.json> <output.json>
//   node richtext-contract-verdict.cjs --verdict <evidenceDir>
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {mask}=require('../../native/Label_Workbench_Native_Layout_ENGINE_V1/program/compare-render.cjs');

const EXPORT_DPI=600;                 // Probe ExportToFile resolution (same as Run47/49).
const MM_PER_PX=25.4/EXPORT_DPI;
// Tolerance basis (no new tuned threshold):
// - NATIVE_MIL_MM: BarTender stores geometry as 0.001 in literals; HybridPool.psm1
//   documents a one-mil truncation of the mm COM setter (Run43 81.4578 -> 81.4324).
// - FONT_SIZE_PT: the existing HybridPool Text FontSize readback tolerance.
const NATIVE_MIL_MM=0.0254;
const FONT_SIZE_PT=0.02;
const EPS=1e-9;

const RTF=/^\s*\{\\rtf/;
const MARKUP=/^\s*<\s*[A-Za-z!?\/]/;
// Designer/BarTender may expose a localized opaque RTF placeholder as Value.
// It is not the RTF body and must not be misclassified as real markup.
const RTF_PLACEHOLDER=/^\s*<\s*RTF\s+(?:資料|Data)\s*>\s*$/i;
const isText=v=>typeof v==='string';

function classify(input){
  const out={model:'UNKNOWN',confirmed:false,payloadPermitted:false,signals:[],reasons:[]};
  const reason=r=>{out.reasons.push(r);return out;};
  if(!input||typeof input!=='object')return reason('NO_INPUT');
  const v=input.value||{};
  if(v.ok!==true||!isText(v.text)){out.model='UNREADABLE';return reason('VALUE_GETTER_FAILED');}
  const ds=Array.isArray(input.dataSources)?input.dataSources:[];
  const ex=input.export||{};
  const literal=ex.literalOk===true&&isText(ex.literal)?ex.literal:null;
  const candidates=[['value',v.text],['exportLiteral',literal],...ds.map((d,i)=>['dataSource'+i,d&&d.valueText])].filter(([,t])=>isText(t));
  for(const [where,t] of candidates){
    if(RTF_PLACEHOLDER.test(t))out.signals.push('RTF_PLACEHOLDER:'+where);
    else if(RTF.test(t))out.signals.push('RTF_SIGNATURE:'+where);
    else if(MARKUP.test(t))out.signals.push('MARKUP_SIGNATURE:'+where);
  }
  if(isText(input.xmlText)&&input.xmlText.includes('{\\rtf'))out.signals.push('RTF_SIGNATURE:objectXml');
  const mutated=(input.valueAfterSetters||[]).filter(s=>s&&s.mutated===true).map(s=>s.label);
  if(mutated.length)out.signals.push('VALUE_MUTATED_BY_STYLE_OR_GEOMETRY_SETTER:'+mutated.join(','));
  if(out.signals.some(s=>s.startsWith('RTF_SIGNATURE:')))  {out.model='RTF';return reason('RTF_EVIDENCE_SAVED_PAYLOAD_SKIPPED');}
  if(out.signals.some(s=>s.startsWith('RTF_PLACEHOLDER:')))return reason('OPAQUE_RTF_PLACEHOLDER_NOT_FORMAT_EVIDENCE');
  if(out.signals.some(s=>s.startsWith('MARKUP_'))){out.model='MARKUP';return reason('MARKUP_EVIDENCE_SAVED_PAYLOAD_SKIPPED');}
  if(v.text.trim()===''){out.model='EMPTY';return reason('EMPTY_VALUE_NOT_PLAIN');}
  if(!ds.length)return reason('DATA_SOURCE_MISSING');
  const embedded=ds.filter(d=>d&&d.localName==='EmbeddedDataSource');
  if(ds.length!==1||embedded.length!==1)reason('NOT_EXACTLY_ONE_EMBEDDED_DATA_SOURCE');
  if(input.transformCount!==0)reason('TRANSFORMS_PRESENT_OR_UNKNOWN');
  if(ex.rowCount!==1||ex.subStringCount!==1||ex.valueCount!==1||literal===null)reason('EXPORT_NODE_NOT_ONE_LITERAL');
  if(literal!==null&&literal!==v.text)reason('EXPORT_LITERAL_DIFFERS_FROM_VALUE');
  if(embedded.length===1&&embedded[0].valueText!==v.text)reason('DATA_SOURCE_VALUE_DIFFERS_FROM_VALUE');
  if(mutated.length)reason('VALUE_CHANGED_WITHOUT_PAYLOAD_WRITE');
  if(out.reasons.length)return out;
  out.signals.push('PLAIN_SHAPED_CONSISTENT');
  // Rule A: content produced only by Create(9) is a default sample. It cannot
  // confirm that the source model is plain text, so no payload overwrite.
  if(input.origin!=='VERIFIED_PAYLOAD_READBACK')return reason('DEFAULT_CONTENT_ONLY_MODEL_UNCONFIRMED');
  out.model='PLAIN';out.confirmed=true;out.payloadPermitted=true;
  return out;
}

function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();}
function ink(file){
  if(!file||!fs.existsSync(file))return {status:'MISSING'};
  let rows;try{rows=mask(file);}catch(e){return {status:'UNREADABLE',error:String(e.message)};}
  const h=rows.length,w=h?rows[0].length:0;let x0=w,y0=h,x1=-1,y1=-1,pixels=0;const rowInk=[];
  rows.forEach((r,y)=>{let n=0;for(let x=0;x<w;x++)if(r[x]){n++;if(x<x0)x0=x;if(x>x1)x1=x;}rowInk.push(n);if(n){pixels+=n;if(y<y0)y0=y;y1=y;}});
  const bands=[];let start=-1;
  rowInk.forEach((n,y)=>{if(n&&start<0)start=y;if(!n&&start>=0){bands.push([start,y-1]);start=-1;}});
  if(start>=0)bands.push([start,h-1]);
  const mm=px=>+(px*MM_PER_PX).toFixed(4);
  return {status:'MEASURED',sha256:sha(file),rasterPx:[w,h],rasterMm:[mm(w),mm(h)],inkPixels:pixels,
    inkBoxMm:pixels?{x:mm(x0),y:mm(y0),width:mm(x1-x0+1),height:mm(y1-y0+1)}:null,
    horizontalInkBands:bands.length,bandHeightsMm:bands.map(([a,b])=>mm(b-a+1))};
}
function numericJudgement(s){
  if(s.status!=='WROTE')return {judgement:s.status==='WRITE_REFUSED'?'WRITE_REFUSED':'NOT_RUN'};
  if(typeof s.requested==='boolean'||typeof s.requested==='string')
    return {judgement:s.actual===s.requested?'READBACK_EXACT':'READBACK_MISMATCH'};
  const a=Number(s.actual),r=Number(s.requested);
  if(!Number.isFinite(a))return {judgement:'READBACK_UNAVAILABLE'};
  const delta=+(a-r).toFixed(6),abs=Math.abs(a-r);
  const tol=s.property==='FontSize'?FONT_SIZE_PT:NATIVE_MIL_MM;
  const basis=s.property==='FontSize'?'HybridPool FontSize readback tolerance':'one native 0.001 in literal (HybridPool Run43 note)';
  return {delta,judgement:abs<EPS?'READBACK_EXACT':abs<=tol+EPS?'READBACK_WITHIN_DOCUMENTED_QUANTUM':'READBACK_MISMATCH',toleranceBasis:basis};
}

function verdict(dir){
  const reportFile=path.join(dir,'richtext-contract-report.json');
  const r=JSON.parse(fs.readFileSync(reportFile,'utf8').replace(/^\uFEFF/,''));
  const f=n=>n?path.join(dir,n):null;
  const hard=[...(r.hardFailures||[])];
  const axes={};
  const matches=(r.enum&&r.enum.richTextMatches)||[];
  axes.A0_installedEnum=matches.length===1&&Number(matches[0].Value)===9?'PASS':'FAIL';
  const rich=r.rich||{};
  axes.A1_create=rich.type===9&&rich.rootLocalName?'PASS':(r.phases&&r.phases.create==='STARTED'?'FAIL':'NOT_RUN');
  const setters=(r.setters||[]).map(s=>({label:s.label,property:s.property,requested:s.requested,actual:s.actual,
    status:s.status,xmlChanged:s.xmlChanged,valueMutated:s.valueMutated,error:s.error||null,...numericJudgement(s),
    fontSizeBefore:s.fontSizeBefore,fontSizeAfter:s.fontSizeAfter,ink:ink(f(s.bmp))}));
  const pick=p=>setters.filter(s=>s.property===p);
  const geo=p=>{const s=pick(p);if(!s.length)return 'NOT_RUN';
    if(s.some(x=>x.judgement==='WRITE_REFUSED'))return 'WRITE_REFUSED';
    if(s.some(x=>x.judgement==='READBACK_MISMATCH'||x.judgement==='READBACK_UNAVAILABLE'))return 'READBACK_MISMATCH_OR_UNAVAILABLE';
    return 'READBACK_ONLY_NOT_FIXED_FRAME';};
  axes.A2_width=geo('Width');axes.A3_height=geo('Height');
  const fonts=setters.filter(s=>/^Font/.test(s.property));
  axes.A4_font=!fonts.length?'NOT_RUN':fonts.every(s=>/^READBACK_(EXACT|WITHIN)/.test(s.judgement))?'READBACK_PASS':'PARTIAL_OR_REFUSED';
  const vm=r.valueModel||{};
  axes.A5_valueModel=vm.model||'UNKNOWN';
  const p=r.payload||{};
  axes.A6_wrap=p.status==='DONE'?'EVIDENCE_ONLY_NOT_CERTIFIED':'NOT_RUN';
  if(p.status==='DONE'&&p.restoreExact!==true)hard.push('PAYLOAD_RESTORE_NOT_EXACT');
  axes.A7_restore=p.status==='DONE'?(p.restoreExact===true?'PASS':'FAIL'):'NOT_RUN';
  const bold=r.fontBoldRestore||{};
  axes.A7b_fontBoldRestore=bold.status==='DONE'?(bold.exact===true?'PASS':'FAIL'):'NOT_RUN';
  if(bold.status==='DONE'&&bold.exact!==true)hard.push('FONTBOLD_RESTORE_NOT_EXACT');
  const c=r.cold||{};
  const coldOk=c.status==='DONE'&&c.distinctPid===true&&c.richXmlEqual===true&&c.richValueEqual===true&&
    c.richBmpEqual===true&&c.formatBmpEqual===true&&c.peerXmlEqual===true&&c.shaBefore&&c.shaBefore===c.shaAfter;
  axes.A8_coldReopen=c.status==='DONE'?(coldOk?'PASS':'FAIL'):'NOT_RUN';
  if(c.status==='DONE'&&!coldOk)hard.push('COLD_REOPEN_OR_SHA_MISMATCH');
  axes.A9_alignment='UNKNOWN_NOT_ATTEMPTED';
  const audits=r.peerAudits||[];
  axes.peerIsolation=!audits.length?'NOT_RUN':audits.every(a=>a.status==='EXACT')?'PASS':'FAIL';
  if(audits.some(a=>a.status!=='EXACT'))hard.push('PEER_CONTAMINATION');
  if(!audits.length)hard.push('NO_PEER_AUDIT_RECORDED');
  if(r.ownership&&r.ownership.allOwned!==true)hard.push('NON_OWNED_PROCESS');
  if(r.designerBase&&r.designerBase.shaOk!==true)hard.push('DESIGNER_BASE_SHA');
  const unknowns=[
    'Fixed frame: Height/Width readback does not prove clipping, shrink-to-fit or sizing mode.',
    'Overflow: no overflow fixture was rendered against a known sizing mode; clipping and auto-scale are UNKNOWN.',
    'Wrap: horizontal ink bands are one signal only; line-break semantics are UNKNOWN.',
    'Alignment: not attempted; no typed setter exists and no dynamic property name was guessed.'];
  const failed=hard.length>0||r.status!=='DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE';
  const out={schema:'lwb-richtext-contract-verdict-v1',report:path.basename(reportFile),
    overall:failed?'FAIL_CLOSED':'DISCOVERY_COMPLETE',hardFailures:[...new Set(hard)],
    productAcceptance:'NOT_COMPLETE',
    capability:{fixedFrame:'NOT_CERTIFIED',nativeJustification:'NOT_CERTIFIED',wrap:'NOT_CERTIFIED'},
    axes,valueModel:vm,setters,baselineInk:ink(f(rich.baselineBmp)),
    payloadInk:(p.steps||[]).map(s=>({label:s.label,ink:ink(f(s.bmp))})),unknowns,
    tolerances:{nativeMilMm:NATIVE_MIL_MM,fontSizePt:FONT_SIZE_PT,exportDpi:EXPORT_DPI}};
  fs.writeFileSync(path.join(dir,'richtext-verdict.json'),JSON.stringify(out,null,2));
  return out;
}

module.exports={classify,verdict,ink,numericJudgement,NATIVE_MIL_MM,FONT_SIZE_PT};
if(require.main===module){
  const [mode,a,b]=process.argv.slice(2);
  try{
    if(mode==='--classify'){
      const input=JSON.parse(fs.readFileSync(a,'utf8').replace(/^\uFEFF/,''));
      fs.writeFileSync(b,JSON.stringify(classify(input),null,2));
    }else if(mode==='--verdict'){
      const v=verdict(a);process.stdout.write(v.overall+'\n');process.exit(v.overall==='DISCOVERY_COMPLETE'?0:2);
    }else throw Error('usage: --classify <in> <out> | --verdict <dir>');
  }catch(e){console.error(e&&e.stack||e);process.exit(1);}
}
