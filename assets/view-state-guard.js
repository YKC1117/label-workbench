/* Label Workbench view-state guard v1.1 */
(function(){
  'use strict';
  const BUILD='20260914-view-guard-126-barcode-crosscheck';
  const RELEASE='v1.9.37';
  const UPDATED='2026/09/14 09:45';
  let desiredView=document.querySelector('.view.active')?.id||'barcode';
  let applying=false;
  let queued=false;
  function stampRelease(){const marker=document.querySelector('.brand small');if(marker)marker.innerHTML='標籤製作工作台 · '+RELEASE+'<br>更新：'+UPDATED;}
  function validView(id){return !!id&&!!document.getElementById(id)&&document.getElementById(id).classList.contains('view')}
  function enforce(){queued=false;if(applying||!validView(desiredView))return;const activeViews=[...document.querySelectorAll('.view.active')],activeNav=[...document.querySelectorAll('[data-view].active')],viewOk=activeViews.length===1&&activeViews[0].id===desiredView,navOk=activeNav.length>0&&activeNav.every(el=>el.dataset.view===desiredView);if(viewOk&&navOk)return;applying=true;try{document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===desiredView));document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===desiredView))}finally{applying=false}}
  function request(id){if(validView(id))desiredView=id;stampRelease();if(!queued){queued=true;requestAnimationFrame(enforce)}}
  function install(){if(window.LabelWorkbenchViewGuard)return false;document.addEventListener('click',e=>{const t=e.target.closest?.('[data-view]');if(t)request(t.dataset.view)},true);const observer=new MutationObserver(()=>{if(!applying){if(!validView(desiredView))desiredView='barcode';if(!queued){queued=true;requestAnimationFrame(enforce)}}});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});stampRelease();requestAnimationFrame(enforce);window.LabelWorkbenchViewGuard={BUILD,RELEASE,UPDATED,request,install};return true}
  install();
})();
