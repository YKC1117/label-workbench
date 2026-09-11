/* Label Workbench view-state guard v1.0
 * Keeps the user's selected workspace visible when delayed modules finish loading.
 */
(function(){
  'use strict';
  const BUILD='20260911-view-guard-100';
  let desiredView=document.querySelector('.view.active')?.id||'barcode';
  let applying=false;
  let queued=false;

  function validView(id){
    return !!id && !!document.getElementById(id) && document.getElementById(id).classList.contains('view');
  }

  function enforce(){
    queued=false;
    if(applying||!validView(desiredView))return;
    const activeViews=[...document.querySelectorAll('.view.active')];
    const activeNav=[...document.querySelectorAll('[data-view].active')];
    const viewOk=activeViews.length===1&&activeViews[0].id===desiredView;
    const navOk=activeNav.length>0&&activeNav.every(el=>el.dataset.view===desiredView);
    if(viewOk&&navOk)return;

    applying=true;
    try{
      document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===desiredView));
      document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===desiredView));
    }finally{
      applying=false;
    }
  }

  function scheduleEnforce(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(enforce);
  }

  function remember(id){
    if(!validView(id))return;
    desiredView=id;
    scheduleEnforce();
    setTimeout(enforce,80);
    setTimeout(enforce,300);
  }

  function wrapShowView(){
    const base=window.showView;
    if(typeof base!=='function'||base.__lwViewGuardWrapped)return false;
    function guardedShowView(id){
      if(validView(id))desiredView=id;
      const result=base.apply(this,arguments);
      scheduleEnforce();
      return result;
    }
    guardedShowView.__lwViewGuardWrapped=true;
    window.showView=guardedShowView;
    return true;
  }

  document.addEventListener('click',function(event){
    const btn=event.target.closest?.('[data-view]');
    if(btn?.dataset?.view)remember(btn.dataset.view);
  },true);

  const observer=new MutationObserver(function(mutations){
    if(applying)return;
    if(mutations.some(m=>m.type==='attributes'&&m.attributeName==='class'))scheduleEnforce();
  });
  observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});

  if(!wrapShowView()){
    let tries=0;
    const timer=setInterval(function(){
      tries++;
      if(wrapShowView()||tries>100)clearInterval(timer);
    },50);
  }

  window.LabelWorkbenchViewGuard={BUILD,get activeView(){return desiredView;},enforce,remember};
  console.info('[Label Workbench] view-state guard',BUILD);
})();
