/* Label Workbench Quick Analysis -> BarTender bridge v2.0
 * PDF/image: keep the latest analysis in memory and hand it to the editable BTW generator.
 * CSV/Excel: retain the optional structured data-pack path.
 */
(function(){
  'use strict';

  const BUILD='20260911-btb200-editable-btw-primary';
  const BT_QUICK_SRC='assets/bt-quick.js?v=20260911-bt140-table-only';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let latestResult=null,latestFiles=[],latestFileNames=[],zipPromise=null,btQuickPromise=null;

  const el=id=>document.getElementById(id);
  const fileNames=files=>[...(files||[])].map(f=>f?.name||'').filter(Boolean);
  const ext=file=>(file?.name?.split('.').pop()||'').toLowerCase();
  const isMedia=file=>!!(file?.type?.startsWith?.('image/')||file?.type==='application/pdf'||/\.(jpe?g|png|webp|gif|bmp|pdf)$/i.test(file?.name||''));
  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const toast=msg=>{if(typeof window.toast==='function')window.toast(msg)};

  function isMediaResult(){return !!(latestResult?.labels?.length&&latestFiles.some(isMedia)&&!latestResult?.tableSource)}
  function openBt(){const btn=document.querySelector('.nav [data-view="bartender"],.mobile-nav [data-view="bartender"]');if(btn)btn.click();else window.showView?.('bartender')}

  function ensureBtQuick(){
    const ready=window.LabelWorkbenchBtQuick;
    if(ready?.receiveAnalysis&&ready?.buildDataCsv)return Promise.resolve(ready);
    if(btQuickPromise)return btQuickPromise;
    btQuickPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=BT_QUICK_SRC+'&t='+Date.now();
      script.async=false;
      script.dataset.btQuickRecovery='true';
      script.onload=()=>{const api=window.LabelWorkbenchBtQuick;if(api?.receiveAnalysis&&api?.buildDataCsv)resolve(api);else reject(new Error('BT Quick API missing after reload'))};
      script.onerror=()=>reject(new Error('BT Quick script reload failed'));
      document.head.appendChild(script);
    }).finally(()=>{btQuickPromise=null});
    return btQuickPromise
  }

  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
  function downloadCsvFallback(api,draft){const csv=api?.buildDataCsv?.(draft)||'';if(!csv)return false;downloadBlob(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}),'BT_Data.csv');return true}
  function loadZip(){if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)});return zipPromise}
  async function downloadProductionPack(api,draft){
    if(!api||!draft)return{ok:false,type:'none'};
    try{
      const JSZip=await loadZip(),zip=new JSZip();
      zip.file('BT_Data.csv','\uFEFF'+api.buildDataCsv(draft));
      zip.file('BT_Field_Map.csv','\uFEFF'+api.buildFieldMapCsv(draft));
      zip.file('BT_Barcode_Map.csv','\uFEFF'+api.buildBarcodeMapCsv(draft));
      zip.file('BT_製作說明.txt','\uFEFF'+api.buildReadme(draft));
      zip.file('BT_Open.cmd',api.buildOpenCmd(draft));
      zip.file('BT_WorkPack.json',JSON.stringify(draft,null,2));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
      const base=safeFile([draft.settings?.customer,draft.settings?.labelName].filter(Boolean).join('_')||draft.sourceFiles?.[0]?.replace(/\.[^.]+$/,'')||'Label');
      downloadBlob(blob,`BT_製作包_${base}.zip`);
      return{ok:true,type:'zip'}
    }catch(err){
      console.warn('[Label Workbench] BT ZIP export failed, falling back to CSV',err);
      return downloadCsvFallback(api,draft)?{ok:true,type:'csv',error:err}:{ok:false,type:'none',error:err}
    }
  }

  async function sendToBt(){
    if(!latestResult?.labels?.length){toast('目前沒有可送出的分析結果');return false}
    if(isMediaResult()){
      const native=window.LabelWorkbenchBtNativePrimary;
      if(native?.downloadEditable)return native.downloadEditable();
      toast('可編輯 BTW 元件尚未載入，請稍後再按一次');
      return false
    }
    const button=el('analysisSendBt');if(button){button.disabled=true;button.textContent='正在建立 BT 資料包…'}
    try{
      const api=await ensureBtQuick(),draft=api.receiveAnalysis(latestResult,latestFileNames,{silent:true});
      const exported=await downloadProductionPack(api,draft);
      if(exported.ok)toast(exported.type==='zip'?'BT 資料包已下載':'已下載 BT_Data.csv');
      return exported.ok
    }catch(err){
      console.error('[Label Workbench] BT table pack failed',err);toast('BT 資料包建立失敗：'+(err?.message||err));return false
    }finally{if(button){button.disabled=false;button.textContent='→ 建立 BT 資料包'}}
  }

  function clearMediaLegacyUi(){
    el('analysisBtDirect')?.remove();
    el('btDirectImport')?.remove();
    document.querySelectorAll('[data-bt-direct-hint]').forEach(n=>n.remove());
  }
  function injectAction(){
    const out=el('analysisResult');if(!out||!latestResult?.labels?.length)return;
    let actions=out.querySelector('.analysis-actions');
    if(!actions){actions=document.createElement('div');actions.className='analysis-actions bt-bridge-actions';out.insertBefore(actions,out.firstChild)}
    const oldPrimary=el('analysisCopyProduction');oldPrimary?.classList.remove('primary');oldPrimary?.classList.add('ghost');
    if(isMediaResult()){
      clearMediaLegacyUi();
      el('analysisSendBt')?.remove();
    }else{
      let dataButton=el('analysisSendBt');
      if(!dataButton){dataButton=document.createElement('button');dataButton.id='analysisSendBt';dataButton.type='button';dataButton.addEventListener('click',sendToBt);actions.appendChild(dataButton)}
      dataButton.className='btn primary';dataButton.textContent='→ 建立 BT 資料包';
    }
  }
  function decorateBtPage(){
    clearMediaLegacyUi();
    if(isMediaResult()) window.LabelWorkbenchBtNativePrimary?.refresh?.();
  }

  function stage(result,files){
    if(!result?.labels?.length)return result;
    latestResult=result;latestFiles=[...(files||[])];latestFileNames=fileNames(latestFiles);
    injectAction();
    window.dispatchEvent(new CustomEvent('labelworkbench:bt-stage',{detail:{media:isMediaResult(),labels:latestResult.labels.length}}));
    setTimeout(decorateBtPage,0);
    return result
  }
  function wireInterpreter(){
    const api=window.LabelWorkbenchInterpreter;if(!api?.analyze)return false;if(api.__btQuickBridgeWrapped)return true;
    const base=api.analyze.bind(api);
    api.analyze=async function(files){const arr=[...(files||[])],result=await base(arr);return stage(result,arr)};
    api.__btQuickBridgeWrapped=true;return true
  }
  function tableResult(headers,rows,sourceName){const names=(headers||[]).map((h,i)=>String(h||'').trim()||`FIELD_${i+1}`),labels=(rows||[]).filter(row=>(row||[]).some(v=>String(v??'').trim()!=='')).slice(0,500).map((row,i)=>({sourceName,page:1,index:i+1,fields:names.map((name,col)=>({code:'',name,value:String(row?.[col]??''),repeat:2,spatial:false,conflict:false})).filter(f=>f.value!==''),barcodes:[],marks:[]}));return{files:1,pages:1,labels,tableSource:true}}
  async function parseTableFiles(files){
    const targets=[...(files||[])].filter(f=>['csv','xls','xlsx'].includes(ext(f)));if(targets.length!==1)return null;
    const file=targets[0],kind=ext(file);
    if(kind==='csv'){
      const text=(await file.text()).replace(/^\uFEFF/,''),parse=window.LabelWorkbenchParsers?.parseCsvLine;if(typeof parse!=='function')return null;
      const lines=text.split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return null;
      const rows=lines.map(parse),headers=rows.shift()||[];return tableResult(headers,rows,file.name)
    }
    const XLSX=window.XLSX;if(!XLSX?.read||!XLSX?.utils?.sheet_to_json)return null;
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false}),sheetName=wb.SheetNames?.[0];if(!sheetName)return null;
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:false,blankrows:false});if(!rows.length)return null;
    const headers=rows.shift()||[];return tableResult(headers,rows,file.name)
  }
  function wireParsers(){
    const api=window.LabelWorkbenchParsers;if(!api?.analyze)return false;if(api.__btQuickBridgeWrapped)return true;
    const base=api.analyze.bind(api);
    api.analyze=async function(files){const arr=[...(files||[])],result=await base(arr);try{const table=await parseTableFiles(arr);if(table?.labels?.length)stage(table,arr)}catch(err){console.warn('[Label Workbench] BT table bridge skipped',err)}return result};
    api.__btQuickBridgeWrapped=true;return true
  }
  function init(){
    wireInterpreter();wireParsers();
    let tries=0;const timer=setInterval(()=>{tries++;const a=wireInterpreter(),b=wireParsers();if((a&&b)||tries>80)clearInterval(timer)},100);
    document.querySelectorAll('[data-view="bartender"]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(decorateBtPage,0)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.LabelWorkbenchBtBridge={BUILD,stage,sendToBt,injectAction,decorateBtPage,ensureBtQuick,wireInterpreter,wireParsers,tableResult,parseTableFiles,downloadProductionPack,isMediaResult,get latestResult(){return latestResult},get latestFiles(){return latestFiles}};
})();
