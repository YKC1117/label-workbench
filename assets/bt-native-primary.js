/* Label Workbench editable BTW primary handoff v1.1
 * Promotes native editable .btw generation for PDF/image Quick Analysis.
 * Keeps PNG import and structured packs as fallbacks.
 */
(function(){
  'use strict';

  const BUILD='20260910-btnp110';
  const FORMAT_SRC='assets/btw-format.js?v=20260910-btw011';
  const NATIVE_SRC='assets/btw-native.js?v=20260910-btwn210';
  let formatPromise=null,nativePromise=null;

  const el=id=>document.getElementById(id);
  const toast=msg=>{if(typeof window.toast==='function')window.toast(msg)};

  function loadScript(src,test,tag){
    if(test())return Promise.resolve(test());
    return new Promise((resolve,reject)=>{
      const old=document.querySelector(`script[data-bt-native-loader="${tag}"]`);
      if(old)old.remove();
      const s=document.createElement('script');s.src=src+'&t='+Date.now();s.async=false;s.dataset.btNativeLoader=tag;
      s.onload=()=>test()?resolve(test()):reject(new Error(`${tag} 元件載入不完整`));
      s.onerror=()=>reject(new Error(`${tag} 元件載入失敗`));document.head.appendChild(s);
    });
  }
  function ensureFormat(){if(window.LabelWorkbenchBtwFormat?.inflateContainer)return Promise.resolve(window.LabelWorkbenchBtwFormat);if(formatPromise)return formatPromise;formatPromise=loadScript(FORMAT_SRC,()=>window.LabelWorkbenchBtwFormat,'BTW format').finally(()=>{formatPromise=null});return formatPromise}
  async function ensureNative(){if(window.LabelWorkbenchBtwNative?.downloadFromAnalysis)return window.LabelWorkbenchBtwNative;if(nativePromise)return nativePromise;nativePromise=(async()=>{await ensureFormat();return loadScript(NATIVE_SRC,()=>window.LabelWorkbenchBtwNative,'BTW native')})().finally(()=>{nativePromise=null});return nativePromise}

  function bridge(){return window.LabelWorkbenchBtBridge}
  function hasMediaResult(){const b=bridge();return !!(b?.latestResult?.labels?.length&&b?.latestFiles?.some?.(f=>f?.type?.startsWith?.('image/')||f?.type==='application/pdf'||/\.(jpe?g|png|webp|gif|bmp|pdf)$/i.test(f?.name||''))&&!b.latestResult?.tableSource)}

  async function downloadEditable(){
    const b=bridge();if(!b?.latestResult?.labels?.length||!hasMediaResult()){toast('請先用 PDF／圖片完成快速分析');return false}
    const buttons=[el('analysisBtNative'),el('btNativeDownload')].filter(Boolean);
    buttons.forEach(x=>{x.disabled=true;x.dataset.oldText=x.textContent;x.textContent='正在建立 BarTender 2022 可編輯 BTW…'});
    try{
      const api=await ensureNative(),out=await api.downloadFromAnalysis(b.latestResult,b.latestFiles,msg=>buttons.forEach(x=>x.textContent=msg||'正在建立 BarTender 2022 可編輯 BTW…'));
      if(out?.ok)toast(out.count>1?`已建立 ${out.count} 個 BarTender 2022 可編輯 BTW`:'BarTender 2022 可編輯 BTW 已下載');return !!out?.ok
    }catch(err){console.error('[Label Workbench] editable BTW generation failed',err);toast('可編輯 BTW 建立失敗：'+(err?.message||err));return false}
    finally{buttons.forEach(x=>{x.disabled=false;x.textContent=x.dataset.oldText||'下載可編輯 BTW';delete x.dataset.oldText})}
  }

  function makeButton(id,text,handler){const b=document.createElement('button');b.id=id;b.type='button';b.className='btn primary';b.textContent=text;b.addEventListener('click',handler);return b}

  function decorateAnalysis(){
    if(!hasMediaResult())return;
    const out=el('analysisResult'),actions=out?.querySelector('.analysis-actions');if(!out||!actions)return;
    let native=el('analysisBtNative');if(!native){native=makeButton('analysisBtNative','→ 下載可編輯 BTW',downloadEditable);actions.insertBefore(native,actions.firstChild)}native.className='btn primary';native.textContent='→ 下載可編輯 BTW';
    const png=el('analysisBtDirect');if(png){png.classList.remove('primary');png.classList.add('ghost');png.textContent='備用：下載 BT 匯入圖'}
    const pack=el('analysisSendBt');if(pack){pack.classList.remove('primary');pack.classList.add('ghost');pack.textContent='進階：下載 BT 資料包'}
    let hint=out.querySelector('[data-bt-native-hint]');if(!hint){hint=document.createElement('div');hint.dataset.btNativeHint='true';hint.className='footer-note';actions.insertAdjacentElement('afterend',hint)}
    hint.innerHTML='<b>主要流程：</b>直接產生 BarTender 2022 格式的 .btw；文字、Code 128、Data Matrix 保留原生可編輯物件。第一次給客戶前請確認尺寸與版面。';
    const old=out.querySelector('[data-bt-direct-hint]');if(old)old.style.display='none';
  }

  function decorateBt(){
    const section=el('bartender');if(!section)return;
    const title=section.querySelector('.bt-title');if(title)title.textContent='BT 快速製作';
    const intro=title?.nextElementSibling;if(intro)intro.textContent='PDF／圖片快速分析後，直接下載 BarTender 2022 可編輯 .btw；回公司開啟後再微調尺寸、字型與位置。';
    const host=section.querySelector('.btq-hero-actions');if(host&&hasMediaResult()){
      let native=el('btNativeDownload');if(!native){native=makeButton('btNativeDownload','下載可編輯 BTW',downloadEditable);host.insertBefore(native,host.firstChild)}native.className='btn primary';
      const png=el('btDirectImport');if(png){png.classList.remove('primary');png.classList.add('ghost');png.textContent='備用：下載匯入圖'}
    }
    const panels=section.querySelectorAll('.panel'),flow=panels?.[2]?.querySelector('.workflow');if(flow)flow.innerHTML='<span>客戶原稿</span><b>→</b><span>快速分析</span><b>→</b><span>下載可編輯 BTW</span><b>→</b><span>BarTender 微調</span><b>→</b><span>尺寸／測印</span>';
    const note=panels?.[2]?.querySelector('.note');if(note)note.innerHTML='<b>目前原生 BTW：</b>以官方 BarTender 2022 R5 CEA 結構為基底，支援文字、Code 128、Data Matrix；PNG 匯入與資料包保留當備用。';
  }

  function syncHeader(){const active=document.querySelector('.view.active')?.id;if(active!=='bartender')return;const t=el('pageTitle'),s=el('pageSub');if(t)t.textContent='BT 快速製作';if(s)s.textContent='快速分析後直接產生 BarTender 2022 可編輯 .btw，再到 BarTender 微調尺寸與版面。'}
  function refresh(){decorateAnalysis();decorateBt();syncHeader()}
  function init(){
    refresh();
    const target=el('analysisResult');if(target&&typeof MutationObserver==='function')new MutationObserver(()=>setTimeout(refresh,0)).observe(target,{childList:true,subtree:true});
    document.querySelectorAll('[data-view="bartender"]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(refresh,10)));
    let tries=0;const timer=setInterval(()=>{tries++;refresh();if(tries>80)clearInterval(timer)},120);
    console.info('[Label Workbench] editable BTW primary handoff',BUILD);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.LabelWorkbenchBtNativePrimary={BUILD,ensureFormat,ensureNative,downloadEditable,decorateAnalysis,decorateBt,refresh};
})();
