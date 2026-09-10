/* Label Workbench Quick Analysis -> BT Quick Production bridge v1.0 */
(function(){
  'use strict';
  const BUILD='20260910-btb100';
  let latestResult=null,latestFiles=[];

  const el=id=>document.getElementById(id);
  const fileNames=files=>[...(files||[])].map(f=>f?.name||'').filter(Boolean);

  function openBt(){
    const btn=document.querySelector('.nav [data-view="bartender"],.mobile-nav [data-view="bartender"]');
    if(btn)btn.click();
    else if(typeof window.showView==='function')window.showView('bartender');
    window.LabelWorkbenchBtQuick?.render?.();
  }

  function sendToBt(){
    if(!latestResult?.labels?.length)return false;
    window.LabelWorkbenchBtQuick?.receiveAnalysis?.(latestResult,latestFiles,{silent:true});
    openBt();
    if(typeof window.toast==='function')window.toast('已帶入 BT 快速製作');
    return true;
  }

  function injectAction(){
    const actions=document.querySelector('#analysisResult .analysis-actions');
    if(!actions||el('analysisSendBt')||!latestResult?.labels?.length)return;
    const oldPrimary=el('analysisCopyProduction');
    oldPrimary?.classList.remove('primary');oldPrimary?.classList.add('ghost');
    const button=document.createElement('button');
    button.id='analysisSendBt';button.type='button';button.className='btn primary';
    button.textContent='→ 送到 BT 快速製作';
    button.addEventListener('click',sendToBt);
    actions.insertBefore(button,actions.firstChild);
  }

  function stage(result,files){
    if(!result?.labels?.length)return result;
    latestResult=result;latestFiles=fileNames(files);
    window.LabelWorkbenchBtQuick?.receiveAnalysis?.(result,latestFiles,{silent:true});
    injectAction();
    return result;
  }

  function wireInterpreter(){
    const api=window.LabelWorkbenchInterpreter;
    if(!api?.analyze)return false;
    if(api.__btQuickBridgeWrapped)return true;
    const base=api.analyze.bind(api);
    api.analyze=async function(files){
      const arr=[...(files||[])];
      const result=await base(arr);
      return stage(result,arr);
    };
    api.__btQuickBridgeWrapped=true;
    return true;
  }

  function init(){
    if(wireInterpreter())return;
    let tries=0;const timer=setInterval(()=>{tries++;if(wireInterpreter()||tries>80)clearInterval(timer)},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.LabelWorkbenchBtBridge={BUILD,stage,sendToBt,injectAction,wireInterpreter,get latestResult(){return latestResult}};
})();