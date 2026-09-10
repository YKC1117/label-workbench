/* Label Workbench barcode generator v1.5
 * Customer gives content -> generate a scannable 1D/2D barcode directly in the browser.
 */
(function(){
  'use strict';

  const BUILD='20260910-v150';
  const BWIP_SRC='https://cdn.jsdelivr.net/npm/bwip-js@4.6.0/dist/bwip-js-min.js';
  let loadPromise=null,last={type:'',text:'',canvas:null};
  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const toast=m=>{if(typeof window.toast==='function')window.toast(m)};

  const TYPES={
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
  const TWO_D=new Set(['QR Code','Data Matrix','GS1 DataMatrix','PDF417','Aztec']);

  function loadBwip(){
    if(window.bwipjs?.toCanvas)return Promise.resolve(window.bwipjs);
    if(loadPromise)return loadPromise;
    loadPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=BWIP_SRC;s.async=true;s.crossOrigin='anonymous';
      s.onload=()=>window.bwipjs?.toCanvas?resolve(window.bwipjs):reject(new Error('條碼產生元件載入不完整'));
      s.onerror=()=>reject(new Error('條碼產生元件載入失敗'));
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  function checksum(digits){
    const a=[...digits].map(Number);let sum=0;
    for(let i=a.length-1,pos=1;i>=0;i--,pos++)sum+=a[i]*(pos%2?3:1);
    return (10-sum%10)%10;
  }

  function validate(type,text){
    if(!text)return '請先輸入要製作的條碼內容。';
    if(type==='Code 39'&&!/^[0-9A-Z \-.$/+%]+$/.test(text))return 'Code 39 只能使用大寫英文字母、數字、空白與 - . $ / + %。';
    if(type==='EAN-13'){
      if(!/^\d{12,13}$/.test(text))return 'EAN-13 請輸入 12 或 13 位數字。';
      if(text.length===13&&checksum(text.slice(0,12))!==+text[12])return `EAN-13 檢查碼不正確，前 12 碼正確檢查碼應為 ${checksum(text.slice(0,12))}。`;
    }
    if(type==='EAN-8'){
      if(!/^\d{7,8}$/.test(text))return 'EAN-8 請輸入 7 或 8 位數字。';
      if(text.length===8&&checksum(text.slice(0,7))!==+text[7])return `EAN-8 檢查碼不正確，前 7 碼正確檢查碼應為 ${checksum(text.slice(0,7))}。`;
    }
    if(type==='UPC-A'&&!/^\d{11,12}$/.test(text))return 'UPC-A 請輸入 11 或 12 位數字。';
    if(type==='ITF-14'&&!/^\d{13,14}$/.test(text))return 'ITF-14 請輸入 13 或 14 位數字。';
    if(type==='Interleaved 2 of 5'&&!/^\d+$/.test(text))return 'Interleaved 2 of 5 只能輸入數字。';
    if(type.startsWith('GS1')&&!/^\(\d{2,4}\).+/.test(text))return 'GS1 建議用 (AI)內容 格式，例如：(01)04712345678903(17)260930(10)LOT001。';
    return '';
  }

  function buildOptions(type,text){
    const opts={bcid:TYPES[type],text,scale:3,paddingwidth:4,paddingheight:4,backgroundcolor:'FFFFFF'};
    if(TWO_D.has(type)){
      if(type==='QR Code')opts.eclevel='M';
    }else{
      opts.height=Math.max(8,Math.min(40,Number(el('genHeight')?.value||14)));
      opts.includetext=!!el('genHuman')?.checked;
      opts.textxalign='center';
      opts.textsize=10;
    }
    return opts;
  }

  async function verifyGenerated(canvas,text){
    const box=el('genVerify');if(!box)return;
    const core=window.LabelWorkbenchBarcodeCore;
    if(!core?.scanCanvas){box.textContent='條碼已產生；讀碼驗證元件尚未載入。';return}
    box.textContent='正在自動回讀確認…';
    try{
      const rows=await core.scanCanvas(canvas,'剛產生的條碼');
      if(!rows.length){box.innerHTML='⚠️ 條碼已產生，但瀏覽器沒有成功自動回讀；正式交付前仍建議用實際掃碼槍驗證。';return}
      const shown=core.visibleText?core.visibleText(rows[0].text):rows[0].text;
      box.innerHTML=`✅ 已自動回讀：<b>${esc(rows[0].format||'條碼')}</b>｜<code>${esc(shown)}</code>`;
    }catch(e){box.textContent='條碼已產生；自動回讀驗證失敗，正式使用前請以掃碼槍確認。'}
  }

  async function generate(){
    const type=el('genType')?.value||'Code 128';
    let text=(el('genText')?.value||'').trim();
    const error=validate(type,text),msg=el('genMessage'),preview=el('genPreview');
    if(error){msg.innerHTML=`<div class="note warn-note">${esc(error)}</div>`;preview.innerHTML='<div class="empty">修正內容後再產生。</div>';return}
    if(type==='EAN-13'&&text.length===12){text+=checksum(text);el('genText').value=text}
    if(type==='EAN-8'&&text.length===7){text+=checksum(text);el('genText').value=text}
    msg.innerHTML='<div class="scan-working">正在產生條碼…</div>';
    try{
      const bwip=await loadBwip();
      preview.innerHTML='<canvas id="genCanvas"></canvas>';
      const canvas=el('genCanvas');
      bwip.toCanvas(canvas,buildOptions(type,text));
      last={type,text,canvas};
      msg.innerHTML=`<div class="note"><b>已產生：</b>${esc(type)}｜實際內容：<code>${esc(text)}</code></div>`;
      el('genDownload').disabled=false;el('genCopyImage').disabled=false;el('genCopyText').disabled=false;
      await verifyGenerated(canvas,text);
    }catch(e){
      last={type:'',text:'',canvas:null};
      preview.innerHTML='<div class="empty">無法產生預覽。</div>';
      msg.innerHTML=`<div class="note warn-note"><b>產生失敗：</b>${esc(e?.message||e)}<br>請檢查條碼類型與內容格式。</div>`;
    }
  }

  function downloadPng(){
    if(!last.canvas)return;
    last.canvas.toBlob(blob=>{
      if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${last.type.replace(/\s+/g,'_')}_${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    },'image/png');
  }

  async function copyImage(){
    if(!last.canvas)return;
    try{
      const blob=await new Promise(r=>last.canvas.toBlob(r,'image/png'));
      if(!blob||!navigator.clipboard||!window.ClipboardItem)throw new Error('browser');
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('已複製條碼圖片');
    }catch{toast('這個瀏覽器無法直接複製圖片，請使用下載 PNG')}
  }

  async function copyText(){
    if(!last.text)return;
    try{await navigator.clipboard.writeText(last.text);toast('已複製條碼內容')}catch{toast('複製失敗')}
  }

  function switchMode(mode){
    const body=el('barcodeGenerateBody'),scanner=el('barcodeScannerPanel');
    if(body)body.classList.toggle('hidden',mode!=='generate');
    if(scanner)scanner.classList.toggle('hidden',mode!=='read');
    el('modeGenerate')?.classList.toggle('primary',mode==='generate');
    el('modeGenerate')?.classList.toggle('ghost',mode!=='generate');
    el('modeRead')?.classList.toggle('primary',mode==='read');
    el('modeRead')?.classList.toggle('ghost',mode!=='read');
  }

  function styles(){
    if(el('barcodeGeneratorStyle'))return;
    const s=document.createElement('style');s.id='barcodeGeneratorStyle';s.textContent=`
      .barcode-mode-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 18px}.barcode-mode-tabs .btn{min-width:160px}
      .generator-grid{display:grid;grid-template-columns:220px 1fr;gap:14px}.generator-options{display:grid;grid-template-columns:180px 180px;gap:12px;margin-top:12px}
      .generator-preview{margin-top:16px;min-height:180px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff;padding:18px;display:flex;align-items:center;justify-content:center;overflow:auto}
      .generator-preview canvas{max-width:100%;height:auto}.generator-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
      #genVerify{margin-top:10px}.generator-tip{margin-top:12px}
      @media(max-width:820px){.generator-grid{grid-template-columns:1fr}.generator-options{grid-template-columns:1fr 1fr}.barcode-mode-tabs .btn{flex:1;min-width:0}.generator-actions .btn{flex:1}.generator-preview{min-height:150px}}
    `;document.head.appendChild(s);
  }

  function ui(){
    const sec=el('barcode');if(!sec||el('barcodeGeneratorPanel'))return;
    styles();
    const legacy=el('scratchType')?.closest('.panel');if(legacy)legacy.classList.add('hidden');
    const p=document.createElement('div');p.id='barcodeGeneratorPanel';p.className='panel';
    p.innerHTML=`
      <div class="section-title"><div><h3>▥ 條碼工具</h3><p class="muted compact">客戶給圖片就讀碼；客戶給內容就直接生碼，不用先開 BarTender。</p></div><span class="pill">v1.5</span></div>
      <div class="barcode-mode-tabs"><button id="modeGenerate" class="btn primary" type="button">產生條碼</button><button id="modeRead" class="btn ghost" type="button">讀取客戶條碼</button></div>
      <div id="barcodeGenerateBody">
        <div class="generator-grid">
          <div class="field"><label for="genType">條碼種類</label><select id="genType">${Object.keys(TYPES).map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
          <div class="field"><label for="genText">客戶指定內容</label><textarea id="genText" rows="3" placeholder="例如：ABC123、LOT20260910、網址，或 (01)... 的 GS1 內容"></textarea></div>
        </div>
        <div class="generator-options"><div class="field"><label for="genHeight">一維碼高度</label><input id="genHeight" type="number" min="8" max="40" value="14"></div><label class="field"><span>條碼下方文字</span><span><input id="genHuman" type="checkbox" checked> 顯示</span></label></div>
        <div class="generator-actions"><button id="genGo" class="btn primary" type="button">立即產生</button><button id="genCopyText" class="btn ghost" type="button" disabled>複製內容</button><button id="genCopyImage" class="btn ghost" type="button" disabled>複製圖片</button><button id="genDownload" class="btn ghost" type="button" disabled>下載 PNG</button></div>
        <div id="genMessage"></div><div id="genPreview" class="generator-preview"><div class="empty">輸入內容後按「立即產生」。</div></div><div id="genVerify" class="footer-note"></div>
        <div class="note generator-tip"><b>工作用法：</b>這裡適合先產生、預覽與確認條碼內容。正式貼標前仍以實際印表機尺寸、DPI 與掃碼槍測試為準；GS1 請依客戶規範確認 AI / FNC1。</div>
      </div>`;
    sec.insertBefore(p,sec.firstChild);
    el('genGo').onclick=generate;el('genDownload').onclick=downloadPng;el('genCopyImage').onclick=copyImage;el('genCopyText').onclick=copyText;
    el('modeGenerate').onclick=()=>switchMode('generate');el('modeRead').onclick=()=>switchMode('read');
    el('genText').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')generate()});
    el('genType').addEventListener('change',()=>{const is2d=TWO_D.has(el('genType').value);el('genHeight').disabled=is2d;el('genHuman').disabled=is2d});
    switchMode('generate');
  }

  function init(){ui();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.LabelWorkbenchBarcodeGenerator={BUILD,generate,validate,TYPES};
})();
