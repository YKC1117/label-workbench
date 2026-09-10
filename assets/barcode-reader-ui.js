/* Label Workbench barcode reader UI v1.9 - local image, camera and clipboard workflow. */
(function(){
  'use strict';

  const C=()=>window.LabelWorkbenchBarcodeCore;
  const st={lastFiles:[],lastResults:[],reading:false};
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
    if(el('barcodeV19Style'))return;
    const s=document.createElement('style');s.id='barcodeV19Style';
    s.textContent=`
      .scanner-panel{border-color:#dbe3ee}
      .scanner-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .scanner-actions .btn{display:inline-flex;align-items:center;min-height:40px}
      .scanner-paste{margin-top:12px;min-height:82px;border:1.5px dashed #b8c6d8;border-radius:13px;background:#f8fafc;display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;cursor:pointer;color:#475569;outline:none;transition:.15s ease}
      .scanner-paste:hover,.scanner-paste:focus{border-color:#60a5fa;background:#f5f9ff;box-shadow:0 0 0 3px #dbeafe}
      .scanner-paste b{display:block;color:#1e293b;font-size:13px;margin-bottom:3px}.scanner-paste small{display:block;color:#94a3b8;font-size:11px}
      .scan-working{padding:16px;border:1px dashed #bfd2ee;border-radius:12px;background:#f8fbff;font-weight:800}
      .scan-working small{font-weight:500;color:#64748b}
      .scan-card{border:1px solid #e3e8ef;border-radius:14px;padding:15px;margin-top:12px;background:#fff}
      .scan-row{border-top:1px solid #e8edf3;padding:12px 0}.scan-row:first-child{border-top:0}
      .scan-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .scan-row pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0;background:#0f172a;color:#f8fafc;padding:12px;border-radius:10px;font:13px/1.55 ui-monospace,Consolas,monospace}
      .retry-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}.retry-row .footer-note{margin:0}
      @media(max-width:820px){.scanner-actions{display:grid;grid-template-columns:1fr 1fr}.scanner-actions .btn{justify-content:center}.scanner-actions .btn:first-child{grid-column:1/-1}.scan-head .btn{width:auto;margin-left:auto}.retry-row .btn{width:100%;justify-content:center}.scanner-paste{min-height:76px}}
    `;
    document.head.appendChild(s);
  }

  function readModeActive(){
    const section=el('barcode'),panel=el('barcodeScannerPanel');
    return !!(section?.classList.contains('active')&&panel&&!panel.classList.contains('hidden'));
  }

  function normalizeClipboardFile(blob,index=0){
    if(!blob)return null;
    if(blob instanceof File&&blob.name)return blob;
    const ext=(blob.type||'image/png').split('/')[1]?.replace('jpeg','jpg')||'png';
    return new File([blob],`clipboard-${Date.now()}-${index+1}.${ext}`,{type:blob.type||'image/png'});
  }

  function clipboardFiles(data){
    const found=[];
    for(const item of [...(data?.items||[])]){
      if(item.kind==='file'&&item.type?.startsWith('image/')){
        const f=item.getAsFile?.();if(f)found.push(normalizeClipboardFile(f,found.length));
      }
    }
    if(!found.length){
      for(const f of [...(data?.files||[])])if(isImage(f))found.push(normalizeClipboardFile(f,found.length));
    }
    return found.filter(Boolean).slice(0,8);
  }

  async function pasteFromClipboard(){
    if(!navigator.clipboard?.read){
      el('barcodePasteZone')?.focus();
      toast('請在貼上區按 Ctrl+V；手機可長按後選「貼上」');
      return;
    }
    try{
      const items=await navigator.clipboard.read(),files=[];
      for(const item of items){
        const type=(item.types||[]).find(t=>t.startsWith('image/'));if(!type)continue;
        const blob=await item.getType(type);files.push(normalizeClipboardFile(blob,files.length));
      }
      if(!files.length){toast('剪貼簿裡沒有可讀取的圖片');return}
      await run(files);toast(`已貼上 ${files.length} 張圖片並開始讀碼`);
    }catch(err){
      console.warn('[Label Workbench] clipboard read failed',err);
      el('barcodePasteZone')?.focus();
      toast('瀏覽器沒有允許直接讀剪貼簿，請在貼上區按 Ctrl+V 或長按貼上');
    }
  }

  function handlePaste(event){
    if(!readModeActive())return;
    const files=clipboardFiles(event.clipboardData);if(!files.length)return;
    event.preventDefault();
    const zone=el('barcodePasteZone');if(zone)zone.innerHTML='<div><b>已收到剪貼簿圖片</b><small>正在讀取條碼…</small></div>';
    run(files).finally(()=>{if(zone)zone.innerHTML='<div><b>直接貼上圖片</b><small>Ctrl+V／⌘V；手機可點這裡後長按貼上</small></div>'});
  }

  function ui(){
    const sec=el('barcode');if(!sec||el('barcodeScannerPanel'))return;
    const p=document.createElement('div');p.id='barcodeScannerPanel';p.className='panel scanner-panel';
    p.innerHTML=`
      <div class="section-title stack-mobile">
        <div><h3>圖片讀碼｜一維碼 / 二維碼</h3><p class="muted compact">直接貼截圖、選圖片或拍照；不必先把剪貼簿圖片存成檔案。</p></div>
        <button id="barcodeCopyAll" class="btn ghost small" disabled>複製全部結果</button>
      </div>
      <div class="scanner-actions">
        <label class="btn primary">選擇圖片<input id="barcodeImageInput" class="hidden" type="file" multiple accept="image/*"></label>
        <button id="barcodePasteBtn" class="btn ghost" type="button">貼上剪貼簿圖片</button>
        <label class="btn ghost">手機拍照<input id="barcodeCameraInput" class="hidden" type="file" accept="image/*" capture="environment"></label>
      </div>
      <div id="barcodePasteZone" class="scanner-paste" tabindex="0" contenteditable="true" role="textbox" aria-label="貼上條碼圖片"><div><b>直接貼上圖片</b><small>Ctrl+V／⌘V；手機可點這裡後長按貼上</small></div></div>
      <div class="note"><b>隱私：</b>圖片直接在目前瀏覽器本機解碼，不會上傳到讀碼伺服器。</div>
      <div id="barcodeScanResults" class="form-gap"><div class="empty">尚未讀取圖片。</div></div>`;
    sec.insertBefore(p,sec.firstChild);
    el('barcodeImageInput').addEventListener('change',e=>{run(e.target.files);e.target.value=''});
    el('barcodeCameraInput').addEventListener('change',e=>{run(e.target.files);e.target.value=''});
    el('barcodePasteBtn').addEventListener('click',pasteFromClipboard);
    const zone=el('barcodePasteZone');
    zone.addEventListener('paste',e=>{handlePaste(e);zone.blur()});
    zone.addEventListener('click',()=>zone.focus());
    zone.addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault()});
    zone.addEventListener('dragover',e=>{e.preventDefault()});
    zone.addEventListener('drop',e=>{e.preventDefault();const files=[...(e.dataTransfer?.files||[])].filter(isImage);if(files.length)run(files)});
    document.addEventListener('paste',handlePaste);
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
  function render(){const out=el('barcodeScanResults');if(!out)return;out.innerHTML=st.lastResults.map(card).join('');wire(out,st.lastResults)}

  async function run(files){
    const out=el('barcodeScanResults'),arr=[...files].filter(isImage).slice(0,8);
    if(!out)return[];
    if(!arr.length){out.innerHTML='<div class="empty">請選擇或貼上一張圖片。</div>';return[]}
    if(st.reading)return[];
    st.reading=true;st.lastFiles=arr;st.lastResults=[];
    try{
      for(let i=0;i<arr.length;i++){
        out.innerHTML=`<div class="scan-working">正在讀取 ${i+1}/${arr.length}：${esc(arr[i].name||'剪貼簿圖片')}<br><small>快速掃描中…</small></div>`;
        try{st.lastResults.push(await C().scanFile(arr[i]))}catch(e){st.lastResults.push({name:arr[i].name||'剪貼簿圖片',results:[],error:e?.message||String(e)})}
      }
      render();return st.lastResults;
    }finally{st.reading=false}
  }

  async function retryDeep(index){
    const file=st.lastFiles[index],out=el('barcodeScanResults');if(!file||!out)return;
    const cardEl=out.querySelector(`[data-card="${index}"]`);
    if(cardEl)cardEl.innerHTML=`<div class="scan-working">正在加強讀取 ${esc(file.name||'剪貼簿圖片')}…<br><small>只針對這張圖片做分區與高對比掃描。</small></div>`;
    try{st.lastResults[index]=await C().scanFile(file,null,{deep:true})}catch(e){st.lastResults[index]={name:file.name||'剪貼簿圖片',results:[],error:e?.message||String(e)}}
    render();
  }

  function init(){styles();ui()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.LabelWorkbenchBarcodeUI={run,retryDeep,pasteFromClipboard,clipboardFiles,state:st};
})();
