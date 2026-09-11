/* Label Workbench editable BTW handoff v2.1
 * PDF/image Quick Analysis -> BarTender 2022 editable .BTW as the primary production output.
 * The output is a real BTW document opened by BarTender, not a flattened image.
 */
(function(){
  'use strict';

  const BUILD='20260911-btnp210-editable-btw-copy';
  const FORMAT_SRC='assets/btw-format.js?v=20260911-btw011';
  const NATIVE_SRC='assets/btw-native.js?v=20260911-btwn321-safe-base64';
  const COPY_SRC='assets/analysis-copy.js?v=20260911-analysis-copy-100';
  let formatPromise=null,nativePromise=null,copyPromise=null;

  const el=id=>document.getElementById(id);
  const toast=msg=>{if(typeof window.toast==='function')window.toast(msg)};

  function loadScript(src,test,tag){
    if(test())return Promise.resolve(test());
    return new Promise((resolve,reject)=>{
      const old=document.querySelector(`script[data-bt-native-loader="${tag}"]`);if(old)old.remove();
      const s=document.createElement('script');s.src=src+'&t='+Date.now();s.async=false;s.dataset.btNativeLoader=tag;
      s.onload=()=>test()?resolve(test()):reject(new Error(`${tag} 元件載入不完整`));
      s.onerror=()=>reject(new Error(`${tag} 元件載入失敗`));document.head.appendChild(s)
    })
  }
  function ensureCopy(){
    if(window.LabelWorkbenchAnalysisCopy?.decorate)return Promise.resolve(window.LabelWorkbenchAnalysisCopy);
    if(copyPromise)return copyPromise;
    copyPromise=loadScript(COPY_SRC,()=>window.LabelWorkbenchAnalysisCopy,'analysis copy').finally(()=>{copyPromise=null});return copyPromise
  }
  function ensureFormat(){
    if(window.LabelWorkbenchBtwFormat?.inflateContainer)return Promise.resolve(window.LabelWorkbenchBtwFormat);
    if(formatPromise)return formatPromise;
    formatPromise=loadScript(FORMAT_SRC,()=>window.LabelWorkbenchBtwFormat,'BTW format').finally(()=>{formatPromise=null});return formatPromise
  }
  async function ensureNative(){
    if(window.LabelWorkbenchBtwNative?.downloadFromAnalysis)return window.LabelWorkbenchBtwNative;
    if(nativePromise)return nativePromise;
    nativePromise=(async()=>{await ensureFormat();return loadScript(NATIVE_SRC,()=>window.LabelWorkbenchBtwNative,'BTW native')})().finally(()=>{nativePromise=null});return nativePromise
  }

  function bridge(){return window.LabelWorkbenchBtBridge}
  function hasMediaResult(){
    const b=bridge();
    return !!(b?.latestResult?.labels?.length&&b?.latestFiles?.some?.(f=>f?.type?.startsWith?.('image/')||f?.type==='application/pdf'||/\.(jpe?g|png|webp|gif|bmp|pdf)$/i.test(f?.name||''))&&!b.latestResult?.tableSource)
  }

  async function downloadEditable(){
    const b=bridge();
    if(!b?.latestResult?.labels?.length||!hasMediaResult()){toast('請先用 PDF／圖片完成快速分析');return false}
    const buttons=[el('analysisBtNative'),el('btNativeDownload')].filter(Boolean);
    buttons.forEach(x=>{x.disabled=true;x.dataset.oldText=x.textContent;x.textContent='正在建立可編輯 .BTW…'});
    try{
      const api=await ensureNative();
      const out=await api.downloadFromAnalysis(b.latestResult,b.latestFiles,msg=>buttons.forEach(x=>x.textContent=msg||'正在建立可編輯 .BTW…'));
      if(out?.ok)toast(out.count>1?`已建立 ${out.count} 個 BarTender .BTW`:'可編輯 .BTW 已下載');
      return !!out?.ok
    }catch(err){
      console.error('[Label Workbench] editable BTW generation failed',err);
      toast('可編輯 .BTW 建立停止：'+(err?.message||err));return false
    }finally{
      buttons.forEach(x=>{x.disabled=false;x.textContent=x.dataset.oldText||'下載可編輯 .BTW';delete x.dataset.oldText})
    }
  }

  function makeButton(id,text,handler){const b=document.createElement('button');b.id=id;b.type='button';b.className='btn primary';b.textContent=text;b.addEventListener('click',handler);return b}
  function removeImageUi(root=document){
    root.querySelectorAll?.('#analysisBtDirect,#btDirectImport,[data-bt-direct-hint]').forEach?.(n=>n.remove());
  }
  function decorateAnalysis(){
    ensureCopy().then(api=>api?.decorate?.()).catch(()=>{});
    if(!hasMediaResult())return;
    const out=el('analysisResult');if(!out)return;
    let actions=out.querySelector('.analysis-actions');
    if(!actions){actions=document.createElement('div');actions.className='analysis-actions bt-bridge-actions';out.insertBefore(actions,out.firstChild)}
    removeImageUi(out);
    el('analysisSendBt')?.remove();
    let native=el('analysisBtNative');
    if(!native){native=makeButton('analysisBtNative','→ 下載可編輯 .BTW',downloadEditable);actions.insertBefore(native,actions.firstChild)}
    native.className='btn primary';native.textContent='→ 下載可編輯 .BTW';
    let hint=out.querySelector('[data-bt-native-hint]');
    if(!hint){hint=document.createElement('div');hint.dataset.btNativeHint='true';hint.className='footer-note';actions.insertAdjacentElement('afterend',hint)}
    hint.innerHTML='<b>給 BarTender 使用：</b>下載的是 <code>.btw</code> BarTender 文件。請在 BarTender 用「檔案 → 開啟」開啟，文字／條碼物件可再編輯；不是匯入 PNG/JPG。'
  }

  function decorateBt(){
    const section=el('bartender');if(!section)return;
    removeImageUi(section);
    const title=section.querySelector('.bt-title');if(title)title.textContent='BT 快速製作';
    const intro=title?.nextElementSibling;if(intro)intro.textContent='客戶 PDF／圖片完成快速分析後，產生 BarTender 2022 可編輯 .BTW。下載後直接在 BarTender 用「檔案 → 開啟」開啟並修改文字、條碼等物件。';
    let actions=section.querySelector('.case-actions');
    if(!actions&&section.querySelector('.panel')){actions=document.createElement('div');actions.className='case-actions';section.querySelector('.panel').appendChild(actions)}
    if(actions){
      let native=el('btNativeDownload');
      if(hasMediaResult()){
        if(!native){native=makeButton('btNativeDownload','下載可編輯 .BTW',downloadEditable);actions.appendChild(native)}
        native.className='btn primary';native.textContent='下載可編輯 .BTW'
      }else if(native)native.remove()
    }
    const flow=section.querySelector('.workflow');
    if(flow)flow.innerHTML='<span>客戶 PDF / 圖片</span><b>→</b><span>快速分析</span><b>→</b><span>建立可編輯 .BTW</span><b>→</b><span>BarTender 檔案→開啟</span><b>→</b><span>編輯／測印</span>';
    const note=section.querySelector('.workflow')?.parentElement?.querySelector('.note');
    if(note)note.innerHTML='<b>工作方式：</b>網站輸出的是 BarTender <code>.btw</code> 文件，不輸出圖片當正式製作檔。未辨識到的內容不會亂補假資料，開啟後請依客戶原稿核對位置與條碼。'
  }
  function syncHeader(){
    if(document.querySelector('.view.active')?.id!=='bartender')return;
    const t=el('pageTitle'),s=el('pageSub');if(t)t.textContent='BT 快速製作';if(s)s.textContent='PDF／圖片 → BarTender 2022 可編輯 .BTW；下載後用「檔案 → 開啟」直接編輯。'
  }
  function refresh(){decorateAnalysis();decorateBt();syncHeader()}
  function init(){
    ensureCopy().then(api=>api?.decorate?.()).catch(()=>{});
    refresh();
    const target=el('analysisResult');if(target&&typeof MutationObserver==='function')new MutationObserver(()=>setTimeout(refresh,0)).observe(target,{childList:true,subtree:true});
    window.addEventListener('labelworkbench:bt-stage',()=>setTimeout(refresh,0));
    document.querySelectorAll('[data-view="bartender"]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(refresh,10)));
    let tries=0;const timer=setInterval(()=>{tries++;refresh();if(tries>30)clearInterval(timer)},150);
    console.info('[Label Workbench] editable BTW primary handoff',BUILD)
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.LabelWorkbenchBtNativePrimary={BUILD,ensureCopy,ensureFormat,ensureNative,downloadEditable,decorateAnalysis,decorateBt,refresh};
})();
