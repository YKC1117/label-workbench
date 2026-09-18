/* Label Workbench editable BTW handoff v2.3
 * PDF/image Quick Analysis -> BarTender 2022 editable .BTW as the primary production output.
 * The output is a real BTW document opened by BarTender, not a flattened image.
 */
(function(){
  'use strict';

  const BUILD='20260918-btnp230-website-only-ux';
  const FORMAT_SRC='assets/btw-format.js?v=20260911-btw011';
  const NATIVE_SRC='assets/btw-native.js?v=20260911-btwn321-safe-base64';
  const PRODUCTION_SRC='assets/btw-production-core.js?v=20260918-btwpc100';
  const COPY_SRC='assets/analysis-copy.js?v=20260911-analysis-copy-100';
  let formatPromise=null,nativePromise=null,productionPromise=null,copyPromise=null;

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
    if(window.LabelWorkbenchBtwNative?.generateOne)return window.LabelWorkbenchBtwNative;
    if(nativePromise)return nativePromise;
    nativePromise=(async()=>{await ensureFormat();return loadScript(NATIVE_SRC,()=>window.LabelWorkbenchBtwNative,'BTW native')})().finally(()=>{nativePromise=null});return nativePromise
  }
  async function ensureProduction(){
    if(window.LabelWorkbenchBtwProductionCore?.downloadFromAnalysis)return window.LabelWorkbenchBtwProductionCore;
    if(productionPromise)return productionPromise;
    productionPromise=(async()=>{
      await ensureNative();
      return loadScript(PRODUCTION_SRC,()=>window.LabelWorkbenchBtwProductionCore,'BTW production core');
    })().finally(()=>{productionPromise=null});
    return productionPromise
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
      const api=await ensureProduction();
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
    native.className='btn primary';if(!native.disabled&&native.textContent!=='→ 下載可編輯 .BTW')native.textContent='→ 下載可編輯 .BTW';
    let hint=out.querySelector('[data-bt-native-hint]');
    if(!hint){hint=document.createElement('div');hint.dataset.btNativeHint='true';hint.className='footer-note';actions.insertAdjacentElement('afterend',hint)}
    if(!hint.innerHTML)hint.innerHTML='<b>分析完成：</b>網站會直接建立 BarTender <code>.btw</code> 成品。按上方按鈕下載即可，不需要另外安裝網站工具；下載後只要用 BarTender 2022 開啟。'
  }

  function decorateBt(){
    const section=el('bartender');if(!section)return;
    removeImageUi(section);
    const title=section.querySelector('.bt-title');if(title)title.textContent='下載可編輯 BTW';
    const intro=title?.nextElementSibling;if(intro)intro.textContent='PDF／圖片完成快速分析後，網站直接建立 BarTender 2022 可編輯 .BTW；不需要另外下載或安裝其他網站工具。';
    let actions=section.querySelector('.case-actions');
    if(!actions&&section.querySelector('.panel')){actions=document.createElement('div');actions.className='case-actions';section.querySelector('.panel').appendChild(actions)}
    if(actions){
      let native=el('btNativeDownload');
      if(hasMediaResult()){
        if(!native){native=makeButton('btNativeDownload','下載可編輯 .BTW',downloadEditable);actions.appendChild(native)}
        native.className='btn primary';if(!native.disabled&&native.textContent!=='下載可編輯 .BTW')native.textContent='下載可編輯 .BTW'
      }else if(native)native.remove()
    }
    const flow=section.querySelector('.workflow');
    if(flow)flow.innerHTML='<span>客戶 PDF / 圖片</span><b>→</b><span>網站快速分析</span><b>→</b><span>下載可編輯 .BTW</span><b>→</b><span>BarTender 2022 開啟</span>';
    const note=section.querySelector('.workflow')?.parentElement?.querySelector('.note');
    if(note)note.innerHTML='<b>工作方式：</b>分析與 BTW 建立都在網站內完成；唯一需要下載的是最後的 <code>.btw</code> 成品。未確認欄位不會亂寫進正式檔。'
  }
  function syncHeader(){
    if(document.querySelector('.view.active')?.id!=='bartender')return;
    const t=el('pageTitle'),s=el('pageSub');if(t)t.textContent='下載可編輯 BTW';if(s)s.textContent='PDF／圖片先在網站完成快速分析，再直接下載 BarTender 2022 可編輯 .BTW。'
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

  window.LabelWorkbenchBtNativePrimary={BUILD,ensureCopy,ensureFormat,ensureNative,ensureProduction,downloadEditable,decorateAnalysis,decorateBt,refresh};
})();
