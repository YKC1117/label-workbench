/* Label Workbench view-state guard v1.4 — explicit-navigation only; version text is owned by index.html. */
(function(){
  'use strict';
  const BUILD='20260918-view-guard-145-index-owned-version';
  let desiredView=document.querySelector('.view.active')?.id||'barcode';
  let applying=false;
  let queued=false;
  let wrapped=false;

  function stampRelease(){
    // Deliberately read-only: index.html is the single owner of the visible release marker.
    return document.querySelector('.brand small')?.textContent||'';
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
      if(validView(id))setDesired(id);
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
        const target=m.target;
        if(target?.classList?.contains('view') || target?.matches?.('[data-view]')){relevant=true;break}
      }
      if(relevant)schedule();
    });
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});

    stampRelease();
    wrapShowView();
    schedule();
    window.LabelWorkbenchViewGuard={BUILD,request(id){setDesired(id);schedule()},install};
    return true;
  }
  install();
})();
