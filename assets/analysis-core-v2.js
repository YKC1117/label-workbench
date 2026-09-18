/* Label Workbench deterministic Quick Analysis core v2.
 * One explicit pipeline: interpret -> refine -> geometry -> render -> stage.
 * Does not call the wrapper-mutated Interpreter.analyze() chain.
 */
(function(){
  'use strict';

  const BUILD='20260918-analysis-core-v2-200';
  let generation=0;
  let latestResult=null;
  let latestFiles=[];

  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function mediaFile(f){
    return !!(f?.type?.startsWith?.('image/')||f?.type==='application/pdf'||/\.(jpe?g|png|webp|gif|bmp|pdf)$/i.test(f?.name||''));
  }

  function progress(msg){
    const out=el('analysisResult');if(!out)return;
    out.innerHTML='<div class="scan-working"><div class="scan-spinner"></div><b>正在完整讀取客戶原稿</b><span>'+esc(msg||'處理中…')+'</span><small>依序執行原稿辨識、條碼交叉比對與位置分析。</small></div>';
  }

  function requireApi(name,api,method){
    if(!api||typeof api[method]!=='function')throw new Error(name+' 元件未就緒');
    return api;
  }

  async function run(files){
    const arr=[...(files||[])].filter(Boolean);
    const my=++generation;
    if(!arr.length)throw new Error('沒有收到檔案');
    if(!arr.every(mediaFile))throw new Error('Analysis Core v2 僅處理 PDF／圖片');

    const I=requireApi('原稿辨識',window.LabelWorkbenchInterpreter,'interpretFiles');
    requireApi('結果顯示',I,'renderResult');

    progress('1/6 原稿辨識中…');
    let result=await I.interpretFiles(arr,msg=>{if(my===generation)progress(msg)});
    if(my!==generation)return result;

    progress('2/6 清理 OCR 邊界與欄位…');
    window.LabelWorkbenchAnalysisAccuracy?.refineResult?.(result);

    progress('3/6 讀取 PDF 原文與欄位一致性…');
    if(window.LabelWorkbenchPdfNative?.refine)result=await window.LabelWorkbenchPdfNative.refine(arr,result)||result;
    window.LabelWorkbenchFieldConsistency?.refineResult?.(result);

    progress('4/6 條碼交叉比對…');
    window.LabelWorkbenchBarcodeCrosscheck?.refineResult?.(result);
    window.LabelWorkbenchConfidenceGuard?.refine?.(result);

    progress('5/6 定位欄位與條碼位置…');
    if(window.LabelWorkbenchAnalysisGeometry?.refine)result=await window.LabelWorkbenchAnalysisGeometry.refine(arr,result)||result;
    if(my!==generation)return result;

    progress('6/6 整理結果…');
    I.renderResult(arr,result);
    window.LabelWorkbenchFinalDisplay?.enforce?.(result);
    window.LabelWorkbenchAnalysisCopy?.decorate?.();

    latestResult=result;
    latestFiles=arr.slice();

    // Stage only after the final result exists. BTW never participates in OCR/refinement.
    window.LabelWorkbenchBtBridge?.stage?.(result,arr);
    window.LabelWorkbenchBtNativePrimary?.refresh?.();

    console.info('[Label Workbench] deterministic analysis core complete',BUILD,{
      files:arr.length,
      labels:result?.labels?.length||0
    });
    return result
  }

  window.LabelWorkbenchAnalysisCoreV2={
    BUILD,run,mediaFile,
    get latestResult(){return latestResult},
    get latestFiles(){return latestFiles.slice()},
    get generation(){return generation}
  };
})();