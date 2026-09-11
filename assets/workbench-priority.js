/* Label Workbench priority controller v1.9.14
 * Stable navigation + Quick Analysis + editable BTW production copy.
 */
(function(){
  'use strict';

  const BUILD='20260911-v214-nav-race-fix';
  const VERSION='v1.9.14';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const isImage=f=>!!(f?.type?.startsWith?.('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));
  const isPdf=f=>/\.pdf$/i.test(f?.name||'')||f?.type==='application/pdf';
  const headerCopy={
    barcode:['條碼工具','常用條碼優先，直接產生、讀取與驗證一維碼、二維碼。'],
    analysis:['快速分析','把客戶 PDF／圖片整理成可製作內容，完成後可直接建立可編輯 BTW。'],
    bartender:['BT 快速製作','PDF／圖片 → 可編輯 BarTender 2022 .BTW；下載後直接用 BarTender 開啟修改。'],
    dashboard:['工作台','查看需要注意的製作工作與暫存紀錄。'],
    cases:['案件紀錄','選用的工作紀錄區；需要跨裝置接續或特別追蹤時再使用。']
  };

  function setVersion(){const small=document.querySelector('.brand small');if(small)small.textContent=`標籤製作工作台 · ${VERSION}`}
  function injectUiRefresh(){if(document.querySelector('link[data-lw-ui-refresh]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=`assets/ui-refresh.css?v=${BUILD}`;link.dataset.lwUiRefresh='true';document.head.appendChild(link)}
  function reorderNav(){
    const order=['barcode','analysis','bartender','dashboard','cases'];
    const desktopLabels={barcode:'▥ 條碼工具',analysis:'⚡ 快速分析',bartender:'🖨️ BT 快速製作',dashboard:'🏠 工作台',cases:'📂 案件紀錄'};
    const mobileLabels={barcode:'條碼',analysis:'分析',bartender:'BT 製作',dashboard:'工作台',cases:'案件'};
    document.querySelectorAll('.nav,.mobile-nav').forEach(nav=>{
      order.forEach(id=>{const btn=nav.querySelector(`[data-view="${id}"]`);if(btn)nav.appendChild(btn)});
      order.forEach(id=>{const btn=nav.querySelector(`[data-view="${id}"]`);if(btn)btn.textContent=nav.classList.contains('mobile-nav')?(mobileLabels[id]||btn.textContent):(desktopLabels[id]||btn.textContent)});
    })
  }
  function syncHeaderCopy(){const active=document.querySelector('.view.active')?.id,copy=headerCopy[active];if(!copy)return;const title=el('pageTitle'),sub=el('pageSub');if(title)title.textContent=copy[0];if(sub)sub.textContent=copy[1]}
  function bindHeaderCopy(){document.querySelectorAll('[data-view]').forEach(btn=>{if(btn.dataset.priorityHeaderBound==='true')return;btn.dataset.priorityHeaderBound='true';btn.addEventListener('click',()=>setTimeout(()=>{setVersion();syncHeaderCopy();},0))})}
  function preserveActiveView(){
    const active=document.querySelector('.view.active');
    if(active){
      document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===active.id));
      syncHeaderCopy();
      return active.id;
    }
    const fallback='barcode';
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===fallback));
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===fallback));
    syncHeaderCopy();
    return fallback;
  }
  function waitFor(getter,timeout=10000){const start=Date.now();return new Promise(resolve=>{const tick=()=>{const value=getter();if(value)return resolve(value);if(Date.now()-start>=timeout)return resolve(null);setTimeout(tick,80)};tick()})}

  async function appendBarcodeAnalysis(files){
    const images=[...files].filter(isImage).slice(0,8);if(!images.length)return;
    const out=el('analysisResult');if(!out)return;
    const core=await waitFor(()=>window.LabelWorkbenchBarcodeCore,7000);if(!core||typeof core.scanFile!=='function')return;
    out.querySelector('[data-quick-barcode="true"]')?.remove();
    const box=document.createElement('div');box.className='analysis-label-card';box.dataset.quickBarcode='true';box.innerHTML='<div class="analysis-label-head"><div><span>圖片條碼</span><h3>正在讀取</h3></div></div>';out.appendChild(box);
    const hits=[];for(const file of images){try{const result=await core.scanFile(file);(result?.results||[]).forEach(r=>hits.push({file:file.name,...r}))}catch(err){console.warn('[Label Workbench] quick barcode scan failed',file.name,err)}}
    box.innerHTML=hits.length?`<div class="analysis-label-head"><div><span>圖片條碼</span><h3>額外掃描結果</h3></div><div class="analysis-label-count">${hits.length} 個</div></div><section><div class="table-scroll"><table class="analysis-table"><thead><tr><th>檔案</th><th>類型</th><th>內容</th></tr></thead><tbody>${hits.map(r=>`<tr><td>${esc(r.file)}</td><td>${esc(r.format||'條碼')}</td><td><strong class="mono">${esc(core.visibleText?core.visibleText(r.text):r.text)}</strong></td></tr>`).join('')}</tbody></table></div></section>`:'<div class="analysis-empty subtle">這些圖片沒有額外讀到可確認的條碼內容。</div>'
  }
  async function runQuickAnalysis(files){
    const arr=[...files],out=el('analysisResult');if(!out)return;if(!arr.length){out.textContent='等待檔案';return}
    out.innerHTML='<div class="scan-working"><div class="scan-spinner"></div><b>正在準備快速分析</b><small>讀取客戶檔案中</small></div>';
    const parsers=await waitFor(()=>window.LabelWorkbenchParsers,10000);
    try{
      const allMedia=arr.every(f=>isPdf(f)||isImage(f));
      if(allMedia){const interpreter=await waitFor(()=>window.LabelWorkbenchInterpreter,10000);if(interpreter?.analyze)await interpreter.analyze(arr);else if(parsers?.analyze)await parsers.analyze(arr);else throw new Error('原稿解析元件未載入')}
      else if(parsers&&typeof parsers.analyze==='function'){await parsers.analyze(arr);await appendBarcodeAnalysis(arr)}
      else throw new Error('快速分析元件未載入')
    }catch(err){console.error('[Label Workbench] quick analysis failed',err);out.innerHTML=`<div class="note warn-note"><b>快速分析失敗：</b>${esc(err?.message||err)}<br>請重新選擇檔案再試一次。</div>`}
    finally{setVersion()}
  }
  function bindQuickAnalysis(){const input=el('analysisFiles');if(!input||input.dataset.priorityBound==='true')return;input.dataset.priorityBound='true';input.addEventListener('change',async e=>{const files=[...(e.target.files||[])];await runQuickAnalysis(files);e.target.value=''})}
  function cleanupBtRecords(){const queue=el('bartenderQueue');if(queue){queue.innerHTML='';const panel=queue.closest('.panel');if(panel){panel.classList.add('hidden','bt-records-panel');panel.setAttribute('aria-hidden','true');panel.style.display='none'}}document.querySelectorAll('#bartender .panel').forEach(panel=>{const text=(panel.textContent||'').replace(/\s+/g,'');if(text.includes('可接續的BT製作紀錄')){panel.classList.add('hidden','bt-records-panel');panel.setAttribute('aria-hidden','true');panel.style.display='none'}})}
  function updateCopy(){
    setVersion();
    const analysis=el('analysis'),drop=analysis?.querySelector('.drop > p');if(drop)drop.textContent='PDF、圖片、Excel、Word、CSV 直接丟進來；PDF／圖片分析完成後可下載可編輯 .BTW。';
    const note=analysis?.querySelector('.warn-note');if(note)note.innerHTML='<b>快速分析：</b>PDF／圖片會自動讀取可製作內容；完成後使用「下載可編輯 BTW (.btw)」進 BarTender 繼續修改。';
    const bt=el('bartender'),btTitle=bt?.querySelector('.bt-title');if(btTitle)btTitle.textContent='BT 快速製作';
    const btIntro=btTitle?.nextElementSibling;if(btIntro)btIntro.textContent='此頁不放舊案件資料。先到「快速分析」處理客戶 PDF／圖片，再直接下載 BarTender 2022 可編輯 .BTW。';
    cleanupBtRecords();
    const flow=bt?.querySelector('.workflow');if(flow)flow.innerHTML='<span>客戶 PDF / 圖片</span><b>→</b><span>快速分析</span><b>→</b><span>建立可編輯 .BTW</span><b>→</b><span>BarTender 開啟編輯</span><b>→</b><span>測印</span>';
    const btNote=flow?.parentElement?.querySelector('.note');if(btNote)btNote.innerHTML='<b>輸出：</b>正式工作輸出 <code>.btw</code>，不是 PNG/JPG 圖片。未辨識到的資料不會亂補假值。';
    syncHeaderCopy()
  }
  function init(){injectUiRefresh();reorderNav();bindHeaderCopy();bindQuickAnalysis();preserveActiveView();updateCopy();setTimeout(()=>{preserveActiveView();updateCopy()},250);setTimeout(()=>{preserveActiveView();updateCopy()},1000);console.info('[Label Workbench] priority controller',BUILD)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.LabelWorkbenchPriority={runQuickAnalysis,reorderNav,setVersion,updateCopy,cleanupBtRecords,preserveActiveView,build:BUILD};
})();
