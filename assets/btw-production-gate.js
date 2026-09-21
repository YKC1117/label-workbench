/* Label Workbench BTW production safety gate v1.0
 * Keeps Quick Analysis confidence decisions aligned with production output.
 * Fields shown as pending/review in Quick Analysis are never silently written into BTW.
 */
(function(){
  'use strict';

  const BUILD='20260921-btw-production-gate-120-object-model';
  let lastReport=null;

  const text=v=>String(v??'').trim();
  const copyArray=v=>Array.isArray(v)?v.slice():v;
  function cloneField(field){
    return {
      ...(field||{}),
      alternatives:copyArray(field?.alternatives),
      candidates:copyArray(field?.candidates),
      __displayAlternatives:copyArray(field?.__displayAlternatives),
      sourceBox:field?.sourceBox?{...field.sourceBox}:field?.sourceBox
    }
  }
  function cloneLabel(label){
    return {
      ...(label||{}),
      fields:(label?.fields||[]).map(cloneField),
      textObjects:(label?.textObjects||[]).map(o=>({...o,sourceBox:o?.sourceBox?{...o.sourceBox}:o?.sourceBox})),
      barcodes:(label?.barcodes||[]).map(b=>({...b,sourceBox:b?.sourceBox?{...b.sourceBox}:b?.sourceBox}))
    }
  }
  function barcodeHasValue(b){return !!text(b?.text??b?.value??b?.data)}

  function fallbackState(field){
    if(!text(field?.value))return['pending','⚠️ 未確認'];
    if(field?.__displayConflict||field?.conflict||field?.needsReview)return['pending','⚠️ 待確認'];
    if(field?.__consistencyResolved||field?.__boundaryTrimmed)return['pending','⚠️ 修正待核對'];
    if(field?.barcodeVerified)return['barcode','✅ 條碼確認'];
    if(field?.barcodeAligned||field?.spatial||Number(field?.repeat)>=2)return['medium','○ 可用'];
    return['pending','⚠️ 建議核對'];
  }
  function confidence(){return window.LabelWorkbenchConfidenceGuard}
  function stateFor(field){
    const guard=confidence();
    if(typeof guard?.stateFor==='function')return guard.stateFor(field);
    return fallbackState(field)
  }
  function refineLabel(label){
    const guard=confidence(),working=cloneLabel(label);
    if(typeof guard?.refine==='function')guard.refine({labels:[working]});
    return working
  }
  function fieldName(field){
    const code=text(field?.code),name=text(field?.name)||'FIELD';
    return code?`(${code}) ${name}`:name
  }

  const objectNorm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9\u3400-\u9FFF]/g,'');
  function validBox(b){return b&&['x','y','w','h'].every(k=>Number.isFinite(Number(b[k])))&&Number(b.w)>0&&Number(b.h)>0}
  function overlapRatio(a,b){
    if(!validBox(a)||!validBox(b))return 0;
    const x0=Math.max(Number(a.x),Number(b.x)),y0=Math.max(Number(a.y),Number(b.y)),x1=Math.min(Number(a.x)+Number(a.w),Number(b.x)+Number(b.w)),y1=Math.min(Number(a.y)+Number(a.h),Number(b.y)+Number(b.h));
    const area=Math.max(0,x1-x0)*Math.max(0,y1-y0),base=Math.max(1e-9,Math.min(Number(a.w)*Number(a.h),Number(b.w)*Number(b.h)));
    return area/base
  }
  function decorativeText(value){
    const n=objectNorm(value);
    return !n||/^(?:ROHS|HF|PB|LEADFREE)$/.test(n)||/^(?:空|EMPTY|NULL|NONE)$/.test(n)
  }
  function reliableTextObject(o){
    const value=text(o?.text??o?.value),n=objectNorm(value),confidence=Number(o?.confidence??o?.sourceBox?.confidence??0),repeat=Number(o?.repeat||0);
    if(!value||decorativeText(value)||value.length>180)return false;
    if(n.length===1&&confidence<90&&repeat<2)return false;
    return confidence>=60||repeat>=2||n.length>=3
  }
  function productionTextObjects(label,acceptedFields,pendingFields){
    const raw=(label?.textObjects||[]).filter(reliableTextObject),reserved=[...(acceptedFields||[]),...(pendingFields||[])].filter(f=>validBox(f?.sourceBox));
    const kept=[];
    for(const o of raw){
      if(reserved.some(f=>overlapRatio(o.sourceBox,f.sourceBox)>=.55))continue;
      const key=objectNorm(o.text??o.value),dup=kept.some(x=>objectNorm(x.text??x.value)===key&&overlapRatio(x.sourceBox,o.sourceBox)>=.45);
      if(!dup)kept.push({...o,text:text(o.text??o.value),objectType:'text',coordinateSpace:o?.coordinateSpace||o?.sourceBox?.coordinateSpace||label?.coordinateSpace||'rectified-label'})
    }
    for(const f of acceptedFields||[]){
      if(!text(f?.value)||!validBox(f?.sourceBox))continue;
      kept.push({id:f.id?String(f.id).replace(/^lw-field-/,'lw-text-'):undefined,text:text(f.value),sourceBox:{...f.sourceBox},confidence:Number(f?.sourceBox?.confidence??f?.lineConfidence??0),repeat:Number(f?.repeat||0),fromFieldId:f.id||null,objectType:'text',coordinateSpace:f?.coordinateSpace||f?.sourceBox?.coordinateSpace||label?.coordinateSpace||'rectified-label'})
    }
    return kept.sort((a,b)=>Number(a?.sourceBox?.y||0)-Number(b?.sourceBox?.y||0)||Number(a?.sourceBox?.x||0)-Number(b?.sourceBox?.x||0))
  }

  function classifyLabel(label,index=0){
    const working=refineLabel(label),accepted=[],pending=[],pendingRows=[],hidden=[];
    for(const field of working.fields||[]){
      if(field?.__finalHidden){hidden.push({name:fieldName(field),value:text(field?.value)});continue}
      const state=stateFor(field),entry={name:fieldName(field),value:text(field?.value),state:state[0],label:state[1]};
      if(state[0]==='pending'){pending.push(entry);pendingRows.push(field);continue}
      if(entry.value)accepted.push(field);
    }
    const textObjects=productionTextObjects(working,accepted,pendingRows);
    const marks=(working.marks||[]).filter(Boolean);
    const output={...working,fields:accepted,textObjects};
    return{
      label:output,
      report:{index,sourceName:text(label?.sourceName),accepted:accepted.length,pending:pending.length,hidden:hidden.length,pendingFields:pending,hiddenFields:hidden,barcodes:(working.barcodes||[]).filter(barcodeHasValue).length,textObjects:textObjects.length,graphicsPending:marks.length,graphics:marks}
    }
  }

  function prepareResult(result){
    const labels=[],labelReports=[];
    for(const [index,label] of (result?.labels||[]).entries()){
      const item=classifyLabel(label,index),hasBarcode=(item.label.barcodes||[]).some(barcodeHasValue);
      const hasTextObjects=(item.label.textObjects||[]).some(o=>text(o?.text));
      if(!item.label.fields.length&&!hasBarcode&&!hasTextObjects){
        const title=item.report.sourceName||`標籤 ${index+1}`;
        throw new Error(`${title} 沒有可安全寫入 BTW 的文字或條碼內容`)
      }
      labels.push(item.label);labelReports.push(item.report)
    }
    const report={
      acceptedTotal:labelReports.reduce((n,x)=>n+x.accepted,0),
      pendingTotal:labelReports.reduce((n,x)=>n+x.pending,0),
      hiddenTotal:labelReports.reduce((n,x)=>n+x.hidden,0),
      graphicsPendingTotal:labelReports.reduce((n,x)=>n+(x.graphicsPending||0),0),
      labels:labelReports
    };
    return{result:{...(result||{}),labels},report}
  }

  function install(){
    const native=window.LabelWorkbenchBtwNative;
    if(!native?.downloadFromAnalysis||native.__productionGateWrapped)return false;
    const base=native.downloadFromAnalysis.bind(native);
    native.downloadFromAnalysis=async function(result,files,onProgress){
      const prepared=prepareResult(result);lastReport=prepared.report;
      if(prepared.report.pendingTotal>0)onProgress?.(`已略過 ${prepared.report.pendingTotal} 個待核對欄位，正在建立 BTW…`);
      return base(prepared.result,files,onProgress)
    };
    native.__productionGateWrapped=true;
    return true
  }

  let installed=install();
  if(!installed){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      installed=install()||installed;
      if(installed||tries>80)clearInterval(timer)
    },50)
  }

  window.LabelWorkbenchBtwProductionGate={
    BUILD,cloneField,cloneLabel,fallbackState,stateFor,refineLabel,validBox,overlapRatio,reliableTextObject,productionTextObjects,classifyLabel,prepareResult,install,
    get installed(){return installed||!!window.LabelWorkbenchBtwNative?.__productionGateWrapped},
    get lastReport(){return lastReport}
  };
  console.info('[Label Workbench] BTW production safety gate',BUILD);
})();
