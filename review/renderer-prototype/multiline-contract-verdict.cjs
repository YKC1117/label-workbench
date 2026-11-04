'use strict';
// Run52 Designer-authored multi-line / alignment contract: mechanical verdict.
// Targets are native Text objects that already exist in SHA-locked Designer
// documents. Nothing is guessed: alignment is classified from BarTender's own
// object raster, and formatting fields are reported by set difference against
// single-line reference Texts from the same document.
// Highest capability result: CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED.
//
// Usage: node multiline-contract-verdict.cjs --verdict <evidenceDir>
const fs=require('fs');
const path=require('path');
const {inkBands}=require('./paragraph-contract-verdict.cjs');
const {TOLERANCE}=require('../../renderer/visual-qa.cjs');
const EDGE_MM=TOLERANCE.edgeMm; // existing Visual QA edge tolerance (0.5 mm)

const spread=a=>a.length?Math.max(...a)-Math.min(...a):0;
// Classify one raster. Requires >=2 bands whose widths differ by more than the
// edge tolerance; otherwise alignment is not observable.
function classify(b){
  if(!b||b.status!=='MEASURED')return {class:'UNMEASURED'};
  if(b.bands<2)return {class:'NOT_OBSERVABLE_SINGLE_BAND',bands:b.bands};
  const bb=b.bandBoxes,L=spread(bb.map(x=>x.left)),R=spread(bb.map(x=>x.right)),C=spread(bb.map(x=>x.center)),W=spread(bb.map(x=>x.right-x.left));
  const s={left:+L.toFixed(4),right:+R.toFixed(4),center:+C.toFixed(4),width:+W.toFixed(4)};
  if(W<=EDGE_MM)return {class:'NOT_OBSERVABLE_EQUAL_WIDTHS',spreadsMm:s,bands:b.bands};
  const ok=[L<=EDGE_MM&&'LEFT',C<=EDGE_MM&&'CENTER',R<=EDGE_MM&&'RIGHT'].filter(Boolean);
  return {class:ok.length===1?ok[0]:'AMBIGUOUS',spreadsMm:s,bands:b.bands};
}
// Fields present in the target but absent from every reference (and vice versa).
function fieldContrast(target,refs){
  if(!target||!refs.length)return {status:'NOT_RUN'};
  const keys=m=>new Set(Object.keys(m||{}));
  const t=keys(target.fieldMap),rs=refs.map(r=>keys(r.fieldMap));
  const norm=k=>k.replace(/\[\d+\]/g,'[]');
  const refNorm=new Set(rs.flatMap(s=>[...s].map(norm)));
  const tNorm=new Set([...t].map(norm));
  const onlyTarget=[...t].filter(k=>!refNorm.has(norm(k))).sort().map(k=>({field:k,value:target.fieldMap[k]}));
  const missingInTarget=[...refNorm].filter(k=>rs.every(s=>[...s].some(x=>norm(x)===k))&&!tNorm.has(k)).sort();
  return {status:'DONE',onlyInTarget:onlyTarget,presentInAllRefsButNotTarget:missingInTarget,referenceCount:refs.length};
}

function verdict(dir){
  const r=JSON.parse(fs.readFileSync(path.join(dir,'multiline-contract-report.json'),'utf8').replace(/^\uFEFF/,''));
  const f=n=>n?path.join(dir,n):null;
  const hard=[...(r.hardFailures||[])];
  const harvest={};
  for(const h of (r.harvest||[])){
    const byName={};for(const o of (h.objects||[]))byName[o.name]=o;
    const refs=(h.referenceNames||[]).map(n=>byName[n]).filter(o=>o&&o.root==='Text');
    const targets={};
    for(const n of (h.targetNames||[])){
      const o=byName[n];
      if(!o){targets[n]={present:false};continue;}
      const ink=inkBands(f(o.bmp));
      targets[n]={present:true,root:o.root,type:o.type,valueHasLineBreak:/[\r\n]/.test(o.value||''),dataSourceCount:o.dataSourceCount,
        ink:{status:ink.status,bands:ink.bands,bandBoxes:ink.bandBoxes},alignment:classify(ink),fields:fieldContrast(o,refs)};
    }
    const integrity=h.integrity||{};
    if(!(integrity.snapshotEqual===true&&integrity.shaBefore&&integrity.shaBefore===integrity.shaAfter))hard.push('READ_ONLY_HARVEST_NOT_PROVEN:'+h.label);
    if(h.shaOk!==true)hard.push('SOURCE_SHA:'+h.label);
    harvest[h.label]={sha256:h.sha256,shaOk:h.shaOk,objectCount:(h.objects||[]).length,integrity,targets};
  }
  // Edit challenge on a Designer multi-line object: same alignment class must
  // survive edits that change line widths, and restore must be exact.
  const e=r.edit||{};let edit={status:e.status||'NOT_RUN',reason:e.reason||null};
  if(e.status==='DONE'){
    const states=(e.steps||[]).map(s=>({label:s.label,readbackExact:s.readbackExact,alignment:classify(inkBands(f(s.bmp)))}));
    const base=states.find(s=>s.label==='baseline'),edits=states.filter(s=>/^edit-/.test(s.label));
    const cls=base&&base.alignment.class;
    const nonDefault=['CENTER','RIGHT'].includes(cls);
    const preserved=!!cls&&['LEFT','CENTER','RIGHT'].includes(cls)&&edits.length>=2&&edits.every(s=>s.alignment.class===cls);
    if(states.some(s=>s.readbackExact!==true))hard.push('EDIT_READBACK_MISMATCH');
    if(e.restoreXmlExact!==true||e.restoreBmpExact!==true)hard.push('EDIT_RESTORE_NOT_EXACT');
    edit={status:'DONE',target:e.target,states,baselineClass:cls,
      result:preserved?'ALIGNMENT_PRESERVED_AFTER_EDIT:'+cls:'ALIGNMENT_NOT_PRESERVED_OR_NOT_OBSERVABLE',nonDefault,
      restoreXmlExact:e.restoreXmlExact===true,restoreBmpExact:e.restoreBmpExact===true};
  }
  const audits=r.peerAudits||[];
  if(e.status==='DONE'){
    if(!audits.length)hard.push('NO_PEER_AUDIT_RECORDED');
    if(audits.some(a=>a.status!=='EXACT'))hard.push('PEER_CONTAMINATION');
  }
  const c=r.cold||{};
  const coldOk=c.status==='DONE'&&c.distinctPid===true&&c.targetXmlEqual===true&&c.targetValueEqual===true&&c.targetBmpEqual===true&&c.formatBmpEqual===true&&c.peerXmlEqual===true&&!!c.shaBefore&&c.shaBefore===c.shaAfter;
  if(c.status==='DONE'&&!coldOk)hard.push('COLD_REOPEN_OR_SHA_MISMATCH');
  if(r.ownership&&r.ownership.allOwned!==true)hard.push('NON_OWNED_PROCESS');
  const failed=hard.length>0||r.status!=='DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE';
  const contractOk=!failed&&edit.status==='DONE'&&edit.restoreXmlExact&&edit.restoreBmpExact&&c.status==='DONE'&&coldOk;
  const just={left:'NOT_CERTIFIED',center:'NOT_CERTIFIED',right:'NOT_CERTIFIED'};
  if(contractOk&&/^ALIGNMENT_PRESERVED_AFTER_EDIT:/.test(edit.result||''))just[edit.baselineClass.toLowerCase()]='CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED';
  // Read-only observation of a non-default alignment elsewhere is reported but never certified.
  const observed=[];
  for(const [label,h] of Object.entries(harvest))for(const [n,t] of Object.entries(h.targets))if(t.alignment&&['LEFT','CENTER','RIGHT'].includes(t.alignment.class))observed.push({source:label,object:n,class:t.alignment.class});
  const editTarget=edit.status==='DONE'?edit.states.find(s=>s.label==='baseline'):null;
  const multiline=contractOk&&editTarget&&editTarget.alignment.bands>=2&&edit.states.filter(s=>/^edit-/.test(s.label)).every(s=>s.alignment.bands>=2)?'CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED':'NOT_CERTIFIED';
  const out={schema:'lwb-multiline-contract-verdict-v1',overall:failed?'FAIL_CLOSED':'DISCOVERY_COMPLETE',hardFailures:[...new Set(hard)],
    productAcceptance:'NOT_COMPLETE',rendererCertified:false,
    capability:{nativeExplicitMultiline:multiline,nativeJustification:just,widthControlledWrap:'NOT_CERTIFIED',fixedFrame:'NOT_CERTIFIED'},
    observedReadOnlyAlignment:observed,harvest,edit,
    cold:c.status==='DONE'?(coldOk?'PASS':'FAIL'):'NOT_RUN',
    peerIsolation:!audits.length?'NOT_RUN':audits.every(a=>a.status==='EXACT')?'PASS':'FAIL',
    unknowns:['Width-driven wrap is not exercised by explicit-break objects.','Fixed frame / overflow not exercised.','Field contrast lists differences only; it does not prove which field encodes alignment.'],
    tolerances:{edgeMm:EDGE_MM,edgeBasis:'renderer/visual-qa.cjs TOLERANCE.edgeMm'}};
  fs.writeFileSync(path.join(dir,'multiline-verdict.json'),JSON.stringify(out,null,2));
  return out;
}
module.exports={verdict,classify,fieldContrast};
if(require.main===module){
  const [mode,a]=process.argv.slice(2);
  try{if(mode!=='--verdict')throw Error('usage: --verdict <dir>');const v=verdict(a);process.stdout.write(v.overall+'\n');process.exit(v.overall==='DISCOVERY_COMPLETE'?0:2);}
  catch(e){console.error(e&&e.stack||e);process.exit(1);}
}
