/* Label Workbench priority controller v1.8.2
 * Keeps shared tools first, makes BT quick production the main engineering path,
 * and keeps Cases available as an optional secondary record area.
 * Does not change case data, localStorage format, Supabase tables, or attachment metadata.
 */
(function(){
  'use strict';

  const BUILD='20260910-v182';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const isImage=f=>!!(f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));
  const isPdf=f=>/\.pdf$/i.test(f?.name||'')||f?.type==='application/pdf';
  const headerCopy={
    barcode:['條碼工具','常用條碼優先，直接產生、讀取與驗證一維碼、二維碼。'],
    analysis:['快速分析','把客戶檔案整理成可回覆、可製作、可確認的內容。'],
    bartender:['BT 快速製作','PDF／圖片可直接輸出成 BarTender UltraLite 可匯入的 Label 圖檔。'],
    dashboard:['工作台','查看需要注意的製作工作與暫存紀錄。'],
    cases:['案件紀錄','選用的工作紀錄區；需要跨裝置接續或特別追蹤時再使用。']
  };

  function injectUiRefresh(){
    if(document.querySelector('link[data-lw-ui-refresh]'))return;
    const link=document.createElement('link');link.rel='stylesheet';link.href=`assets/ui-refresh.css?v=${BUILD}`;link.dataset.lwUiRefresh='true';document.head.appendChild(link);
  }

  function reorderNav(){
    const order=['barcode','analysis','bartender','dashboard','cases'];
    const desktopLabels={barcode:'▥ 條碼工具',analysis:'⚡ 快速分析',bartender:'🖨️ BT 快速製作',dashboard:'🏠 工作台',cases:'📂 案件紀錄'};
    const mobileLabels={barcode:'條碼',analysis:'分析',bartender:'BT 製作',dashboard:'工作台',cases:'案件'};
    document.querySelectorAll('.nav,.mobile-nav').forEach(nav=>{
      order.forEach(id=>{const btn=nav.querySelector(`[data-view="${id}"]`);if(btn)nav.appendChild(btn)});
      order.forEach(id=>{const btn=nav.querySelector(`[data-view="${id}"]`);if(!btn)return;btn.textContent=nav.classList.contains('mobile-nav')?(mobileLabels[id]||btn.textContent):(desktopLabels[id]||btn.textContent)});
    });
  }

  function syncHeaderCopy(){
    const active=document.querySelector('.view.active')?.id;
    const copy=headerCopy[active];
    if(!copy)return;
    const title=el('pageTitle'),sub=el('pageSub');
    if(title)title.textContent=copy[0];
    if(sub)sub.textContent=copy[1];
  }

  function bindHeaderCopy(){
    document.querySelectorAll('[data-view]').forEach(btn=>{
      if(btn.dataset.priorityHeaderBound==='true')return;
      btn.dataset.priorityHeaderBound='true';
      btn.addEventListener('click',()=>setTimeout(syncHeaderCopy,0));
    });
  }

  function openBarcodeFirst(){
    try{if(typeof window.showView==='function')window.showView('barcode');else{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='barcode'));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='barcode'))}}
    catch(err){console.warn('[Label Workbench] default barcode view failed',err)}
    syncHeaderCopy();
  }

  function waitFor(getter,timeout=10000){const start=Date.now();return new Promise(resolve=>{const tick=()=>{const value=getter();if(value)return resolve(value);if(Date.now()-start>=timeout)return resolve(null);setTimeout(tick,80)};tick()})}

  async function appendBarcodeAnalysis(files){
    const images=[...files].filter(isImage).slice(0,8);if(!images.length)return;const out=el('analysisResult');if(!out)return;
    const core=await waitFor(()=>window.LabelWorkbenchBarcodeCore,7000),box=document.createElement('div');box.className='analysis-label-card';box.dataset.quickBarcode='true';out.querySelector('[data-quick-barcode="true"]')?.remove();if(!core||typeof core.scanFile!=='function')return;
    box.innerHTML='<div class="analysis-label-head"><div><span>圖片條碼</span><h3>正在讀取</h3></div></div>';out.appendChild(box);const hits=[];
    for(const file of images){try{const result=await core.scanFile(file);(result?.results||[]).forEach(r=>hits.push({file:file.name,...r}))}catch(err){console.warn('[Label Workbench] quick barcode scan failed',file.name,err)}}
    box.innerHTML=hits.length?`<div class="analysis-label-head"><div><span>圖片條碼</span><h3>額外掃描結果</h3></div><div class="analysis-label-count">${hits.length} 個</div></div><section><div class="table-scroll"><table class="analysis-table"><thead><tr><th>檔案</th><th>類型</th><th>內容</th></tr></thead><tbody>${hits.map(r=>`<tr><td>${esc(r.file)}</td><td>${esc(r.format||'條碼')}</td><td><strong class="mono">${esc(core.visibleText?core.visibleText(r.text):r.text)}</strong></td></tr>`).join('')}</tbody></table></div></section>`:'<div class="analysis-empty subtle">這些圖片沒有額外讀到可確認的條碼內容。</div>';
  }

  async function runQuickAnalysis(files){
    const arr=[...files],out=el('analysisResult');if(!out)return;if(!arr.length){out.textContent='等待檔案';return}
    out.innerHTML='<div class="scan-working"><div class="scan-spinner"></div><b>正在準備快速分析</b><small>讀取客戶檔案中</small></div>';const parsers=await waitFor(()=>window.LabelWorkbenchParsers,10000);
    try{
      const allMedia=arr.every(f=>isPdf(f)||isImage(f));
      if(allMedia){const interpreter=await waitFor(()=>window.LabelWorkbenchInterpreter,10000);if(interpreter?.analyze)await interpreter.analyze(arr);else if(parsers?.analyze)await parsers.analyze(arr);else throw new Error('原稿解析元件未載入')}
      else if(parsers&&typeof parsers.analyze==='function'){await parsers.analyze(arr);await appendBarcodeAnalysis(arr)}
      else throw new Error('快速分析元件未載入');
    }catch(err){console.error('[Label Workbench] quick analysis failed',err);out.innerHTML=`<div class="note warn-note"><b>快速分析失敗：</b>${esc(err?.message||err)}<br>請重新選擇檔案再試一次；若內容本身不足，系統會列出同事需要向客戶補確認的資料。</div>`}
  }

  function bindQuickAnalysis(){
    const input=el('analysisFiles');
    if(!input||input.dataset.priorityBound==='true')return;
    input.dataset.priorityBound='true';
    input.addEventListener('change',async e=>{
      const files=[...(e.target.files||[])];
      await runQuickAnalysis(files);
      e.target.value='';
    });
  }

  function updateCopy(){
    const small=document.querySelector('.brand small');if(small)small.textContent='標籤製作工作台 · v1.8';
    const analysis=el('analysis'),drop=analysis?.querySelector('.drop > p');if(drop)drop.textContent='PDF、圖片、Excel、Word、CSV 直接丟進來，整理成可回覆、可製作、可確認的內容。';const note=analysis?.querySelector('.warn-note');if(note)note.innerHTML='<b>快速分析：</b>PDF／圖片會自動判斷方向、分標籤、讀欄位位置、補讀小字並交叉比對條碼；畫面只留下可製作內容與待確認項目。';

    const bt=el('bartender');
    const btTitle=bt?.querySelector('.bt-title');
    if(btTitle)btTitle.textContent='BT 快速製作';
    const btIntro=btTitle?.nextElementSibling;
    if(btIntro)btIntro.textContent='PDF／圖片快速分析後，可下載成 BarTender 可直接匯入的 PNG；開啟 BT 後直接拖入或使用「圖片 → 從檔案」。';
    const btPanels=bt?.querySelectorAll('.panel');
    const queueTitle=btPanels?.[1]?.querySelector('h3');if(queueTitle)queueTitle.textContent='可接續的 BT 製作紀錄';
    const flowTitle=btPanels?.[2]?.querySelector('h3');if(flowTitle)flowTitle.textContent='快速製作流程';
    const flow=btPanels?.[2]?.querySelector('.workflow');if(flow)flow.innerHTML='<span>客戶原稿</span><b>→</b><span>快速分析</span><b>→</b><span>下載 BT 匯入圖</span><b>→</b><span>拖進 BarTender</span><b>→</b><span>尺寸／測印</span>';
    const btNote=btPanels?.[2]?.querySelector('.note');if(btNote)btNote.innerHTML='<b>UltraLite 建議：</b>PDF／圖片以「直接匯入 PNG」為主；CSV／欄位對照保留為進階製作資料。';
    syncHeaderCopy();
  }

  function init(){injectUiRefresh();reorderNav();bindHeaderCopy();bindQuickAnalysis();openBarcodeFirst();updateCopy();console.info('[Label Workbench] priority controller',BUILD)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.LabelWorkbenchPriority={runQuickAnalysis,reorderNav,build:BUILD};
})();