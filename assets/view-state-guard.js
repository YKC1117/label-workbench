/* Label Workbench view-state guard v1.2 — prevents view rollback without fighting legitimate navigation. */
(function(){
  'use strict';
  const BUILD='20260914-view-guard-130-state-rollback-fix';
  const RELEASE='v1.9.38';
  const UPDATED='2026/09/14 10:05';
  let desiredView=document.querySelector('.view.active')?.id||'barcode';
  let applying=false;
  let queued=false;
  let wrapped=false;

  function stampRelease(){
    const marker=document.querySelector('.brand small');
    if(marker)marker.innerHTML='標籤製作工作台 · '+RELEASE+'<br>更新：'+UPDATED;
  }
  function validView(id){
    return !!id&&!!document.getElementById(id)&&document.getElementById(id).classList.contains('view');
  }
  function setDesired(id){
    if(validView(id))desiredView=id;
  }
  function enforce(){
    queued=false;
    if(applying||!validView(desiredView))return;
    const activeViews=[...document.querySelectorAll('.view.active')];
    const activeNav=[...document.querySelectorAll('[data-view].active')];
    const viewOk=activeViews.length===1&&activeViews[0].id===desiredView;
    const navOk=activeNav.length===0||activeNav.every(el=>el.dataset.view===desiredView);
    if(viewOk&&navOk)return;
    applying=true;
    try{
      document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===desiredView));
      document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===desiredView));
    }finally{applying=false}
  }
  function schedule(){
    if(!queued){
      queued=true;
      requestAnimationFrame(enforce);
    }
  }
  function wrapShowView(){
    if(wrapped||typeof window.showView!=='function')return false;
    const original=window.showView;
    window.showView=function(id){
      if(validView(id))desiredView=id;
      return original.apply(this,arguments);
    };
    wrapped=true;
    return true;
  }
  function install(){
    if(window.LabelWorkbenchViewGuard)return false;
    document.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-view]');
      if(t)setDesired(t.dataset.view);
    },true);

    wrapShowView();

    const observer=new MutationObserver(mutations=>{
      if(applying)return;
      let relevant=false;
      for(const m of mutations){
        const el=m.target;
        if(el?.classList?.contains('view') || el?.matches?.('[data-view]')){
          relevant=true;
          break;
        }
      }
      if(!relevant)return;

      /*
       * A real navigation can be initiated by code that does not call showView().
       * If exactly one view is active, accept that state as the new desired view.
       * This is deliberately deferred until the DOM mutation batch settles so the
       * guard never sees the intermediate half-switched state and rolls it back.
       */
      queueMicrotask(()=>{
        if(applying)return;
        const active=[...document.querySelectorAll('.view.active')];
        if(active.length===1&&validView(active[0].id)){
          desiredView=active[0].id;
          stampRelease();
        }
        schedule();
      });
    });
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});

    stampRelease();
    wrapShowView();
    schedule();
    window.LabelWorkbenchViewGuard={BUILD,RELEASE,UPDATED,request(id){setDesired(id);schedule()},install};
    return true;
  }
  install();
})();
