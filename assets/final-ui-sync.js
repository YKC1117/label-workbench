/* Label Workbench final UI sync v1.0 */
(function(){
  'use strict';
  const VERSION='v1.9.13';
  const BUILD='20260911-final-ui-sync-100';
  function sync(){
    const small=document.querySelector('.brand small');
    if(small)small.textContent=`標籤製作工作台 · ${VERSION}`;
    const note=document.querySelector('#analysis .warn-note');
    if(note)note.innerHTML='<b>快速分析：</b>PDF／圖片先用 PDF 原文、同欄位條碼、OCR 與版面位置交叉比對；有衝突就保留待核對，不會硬塞進 BTW。';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view]'))setTimeout(sync,0)});
  setTimeout(sync,500);setTimeout(sync,1500);
  window.LabelWorkbenchFinalUiSync={VERSION,BUILD,sync};
})();
