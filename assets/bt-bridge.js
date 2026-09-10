/* Label Workbench Quick Analysis -> BT Quick Production bridge v1.3
 * One click creates a real downloadable BT production pack.
 * If the BT module is missing, the bridge retries it instead of asking the user to refresh.
 */
(function(){
  'use strict';

  const BUILD='20260910-btb130';
  const BT_QUICK_SRC='assets/bt-quick.js?v=20260910-bt130-retry';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let latestResult=null,latestFiles=[],zipPromise=null,btQuickPromise=null;

  const el=id=>document.getElementById(id);
  const fileNames=files=>[...(files||[])].map(f=>f?.name||'').filter(Boolean);
  const ext=file=>(file?.name?.split('.').pop()||'').toLowerCase();
  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const toast=msg=>{if(typeof window.toast==='function')window.toast(msg)};

  function openBt(){
    const btn=document.querySelector('.nav [data-view="bartender"],.mobile-nav [data-view="bartender"]');
    if(btn)btn.click();else if(typeof window.showView==='function')window.showView('bartender');
    try{window.LabelWorkbenchBtQuick?.safeRender?.()}catch(err){console.warn('[BT bridge] render skipped',err)}
  }

  function ensureBtQuick(){
    const ready=window.LabelWorkbenchBtQuick;
    if(ready?.receiveAnalysis&&ready?.buildDataCsv)return Promise.resolve(ready);
    if(btQuickPromise)return btQuickPromise;
    btQuickPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=BT_QUICK_SRC+'&t='+Date.now();script.async=false;script.dataset.btQuickRecovery='true';
      script.onload=()=>{const api=window.LabelWorkbenchBtQuick;if(api?.receiveAnalysis&&api?.buildDataCsv)resolve(api);else reject(new Error('BT Quick API missing after reload'))};
      script.onerror=()=>reject(new Error('BT Quick script reload failed'));
      document.head.appendChild(script)
    }).finally(()=>{btQuickPromise=null});
    return btQuickPromise
  }

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)
  }
  function downloadCsvFallback(api,draft){const csv=api?.buildDataCsv?.(draft)||'';if(!csv)return false;downloadBlob(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}),'BT_Data.csv');return true}
  function loadZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;
    zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)});
    return zipPromise
  }
  async function downloadProductionPack(api,draft){
    if(!api||!draft)return{ok:false,type:'none'};
    try{
      const JSZip=await loadZip(),zip=new JSZip();
      zip.file('BT_Data.csv','\uFEFF'+api.buildDataCsv(draft));zip.file('BT_Field_Map.csv','\uFEFF'+api.buildFieldMapCsv(draft));zip.file('BT_Barcode_Map.csv','\uFEFF'+api.buildBarcodeMapCsv(draft));
      zip.file('BT_製作說明.txt','\uFEFF'+api.buildReadme(draft));zip.file('BT_Open.cmd',api.buildOpenCmd(draft));zip.file('BT_WorkPack.json',JSON.stringify(draft,null,2));
      zip.file('請放入公司BT母版.txt','請將最接近的公司 BarTender 母版 .btw 放在此資料夾，再雙擊 BT_Open.cmd。\r\n建議母版檔名：'+api.templateBaseName(draft)+'\r\nBT_Open.cmd 不會自動列印。');
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),base=safeFile([draft.settings?.customer,draft.settings?.labelName].filter(Boolean).join('_')||draft.sourceFiles?.[0]?.replace(/\.[^.]+$/,'')||'Label');
      downloadBlob(blob,`BT_製作包_${base}.zip`);return{ok:true,type:'zip'}
    }catch(err){console.warn('[Label Workbench] BT ZIP auto export failed, falling back to CSV',err);return downloadCsvFallback(api,draft)?{ok:true,type:'csv',error:err}:{ok:false,type:'none',error:err}}
  }

  async function sendToBt(){
    if(!latestResult?.labels?.length){toast('目前沒有可送出的分析結果');return false}
    const button=el('analysisSendBt');if(button){button.disabled=true;button.textContent='正在建立 BT 製作包…'}
    try{
      const api=await ensureBtQuick(),draft=api.receiveAnalysis(latestResult,latestFiles,{silent:true});
      openBt();const exported=await downloadProductionPack(api,draft);
      if(exported.ok&&exported.type==='zip')toast('BT 製作包已自動下載');else if(exported.ok)toast('ZIP 建立失敗，已改下載 BT_Data.csv');else toast('下載失敗，請到 BT 快速製作頁下載 BT_Data.csv');
      return exported.ok
    }catch(err){console.error('[Label Workbench] BT Quick recovery failed',err);toast('BT 元件載入失敗，分析結果仍保留；請稍後再按一次');return false}
    finally{if(button){button.disabled=false;button.textContent='→ 建立 BT 製作包（自動下載）'}}
  }

  function injectAction(){
    const out=el('analysisResult');if(!out||!latestResult?.labels?.length)return;
    let actions=out.querySelector('.analysis-actions');if(!actions){actions=document.createElement('div');actions.className='analysis-actions bt-bridge-actions';out.insertBefore(actions,out.firstChild)}
    if(el('analysisSendBt'))return;
    const oldPrimary=el('analysisCopyProduction');oldPrimary?.classList.remove('primary');oldPrimary?.classList.add('ghost');
    const button=document.createElement('button');button.id='analysisSendBt';button.type='button';button.className='btn primary';button.textContent='→ 建立 BT 製作包（自動下載）';button.addEventListener('click',sendToBt);actions.insertBefore(button,actions.firstChild)
  }
  function stage(result,files){
    if(!result?.labels?.length)return result;latestResult=result;latestFiles=fileNames(files);
    const api=window.LabelWorkbenchBtQuick;if(api?.receiveAnalysis){try{api.receiveAnalysis(result,latestFiles,{silent:true})}catch(err){console.warn('[BT bridge] pre-stage skipped',err)}}
    injectAction();return result
  }
  function wireInterpreter(){
    const api=window.LabelWorkbenchInterpreter;if(!api?.analyze)return false;if(api.__btQuickBridgeWrapped)return true;
    const base=api.analyze.bind(api);api.analyze=async function(files){const arr=[...(files||[])],result=await base(arr);return stage(result,arr)};api.__btQuickBridgeWrapped=true;return true
  }
  function tableResult(headers,rows,sourceName){
    const names=(headers||[]).map((h,i)=>String(h||'').trim()||`FIELD_${i+1}`);
    const labels=(rows||[]).filter(row=>(row||[]).some(v=>String(v??'').trim()!=='')).slice(0,500).map((row,i)=>({sourceName,page:1,index:i+1,fields:names.map((name,col)=>({code:'',name,value:String(row?.[col]??''),repeat:2,spatial:false,conflict:false})).filter(f=>f.value!==''),barcodes:[],marks:[]}));
    return{files:1,pages:1,labels,tableSource:true}
  }
  async function parseTableFiles(files){
    const targets=[...(files||[])].filter(f=>['csv','xls','xlsx'].includes(ext(f)));if(targets.length!==1)return null;const file=targets[0],kind=ext(file);
    if(kind==='csv'){const text=(await file.text()).replace(/^\uFEFF/,'');const parse=window.LabelWorkbenchParsers?.parseCsvLine;if(typeof parse!=='function')return null;const lines=text.split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return null;const rows=lines.map(parse),headers=rows.shift()||[];return tableResult(headers,rows,file.name)}
    const XLSX=window.XLSX;if(!XLSX?.read||!XLSX?.utils?.sheet_to_json)return null;const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false}),sheetName=wb.SheetNames?.[0];if(!sheetName)return null;
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:false,blankrows:false});if(!rows.length)return null;const headers=rows.shift()||[];return tableResult(headers,rows,file.name)
  }
  function wireParsers(){
    const api=window.LabelWorkbenchParsers;if(!api?.analyze)return false;if(api.__btQuickBridgeWrapped)return true;
    const base=api.analyze.bind(api);api.analyze=async function(files){const arr=[...(files||[])],result=await base(arr);try{const table=await parseTableFiles(arr);if(table?.labels?.length)stage(table,arr)}catch(err){console.warn('[Label Workbench] BT table bridge skipped',err)}return result};api.__btQuickBridgeWrapped=true;return true
  }
  function init(){wireInterpreter();wireParsers();let tries=0;const timer=setInterval(()=>{tries++;const a=wireInterpreter(),b=wireParsers();if((a&&b)||tries>80)clearInterval(timer)},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.LabelWorkbenchBtBridge={BUILD,stage,sendToBt,injectAction,ensureBtQuick,wireInterpreter,wireParsers,tableResult,parseTableFiles,downloadProductionPack,get latestResult(){return latestResult}};
})();