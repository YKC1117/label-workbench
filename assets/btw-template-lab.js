/* Label Workbench BTW template lab v0.1
 * Reads an uploaded BarTender .btw file locally in the browser, shows editable UTF-16LE text records,
 * and rebuilds a new BTW without using the external official seed endpoint.
 */
(function(){
  'use strict';

  const BUILD='20260911-btw-template-lab-001';
  const FORMAT_SRC='assets/btw-format.js?v=20260911-btw-template-lab';
  let formatPromise=null;
  let current={file:null,buffer:null,parsed:null,container:null,strings:[],previewUrl:null};

  const el=id=>document.getElementById(id);
  const $=(sel,root=document)=>root.querySelector(sel);
  const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const toast=message=>{ if(typeof window.toast==='function') window.toast(message); };
  const safeName=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const byteText=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
  const todayStamp=()=>{
    const d=new Date();
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };

  function loadScript(src,test,tag){
    if(test()) return Promise.resolve(test());
    return new Promise((resolve,reject)=>{
      const old=document.querySelector(`script[data-btw-template-lab-loader="${tag}"]`);
      if(old) old.remove();
      const s=document.createElement('script');
      s.src=src+'&t='+Date.now();
      s.async=false;
      s.dataset.btwTemplateLabLoader=tag;
      s.onload=()=>test()?resolve(test()):reject(new Error(`${tag} 載入不完整`));
      s.onerror=()=>reject(new Error(`${tag} 載入失敗`));
      document.head.appendChild(s);
    });
  }
  function ensureFormat(){
    if(window.LabelWorkbenchBtwFormat?.roundTrip) return Promise.resolve(window.LabelWorkbenchBtwFormat);
    if(formatPromise) return formatPromise;
    formatPromise=loadScript(FORMAT_SRC,()=>window.LabelWorkbenchBtwFormat,'btw-format').finally(()=>{formatPromise=null});
    return formatPromise;
  }

  function setStatus(html,cls=''){
    const box=el('btlStatus');
    if(!box) return;
    box.className='footer-note btl-status '+cls;
    box.innerHTML=html;
  }

  function clearPreview(){
    if(current.previewUrl){ URL.revokeObjectURL(current.previewUrl); current.previewUrl=null; }
    const p=el('btlPreview');
    if(p) p.innerHTML='';
  }

  function setPreview(parsed,buffer){
    clearPreview();
    const host=el('btlPreview');
    if(!host||!parsed?.pngs?.[0]?.isPng) return;
    const first=parsed.pngs[0];
    const blob=new Blob([new Uint8Array(buffer).slice(first.start,first.end)],{type:'image/png'});
    current.previewUrl=URL.createObjectURL(blob);
    host.innerHTML=`<div class="btl-preview-card"><b>BTW 內建預覽圖</b><img src="${current.previewUrl}" alt="BTW 預覽圖"></div>`;
  }

  function usefulString(entry){
    const text=String(entry?.text||'').trim();
    if(!text) return false;
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return false;
    if(text.length>800) return false;
    return true;
  }
  function preferredDefault(entries){
    return entries.find(e=>/輸入資料|文字|測試|label|part|lot|item|code|sample/i.test(e.text))||
      entries.find(e=>e.text.length>=2&&!/^(BarTender|Text \d+|Barcode \d+|Line \d+|Rectangle \d+)$/i.test(e.text))||entries[0]||null;
  }

  function renderStrings(){
    const host=el('btlStrings');
    if(!host) return;
    const entries=current.strings.filter(usefulString).slice(0,120);
    if(!entries.length){
      host.innerHTML='<div class="empty">有解開 BTW，但沒有抓到可改的文字欄位。</div>';
      return;
    }
    const selected=preferredDefault(entries);
    host.innerHTML=`
      <div class="btl-replace-box">
        <div class="grid form-gap">
          <div class="field"><label for="btlTarget">要改哪一段文字</label><select id="btlTarget"></select></div>
          <div class="field"><label for="btlNewText">改成什麼</label><input id="btlNewText" value="LW-測試-${todayStamp()}" placeholder="輸入新文字"></div>
        </div>
        <label class="btl-inline"><input id="btlReplaceAll" type="checkbox"> 同樣文字全部一起改</label>
        <div class="case-actions"><button class="btn primary" id="btlPatch" type="button">改字並下載新 BTW</button><button class="btn ghost" id="btlRoundTrip" type="button">只重封裝下載測試</button></div>
      </div>
      <div class="btl-string-list">
        ${entries.map((s,i)=>`<button type="button" class="btl-string ${selected&&s.offset===selected.offset?'active':''}" data-offset="${s.offset}"><span>${String(i+1).padStart(2,'0')}</span><b>${esc(s.text)}</b><small>offset ${s.offset} · ${s.charLength}字</small></button>`).join('')}
      </div>`;
    const sel=el('btlTarget');
    if(sel){
      sel.innerHTML=entries.map((s,i)=>`<option value="${s.offset}" ${selected&&s.offset===selected.offset?'selected':''}>${String(i+1).padStart(2,'0')}｜${esc(s.text).slice(0,90)}</option>`).join('');
      sel.addEventListener('change',()=>markActive(Number(sel.value)));
    }
    $$('.btl-string',host).forEach(btn=>btn.addEventListener('click',()=>{
      const value=Number(btn.dataset.offset);
      if(sel) sel.value=String(value);
      markActive(value);
    }));
    el('btlPatch')?.addEventListener('click',patchAndDownload);
    el('btlRoundTrip')?.addEventListener('click',roundTripDownload);
  }

  function markActive(offset){
    $$('.btl-string').forEach(b=>b.classList.toggle('active',Number(b.dataset.offset)===offset));
  }

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1800);
  }

  async function analyzeFile(file){
    const F=await ensureFormat();
    const buffer=await file.arrayBuffer();
    const parsed=F.parseStructure(buffer);
    const container=await F.inflateContainer(parsed);
    const rebuilt=await F.rebuild(parsed,container);
    const verifyParsed=F.parseStructure(rebuilt);
    const verifyContainer=await F.inflateContainer(verifyParsed);
    const same=container.length===verifyContainer.length && container.every((v,i)=>v===verifyContainer[i]);
    if(!same) throw new Error('BTW 重封裝驗證失敗，先不要下載給客戶使用');
    const strings=F.scanUtf16Strings(container,{minLength:1,maxLength:4000}).filter(usefulString);
    current={file,buffer,parsed,container,strings,previewUrl:null};
    setPreview(parsed,buffer);
    setStatus(`✅ 已讀取：<b>${esc(file.name)}</b>　${byteText(file.size)}<br>版本：${esc(parsed.header?.applicationVersion||'未讀到')}　Build：${esc(parsed.header?.build||'—')}　Compatible：${esc(parsed.header?.compatibleVersion||'—')}　Archive：${esc(parsed.header?.archiveVersion||'—')}<br>已找到 <b>${strings.length}</b> 段可檢查文字。這版不抓官方種子，所以不會再跳 502。`,'ok');
    renderStrings();
  }

  async function handleFileChange(event){
    const file=event.target.files?.[0];
    clearPreview();
    current={file:null,buffer:null,parsed:null,container:null,strings:[],previewUrl:null};
    el('btlStrings').innerHTML='';
    if(!file) return;
    if(!/\.btw$/i.test(file.name)){ setStatus('請選擇 .btw 檔案。','warn'); return; }
    setStatus('正在讀取 BTW，請稍等…');
    try{ await analyzeFile(file); toast('BTW 範本已讀取'); }
    catch(err){ console.error('[Label Workbench] BTW template analyze failed',err); setStatus('❌ 讀取失敗：'+esc(err?.message||err),'bad'); toast('BTW 讀取失敗'); }
  }

  async function roundTripDownload(){
    if(!current.file||!current.container){ setStatus('請先選擇 BTW 範本。','warn'); return; }
    try{
      const F=await ensureFormat();
      const rebuilt=await F.rebuild(current.parsed,current.container);
      F.parseStructure(rebuilt);
      downloadBlob(new Blob([rebuilt],{type:'application/octet-stream'}),`LW_RoundTrip_${safeName(current.file.name.replace(/\.btw$/i,''))}.btw`);
      toast('已下載重封裝 BTW');
    }catch(err){ console.error(err); setStatus('❌ 重封裝失敗：'+esc(err?.message||err),'bad'); }
  }

  async function patchAndDownload(){
    if(!current.file||!current.container){ setStatus('請先選擇 BTW 範本。','warn'); return; }
    const targetOffset=Number(el('btlTarget')?.value);
    const newText=String(el('btlNewText')?.value??'').trim();
    const replaceAll=!!el('btlReplaceAll')?.checked;
    if(!Number.isFinite(targetOffset)){ setStatus('請先選擇要修改的文字。','warn'); return; }
    if(!newText){ setStatus('請輸入要改成的文字。','warn'); return; }
    try{
      const F=await ensureFormat();
      let container=new Uint8Array(current.container);
      const source=current.strings.find(s=>s.offset===targetOffset);
      if(!source) throw new Error('找不到選取的文字位置，請重新讀取 BTW');
      const targets=replaceAll?current.strings.filter(s=>s.text===source.text):[source];
      for(const entry of targets.slice().sort((a,b)=>b.offset-a.offset)) container=F.replaceStringAt(container,entry,newText);
      const rebuilt=await F.rebuild(current.parsed,container);
      const parsed=F.parseStructure(rebuilt);
      const round=await F.inflateContainer(parsed);
      const found=F.scanUtf16Strings(round,{minLength:1,maxLength:4000}).some(s=>s.text===newText);
      if(!found) throw new Error('新文字寫入驗證失敗');
      downloadBlob(new Blob([rebuilt],{type:'application/octet-stream'}),`LW_Edit_${safeName(current.file.name.replace(/\.btw$/i,''))}_${todayStamp()}.btw`);
      setStatus(`✅ 已下載新 BTW：已把「${esc(source.text)}」改成「${esc(newText)}」。<br>請用公司 BarTender 2022 開啟確認：能開、文字可編輯、版面沒跑掉。`,'ok');
      toast('已下載改字 BTW');
    }catch(err){ console.error('[Label Workbench] BTW patch failed',err); setStatus('❌ 改字下載失敗：'+esc(err?.message||err),'bad'); toast('BTW 改字失敗'); }
  }

  function injectStyle(){
    if(el('btlStyle')) return;
    const style=document.createElement('style');
    style.id='btlStyle';
    style.textContent=`
      #btwTemplateLab .btl-status{line-height:1.75;border-radius:12px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0}
      #btwTemplateLab .btl-status.ok{background:#ecfdf5;border-color:#bbf7d0;color:#065f46}
      #btwTemplateLab .btl-status.warn{background:#fff7ed;border-color:#fed7aa;color:#9a3412}
      #btwTemplateLab .btl-status.bad{background:#fef2f2;border-color:#fecaca;color:#991b1b}
      #btwTemplateLab .btl-preview-card{margin-top:12px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:10px;display:inline-block;max-width:100%}
      #btwTemplateLab .btl-preview-card img{display:block;max-width:min(520px,100%);max-height:260px;margin-top:8px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
      #btwTemplateLab .btl-replace-box{margin-top:14px;padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#fbfdff}
      #btwTemplateLab .btl-inline{display:flex;align-items:center;gap:7px;margin:8px 0;color:#475569;font-size:13px}
      #btwTemplateLab .btl-string-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:12px;max-height:360px;overflow:auto;padding-right:4px}
      #btwTemplateLab .btl-string{appearance:none;border:1px solid #e2e8f0;background:#fff;border-radius:12px;text-align:left;padding:9px 10px;display:grid;gap:2px;cursor:pointer;color:#0f172a}
      #btwTemplateLab .btl-string:hover,#btwTemplateLab .btl-string.active{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.10)}
      #btwTemplateLab .btl-string span{font-size:10px;color:#64748b;font-weight:700}
      #btwTemplateLab .btl-string b{font-size:13px;word-break:break-word;white-space:pre-wrap}
      #btwTemplateLab .btl-string small{font-size:10px;color:#94a3b8}
    `;
    document.head.appendChild(style);
  }

  function injectPanel(){
    const section=el('bartender');
    if(!section||el('btwTemplateLab')) return;
    injectStyle();
    const panel=document.createElement('div');
    panel.className='panel';
    panel.id='btwTemplateLab';
    panel.innerHTML=`
      <div class="section-title">
        <div><h3>BTW 範本測試（免官方種子）</h3><p class="muted compact">先用你現有的 BarTender 2022 .btw 當範本，讀出文字、改字、重新封裝下載。</p></div>
        <span class="pill">502 修正版</span>
      </div>
      <div class="note warn-note"><b>這版重點：</b>不連外部官方種子、不上傳你的 BTW；檔案只在目前瀏覽器本機處理。先測「能不能開啟」跟「文字能不能改」。</div>
      <div class="drop form-gap">
        <strong>上傳一個 .btw 範本</strong>
        <p>請選 BarTender 2022 建立過的 BTW。建議先用你剛剛給我的那種 100×65 測試檔。</p>
        <input id="btlFile" type="file" accept=".btw,application/octet-stream">
      </div>
      <div id="btlStatus" class="footer-note btl-status">等待 BTW 檔案。選檔後會先做重封裝驗證，通過才讓你下載。</div>
      <div id="btlPreview"></div>
      <div id="btlStrings"></div>
    `;
    const firstPanel=section.querySelector('.panel');
    if(firstPanel?.nextSibling) section.insertBefore(panel,firstPanel.nextSibling); else section.appendChild(panel);
    el('btlFile')?.addEventListener('change',handleFileChange);
  }

  function refresh(){ injectPanel(); }
  function init(){
    refresh();
    document.querySelectorAll('[data-view="bartender"]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(refresh,30)));
    let tries=0;
    const timer=setInterval(()=>{ tries++; refresh(); if(tries>60||el('btwTemplateLab')) clearInterval(timer); },150);
    console.info('[Label Workbench] BTW template lab loaded',BUILD);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();

  window.LabelWorkbenchBtwTemplateLab={BUILD,ensureFormat,analyzeFile,roundTripDownload,patchAndDownload,refresh,get current(){return current;}};
})();