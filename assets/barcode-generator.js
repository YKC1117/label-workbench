/* Label Workbench barcode generator v2.0
 * Customer content -> generate scannable 1D/2D barcodes and arrange multiple codes on a simple canvas.
 * Layout stays local in the current browser; exported/copy output contains only barcode graphics on white.
 */
(function(){
  'use strict';

  const BUILD = '20260910-v200';
  const BWIP_SRC = 'https://cdn.jsdelivr.net/npm/bwip-js@4.6.0/dist/bwip-js-min.js';
  let loadPromise = null;
  let last = {type:'', text:'', canvas:null};
  let layoutItems = [];
  let selectedId = null;
  let itemSeq = 0;

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
      box.textContent = '條碼已加入排版；讀碼驗證元件尚未載入。';
      return;
    }
    box.textContent = '正在自動回讀確認剛加入的條碼…';
    try{
      const rows = await core.scanCanvas(canvas,'剛產生的條碼');
      if(!rows.length){
        box.innerHTML = '⚠️ 已加入排版，但瀏覽器沒有成功自動回讀；正式交付前仍建議用實際掃碼槍驗證。';
        return;
      }
      const shown = core.visibleText ? core.visibleText(rows[0].text) : rows[0].text;
      box.innerHTML = `✅ 已自動回讀：<b>${esc(rows[0].format || '條碼')}</b>｜<code>${esc(shown)}</code>`;
    }catch{
      box.textContent = '條碼已加入排版；自動回讀驗證失敗，正式使用前請以掃碼槍確認。';
    }
  }

  function cloneCanvas(source){
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,copy.width,copy.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source,0,0);
    return copy;
  }

  function displaySize(canvas){
    const board = el('layoutBoard');
    const boardWidth = board?.clientWidth || 960;
    const maxWidth = Math.max(180,Math.min(430,boardWidth-56));
    const maxHeight = 230;
    const scale = Math.min(1,maxWidth/Math.max(1,canvas.width),maxHeight/Math.max(1,canvas.height));
    return {
      width:Math.max(24,Math.round(canvas.width*scale)),
      height:Math.max(24,Math.round(canvas.height*scale))
    };
  }

  function layoutPlan(sizes,boardWidth,gap=18,margin=20){
    const width = Math.max(260,Number(boardWidth)||260);
    let x=margin,y=margin,rowHeight=0;
    return (sizes||[]).map(size=>{
      const w=Math.max(1,Number(size?.width)||1),h=Math.max(1,Number(size?.height)||1);
      if(x>margin && x+w>width-margin){
        x=margin;
        y+=rowHeight+gap;
        rowHeight=0;
      }
      const point={x,y};
      x+=w+gap;
      rowHeight=Math.max(rowHeight,h);
      return point;
    });
  }

  function selectedItem(){
    return layoutItems.find(item=>item.id===selectedId) || null;
  }

  function updateLayoutUi(){
    const count=layoutItems.length;
    if(el('layoutCount')) el('layoutCount').textContent=`${count} 個`;
    el('layoutEmpty')?.classList.toggle('hidden',count>0);
    for(const id of ['layoutAuto','layoutCopyAll','layoutDownloadAll','layoutClear']){
      if(el(id)) el(id).disabled=!count;
    }

    const selected=selectedItem(),bar=el('layoutSelectionBar'),label=el('layoutSelectedLabel');
    if(bar) bar.classList.toggle('hidden',!selected);
    if(selected && label){
      const short=selected.text.length>44?selected.text.slice(0,44)+'…':selected.text;
      label.innerHTML=`<b>${esc(selected.type)}</b><span>${esc(short)}</span>`;
    }
    for(const id of ['genCopyText','genCopyImage','genDownload','layoutDuplicate','layoutDelete']){
      if(el(id)) el(id).disabled=!selected;
    }
    if(selected) last={type:selected.type,text:selected.text,canvas:selected.canvas};
    else last={type:'',text:'',canvas:null};
  }

  function selectLayoutItem(id){
    selectedId = layoutItems.some(item=>item.id===id) ? id : null;
    el('layoutBoard')?.querySelectorAll('.layout-barcode-item').forEach(node=>{
      node.classList.toggle('selected',node.dataset.layoutId===selectedId);
    });
    updateLayoutUi();
  }

  function updateBoardHeight(){
    const board=el('layoutBoard');
    if(!board) return;
    const bottom=layoutItems.reduce((max,item)=>Math.max(max,item.y+item.height),0);
    board.style.height=`${Math.max(380,bottom+34)}px`;
  }

  function clampItem(item){
    const board=el('layoutBoard');
    if(!board) return;
    const maxX=Math.max(8,board.clientWidth-item.width-8);
    const maxY=Math.max(8,board.clientHeight-item.height-8);
    item.x=Math.max(8,Math.min(maxX,item.x));
    item.y=Math.max(8,Math.min(maxY,item.y));
    if(item.node){
      item.node.style.left=`${item.x}px`;
      item.node.style.top=`${item.y}px`;
    }
  }

  function bindDrag(node,item){
    node.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse' && event.button!==0) return;
      selectLayoutItem(item.id);
      event.preventDefault();
      node.setPointerCapture?.(event.pointerId);
      const startX=event.clientX,startY=event.clientY,startLeft=item.x,startTop=item.y;
      node.classList.add('dragging');

      const move=ev=>{
        item.x=startLeft+(ev.clientX-startX);
        item.y=startTop+(ev.clientY-startY);
        clampItem(item);
      };
      const stop=ev=>{
        node.classList.remove('dragging');
        node.releasePointerCapture?.(ev.pointerId);
        node.removeEventListener('pointermove',move);
        node.removeEventListener('pointerup',stop);
        node.removeEventListener('pointercancel',stop);
      };
      node.addEventListener('pointermove',move);
      node.addEventListener('pointerup',stop);
      node.addEventListener('pointercancel',stop);
    });

    node.addEventListener('click',()=>selectLayoutItem(item.id));
    node.addEventListener('keydown',event=>{
      if(event.key==='Delete' || event.key==='Backspace'){
        event.preventDefault();
        deleteSelected();
        return;
      }
      const delta=event.shiftKey?10:2;
      const map={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};
      const d=map[event.key];
      if(!d) return;
      event.preventDefault();
      item.x+=d[0];item.y+=d[1];clampItem(item);
    });
  }

  function nextPlacement(width,height){
    const board=el('layoutBoard');
    const boardWidth=board?.clientWidth || 960;
    if(!layoutItems.length) return {x:20,y:20};
    const lastItem=layoutItems[layoutItems.length-1];
    let x=lastItem.x+lastItem.width+18;
    let y=lastItem.y;
    if(x+width>boardWidth-20){
      x=20;
      y=Math.max(...layoutItems.map(item=>item.y+item.height))+18;
    }
    return {x,y};
  }

  function addCanvasToLayout(source,type,text){
    const board=el('layoutBoard');
    if(!board) return null;
    const canvas=cloneCanvas(source);
    const size=displaySize(canvas);
    const wrapperWidth=size.width+20,wrapperHeight=size.height+20;
    const point=nextPlacement(wrapperWidth,wrapperHeight);
    const item={
      id:`layout-${Date.now()}-${++itemSeq}`,
      type,text,canvas,
      displayWidth:size.width,displayHeight:size.height,
      width:wrapperWidth,height:wrapperHeight,
      x:point.x,y:point.y,node:null
    };
    layoutItems.push(item);

    const node=document.createElement('div');
    node.className='layout-barcode-item';
    node.dataset.layoutId=item.id;
    node.tabIndex=0;
    node.setAttribute('role','button');
    node.setAttribute('aria-label',`${type} 條碼，可拖曳移動`);
    node.title=`${type}｜${text}\n拖曳移動；方向鍵可微調位置`;
    node.style.left=`${item.x}px`;
    node.style.top=`${item.y}px`;
    node.style.width=`${item.width}px`;
    node.style.height=`${item.height}px`;
    canvas.style.width=`${item.displayWidth}px`;
    canvas.style.height=`${item.displayHeight}px`;
    node.appendChild(canvas);
    item.node=node;
    board.appendChild(node);
    bindDrag(node,item);
    updateBoardHeight();
    selectLayoutItem(item.id);
    return item;
  }

  function autoLayout(){
    const board=el('layoutBoard');
    if(!board || !layoutItems.length) return;
    const points=layoutPlan(layoutItems.map(item=>({width:item.width,height:item.height})),board.clientWidth,18,20);
    layoutItems.forEach((item,index)=>{
      item.x=points[index].x;
      item.y=points[index].y;
      if(item.node){
        item.node.style.left=`${item.x}px`;
        item.node.style.top=`${item.y}px`;
      }
    });
    updateBoardHeight();
    toast('已自動整齊排列');
  }

  function duplicateSelected(){
    const item=selectedItem();
    if(!item) return;
    addCanvasToLayout(item.canvas,item.type,item.text);
    toast('已複製一份到排版區');
  }

  function deleteSelected(){
    const item=selectedItem();
    if(!item) return;
    item.node?.remove();
    layoutItems=layoutItems.filter(row=>row.id!==item.id);
    selectedId=layoutItems.at(-1)?.id || null;
    updateBoardHeight();
    selectLayoutItem(selectedId);
  }

  function clearLayout(){
    if(!layoutItems.length) return;
    if(typeof window.confirm==='function' && !window.confirm('要清空目前排版區的所有條碼嗎？')) return;
    layoutItems.forEach(item=>item.node?.remove());
    layoutItems=[];
    selectedId=null;
    updateBoardHeight();
    selectLayoutItem(null);
    if(el('genVerify')) el('genVerify').textContent='';
    if(el('genMessage')) el('genMessage').innerHTML='';
    toast('排版區已清空');
  }

  function renderComposite(){
    if(!layoutItems.length) return null;
    const margin=24,scale=2;
    const left=Math.min(...layoutItems.map(item=>item.x+10));
    const top=Math.min(...layoutItems.map(item=>item.y+10));
    const right=Math.max(...layoutItems.map(item=>item.x+10+item.displayWidth));
    const bottom=Math.max(...layoutItems.map(item=>item.y+10+item.displayHeight));
    const out=document.createElement('canvas');
    out.width=Math.max(1,Math.ceil((right-left+margin*2)*scale));
    out.height=Math.max(1,Math.ceil((bottom-top+margin*2)*scale));
    const ctx=out.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,out.width,out.height);
    ctx.imageSmoothingEnabled=false;
    layoutItems.forEach(item=>{
      const x=Math.round((item.x+10-left+margin)*scale);
      const y=Math.round((item.y+10-top+margin)*scale);
      const w=Math.round(item.displayWidth*scale);
      const h=Math.round(item.displayHeight*scale);
      ctx.drawImage(item.canvas,x,y,w,h);
    });
    return out;
  }

  function canvasBlob(canvas){
    return new Promise(resolve=>canvas?.toBlob(resolve,'image/png'));
  }

  function triggerDownload(canvas,name){
    if(!canvas) return;
    canvas.toBlob(blob=>{
      if(!blob) return;
      const link=document.createElement('a');
      link.href=URL.createObjectURL(blob);
      link.download=name;
      link.click();
      setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    },'image/png');
  }

  async function writeCanvasToClipboard(canvas,successMessage){
    try{
      const blob=await canvasBlob(canvas);
      if(!blob || !navigator.clipboard?.write || !window.ClipboardItem) throw new Error('browser');
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      toast(successMessage);
      return true;
    }catch{
      toast('這個瀏覽器無法直接複製圖片，請改用下載 PNG');
      return false;
    }
  }

  function downloadPng(){
    const item=selectedItem();
    if(!item) return;
    triggerDownload(item.canvas,`${item.type.trim().split(' ').join('_')}_${Date.now()}.png`);
  }

  async function copyImage(){
    const item=selectedItem();
    if(!item) return;
    await writeCanvasToClipboard(item.canvas,'已複製選取的條碼圖片');
  }

  async function copyText(){
    const item=selectedItem();
    if(!item) return;
    try{
      await navigator.clipboard.writeText(item.text);
      toast('已複製條碼內容');
    }catch{
      toast('複製失敗');
    }
  }

  async function copyLayoutImage(){
    const canvas=renderComposite();
    if(!canvas) return;
    await writeCanvasToClipboard(canvas,'已複製整個排版，可直接貼給客戶或貼到支援圖片的軟體');
  }

  function downloadLayoutPng(){
    const canvas=renderComposite();
    if(!canvas) return;
    triggerDownload(canvas,`Label_Workbench_排版_${Date.now()}.png`);
  }

  async function generate(){
    const type=el('genType')?.value || 'Code 128';
    let text=(el('genText')?.value || '').trim();
    const error=validate(type,text);
    const message=el('genMessage');

    if(error){
      message.innerHTML=`<div class="note warn-note">${esc(error)}</div>`;
      return;
    }
    if(type==='EAN-13' && text.length===12){
      text+=checksum(text);
      el('genText').value=text;
    }
    if(type==='EAN-8' && text.length===7){
      text+=checksum(text);
      el('genText').value=text;
    }

    message.innerHTML='<div class="scan-working">正在產生並加入排版…</div>';
    try{
      const bwip=await loadBwip();
      const canvas=document.createElement('canvas');
      bwip.toCanvas(canvas,buildOptions(type,text));
      const item=addCanvasToLayout(canvas,type,text);
      if(!item) throw new Error('排版工作區尚未載入');
      const sizeText=TWO_D.has(type)?`二維碼大小 ${twoDScale()} 級`:`高度 ${linearHeight()} mm`;
      message.innerHTML=`<div class="layout-added"><b>✓ 已加入第 ${layoutItems.length} 個</b><span>${esc(type)}｜${esc(sizeText)}｜可直接拖曳移動</span></div>`;
      await verifyGenerated(item.canvas,text);
    }catch(err){
      message.innerHTML=`<div class="note warn-note"><b>產生失敗：</b>${esc(err?.message || err)}<br>請檢查條碼類型與內容格式。</div>`;
    }
  }

  function switchMode(mode){
    el('barcodeGenerateBody')?.classList.toggle('hidden',mode!=='generate');
    el('barcodeScannerPanel')?.classList.toggle('hidden',mode!=='read');
    el('modeGenerate')?.classList.toggle('primary',mode==='generate');
    el('modeGenerate')?.classList.toggle('ghost',mode!=='generate');
    el('modeRead')?.classList.toggle('primary',mode==='read');
    el('modeRead')?.classList.toggle('ghost',mode!=='read');
  }

  function styles(){
    if(el('barcodeGeneratorStyle')) return;
    const style=document.createElement('style');
    style.id='barcodeGeneratorStyle';
    style.textContent=`
      #barcodeGeneratorPanel{padding:24px}
      #barcodeGeneratorPanel>.section-title{margin-bottom:12px}
      .barcode-mode-tabs{display:inline-grid;grid-template-columns:1fr 1fr;gap:4px;margin:6px 0 20px;padding:4px;background:#eef2f7;border:1px solid #e2e8f0;border-radius:13px}
      .barcode-mode-tabs .btn{min-width:170px;min-height:40px;border:0!important;border-radius:9px;box-shadow:none!important;transform:none!important}
      .barcode-mode-tabs .btn.primary{background:#fff;color:#1d4ed8;box-shadow:0 1px 4px rgba(15,23,42,.09)!important}
      .barcode-mode-tabs .btn.ghost{background:transparent;color:#64748b}
      .generator-grid{display:grid;grid-template-columns:240px minmax(0,1fr);gap:14px;align-items:start}
      .generator-grid .field{gap:7px}
      #genText{min-height:76px;max-height:140px;resize:vertical;line-height:1.5}
      .generator-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
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
      .generator-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .generator-actions #genGo{min-width:142px}
      .layout-added{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;color:#166534;font-size:11px}
      .layout-added b{padding:5px 8px;border-radius:999px;background:#ecfdf3}
      .layout-added span{color:#64748b}
      #genVerify{margin-top:7px}
      .layout-workspace{margin-top:16px;border:1px solid #dfe5ed;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 3px 12px rgba(15,23,42,.03)}
      .layout-workspace-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 15px;background:linear-gradient(180deg,#fbfdff,#f8fafc);border-bottom:1px solid #e7ecf2}
      .layout-workspace-title{min-width:0}
      .layout-workspace-title h3{display:flex;align-items:center;gap:8px;margin:0;color:#172033;font-size:15px}
      .layout-workspace-title p{margin:4px 0 0;color:#64748b;font-size:10px;line-height:1.45}
      .layout-main-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .layout-main-actions .btn{min-height:34px;padding:7px 10px;font-size:11px}
      .layout-selection-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 14px;background:#eff6ff;border-bottom:1px solid #dbeafe}
      .layout-selection-info{display:flex;align-items:center;gap:8px;min-width:0;font-size:11px}
      .layout-selection-info b{color:#1d4ed8;white-space:nowrap}
      .layout-selection-info span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;max-width:360px}
      .layout-selection-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .layout-selection-actions .btn{min-height:30px;padding:6px 9px;font-size:10px}
      .layout-board-shell{overflow:auto;background:#eef3f9;padding:12px}
      .layout-board{position:relative;min-width:720px;width:100%;height:380px;min-height:380px;overflow:hidden;border:1px solid #dbe3ee;border-radius:13px;background:
        linear-gradient(90deg,rgba(203,213,225,.28) 1px,transparent 1px),
        linear-gradient(rgba(203,213,225,.28) 1px,transparent 1px),#fff;
        background-size:24px 24px;box-shadow:inset 0 1px 2px rgba(15,23,42,.02)}
      .layout-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;pointer-events:none;color:#64748b;font-size:12px}
      .layout-empty div{padding:17px 22px;border:1px dashed #cbd5e1;border-radius:12px;background:rgba(248,250,252,.92)}
      .layout-empty b{display:block;color:#334155;margin-bottom:4px}
      .layout-barcode-item{position:absolute;display:flex;align-items:center;justify-content:center;padding:10px;background:#fff;border:1px solid transparent;border-radius:11px;box-shadow:0 4px 14px rgba(15,23,42,.08);cursor:grab;user-select:none;touch-action:none;transition:border-color .12s ease,box-shadow .12s ease,transform .12s ease}
      .layout-barcode-item:hover{border-color:#bfdbfe;box-shadow:0 8px 18px rgba(15,23,42,.11)}
      .layout-barcode-item.selected{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12),0 8px 20px rgba(15,23,42,.11)}
      .layout-barcode-item.dragging{cursor:grabbing;transform:scale(1.01);z-index:5;transition:none}
      .layout-barcode-item canvas{display:block;max-width:none;height:auto;pointer-events:none;image-rendering:auto}
      .layout-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid #e7ecf2;color:#64748b;font-size:10px}
      .layout-footer .btn{min-height:30px;padding:6px 9px;font-size:10px}
      .generator-tip{margin-top:12px}
      @media(max-width:820px){
        #barcodeGeneratorPanel{padding:16px}
        .barcode-mode-tabs{display:grid;width:100%;margin-bottom:16px}.barcode-mode-tabs .btn{min-width:0}
        .generator-grid{grid-template-columns:1fr;gap:12px}#genText{min-height:72px}
        .generator-controls{align-items:flex-start;gap:10px;padding:10px}.generator-size-field{width:100%}.generator-toggle{width:100%}
        .generator-actions #genGo{width:100%}
        .layout-workspace-head{align-items:flex-start;flex-direction:column}
        .layout-main-actions{width:100%;justify-content:flex-start}.layout-main-actions .btn{flex:1}
        .layout-selection-bar{align-items:flex-start;flex-direction:column}.layout-selection-info{width:100%}.layout-selection-actions{width:100%;justify-content:flex-start}
        .layout-selection-actions .btn{flex:1}
        .layout-board-shell{padding:8px}.layout-board{min-width:680px}
        .layout-footer{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  function ui(){
    const section=el('barcode');
    if(!section || el('barcodeGeneratorPanel')) return;
    styles();

    const panel=document.createElement('div');
    panel.id='barcodeGeneratorPanel';
    panel.className='panel';
    panel.innerHTML=`
      <div class="section-title"><div><h3>▥ 條碼工具</h3><p class="muted compact">客戶給圖片就讀碼；客戶給內容就直接生碼，不用先開 BarTender。</p></div></div>
      <div class="barcode-mode-tabs"><button id="modeGenerate" class="btn primary" type="button">產生條碼</button><button id="modeRead" class="btn ghost" type="button">讀取客戶條碼</button></div>
      <div id="barcodeGenerateBody">
        <div class="generator-grid">
          <div class="field"><label for="genType">條碼種類</label><select id="genType">${Object.keys(TYPES).map(name=>`<option>${esc(name)}</option>`).join('')}</select></div>
          <div class="field"><label for="genText">客戶指定內容</label><textarea id="genText" rows="2" placeholder="例如：ABC123、LOT20260910、網址，或 (01)... 的 GS1 內容"></textarea></div>
        </div>
        <div class="generator-controls">
          <div id="gen1DOptions" class="generator-size-field"><label for="genHeight">一維碼高度</label><input id="genHeight" type="number" min="2" max="40" step="0.5" value="4"><span class="unit">mm</span><small>2–40</small></div>
          <label id="genHumanWrap" class="generator-toggle" for="genHuman"><input id="genHuman" type="checkbox" checked><span class="generator-toggle-track" aria-hidden="true"></span><span class="generator-toggle-copy"><b>顯示條碼文字</b><small>一維碼下方內容</small></span></label>
          <div id="gen2DOptions" class="generator-size-field hidden"><label for="gen2DSize">二維碼大小</label><input id="gen2DSize" type="number" min="1" max="10" step="1" value="3"><span class="unit">級</span><small>1–10</small></div>
        </div>
        <div class="generator-actions"><button id="genGo" class="btn primary" type="button">＋ 加入排版</button></div>
        <div id="genMessage"></div>
        <div id="genVerify" class="footer-note"></div>

        <div class="layout-workspace">
          <div class="layout-workspace-head">
            <div class="layout-workspace-title"><h3>排版工作區 <span id="layoutCount" class="pill">0 個</span></h3><p>每個條碼都可以用滑鼠或手指拖曳。格線只協助排版，整張輸出不會包含格線。</p></div>
            <div class="layout-main-actions">
              <button id="layoutAuto" class="btn ghost" type="button" disabled>整齊排列</button>
              <button id="layoutCopyAll" class="btn ghost" type="button" disabled>複製整張</button>
              <button id="layoutDownloadAll" class="btn primary" type="button" disabled>下載整張</button>
            </div>
          </div>
          <div id="layoutSelectionBar" class="layout-selection-bar hidden">
            <div id="layoutSelectedLabel" class="layout-selection-info"></div>
            <div class="layout-selection-actions">
              <button id="genCopyText" class="btn ghost" type="button" disabled>複製內容</button>
              <button id="genCopyImage" class="btn ghost" type="button" disabled>複製圖片</button>
              <button id="genDownload" class="btn ghost" type="button" disabled>下載單個</button>
              <button id="layoutDuplicate" class="btn ghost" type="button" disabled>複製一份</button>
              <button id="layoutDelete" class="btn danger" type="button" disabled>刪除</button>
            </div>
          </div>
          <div class="layout-board-shell">
            <div id="layoutBoard" class="layout-board">
              <div id="layoutEmpty" class="layout-empty"><div><b>還沒有條碼</b>輸入內容後按「＋ 加入排版」；產生後可直接拖曳位置。</div></div>
            </div>
          </div>
          <div class="layout-footer"><span>輸出會自動裁掉外圍多餘空白，只留下你目前排好的條碼內容。</span><button id="layoutClear" class="btn ghost" type="button" disabled>清空版面</button></div>
        </div>

        <div class="note generator-tip"><b>外出使用：</b>可以連續加入多個一維碼、QR Code、Data Matrix 後直接排給客戶看；「複製整張／下載整張」會輸出成一張白底圖片。若要正式放進 BarTender 並讓每個條碼各自連 Excel、流水號或資料庫，仍應使用 BarTender 原生條碼物件。</div>
      </div>`;
    section.insertBefore(panel,section.firstChild);

    el('genGo').onclick=generate;
    el('genDownload').onclick=downloadPng;
    el('genCopyImage').onclick=copyImage;
    el('genCopyText').onclick=copyText;
    el('layoutAuto').onclick=autoLayout;
    el('layoutDuplicate').onclick=duplicateSelected;
    el('layoutDelete').onclick=deleteSelected;
    el('layoutClear').onclick=clearLayout;
    el('layoutCopyAll').onclick=copyLayoutImage;
    el('layoutDownloadAll').onclick=downloadLayoutPng;
    el('modeGenerate').onclick=()=>switchMode('generate');
    el('modeRead').onclick=()=>switchMode('read');
    el('genText').addEventListener('keydown',event=>{
      if((event.ctrlKey || event.metaKey) && event.key==='Enter') generate();
    });
    el('genType').addEventListener('change',updateSizeControls);
    updateSizeControls();
    updateLayoutUi();
    switchMode('generate');
  }

  function init(){ui();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();

  window.LabelWorkbenchBarcodeGenerator={
    BUILD,generate,validate,TYPES,TWO_D,linearHeight,twoDScale,buildOptions,
    layoutPlan,autoLayout,copyLayoutImage,downloadLayoutPng,renderComposite,
    selectLayoutItem,get layoutItems(){return layoutItems.slice();}
  };
})();