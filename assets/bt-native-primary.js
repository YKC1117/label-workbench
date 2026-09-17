/* BT workflow. No browser binary patcher is a production download provider. */
(function () {
  'use strict';
  if (window.LabelWorkbenchBtNativePrimary) return;
  const BUILD = 'bt-runtime-gate-1';
  const el = id => document.getElementById(id);
  const jobs = () => window.LabelWorkbenchBtJob;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BLOCK = 'BTW_RUNTIME_NOT_VERIFIED：尚未取得已驗證的 Windows BarTender 2022 產檔服務與範本。此版本不能直接下載可編輯 .BTW；可先確認內容並匯出 Windows 測試工作檔。';
  let rendered = '', message = '';
  function status(text) { message = text; const target = el('btJobStatus'); if(target) target.textContent = text; window.toast?.(text); }
  function downloadEditable() {
    const job = jobs()?.current;
    const reason = !job ? 'BT_NO_JOB：請先完成 PDF／圖片快速分析' : job.status !== 'confirmed' ? 'BT_REVIEW_REQUIRED：請到 BT 快速製作核對內容、尺寸、方向及物件位置' : BLOCK;
    status(reason); return Promise.resolve(false);
  }
  function saveJson(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function exportJob() {
    try { saveJson(jobs().productionJob(), 'BarTender.btjob.json'); status('已送出 Windows 測試工作檔下載（JSON，不是 BTW）。需搭配 Designer 範本與 Windows 驗證工具。'); }
    catch(e) { status(e.message); }
  }
  function openReview() { window.showView?.('bartender'); refresh(); }
  function decorateAnalysis() {
    const out = el('analysisResult');
    if (!out || !jobs()?.current || !window.LabelWorkbenchBtBridge?.isMediaResult()) return;
    if (!el('analysisBtReview')) {
      const b = document.createElement('button'); b.id = 'analysisBtReview'; b.className = 'btn primary'; b.type = 'button';
      b.textContent = '確認辨識內容／BT 工作'; b.addEventListener('click', openReview); out.appendChild(b);
    }
    if (!el('analysisBtNative')) {
      const b = document.createElement('button'); b.id = 'analysisBtNative'; b.className = 'btn ghost'; b.type = 'button';
      b.textContent = '下載 BarTender .BTW'; b.addEventListener('click', downloadEditable); out.appendChild(b);
      const p = document.createElement('p'); p.textContent = 'BTW 實機驗證尚未通過，下載目前受阻；分析工作會保存在此瀏覽器。'; out.appendChild(p);
    }
  }
  function boxInputs(row, group, i, li, g) {
    const b = row.sourceBox || {};
    return ['x','y','w','h'].map((key,k) => {
      const scale = k % 2 === 0 ? Number(g.widthMm) : Number(g.heightMm);
      const value = Number.isFinite(b[key]) && scale > 0 ? +(b[key]*scale).toFixed(3) : '';
      return `<td><input aria-label="${esc(row.name || row.format || group)} ${key} mm" type="number" min="0" step="0.001" data-label="${li}" data-group="${group}" data-index="${i}" data-box="${key}" value="${value}"></td>`;
    }).join('');
  }
  function renderJob() {
    const section = el('bartender'); if (!section) return;
    let panel = el('btJobPanel');
    if (!panel) { panel = document.createElement('div'); panel.id = 'btJobPanel'; panel.className = 'panel'; section.appendChild(panel); }
    const job = jobs()?.current, signature = JSON.stringify(job);
    if (signature === rendered && panel.childNodes.length) return;
    rendered = signature;
    panel.innerHTML = `<h3>目前 BT 工作</h3><p id="btJobStatus" role="status" aria-live="polite"></p>`;
    el('btJobStatus').textContent = message || jobs()?.storageError || (job ? `${job.status === 'confirmed' ? '內容已確認，等待 Windows 實機驗證' : '待核對'} · ${job.files.map(f=>f.name).join('、')}` : '尚無工作，請先完成快速分析。');
    const importLabel=document.createElement('label'); importLabel.className='btn ghost'; importLabel.textContent='匯入工作備份';
    const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json'; input.className='hidden';
    input.onchange=async()=>{try {const file=input.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error('備份超過 2 MB');jobs().importJob(await file.text());message='備份已恢復，請重新核對。';renderJob();}catch(e){status('備份匯入失敗：'+e.message);}};
    importLabel.appendChild(input); panel.appendChild(importLabel);
    if (!job) return;
    const form = document.createElement('form'); form.id = 'btJobReview'; form.onsubmit = e => e.preventDefault();
    form.innerHTML = job.result.labels.map((label,li) => {
      const g = label.sourceGeometry || {};
      const rows = ['fields','barcodes'].flatMap(group => (label[group] || []).map((row,i) => `<tr><td>${esc(group === 'fields' ? row.name || '文字' : row.format || '未知條碼')}</td><td><textarea aria-label="${esc(row.name || row.format || '物件')} 內容" data-label="${li}" data-group="${group}" data-index="${i}" data-value>${esc(group === 'fields' ? row.value : row.text ?? row.value ?? row.data)}</textarea></td>${boxInputs(row,group,i,li,g)}</tr>`)).join('');
      return `<fieldset><legend>標籤 ${li+1} · ${esc(label.sourceName)}</legend><div class="grid-3"><label>寬 mm<input type="number" min="5" max="1000" step="0.001" data-label="${li}" data-size="widthMm" value="${esc(g.widthMm || '')}"></label><label>高 mm<input type="number" min="5" max="1000" step="0.001" data-label="${li}" data-size="heightMm" value="${esc(g.heightMm || '')}"></label><label>列印方向<select data-label="${li}" data-size="orientation"><option value="">請確認</option><option value="portrait" ${g.orientation==='portrait'?'selected':''}>直向</option><option value="landscape" ${g.orientation==='landscape'?'selected':''}>橫向</option></select></label></div><div class="table-scroll"><table><thead><tr><th>物件</th><th>內容</th><th>X mm</th><th>Y mm</th><th>寬 mm</th><th>高 mm</th></tr></thead><tbody>${rows}</tbody></table></div></fieldset>`;
    }).join('');
    panel.appendChild(form);
    form.addEventListener('input', () => {
      try {
        const next = jobs().current.result;
        form.querySelectorAll('[data-size]').forEach(n => { const g = next.labels[+n.dataset.label].sourceGeometry ||= {}; g[n.dataset.size] = n.dataset.size === 'orientation' ? n.value : Number(n.value); });
        form.querySelectorAll('[data-group]').forEach(n => {
          const label = next.labels[+n.dataset.label], row = label[n.dataset.group][+n.dataset.index];
          if (n.hasAttribute('data-value')) { if(n.dataset.group === 'fields') row.value=n.value; else row.text=n.value; }
          else { const key=n.dataset.box, scale=Number(label.sourceGeometry?.[['x','w'].includes(key)?'widthMm':'heightMm']); (row.sourceBox ||= {})[key] = n.value !== '' && scale > 0 ? Number(n.value)/scale : null; }
        });
        jobs().update(next); rendered = JSON.stringify(jobs().current);
        el('btJobStatus').textContent = jobs().storageError || '修改已保存，請重新確認全部內容。';
      } catch(e) { status(e.message); }
    });
    const note = document.createElement('p'); note.textContent = '位置以左上角為基準。請逐項核對原稿；不推測未知尺寸、不略過未確認欄位。QR Code／圖形目前 unsupported。工作保存 30 天，僅限本瀏覽器；不保存原始 PDF／圖片。'; panel.appendChild(note);
    const actions = document.createElement('div'); actions.className = 'case-actions'; panel.appendChild(actions);
    const button = (text, fn, id) => { const b=document.createElement('button'); b.type='button'; b.className='btn ghost'; b.textContent=text; if(id)b.id=id; b.onclick=fn; actions.appendChild(b); };
    button('我已核對全部內容', () => { try { jobs().confirm(); message='內容已確認；'+BLOCK; renderJob(); } catch(e) { status(e.message); } });
    button('下載 BarTender .BTW', downloadEditable, 'btNativeDownload');
    button('匯出 Windows 測試工作檔', exportJob);
    button('匯出工作備份', () => saveJson(jobs().current, 'BarTender-work-backup.json'));
    button('清除此工作', () => { jobs().clear(); message=''; renderJob(); });
  }
  function refresh() { renderJob(); decorateAnalysis(); }
  function init() {
    refresh();
    window.addEventListener('labelworkbench:bt-stage', () => { message=''; refresh(); });
    document.querySelectorAll('[data-view="bartender"]').forEach(b => b.addEventListener('click',refresh));
    // Only decorate when missing. Writing text on every mutation used to self-trigger indefinitely.
    const target=el('analysisResult'); if(target && typeof MutationObserver==='function') new MutationObserver(decorateAnalysis).observe(target,{childList:true,subtree:true});
  }
  window.LabelWorkbenchBtNativePrimary={BUILD, downloadEditable, exportJob, refresh, decorateAnalysis, decorateBt:renderJob};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
