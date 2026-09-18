/* Label Workbench early Quick Analysis input bridge v1.9.45.
 * Capture the selected File objects immediately; do not depend on the late module-loader chain
 * to bind the <input type="file"> change event.
 */
(function(){
  'use strict';

  const BUILD='20260918-analysis-entry-146-core-v2';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let generation=0;

  function waitFor(getter,timeout=15000){
    const start=Date.now();
    return new Promise(resolve=>{
      const tick=()=>{
        let value=null;
        try{value=getter()}catch{}
        if(value)return resolve(value);
        if(Date.now()-start>=timeout)return resolve(null);
        setTimeout(tick,60);
      };
      tick();
    });
  }

  function showQueued(files){
    const out=el('analysisResult');
    if(!out)return;
    const names=[...files].map(f=>f?.name||'未命名檔案').filter(Boolean);
    out.innerHTML='<div class="scan-working"><div class="scan-spinner"></div><b>已收到檔案，正在啟動快速分析</b><span>'+esc(names.join('、'))+'</span><small>正在載入 PDF／OCR／條碼交叉比對與 BTW 分析元件，檔案不會因模組尚未載完而遺失。</small></div>';
  }

  function showFailure(err){
    const out=el('analysisResult');
    if(!out)return;
    out.innerHTML='<div class="note warn-note"><b>快速分析無法啟動：</b>'+esc(err?.message||err||'未知錯誤')+'<br>請重新整理頁面後再選一次檔案。</div>';
  }

  function stackReady(){
    const loader=window.LabelWorkbenchModuleLoader;
    const core=window.LabelWorkbenchAnalysisCoreV2;
    const priority=window.LabelWorkbenchPriority;
    if(loader?.ready===true&&core?.run&&priority?.runQuickAnalysis)return {core,priority};
    return null;
  }

  async function dispatch(files){
    const arr=[...files].filter(Boolean);
    const my=++generation;
    if(!arr.length){
      const out=el('analysisResult');
      if(out)out.textContent='等待檔案';
      return;
    }

    showQueued(arr);

    let stack=await waitFor(stackReady,15000);
    if(my!==generation)return;

    const allMedia=arr.every(f=>/\.pdf$/i.test(f?.name||'')||f?.type==='application/pdf'||f?.type?.startsWith?.('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));

    if(stack?.core?.run&&allMedia){
      return stack.core.run(arr);
    }
    if(stack?.priority?.runQuickAnalysis){
      return stack.priority.runQuickAnalysis(arr);
    }

    // Safe fallback: keep media on the deterministic core if it exists; non-media stays on document parsers.
    if(allMedia&&window.LabelWorkbenchAnalysisCoreV2?.run){
      console.warn('[Label Workbench] loader readiness timed out; using deterministic analysis core');
      return window.LabelWorkbenchAnalysisCoreV2.run(arr);
    }
    if(window.LabelWorkbenchPriority?.runQuickAnalysis){
      console.warn('[Label Workbench] loader readiness timed out; using priority document route');
      return window.LabelWorkbenchPriority.runQuickAnalysis(arr);
    }

    const parsers=await waitFor(()=>window.LabelWorkbenchParsers?.analyze?window.LabelWorkbenchParsers:null,3000);
    if(my!==generation)return;
    if(parsers?.analyze)return parsers.analyze(arr);

    throw new Error('快速分析元件載入逾時');
  }

  function bind(){
    const input=el('analysisFiles');
    if(!input)return false;
    if(input.dataset.analysisEntryBound==='true')return true;

    input.dataset.analysisEntryBound='true';
    // The late priority controller treats this marker as "already bound".
    input.dataset.priorityBound='true';

    input.addEventListener('change',event=>{
      const target=event.currentTarget||event.target||input;
      const files=[...(target.files||[])];
      if(!files.length)return;

      // Copy File references before clearing the native input so the same file can be chosen again.
      showQueued(files);
      try{target.value=''}catch{}

      Promise.resolve(dispatch(files)).catch(err=>{
        console.error('[Label Workbench] early analysis entry failed',err);
        showFailure(err);
      });
    });
    return true;
  }

  function boot(){
    if(bind())return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(bind()||tries>100)clearInterval(timer);
    },50);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  window.LabelWorkbenchAnalysisEntry={BUILD,bind,dispatch,stackReady,generation:()=>generation};
})();