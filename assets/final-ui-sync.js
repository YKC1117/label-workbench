/* Label Workbench final UI sync v1.2
 * IMPORTANT: version / modified time are owned by index.html only.
 * This helper must never rewrite .brand small, otherwise a cached loader can wash the visible build marker back.
 */
(function(){
  'use strict';
  const BUILD='20260911-final-ui-sync-120-no-version-write';
  function sync(){
    const note=document.querySelector('#analysis .warn-note');
    if(note)note.innerHTML='<b>快速分析：</b>PDF／圖片先用 PDF 原文、同欄位條碼、OCR 與版面位置交叉比對；有衝突就保留待核對，不會硬塞進 BTW。';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view]'))setTimeout(sync,0)});
  window.LabelWorkbenchFinalUiSync={BUILD,sync};
})();
