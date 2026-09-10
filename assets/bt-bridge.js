/* Label Workbench Quick Analysis -> BT Quick Production bridge v1.1 */
(function(){
  'use strict';
  const BUILD='20260910-btb110';
  let latestResult=null,latestFiles=[];

  const el=id=>document.getElementById(id);
  const fileNames=files=>[...(files||[])].map(f=>f?.name||'').filter(Boolean);
  const ext=file=>(file?.name?.split('.').pop()||'').toLowerCase();

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
    const out=el('analysisResult');if(!out||!latestResult?.labels?.length)return;
    let actions=out.querySelector('.analysis-actions');
    if(!actions){actions=document.createElement('div');actions.className='analysis-actions bt-bridge-actions';out.insertBefore(actions,out.firstChild)}
    if(el('analysisSendBt'))return;
    const oldPrimary=el('analysisCopyProduction');oldPrimary?.classList.remove('primary');oldPrimary?.classList.add('ghost');
    const button=document.createElement('button');
    button.id='analysisSendBt';button.type='button';button.className='btn primary';button.textContent='→ 送到 BT 快速製作';
    button.addEventListener('click',sendToBt);actions.insertBefore(button,actions.firstChild);
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
    api.analyze=async function(files){const arr=[...(files||[])],result=await base(arr);return stage(result,arr)};
    api.__btQuickBridgeWrapped=true;return true;
  }

  function tableResult(headers,rows,sourceName){
    const names=(headers||[]).map((h,i)=>String(h||'').trim()||`FIELD_${i+1}`);
    const labels=(rows||[]).filter(row=>(row||[]).some(v=>String(v??'').trim()!=='')).slice(0,500).map((row,i)=>({
      sourceName,page:1,index:i+1,
      fields:names.map((name,col)=>({code:'',name,value:String(row?.[col]??''),repeat:2,spatial:false,conflict:false})).filter(f=>f.value!==''),
      barcodes:[],marks:[]
    }));
    return{files:1,pages:1,labels,tableSource:true};
  }

  async function parseTableFiles(files){
    const targets=[...(files||[])].filter(f=>['csv','xls','xlsx'].includes(ext(f)));
    if(targets.length!==1)return null;
    const file=targets[0],kind=ext(file);
    if(kind==='csv'){
      const text=(await file.text()).replace(/^\uFEFF/,'');
      const parse=window.LabelWorkbenchParsers?.parseCsvLine;
      if(typeof parse!=='function')return null;
      const lines=text.split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return null;
      const rows=lines.map(parse),headers=rows.shift()||[];return tableResult(headers,rows,file.name);
    }
    const XLSX=window.XLSX;if(!XLSX?.read||!XLSX?.utils?.sheet_to_json)return null;
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const sheetName=wb.SheetNames?.[0];if(!sheetName)return null;
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:false,blankrows:false});
    if(!rows.length)return null;const headers=rows.shift()||[];return tableResult(headers,rows,file.name);
  }

  function wireParsers(){
    const api=window.LabelWorkbenchParsers;
    if(!api?.analyze)return false;
    if(api.__btQuickBridgeWrapped)return true;
    const base=api.analyze.bind(api);
    api.analyze=async function(files){
      const arr=[...(files||[])],result=await base(arr);
      try{const table=await parseTableFiles(arr);if(table?.labels?.length)stage(table,arr)}catch(err){console.warn('[Label Workbench] BT table bridge skipped',err)}
      return result;
    };
    api.__btQuickBridgeWrapped=true;return true;
  }

  function init(){
    wireInterpreter();wireParsers();
    let tries=0;const timer=setInterval(()=>{tries++;const a=wireInterpreter(),b=wireParsers();if((a&&b)||tries>80)clearInterval(timer)},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.LabelWorkbenchBtBridge={BUILD,stage,sendToBt,injectAction,wireInterpreter,wireParsers,tableResult,parseTableFiles,get latestResult(){return latestResult}};
})();