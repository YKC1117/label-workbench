/* Label Workbench priority controller v1.8
 * Keeps the engineer's most-used tools first and gives Quick Analysis one stable entry point.
 * Does not change case data, localStorage format, Supabase tables, or attachment metadata.
 */
(function(){
  'use strict';

  const BUILD='20260910-v180';
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const isImage=f=>!!(f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));
  const isPdf=f=>/\.pdf$/i.test(f?.name||'')||f?.type==='application/pdf';

  function injectUiRefresh(){
    if(document.querySelector('link[data-lw-ui-refresh]'))return;
    const link=document.createElement('link');link.rel='stylesheet';link.href=`assets/ui-refresh.css?v=${BUILD}`;link.dataset.lwUiRefresh='true';document.head.appendChild(link);
  }

  function reorderNav(){
    const order=['barcode','analysis','dashboard','cases','bartender'];
    document.querySelectorAll('.nav,.mobile-nav').forEach(nav=>{order.forEach(id=>{const btn=nav.querySelector(`[data-view="${id}"]`);if(btn)nav.appendChild(btn)})});
    const labels={barcode:'條碼',analysis:'分析',dashboard:'工作台',cases:'案件',bartender:'BT'},mobile=document.querySelector('.mobile-nav');
    if(mobile)order.forEach(id=>{const btn=mobile.querySelector(`[data-view="${id}"]`);if(btn)btn.textContent=labels[id]||btn.textContent});
  }

  function openBarcodeFirst(){
    try{if(typeof window.showView==='function')window.showView('barcode');else{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='barcode'));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='barcode'))}}
    catch(err){console.warn('[Label Workbench] default barcode view failed',err)}
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
      else if(typeof window.analyzeSelected==='function'){await window.analyzeSelected(arr);await appendBarcodeAnalysis(arr)}
      else throw new Error('快速分析元件未載入');
    }catch(err){console.error('[Label Workbench] quick analysis failed',err);out.innerHTML=`<div class="note warn-note"><b>快速分析失敗：</b>${esc(err?.message||err)}<br>請重新選擇檔案再試一次；若內容本身不足，系統會列出同事需要向客戶補確認的資料。</div>`}
  }

  function bindQuickAnalysis(){const input=el('analysisFiles');if(!input||input.dataset.priorityBound==='true')return;input.dataset.priorityBound='true';input.addEventListener('change',async e=>{e.stopImmediatePropagation();const files=[...(e.target.files||[])];await runQuickAnalysis(files);e.target.value=''},true)}

  function updateCopy(){
    const title=el('pageTitle');if(title&&document.querySelector('#barcode.view.active'))title.textContent='條碼工具';const small=document.querySelector('.brand small');if(small)small.textContent='標籤製作工作台 · v1.8';
    const analysis=el('analysis'),drop=analysis?.querySelector('.drop > p');if(drop)drop.textContent='PDF、圖片、Excel、Word、CSV 直接丟進來，整理成可回覆、可製作、可確認的內容。';const note=analysis?.querySelector('.warn-note');if(note)note.innerHTML='<b>快速分析：</b>PDF／圖片會自動判斷方向、分標籤、讀欄位位置、補讀小字並交叉比對條碼；畫面只留下可製作內容與待確認項目。';
  }

  function init(){injectUiRefresh();reorderNav();bindQuickAnalysis();openBarcodeFirst();updateCopy();console.info('[Label Workbench] priority controller',BUILD)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.LabelWorkbenchPriority={runQuickAnalysis,reorderNav,build:BUILD};
})();
