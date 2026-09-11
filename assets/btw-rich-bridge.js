/* Label Workbench rich BTW production bridge v0.1.0 */
(function(){
  'use strict';
  const BUILD='20260911-btw-rich-bridge-100';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let zipPromise=null;
  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  function loadZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;
    zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)}).finally(()=>{zipPromise=null});
    return zipPromise
  }
  function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800)}
  async function richDownload(result,files,onProgress){
    const R=window.LabelWorkbenchBtwRichNative,labels=(result?.labels||[]).slice(0,20);if(!labels.length)throw new Error('目前沒有可建立 BTW 的分析結果');
    const outputs=[];for(let i=0;i<labels.length;i++){onProgress?.(`正在建立多物件可編輯 BTW ${i+1}/${labels.length}`);outputs.push(await R.generateOne(labels[i],i))}
    if(outputs.length===1){saveBlob(new Blob([outputs[0].bytes],{type:'application/octet-stream'}),outputs[0].name);return{ok:true,type:'btw',count:1,outputs,rich:true}}
    const JSZip=await loadZip(),zip=new JSZip();for(const out of outputs)zip.file(out.name,out.bytes);
    zip.file('README.txt','Label Workbench rich BTW output. Text fields and supported barcode objects are independent editable BarTender objects. Open in BarTender and verify content/layout before printing.');
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),base=safeFile(String(labels[0]?.sourceName||files?.[0]?.name||'Label').replace(/\.[^.]+$/,''));saveBlob(blob,`BT_Editable_${base}.zip`);
    return{ok:true,type:'zip',count:outputs.length,outputs,rich:true}
  }
  function install(){
    const N=window.LabelWorkbenchBtwNative,R=window.LabelWorkbenchBtwRichNative;if(!N?.downloadFromAnalysis||!R?.canGenerate||N.__richDonorWrapped)return false;
    const fallback=N.downloadFromAnalysis.bind(N);
    N.downloadFromAnalysis=async function(result,files,onProgress){
      const labels=(result?.labels||[]).slice(0,20);
      if(labels.length&&labels.every(x=>R.canGenerate(x))){
        try{return await richDownload(result,files,onProgress)}catch(err){console.warn('[Label Workbench] rich BTW fallback to CEA',err)}
      }
      return fallback(result,files,onProgress)
    };
    N.__richDonorWrapped=true;return true
  }
  const ok=install();
  window.LabelWorkbenchBtwRichBridge={BUILD,install,richDownload,installed:ok};
})();
