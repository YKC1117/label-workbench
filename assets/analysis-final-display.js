/* Label Workbench final analysis display stabilizer v1.0 */
(function(){
  'use strict';
  const BUILD='20260911-final-display-100';
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  let lastResult=null;
  let patching=false;

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

  function enforce(){
    if(patching||!lastResult)return;
    patching=true;
    try{
      const guard=window.LabelWorkbenchConfidenceGuard;
      guard?.refine?.(lastResult);
      guard?.patchDom?.(lastResult);
      removeDuplicateEvidence();
    }finally{patching=false}
  }

  function install(){
    const A=window.LabelWorkbenchInterpreter;
    if(!A?.analyze||A.__finalDisplayWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){
      const result=await base(files);
      lastResult=result;
      enforce();
      setTimeout(enforce,120);
      setTimeout(enforce,500);
      setTimeout(enforce,1200);
      return result;
    };
    A.__finalDisplayWrapped=true;
    console.info('[Label Workbench] final display stabilizer',BUILD);
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},80);
  }
  window.LabelWorkbenchFinalDisplay={BUILD,enforce,removeDuplicateEvidence};
})();
