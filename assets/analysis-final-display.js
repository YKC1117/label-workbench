/* Label Workbench analysis race-safe final display stabilizer v1.9.39 - 2026/09/14 10:20 */
(function(){
  'use strict';
  const BUILD='20260914-v139-race-safe-display';
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  let lastResult=null;
  let patching=false;
  let generation=0;
  let latestGoodHTML=null;
  let latestGoodView=null;

  function removeDuplicateEvidence(){
    const host=document.getElementById('analysisResult');
    if(!host)return;
    host.querySelectorAll('.analysis-table tbody tr').forEach(row=>{
      const cells=row.querySelectorAll('td');
      if(cells.length<3)return;
      const content=cells[1];
      const main=norm(content.querySelector('strong')?.textContent||'');
      if(!main)return;
      content.querySelectorAll('small').forEach(node=>{
        const text=String(node.textContent||'').trim();
        if(!/^另讀到\s*[:：]/.test(text))return;
        const raw=text.replace(/^另讀到\s*[:：]\s*/,'').trim();
        const parts=raw.split(/\s*\/\s*/).map(norm).filter(Boolean);
        if(parts.length&&parts.every(v=>v===main))node.remove();
      });
    });
  }

  function activeView(){return document.querySelector('.view.active')?.id||null}
  function snapshot(){const h=document.getElementById('analysisResult');return h?h.innerHTML:null}
  function restore(html,view){
    if(html!==null){const h=document.getElementById('analysisResult');if(h)h.innerHTML=html}
    if(view){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===view));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}
  }

  function enforce(result=lastResult){
    if(patching||!result)return;
    patching=true;
    try{
      const guard=window.LabelWorkbenchConfidenceGuard;
      guard?.refine?.(result);
      guard?.patchDom?.(result);
      removeDuplicateEvidence();
    }finally{patching=false}
  }

  function install(){
    const A=window.LabelWorkbenchInterpreter;
    if(!A?.analyze||A.__finalDisplayWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){
      const my=++generation;
      const previousHTML=latestGoodHTML??snapshot();
      const previousView=latestGoodView??activeView();
      const result=await base(files);
      if(my!==generation){
        restore(latestGoodHTML??previousHTML,latestGoodView??previousView);
        return result;
      }
      lastResult=result;
      enforce(result);
      latestGoodHTML=snapshot();
      latestGoodView=activeView();
      return result;
    };
    A.__finalDisplayWrapped=true;
    A.__finalDisplayBuild=BUILD;
    window.LabelWorkbenchFinalDisplay={BUILD,enforce,removeDuplicateEvidence,generation:()=>generation};
    console.info('[Label Workbench] race-safe final display stabilizer',BUILD);
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>250)clearInterval(timer)},80);
  }
})();
