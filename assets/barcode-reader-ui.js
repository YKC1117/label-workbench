/* Label Workbench barcode UI v1.1 - simple, fast workflow. */
(function(){
  'use strict';

  const C=()=>window.LabelWorkbenchBarcodeCore;
  const st={analysis:false,lastFiles:[],lastResults:[]};
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const toast=m=>{if(typeof window.toast==='function')window.toast(m)};
  const isImage=f=>!!(f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));

  function copy(t){
    navigator.clipboard?.writeText(String(t)).then(()=>toast('已複製條碼內容')).catch(()=>{
      const a=document.createElement('textarea');a.value=String(t);document.body.appendChild(a);a.select();
      document.execCommand('copy');a.remove();toast('已複製條碼內容');
    });
  }

  function styles(){
    if(el('barcodeV11Style'))return;
    const s=document.createElement('style');s.id='barcodeV11Style';
    s.textContent=`
      .scanner-panel{border-color:#cfe0ff}
      .scanner-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
      .scanner-actions .btn{display:inline-flex;align-items:center}
      .scan-working{padding:16px;border:1px dashed #bfd2ee;border-radius:12px;background:#f8fbff;font-weight:800}
      .scan-working small{font-weight:500;color:#64748b}
      .scan-card{border:1px solid #e3e8ef;border-radius:14px;padding:15px;margin-top:12px;background:#fff}
      .scan-row{border-top:1px solid #e8edf3;padding:12px 0}
      .scan-row:first-child{border-top:0}
      .scan-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .scan-row pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0;background:#0f172a;color:#f8fafc;padding:12px;border-radius:10px;font:13px/1.55 ui-monospace,Consolas,monospace}
      .retry-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
      .retry-row .footer-note{margin:0}
      @media(max-width:820px){.scanner-actions .btn{width:100%;justify-content:center}.scan-head .btn{width:auto;margin-left:auto}.retry-row .btn{width:100%;justify-content:center}}
    `;
    document.head.appendChild(s);
  }

  function ui(){
    const sec=el('barcode');if(!sec||el('barcodeScannerPanel'))return;
    const p=document.createElement('div');p.id='barcodeScannerPanel';p.className='panel scanner-panel';
    p.innerHTML=`
      <div class="section-title stack-mobile">
        <div><h3>📷 圖片讀碼｜一維碼 / 二維碼</h3><p class="muted compact">選圖片後直接讀取。一般先快速掃描；只有真的讀不到時，才會出現「加強讀取」。</p></div>
        <button id="barcodeCopyAll" class="btn ghost small" disabled>複製全部結果</button>
      </div>
      <div class="scanner-actions">
        <label class="btn primary">選擇圖片讀碼<input id="barcodeImageInput" class="hidden" type="file" multiple accept="image/*"></label>
        <label class="btn ghost">手機拍照讀碼<input id="barcodeCameraInput" class="hidden" type="file" accept="image/*" capture="environment"></label>
      </div>
      <div class="note"><b>隱私：</b>條碼在目前瀏覽器本機解碼，圖片不會送到讀碼伺服器。</div>
      <div id="barcodeScanResults" class="form-gap"><div class="empty">尚未選擇圖片。</div></div>`;
    sec.insertBefore(p,sec.firstChild);
    el('barcodeImageInput').addEventListener('change',e=>{run(e.target.files);e.target.value=''});
    el('barcodeCameraInput').addEventListener('change',e=>{run(e.target.files);e.target.value=''});
  }

  function resultRows(rows){
    return rows.map((r,i)=>`<div class="scan-row"><div class="scan-head"><span class="pill">${esc(r.format)}</span><button class="btn ghost small" data-copy="${i}">複製內容</button></div><pre>${esc(C().visibleText(r.text))}</pre><small>${esc(r.engine)} · ${esc(r.source||'')}</small></div>`).join('');
  }
  function card(fr,index){
    const rows=fr.results||[];
    const body=rows.length?resultRows(rows):`<div class="note warn-note">這張圖快速掃描沒有讀到條碼。</div><div class="retry-row"><button class="btn ghost small" data-deep="${index}">加強讀取</button><div class="footer-note">只有需要時才做分區與高對比掃描。</div></div>`;
    return `<article class="scan-card" data-card="${index}"><h3>${esc(fr.name)}</h3><div class="footer-note">${fr.width?`${fr.width} × ${fr.height} px`:'尺寸未知'} · 讀到 ${rows.length} 組</div>${body}</article>`;
  }
  function wire(host,res){
    const all=[];res.forEach(fr=>(fr.results||[]).forEach(r=>all.push(r)));
    host.querySelectorAll('.scan-card').forEach((c,fi)=>c.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(res[fi]?.results?.[+b.dataset.copy]?.text||'')));
    host.querySelectorAll('[data-deep]').forEach(b=>b.onclick=()=>retryDeep(+b.dataset.deep));
    const a=el('barcodeCopyAll');a.disabled=!all.length;a.onclick=()=>copy(all.map((r,i)=>`${i+1}. [${r.format}] ${C().visibleText(r.text)}`).join('\n'));
  }
  function render(){
    const out=el('barcodeScanResults');out.innerHTML=st.lastResults.map(card).join('');wire(out,st.lastResults);
  }

  async function run(files){
    const out=el('barcodeScanResults'),arr=[...files].filter(isImage).slice(0,8);
    if(!arr.length){out.innerHTML='<div class="empty">請選擇圖片檔。</div>';return[]}
    st.lastFiles=arr;st.lastResults=[];
    for(let i=0;i<arr.length;i++){
      out.innerHTML=`<div class="scan-working">正在讀取 ${i+1}/${arr.length}：${esc(arr[i].name)}<br><small>快速掃描中…</small></div>`;
      try{st.lastResults.push(await C().scanFile(arr[i]))}catch(e){st.lastResults.push({name:arr[i].name,results:[],error:e?.message||String(e)})}
    }
    render();return st.lastResults;
  }

  async function retryDeep(index){
    const file=st.lastFiles[index],out=el('barcodeScanResults');if(!file)return;
    const cardEl=out.querySelector(`[data-card="${index}"]`);
    if(cardEl)cardEl.innerHTML=`<div class="scan-working">正在加強讀取 ${esc(file.name)}…<br><small>只針對這張圖片做分區與高對比掃描。</small></div>`;
    try{st.lastResults[index]=await C().scanFile(file,null,{deep:true})}catch(e){st.lastResults[index]={name:file.name,results:[],error:e?.message||String(e)}}
    render();
  }

  function patchAnalysis(){
    if(st.analysis||typeof window.analyzeSelected!=='function')return;
    const base=window.analyzeSelected;
    window.analyzeSelected=async files=>{
      await base(files);const imgs=[...files].filter(isImage);if(!imgs.length)return;
      const out=el('analysisResult'),box=document.createElement('div');box.className='analysis-block';box.innerHTML='<b>圖片條碼內容：</b><div class="scan-working">快速掃描中…</div>';out.appendChild(box);
      const hits=[];
      for(const f of imgs.slice(0,8)){try{const r=await C().scanFile(f);r.results.forEach(x=>hits.push({file:f.name,...x}))}catch{}}
      box.innerHTML=hits.length?`<b>圖片條碼內容：</b>${hits.map(r=>`<div class="scan-row"><span class="pill">${esc(r.format)}</span><small>${esc(r.file)}</small><pre>${esc(C().visibleText(r.text))}</pre></div>`).join('')}`:'<b>圖片條碼內容：</b><div class="footer-note">快速掃描沒有讀到條碼；需要時可到「條碼工具」使用加強讀取。</div>';
    };
    st.analysis=true;
  }

  function init(){
    styles();ui();const small=document.querySelector('.brand small');if(small)small.textContent='標籤製作工作台 · v1.1';
    let n=0;const t=setInterval(()=>{patchAnalysis();if(st.analysis||n++>80)clearInterval(t)},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.LabelWorkbenchBarcodeUI={run,retryDeep,state:st};
})();
