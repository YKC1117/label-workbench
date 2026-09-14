/* Label Workbench analysis race / view stabilizer v1.9.39 - 2026/09/14 10:20 */
(function(){
  'use strict';
  const BUILD='20260914-v139-race-guard';
  let generation=0;
  let latestSnapshot=null;
  const cloneHost=()=>{const h=document.getElementById('analysisResult');return h?h.innerHTML:null};
  const activeView=()=>document.querySelector('.view.active')?.id||null;
  const restore=(snap,view)=>{
    if(snap!==null){const h=document.getElementById('analysisResult');if(h)h.innerHTML=snap}
    if(view){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===view));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
  };
  function install(){
    const A=window.LabelWorkbenchInterpreter;
    if(!A?.analyze||A.__lwRaceGuard)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){
      const my=++generation;
      const snap=cloneHost(),view=activeView();
      const result=await base(files);
      if(my!==generation){restore(latestSnapshot||snap,view);return result}
      latestSnapshot=cloneHost();
      return result;
    };
    A.__lwRaceGuard=true;
    A.__lwRaceGuardBuild=BUILD;
    window.LabelWorkbenchAnalysisRaceGuard={BUILD,generation:()=>generation,isCurrent:n=>n===generation};
    console.info('[Label Workbench] race guard installed',BUILD);
    return true;
  }
  function boot(){if(install())return;let tries=0;const t=setInterval(()=>{if(install()||++tries>250)clearInterval(t)},80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
