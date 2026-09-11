/* Label Workbench BTW production safety gate v1.0
 * Keeps Quick Analysis confidence decisions aligned with production output.
 * Fields shown as pending/review in Quick Analysis are never silently written into BTW.
 */
(function(){
  'use strict';

  const BUILD='20260911-btw-production-gate-100';
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

  function classifyLabel(label,index=0){
    const working=refineLabel(label),accepted=[],pending=[],hidden=[];
    for(const field of working.fields||[]){
      if(field?.__finalHidden){hidden.push({name:fieldName(field),value:text(field?.value)});continue}
      const state=stateFor(field),entry={name:fieldName(field),value:text(field?.value),state:state[0],label:state[1]};
      if(state[0]==='pending'){pending.push(entry);continue}
      if(entry.value)accepted.push(field);
    }
    const output={...working,fields:accepted};
    return{
      label:output,
      report:{index,sourceName:text(label?.sourceName),accepted:accepted.length,pending:pending.length,hidden:hidden.length,pendingFields:pending,hiddenFields:hidden,barcodes:(working.barcodes||[]).filter(barcodeHasValue).length}
    }
  }

  function prepareResult(result){
    const labels=[],labelReports=[];
    for(const [index,label] of (result?.labels||[]).entries()){
      const item=classifyLabel(label,index),hasBarcode=(item.label.barcodes||[]).some(barcodeHasValue);
      if(!item.label.fields.length&&!hasBarcode){
        const title=item.report.sourceName||`標籤 ${index+1}`;
        throw new Error(`${title} 沒有可安全寫入 BTW 的已確認欄位或條碼`)
      }
      labels.push(item.label);labelReports.push(item.report)
    }
    const report={
      acceptedTotal:labelReports.reduce((n,x)=>n+x.accepted,0),
      pendingTotal:labelReports.reduce((n,x)=>n+x.pending,0),
      hiddenTotal:labelReports.reduce((n,x)=>n+x.hidden,0),
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
    BUILD,cloneField,cloneLabel,fallbackState,stateFor,refineLabel,classifyLabel,prepareResult,install,
    get installed(){return installed||!!window.LabelWorkbenchBtwNative?.__productionGateWrapped},
    get lastReport(){return lastReport}
  };
  console.info('[Label Workbench] BTW production safety gate',BUILD);
})();
