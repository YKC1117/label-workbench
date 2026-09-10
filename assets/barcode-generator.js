/* Label Workbench barcode generator v1.8
 * Customer gives content -> generate a real scannable 1D/2D barcode directly in the browser.
 * Linear barcode height is millimetres; 2D size uses integer module scale.
 */
(function(){
  'use strict';

  const BUILD = '20260910-v180';
  const BWIP_SRC = 'https://cdn.jsdelivr.net/npm/bwip-js@4.6.0/dist/bwip-js-min.js';
  let loadPromise = null;
  let last = {type:'', text:'', canvas:null};

  const el = id => document.getElementById(id);
  const toast = message => {
    if(typeof window.toast === 'function') window.toast(message);
  };
  const esc = (value='') => String(value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  const TYPES = {
    'Code 128':'code128',
    'Code 39':'code39',
    'QR Code':'qrcode',
    'Data Matrix':'datamatrix',
    'GS1-128':'gs1-128',
    'GS1 DataMatrix':'gs1datamatrix',
    'EAN-13':'ean13',
    'EAN-8':'ean8',
    'UPC-A':'upca',
    'ITF-14':'itf14',
    'Interleaved 2 of 5':'interleaved2of5',
    'PDF417':'pdf417',
    'Aztec':'azteccode'
  };
  const TWO_D = new Set(['QR Code','Data Matrix','GS1 DataMatrix','PDF417','Aztec']);

  function loadBwip(){
    if(window.bwipjs?.toCanvas) return Promise.resolve(window.bwipjs);
    if(loadPromise) return loadPromise;
    loadPromise = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = BWIP_SRC;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => window.bwipjs?.toCanvas
        ? resolve(window.bwipjs)
        : reject(new Error('條碼產生元件載入不完整'));
      script.onerror = () => reject(new Error('條碼產生元件載入失敗'));
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  function checksum(digits){
    const values = [...digits].map(Number);
    let sum = 0;
    for(let i=values.length-1, pos=1; i>=0; i--, pos++){
      sum += values[i] * (pos % 2 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10;
  }

  function digitsOnly(value){
    return /^[0-9]+$/.test(value);
  }

  function validGs1BracketForm(text){
    if(!text.startsWith('(')) return false;
    const close = text.indexOf(')');
    if(close < 3 || close > 5) return false;
    const ai = text.slice(1, close);
    return digitsOnly(ai) && text.length > close + 1;
  }

  function validate(type,text){
    if(!text) return '請先輸入要製作的條碼內容。';
    if(type === 'Code 39' && !/^[0-9A-Z .$/+%-]+$/.test(text)){
      return 'Code 39 只能使用大寫英文字母、數字、空白與 - . $ / + %。';
    }
    if(type === 'EAN-13'){
      if(!digitsOnly(text) || ![12,13].includes(text.length)) return 'EAN-13 請輸入 12 或 13 位數字。';
      if(text.length === 13 && checksum(text.slice(0,12)) !== Number(text[12])){
        return `EAN-13 檢查碼不正確，前 12 碼正確檢查碼應為 ${checksum(text.slice(0,12))}。`;
      }
    }
    if(type === 'EAN-8'){
      if(!digitsOnly(text) || ![7,8].includes(text.length)) return 'EAN-8 請輸入 7 或 8 位數字。';
      if(text.length === 8 && checksum(text.slice(0,7)) !== Number(text[7])){
        return `EAN-8 檢查碼不正確，前 7 碼正確檢查碼應為 ${checksum(text.slice(0,7))}。`;
      }
    }
    if(type === 'UPC-A' && (!digitsOnly(text) || ![11,12].includes(text.length))) return 'UPC-A 請輸入 11 或 12 位數字。';
    if(type === 'ITF-14' && (!digitsOnly(text) || ![13,14].includes(text.length))) return 'ITF-14 請輸入 13 或 14 位數字。';
    if(type === 'Interleaved 2 of 5' && !digitsOnly(text)) return 'Interleaved 2 of 5 只能輸入數字。';
    if(type.startsWith('GS1') && !validGs1BracketForm(text)){
      return 'GS1 建議用 (AI)內容 格式，例如：(01)04712345678903(17)260930(10)LOT001。';
    }
    return '';
  }

  function linearHeight(){
    const raw = Number(el('genHeight')?.value || 4);
    return Math.max(2, Math.min(40, Number.isFinite(raw) ? raw : 4));
  }

  function twoDScale(){
    const raw = Math.round(Number(el('gen2DSize')?.value || 3));
    return Math.max(1, Math.min(10, Number.isFinite(raw) ? raw : 3));
  }

  function buildOptions(type,text){
    const is2d = TWO_D.has(type);
    const options = {
      bcid:TYPES[type],
      text,
      scale:is2d ? twoDScale() : 3,
      paddingwidth:4,
      paddingheight:4,
      backgroundcolor:'FFFFFF'
    };
    if(is2d){
      if(type === 'QR Code') options.eclevel = 'M';
    }else{
      options.height = linearHeight();
      options.includetext = !!el('genHuman')?.checked;
      options.textxalign = 'center';
      options.textsize = 10;
    }
    return options;
  }

  function updateSizeControls(){
    const type = el('genType')?.value || 'Code 128';
    const is2d = TWO_D.has(type);
    el('gen1DOptions')?.classList.toggle('hidden',is2d);
    el('gen2DOptions')?.classList.toggle('hidden',!is2d);
    el('genHumanWrap')?.classList.toggle('hidden',is2d);
    if(el('genHeight')) el('genHeight').disabled = is2d;
    if(el('genHuman')) el('genHuman').disabled = is2d;
    if(el('gen2DSize')) el('gen2DSize').disabled = !is2d;
  }

  async function verifyGenerated(canvas,text){
    const box = el('genVerify');
    if(!box) return;
    const core = window.LabelWorkbenchBarcodeCore;
    if(!core?.scanCanvas){
      box.textContent = '條碼已產生；讀碼驗證元件尚未載入。';
      return;
    }
    box.textContent = '正在自動回讀確認…';
    try{
      const rows = await core.scanCanvas(canvas,'剛產生的條碼');
      if(!rows.length){
        box.innerHTML = '⚠️ 條碼已產生，但瀏覽器沒有成功自動回讀；正式交付前仍建議用實際掃碼槍驗證。';
        return;
      }
      const shown = core.visibleText ? core.visibleText(rows[0].text) : rows[0].text;
      box.innerHTML = `✅ 已自動回讀：<b>${esc(rows[0].format || '條碼')}</b>｜<code>${esc(shown)}</code>`;
    }catch{
      box.textContent = '條碼已產生；自動回讀驗證失敗，正式使用前請以掃碼槍確認。';
    }
  }

  async function generate(){
    const type = el('genType')?.value || 'Code 128';
    let text = (el('genText')?.value || '').trim();
    const error = validate(type,text);
    const message = el('genMessage');
    const preview = el('genPreview');

    if(error){
      message.innerHTML = `<div class="note warn-note">${esc(error)}</div>`;
      preview.innerHTML = '<div class="empty">修正內容後再產生。</div>';
      return;
    }
    if(type === 'EAN-13' && text.length === 12){
      text += checksum(text);
      el('genText').value = text;
    }
    if(type === 'EAN-8' && text.length === 7){
      text += checksum(text);
      el('genText').value = text;
    }

    message.innerHTML = '<div class="scan-working">正在產生條碼…</div>';
    try{
      const bwip = await loadBwip();
      preview.innerHTML = '<canvas id="genCanvas"></canvas>';
      const canvas = el('genCanvas');
      bwip.toCanvas(canvas,buildOptions(type,text));
      last = {type,text,canvas};
      const sizeText = TWO_D.has(type) ? `二維碼大小 ${twoDScale()} 級` : `高度 ${linearHeight()} mm`;
      message.innerHTML = `<div class="note"><b>已產生：</b>${esc(type)}｜${esc(sizeText)}｜${canvas.width} × ${canvas.height} px<br>實際內容：<code>${esc(text)}</code></div>`;
      el('genDownload').disabled = false;
      el('genCopyImage').disabled = false;
      el('genCopyText').disabled = false;
      await verifyGenerated(canvas,text);
    }catch(err){
      last = {type:'',text:'',canvas:null};
      preview.innerHTML = '<div class="empty">無法產生預覽。</div>';
      message.innerHTML = `<div class="note warn-note"><b>產生失敗：</b>${esc(err?.message || err)}<br>請檢查條碼類型與內容格式。</div>`;
    }
  }

  function downloadPng(){
    if(!last.canvas) return;
    last.canvas.toBlob(blob => {
      if(!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${last.type.trim().split(' ').join('_')}_${Date.now()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href),1000);
    },'image/png');
  }

  async function copyImage(){
    if(!last.canvas) return;
    try{
      const blob = await new Promise(resolve => last.canvas.toBlob(resolve,'image/png'));
      if(!blob || !navigator.clipboard || !window.ClipboardItem) throw new Error('browser');
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      toast('已複製條碼圖片，可貼到支援圖片貼上的軟體');
    }catch{
      toast('這個瀏覽器無法直接複製圖片，請使用下載 PNG');
    }
  }

  async function copyText(){
    if(!last.text) return;
    try{
      await navigator.clipboard.writeText(last.text);
      toast('已複製條碼內容');
    }catch{
      toast('複製失敗');
    }
  }

  function switchMode(mode){
    el('barcodeGenerateBody')?.classList.toggle('hidden',mode !== 'generate');
    el('barcodeScannerPanel')?.classList.toggle('hidden',mode !== 'read');
    el('modeGenerate')?.classList.toggle('primary',mode === 'generate');
    el('modeGenerate')?.classList.toggle('ghost',mode !== 'generate');
    el('modeRead')?.classList.toggle('primary',mode === 'read');
    el('modeRead')?.classList.toggle('ghost',mode !== 'read');
  }

  function styles(){
    if(el('barcodeGeneratorStyle')) return;
    const style = document.createElement('style');
    style.id = 'barcodeGeneratorStyle';
    style.textContent = `
      #barcodeGeneratorPanel{padding:24px}
      #barcodeGeneratorPanel>.section-title{margin-bottom:12px}
      .barcode-mode-tabs{display:inline-grid;grid-template-columns:1fr 1fr;gap:4px;margin:6px 0 20px;padding:4px;background:#eef2f7;border:1px solid #e2e8f0;border-radius:13px}
      .barcode-mode-tabs .btn{min-width:170px;min-height:40px;border:0!important;border-radius:9px;box-shadow:none!important;transform:none!important}
      .barcode-mode-tabs .btn.primary{background:#fff;color:#1d4ed8;box-shadow:0 1px 4px rgba(15,23,42,.09)!important}
      .barcode-mode-tabs .btn.ghost{background:transparent;color:#64748b}
      .generator-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;align-items:start}
      .generator-grid .field{gap:7px}
      #genText{min-height:82px;max-height:150px;resize:vertical;line-height:1.5}
      .generator-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;padding:11px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
      .generator-size-field{display:flex;align-items:center;gap:8px;min-height:38px}
      .generator-size-field label{font-size:13px;font-weight:800;color:#334155;white-space:nowrap}
      .generator-size-field input{width:84px;height:38px;border:1px solid #d7dee9;border-radius:9px;background:#fff;padding:7px 10px;font:inherit;color:#172033}
      .generator-size-field input:focus{outline:3px solid #dbeafe;border-color:#60a5fa}
      .generator-size-field .unit{font-size:12px;color:#64748b}
      .generator-size-field small{font-size:11px;color:#94a3b8;white-space:nowrap}
      .generator-toggle{position:relative;display:inline-flex;align-items:center;gap:9px;min-height:38px;padding:0 4px;cursor:pointer;user-select:none}
      .generator-toggle input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
      .generator-toggle-track{position:relative;width:38px;height:22px;border-radius:999px;background:#cbd5e1;flex:0 0 auto;transition:.18s ease}
      .generator-toggle-track::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.25);transition:.18s ease}
      .generator-toggle input:checked+.generator-toggle-track{background:#2563eb}
      .generator-toggle input:checked+.generator-toggle-track::after{transform:translateX(16px)}
      .generator-toggle input:focus-visible+.generator-toggle-track{outline:3px solid #bfdbfe}
      .generator-toggle-copy{display:grid;gap:1px}
      .generator-toggle-copy b{font-size:13px;color:#334155}
      .generator-toggle-copy small{font-size:11px;color:#94a3b8}
      .generator-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:2px}
      .generator-actions .btn{min-height:40px;padding:9px 14px}
      .generator-actions #genGo{min-width:118px}
      .generator-actions .btn:disabled{opacity:.45}
      .generator-preview{margin-top:16px;min-height:160px;border:1px solid #dbe3ee;border-radius:14px;background:linear-gradient(180deg,#fff,#fbfdff);padding:20px;display:flex;align-items:center;justify-content:center;overflow:auto}
      .generator-preview canvas{max-width:100%;height:auto}
      #genVerify{margin-top:9px}.generator-tip{margin-top:12px}.generator-size-help{display:none}
      @media(max-width:820px){
        #barcodeGeneratorPanel{padding:16px}
        .barcode-mode-tabs{display:grid;width:100%;margin-bottom:16px}.barcode-mode-tabs .btn{min-width:0}
        .generator-grid{grid-template-columns:1fr;gap:12px}#genText{min-height:76px}
        .generator-controls{align-items:flex-start;gap:10px;padding:10px}.generator-size-field{width:100%}.generator-toggle{width:100%}
        .generator-actions{display:grid;grid-template-columns:1fr 1fr}.generator-actions #genGo{grid-column:1/-1}
        .generator-preview{min-height:135px;padding:14px}
      }
    `;
    document.head.appendChild(style);
  }

  function ui(){
    const section = el('barcode');
    if(!section || el('barcodeGeneratorPanel')) return;
    styles();

    const panel = document.createElement('div');
    panel.id = 'barcodeGeneratorPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="section-title"><div><h3>▥ 條碼工具</h3><p class="muted compact">客戶給圖片就讀碼；客戶給內容就直接生碼，不用先開 BarTender。</p></div></div>
      <div class="barcode-mode-tabs"><button id="modeGenerate" class="btn primary" type="button">產生條碼</button><button id="modeRead" class="btn ghost" type="button">讀取客戶條碼</button></div>
      <div id="barcodeGenerateBody">
        <div class="generator-grid">
          <div class="field"><label for="genType">條碼種類</label><select id="genType">${Object.keys(TYPES).map(name => `<option>${esc(name)}</option>`).join('')}</select></div>
          <div class="field"><label for="genText">客戶指定內容</label><textarea id="genText" rows="2" placeholder="例如：ABC123、LOT20260910、網址，或 (01)... 的 GS1 內容"></textarea></div>
        </div>
        <div class="generator-controls">
          <div id="gen1DOptions" class="generator-size-field"><label for="genHeight">一維碼高度</label><input id="genHeight" type="number" min="2" max="40" step="0.5" value="4"><span class="unit">mm</span><small>2–40</small></div>
          <label id="genHumanWrap" class="generator-toggle" for="genHuman"><input id="genHuman" type="checkbox" checked><span class="generator-toggle-track" aria-hidden="true"></span><span class="generator-toggle-copy"><b>顯示條碼文字</b><small>一維碼下方內容</small></span></label>
          <div id="gen2DOptions" class="generator-size-field hidden"><label for="gen2DSize">二維碼大小</label><input id="gen2DSize" type="number" min="1" max="10" step="1" value="3"><span class="unit">級</span><small>1–10</small></div>
        </div>
        <div class="generator-actions"><button id="genGo" class="btn primary" type="button">立即產生</button><button id="genCopyText" class="btn ghost" type="button" disabled>複製內容</button><button id="genCopyImage" class="btn ghost" type="button" disabled>複製圖片</button><button id="genDownload" class="btn ghost" type="button" disabled>下載 PNG</button></div>
        <div id="genMessage"></div>
        <div id="genPreview" class="generator-preview"><div class="empty">輸入內容後按「立即產生」。</div></div>
        <div id="genVerify" class="footer-note"></div>
        <div class="note generator-tip"><b>貼到 BarTender：</b>「複製圖片」可用來貼成圖片物件，適合固定不變的條碼；若條碼內容要連 Excel、流水號或每張變動，仍應使用 BarTender 原生條碼物件。圖片貼入後不要任意拉伸變形，正式列印仍要實際掃碼確認。</div>
      </div>`;
    section.insertBefore(panel,section.firstChild);

    el('genGo').onclick = generate;
    el('genDownload').onclick = downloadPng;
    el('genCopyImage').onclick = copyImage;
    el('genCopyText').onclick = copyText;
    el('modeGenerate').onclick = () => switchMode('generate');
    el('modeRead').onclick = () => switchMode('read');
    el('genText').addEventListener('keydown',event => {
      if((event.ctrlKey || event.metaKey) && event.key === 'Enter') generate();
    });
    el('genType').addEventListener('change',updateSizeControls);
    updateSizeControls();
    switchMode('generate');
  }

  function init(){ ui(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();

  window.LabelWorkbenchBarcodeGenerator = {
    BUILD,generate,validate,TYPES,TWO_D,linearHeight,twoDScale,buildOptions
  };
})();
