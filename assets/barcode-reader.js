/* Label Workbench image barcode reader.
 * Local 1D / 2D decoding with automatic deep scan, engine self-test and manual crop.
 * Customer images stay in this browser.
 */
(function(){
  'use strict';

  const VERSION='v1.0';
  const ZXING_VERSION='3.1.3';
  const WASM_SRC=`https://cdn.jsdelivr.net/npm/zxing-wasm@${ZXING_VERSION}/dist/iife/reader/index.js`;
  const WASM_BIN=`https://cdn.jsdelivr.net/npm/zxing-wasm@${ZXING_VERSION}/dist/reader/zxing_reader.wasm`;
  const SELFTEST_B64='iVBORw0KGgoAAAANSUhEUgAAAFcAAABXAQAAAABZs+TBAAAAzklEQVR4nM2TsW3DQAxFH20DchPdAgZ0Y7i7MuvYEyReIDPFlTyGgmSAO1cnQMhPkyDVUWXyKxYf5P/kp4kfaMMv/qpGGU4sMHy2+aYl1Pgkt+c1wlT2K3PLPq5qs7qmP010hOpxZDtuXMzzLqlIkpreUdGBBKm9H6Rxq3GbXU6pyykNL1171gaFbrh8MHu+euZ8nItzCyQpQxg9XxnO9d3XY1oewoE5+ne/H+PZzwb0vD1f25wdALfBHqv3F2myQnht6/nO89Q7ebZ/9oNf4CtfhnjR3jkAAAAASUVORK5CYII=';
  const SELFTEST_TEXT='LW-SELFTEST-OK';
  const MAX_IMAGES=8;
  const MAX_RESULTS=32;
  const MAX_DIM=3400;
  const PREVIEW_MAX_W=1100;
  const PREVIEW_MAX_H=720;

  const state={
    wasmPromise:null,
    prepared:false,
    selfTestPromise:null,
    selfTest:{ok:null,error:''},
    analysisPatched:false,
    currentFile:null,
    preview:{img:null,canvas:null,ctx:null,selection:null,dragging:false,start:null,scaleX:1,scaleY:1}
  };

  function el(id){return document.getElementById(id)}
  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function toast(msg){if(typeof window.toast==='function')window.toast(msg)}
  function isImage(f){return !!(f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''))}
  function formatName(raw){
    const key=String(raw??'').replace(/[\s_\-\/]/g,'').toUpperCase();
    const map={QRCODE:'QR Code',MICROQRCODE:'Micro QR Code',RMQRCODE:'rMQR Code',DATAMATRIX:'Data Matrix',CODE39:'Code 39',CODE39STD:'Code 39',CODE39EXT:'Code 39 Extended',CODE93:'Code 93',CODE128:'Code 128',EAN8:'EAN-8',EAN13:'EAN-13',UPCA:'UPC-A',UPCE:'UPC-E',EANUPC:'EAN / UPC',ITF:'ITF / Interleaved 2 of 5',ITF14:'ITF-14',PDF417:'PDF417',AZTEC:'Aztec',AZTECCODE:'Aztec',CODABAR:'Codabar',DATABAR:'DataBar',DATABAREXP:'DataBar Expanded',DATABARLTD:'DataBar Limited',MAXICODE:'MaxiCode'};
    return map[key]||String(raw||'未知格式').replace(/_/g,' ')
  }
  function visibleText(text){
    return [...String(text??'')].map(ch=>{const n=ch.charCodeAt(0);if(n===29)return '[GS]';if(n===30)return '[RS]';if(n===4)return '[EOT]';if(n===13)return '[CR]';if(n===10)return '[LF]';if(n===9)return '[TAB]';if(n<32||n===127)return `[0x${n.toString(16).toUpperCase().padStart(2,'0')}]`;return ch}).join('')
  }
  function resultKey(r){return `${formatName(r?.format)}\u0000${String(r?.text??'')}`}
  function dedupeResults(items){
    const seen=new Set(),out=[];
    for(const item of items||[]){
      if(item?.text==null||String(item.text)==='')continue;
      const r={format:formatName(item.format),text:String(item.text),engine:item.engine||'',source:item.source||'',position:item.position||null};
      const k=resultKey(r);if(seen.has(k))continue;seen.add(k);out.push(r);if(out.length>=MAX_RESULTS)break
    }
    return out
  }
  function hasGs(text){return [...String(text||'')].some(ch=>ch.charCodeAt(0)===29)}
  function copyText(text){navigator.clipboard?.writeText(String(text)).then(()=>toast('已複製條碼內容')).catch(()=>{const ta=document.createElement('textarea');ta.value=String(text);document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('已複製條碼內容')})}
  function b64Blob(b64,type='image/png'){const raw=atob(b64),buf=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);return new Blob([buf],{type})}

  function prepareModule(zx){
    if(state.prepared)return;
    if(typeof zx?.prepareZXingModule==='function'){
      zx.prepareZXingModule({overrides:{locateFile:(path,prefix)=>path.endsWith('.wasm')?WASM_BIN:prefix+path}});
    }
    state.prepared=true;
  }
  function loadWasm(){
    if(window.ZXingWASM?.readBarcodes){prepareModule(window.ZXingWASM);return Promise.resolve(window.ZXingWASM)}
    if(state.wasmPromise)return state.wasmPromise;
    state.wasmPromise=new Promise((resolve,reject)=>{
      const done=()=>{if(window.ZXingWASM?.readBarcodes){prepareModule(window.ZXingWASM);resolve(window.ZXingWASM)}else reject(new Error('讀碼核心載入不完整'))};
      const old=document.querySelector('script[data-label-zxing-wasm]');
      if(old){if(window.ZXingWASM?.readBarcodes)return done();old.addEventListener('load',done,{once:true});old.addEventListener('error',()=>reject(new Error('讀碼核心載入失敗')),{once:true});return}
      const s=document.createElement('script');s.src=WASM_SRC;s.async=true;s.dataset.labelZxingWasm='true';s.crossOrigin='anonymous';s.onload=done;s.onerror=()=>reject(new Error('無法載入免費讀碼核心'));document.head.appendChild(s)
    });
    return state.wasmPromise
  }

  const PROFILE_PRIMARY={formats:['All'],tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,tryDenoise:true,minLineCount:1,maxNumberOfSymbols:0,textMode:'Plain',binarizer:'LocalAverage'};
  const PROFILE_LINEAR={...PROFILE_PRIMARY,tryDenoise:false,tryDownscale:false,binarizer:'GlobalHistogram'};
  const PROFILE_FIXED={...PROFILE_PRIMARY,tryDenoise:false,tryDownscale:false,binarizer:'FixedThreshold'};

  async function decodeWasm(input,source,profiles=[PROFILE_PRIMARY]){
    const zx=await loadWasm(),all=[];
    for(const opts of profiles){
      const rows=await zx.readBarcodes(input,opts);
      for(const r of rows||[]){if(r?.isValid===false||r?.error)continue;all.push({format:r.format||r.symbology||'',text:r.text??'',engine:'ZXing-C++ WASM',source,position:r.position||null})}
      if(dedupeResults(all).length)break
    }
    return dedupeResults(all)
  }
  async function decodeNative(canvas,source='瀏覽器原生'){
    if(!('BarcodeDetector' in globalThis))return [];
    try{const formats=await globalThis.BarcodeDetector.getSupportedFormats();if(!formats?.length)return [];const detector=new globalThis.BarcodeDetector({formats});const rows=await detector.detect(canvas);return rows.map(r=>({format:r.format,text:r.rawValue,engine:'BarcodeDetector',source}))}catch{return []}
  }

  async function selfTest(){
    if(state.selfTestPromise)return state.selfTestPromise;
    state.selfTestPromise=(async()=>{
      setEngineStatus('work','讀碼核心檢查中…');
      try{
        const rows=await decodeWasm(b64Blob(SELFTEST_B64),'內建自我測試',[PROFILE_PRIMARY]);
        const ok=rows.some(r=>r.text===SELFTEST_TEXT);
        if(!ok)throw new Error('內建測試碼未能解碼');
        state.selfTest={ok:true,error:''};setEngineStatus('ok','讀碼核心正常');return true
      }catch(err){state.selfTest={ok:false,error:err?.message||String(err)};setEngineStatus('error','讀碼核心異常');return false}
    })();
    return state.selfTestPromise
  }
  function setEngineStatus(kind,text){const dot=el('barcodeEngineDot'),label=el('barcodeEngineStatus');if(dot)dot.className=`scanner-dot ${kind}`;if(label)label.textContent=text}

  function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片無法開啟'))};img.src=url})}
  function drawImage(img,scale=1){
    const naturalW=img.naturalWidth||img.width||1,naturalH=img.naturalHeight||img.height||1;
    const cap=Math.min(scale,MAX_DIM/Math.max(naturalW,naturalH));
    const w=Math.max(1,Math.round(naturalW*cap)),h=Math.max(1,Math.round(naturalH*cap));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0,w,h);return c
  }
  function crop(src,x,y,w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(src,x,y,w,h,0,0,c.width,c.height);return c}
  function scaleCanvas(src,factor){factor=Math.max(1,Math.min(factor,MAX_DIM/Math.max(src.width,src.height)));if(factor<=1.05)return src;const c=document.createElement('canvas');c.width=Math.round(src.width*factor);c.height=Math.round(src.height*factor);const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=false;x.drawImage(src,0,0,c.width,c.height);return c}
  function threshold(src,invert=false){
    const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(src,0,0);const im=x.getImageData(0,0,c.width,c.height),d=im.data;let sum=0,count=0;for(let i=0;i<d.length;i+=16){sum+=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;count++}const t=Math.max(70,Math.min(210,sum/Math.max(1,count)));for(let i=0;i<d.length;i+=4){const g=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;let v=g<t?0:255;if(invert)v=255-v;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}x.putImageData(im,0,0);return c
  }
  function imageData(c){return c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height)}

  function gridCandidates(base,cols,rows,overlap=.18,label='區塊'){
    const out=[],cw=base.width/cols,ch=base.height/rows;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const x0=Math.max(0,x*cw-cw*overlap),y0=Math.max(0,y*ch-ch*overlap),x1=Math.min(base.width,(x+1)*cw+cw*overlap),y1=Math.min(base.height,(y+1)*ch+ch*overlap);
      const tile=crop(base,x0,y0,x1-x0,y1-y0),zoom=Math.max(tile.width,tile.height)<1100?Math.min(2.5,1400/Math.max(tile.width,tile.height)):1;
      out.push({canvas:scaleCanvas(tile,zoom),source:`${label} ${y*cols+x+1}`})
    }
    return out
  }
  function bandCandidates(base){
    const out=[];
    for(let i=0;i<4;i++){
      const h=base.height*.34,y=Math.max(0,Math.min(base.height-h,i*base.height*.22));out.push({canvas:scaleCanvas(crop(base,0,y,base.width,h),1.4),source:`橫向帶 ${i+1}`})
    }
    for(let i=0;i<4;i++){
      const w=base.width*.34,x=Math.max(0,Math.min(base.width-w,i*base.width*.22));out.push({canvas:scaleCanvas(crop(base,x,0,w,base.height),1.4),source:`直向帶 ${i+1}`})
    }
    return out
  }
  async function scanCandidates(candidates,onProgress){
    const all=[];
    for(let i=0;i<candidates.length;i++){
      const v=candidates[i];onProgress?.(i,candidates.length,v.source);
      try{all.push(...await decodeWasm(imageData(v.canvas),v.source,[PROFILE_PRIMARY,PROFILE_LINEAR]))}catch(err){console.warn('[Label Workbench] candidate decode failed:',v.source,err)}
      const d=dedupeResults(all);if(d.length>=MAX_RESULTS)return d
    }
    return dedupeResults(all)
  }

  async function scanFile(file,onStage){
    if(!isImage(file))throw new Error('目前圖片讀碼只接受圖片檔');
    const img=await loadImage(file),base=drawImage(img,1),all=[];
    onStage?.('先掃描整張原圖');
    try{all.push(...await decodeWasm(file,'原始檔',[PROFILE_PRIMARY,PROFILE_LINEAR]))}catch(err){console.warn('[Label Workbench] raw decode failed:',err)}
    try{all.push(...await decodeNative(base))}catch{}
    if(dedupeResults(all).length===0){
      onStage?.('深度掃描：分區與放大');
      const candidates=[...gridCandidates(base,4,4,.2,'4×4 區塊'),...bandCandidates(base)];
      all.push(...await scanCandidates(candidates))
    }
    if(dedupeResults(all).length===0){
      onStage?.('深度掃描：高對比與更小區塊');
      const bw=threshold(base,false),inv=threshold(base,true);
      const candidates=[{canvas:bw,source:'整張高對比'},{canvas:inv,source:'整張反相'},...gridCandidates(base,5,5,.16,'5×5 區塊')];
      all.push(...await scanCandidates(candidates))
    }
    return {name:file.name,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,results:dedupeResults(all),img}
  }
  async function scanFiles(files,onProgress){
    const arr=[...files].filter(isImage).slice(0,MAX_IMAGES),out=[];
    for(let i=0;i<arr.length;i++){
      onProgress?.(i,arr.length,arr[i],'準備讀取');
      try{out.push(await scanFile(arr[i],stage=>onProgress?.(i,arr.length,arr[i],stage)))}catch(err){out.push({name:arr[i].name,width:null,height:null,results:[],error:err?.message||String(err)})}
    }
    return out
  }

  function resultCard(fr){
    const rows=fr.results||[];
    const body=rows.length?rows.map((r,i)=>`<div class="scan-result-row"><div class="scan-result-head"><span class="pill">${esc(r.format)}</span>${hasGs(r.text)?'<span class="pill ready">含 [GS] 分隔符</span>':''}<button class="btn ghost small" type="button" data-copy-code="${i}">複製內容</button></div><pre>${esc(visibleText(r.text))}</pre><small>${esc(r.engine)}${r.source?` · ${esc(r.source)}`:''} · ${String(r.text).length} 字元</small></div>`).join(''):`<div class="note warn-note">${fr.error?`讀取失敗：${esc(fr.error)}`:'自動掃描沒有讀到可驗證條碼。下方可直接在原圖上框選條碼，不用另外裁圖。'}</div>`;
    return `<article class="scan-file-card"><div class="section-title"><div><h3>${esc(fr.name)}</h3><p class="muted compact">${fr.width?`${fr.width} × ${fr.height} px`:'圖片尺寸未知'} · 讀到 ${rows.length} 組</p></div></div>${body}</article>`
  }
  function attachCopy(host,results){
    const flat=[];(results||[]).forEach(fr=>(fr.results||[]).forEach(r=>flat.push(r)));
    host.querySelectorAll('.scan-file-card').forEach((card,fi)=>card.querySelectorAll('[data-copy-code]').forEach(btn=>btn.addEventListener('click',()=>{const r=results[fi]?.results?.[Number(btn.dataset.copyCode)];if(r)copyText(r.text)})));
    const all=el('barcodeCopyAll');if(all){all.disabled=!flat.length;all.onclick=()=>copyText(flat.map((r,i)=>`${i+1}. [${r.format}] ${visibleText(r.text)}`).join('\n'))}
  }

  function previewCoords(evt,canvas){const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(evt.clientX-rect.left)*canvas.width/rect.width)),y:Math.max(0,Math.min(canvas.height,(evt.clientY-rect.top)*canvas.height/rect.height))}}
  function normalizedSelection(a,b){const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return {x,y,w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)}}
  function redrawPreview(){
    const p=state.preview;if(!p.canvas||!p.ctx||!p.img)return;
    p.ctx.clearRect(0,0,p.canvas.width,p.canvas.height);p.ctx.imageSmoothingEnabled=true;p.ctx.drawImage(p.img,0,0,p.canvas.width,p.canvas.height);
    if(p.selection&&p.selection.w>2&&p.selection.h>2){p.ctx.save();p.ctx.strokeStyle='#1769ff';p.ctx.lineWidth=Math.max(2,p.canvas.width/450);p.ctx.setLineDash([10,6]);p.ctx.fillStyle='rgba(23,105,255,.10)';p.ctx.fillRect(p.selection.x,p.selection.y,p.selection.w,p.selection.h);p.ctx.strokeRect(p.selection.x,p.selection.y,p.selection.w,p.selection.h);p.ctx.restore()}
  }
  async function setupManual(file,img){
    state.currentFile=file;const panel=el('barcodeManualPanel'),canvas=el('barcodePreviewCanvas'),btn=el('barcodeCropScanBtn'),msg=el('barcodeCropMessage');if(!panel||!canvas)return;
    panel.classList.remove('hidden');const naturalW=img.naturalWidth||img.width,naturalH=img.naturalHeight||img.height,scale=Math.min(1,PREVIEW_MAX_W/naturalW,PREVIEW_MAX_H/naturalH);canvas.width=Math.max(1,Math.round(naturalW*scale));canvas.height=Math.max(1,Math.round(naturalH*scale));
    state.preview={img,canvas,ctx:canvas.getContext('2d',{willReadFrequently:true}),selection:null,dragging:false,start:null,scaleX:naturalW/canvas.width,scaleY:naturalH/canvas.height};redrawPreview();if(btn)btn.disabled=true;if(msg)msg.textContent='用滑鼠或手指在圖片上框住條碼，再按「讀取框選區域」。';
  }
  function bindPreview(){
    const canvas=el('barcodePreviewCanvas');if(!canvas||canvas.dataset.bound)return;canvas.dataset.bound='1';
    canvas.addEventListener('pointerdown',e=>{if(!state.preview.img)return;canvas.setPointerCapture?.(e.pointerId);const p=previewCoords(e,canvas);state.preview.dragging=true;state.preview.start=p;state.preview.selection={x:p.x,y:p.y,w:0,h:0};redrawPreview()});
    canvas.addEventListener('pointermove',e=>{if(!state.preview.dragging||!state.preview.start)return;state.preview.selection=normalizedSelection(state.preview.start,previewCoords(e,canvas));redrawPreview()});
    const finish=e=>{if(!state.preview.dragging)return;state.preview.dragging=false;if(state.preview.start)state.preview.selection=normalizedSelection(state.preview.start,previewCoords(e,canvas));redrawPreview();const s=state.preview.selection,btn=el('barcodeCropScanBtn'),msg=el('barcodeCropMessage');const valid=s&&s.w>=12&&s.h>=12;if(btn)btn.disabled=!valid;if(msg)msg.textContent=valid?`已框選 ${Math.round(s.w*state.preview.scaleX)} × ${Math.round(s.h*state.preview.scaleY)} px。`:'框選範圍太小，請重新框選。'};
    canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',()=>{state.preview.dragging=false})
  }
  async function scanManualSelection(){
    const p=state.preview,s=p.selection,target=el('barcodeManualResults'),btn=el('barcodeCropScanBtn');if(!p.img||!s||s.w<12||s.h<12||!target)return;
    if(btn)btn.disabled=true;target.innerHTML='<div class="scan-working">正在精準讀取框選區域…</div>';
    const sx=Math.max(0,Math.round(s.x*p.scaleX)),sy=Math.max(0,Math.round(s.y*p.scaleY)),sw=Math.max(1,Math.round(s.w*p.scaleX)),sh=Math.max(1,Math.round(s.h*p.scaleY));
    const base=document.createElement('canvas');base.width=sw;base.height=sh;const ctx=base.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(p.img,sx,sy,sw,sh,0,0,sw,sh);
    const zoom=Math.min(4,MAX_DIM/Math.max(sw,sh)),zoomed=scaleCanvas(base,Math.max(1.5,zoom)),all=[];
    try{all.push(...await decodeWasm(imageData(zoomed),'手動框選放大',[PROFILE_PRIMARY,PROFILE_LINEAR,PROFILE_FIXED]))}catch(err){console.warn('[Label Workbench] manual crop decode failed:',err)}
    if(!dedupeResults(all).length){try{all.push(...await decodeWasm(imageData(threshold(zoomed,false)),'手動框選高對比',[PROFILE_PRIMARY,PROFILE_LINEAR]))}catch{}}
    if(!dedupeResults(all).length){try{all.push(...await decodeWasm(imageData(threshold(zoomed,true)),'手動框選反相',[PROFILE_PRIMARY,PROFILE_LINEAR]))}catch{}}
    const rows=dedupeResults(all);
    if(rows.length){target.innerHTML=rows.map((r,i)=>`<div class="scan-result-row"><div class="scan-result-head"><span class="pill">${esc(r.format)}</span><button class="btn ghost small" type="button" data-manual-copy="${i}">複製內容</button></div><pre>${esc(visibleText(r.text))}</pre><small>${esc(r.engine)} · ${esc(r.source)}</small></div>`).join('');target.querySelectorAll('[data-manual-copy]').forEach(b=>b.addEventListener('click',()=>copyText(rows[Number(b.dataset.manualCopy)]?.text||''))}
    else target.innerHTML=`<div class="note warn-note"><b>框選後仍讀不到。</b>${state.selfTest.ok===true?' 讀碼核心自我測試正常，代表這個框選區域沒有可可靠解碼的條碼；若來源是模糊截圖、AI 重畫或條碼線條已失真，軟體無法還原原始內容。':state.selfTest.ok===false?` 目前讀碼核心也有異常：${esc(state.selfTest.error)}`:' 請重新框選只包含條碼本體與周圍留白。'}</div>`;
    if(btn)btn.disabled=false
  }

  async function runScanner(files,targetId='barcodeScanResults'){
    const target=el(targetId);if(!target)return [];
    const images=[...files].filter(isImage);if(!images.length){target.innerHTML='<div class="empty">請選擇圖片檔。</div>';return []}
    const engineOk=await selfTest();
    if(!engineOk){target.innerHTML=`<div class="note warn-note"><b>讀碼核心沒有通過自我測試。</b> ${esc(state.selfTest.error)}。這不是客戶圖片問題，請先不要拿結果判斷條碼。</div>`;return []}
    target.innerHTML='<div class="scan-working">讀碼核心正常，正在掃描圖片…</div>';
    const results=await scanFiles(images,(i,total,file,stage)=>{target.innerHTML=`<div class="scan-working">正在讀取 ${i+1}/${total}：${esc(file.name)}<br><small>${esc(stage||'掃描中')}；會自動分區、放大與高對比重試。</small></div>`});
    target.innerHTML=results.map(resultCard).join('');attachCopy(target,results);
    if(images.length===1){const img=results[0]?.img||await loadImage(images[0]);await setupManual(images[0],img)}else el('barcodeManualPanel')?.classList.add('hidden');
    return results
  }

  function injectStyles(){
    if(el('barcodeReaderStyle'))return;const s=document.createElement('style');s.id='barcodeReaderStyle';s.textContent=`.scanner-panel{border-color:#cfe0ff}.scanner-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.scanner-actions .btn{display:inline-flex;align-items:center}.scanner-core{display:flex;align-items:center;gap:8px;font-size:13px;color:#475569}.scanner-dot{width:9px;height:9px;border-radius:50%;background:#94a3b8;display:inline-block}.scanner-dot.ok{background:#16a34a}.scanner-dot.work{background:#2563eb}.scanner-dot.error{background:#dc2626}.scan-working{padding:18px;border:1px dashed #bfd2ee;border-radius:12px;background:#f8fbff;font-weight:800}.scan-working small{font-weight:500;color:#64748b}.scan-file-card{border:1px solid #e3e8ef;border-radius:14px;padding:15px;margin-top:12px;background:#fff}.scan-file-card h3{margin:0;font-size:15px}.scan-result-row{border-top:1px solid #e8edf3;padding:12px 0}.scan-result-row:first-of-type{border-top:0}.scan-result-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.scan-result-row pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0;background:#0f172a;color:#f8fafc;padding:12px;border-radius:10px;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.scan-result-row small{color:#64748b}.scanner-help{line-height:1.65}.scanner-privacy{margin-top:12px}.manual-scan{margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb}.manual-canvas-wrap{margin-top:10px;background:#eef2f7;border:1px solid #dbe3ee;border-radius:12px;padding:10px;overflow:auto;text-align:center}.manual-canvas-wrap canvas{max-width:100%;height:auto;touch-action:none;cursor:crosshair;background:white;border-radius:7px}.manual-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}.manual-tools .footer-note{margin:0;flex:1;min-width:220px}@media(max-width:820px){.scanner-actions .btn{width:100%;justify-content:center}.scan-result-head .btn{width:auto;margin-left:auto}.manual-tools .btn{width:100%}}`;document.head.appendChild(s)
  }
  function injectUi(){
    const section=el('barcode');if(!section||el('barcodeScannerPanel'))return;
    const panel=document.createElement('div');panel.className='panel scanner-panel';panel.id='barcodeScannerPanel';panel.innerHTML=`<div class="section-title stack-mobile"><div><h3>📷 圖片讀碼｜一維碼 / 二維碼</h3><p class="muted compact scanner-help">客戶丟圖片就直接讀實際內容。先自動深度掃描；讀不到時可直接在原圖上框選條碼，不用外接掃描器，也不用另外裁圖。</p></div><button id="barcodeCopyAll" class="btn ghost small" type="button" disabled>複製全部結果</button></div><div class="scanner-actions"><label class="btn primary">選擇圖片讀碼<input id="barcodeImageInput" class="hidden" type="file" multiple accept="image/*"></label><label class="btn ghost">手機拍照讀碼<input id="barcodeCameraInput" class="hidden" type="file" accept="image/*" capture="environment"></label><div class="scanner-core"><span id="barcodeEngineDot" class="scanner-dot"></span><span id="barcodeEngineStatus">讀碼核心尚未檢查</span></div></div><div class="note scanner-privacy"><b>隱私：</b>使用 ZXing-C++ WebAssembly 在目前瀏覽器本機解碼。圖片本身不會上傳到讀碼服務。每次啟用會先用內建有效 QR 做自我測試，避免把「核心壞掉」誤判成「客戶圖片沒條碼」。</div><div id="barcodeScanResults" class="form-gap"><div class="empty">尚未選擇圖片。</div></div><div id="barcodeManualPanel" class="manual-scan hidden"><div class="section-title"><div><h3>🎯 精準框選讀碼</h3><p class="muted compact">在圖片上直接拖曳框住條碼本體與一點周圍留白。</p></div></div><div class="manual-canvas-wrap"><canvas id="barcodePreviewCanvas"></canvas></div><div class="manual-tools"><button id="barcodeCropScanBtn" class="btn primary" type="button" disabled>讀取框選區域</button><div id="barcodeCropMessage" class="footer-note">先框選條碼。</div></div><div id="barcodeManualResults"></div></div>`;
    section.insertBefore(panel,section.firstChild);bindPreview();el('barcodeCropScanBtn')?.addEventListener('click',scanManualSelection);el('barcodeImageInput')?.addEventListener('change',e=>{runScanner(e.target.files);e.target.value=''});el('barcodeCameraInput')?.addEventListener('change',e=>{runScanner(e.target.files);e.target.value=''})
  }
  function patchAnalysis(){
    if(state.analysisPatched||typeof window.analyzeSelected!=='function')return;
    const base=window.analyzeSelected;
    window.analyzeSelected=async function(files){
      await base(files);const imgs=[...files].filter(isImage);if(!imgs.length)return;const out=el('analysisResult');if(!out)return;
      const box=document.createElement('div');box.className='analysis-block';box.innerHTML='<b>圖片條碼內容：</b><div class="scan-working">正在讀碼核心自我測試…</div>';out.appendChild(box);
      if(!await selfTest()){box.innerHTML=`<b>圖片條碼內容：</b><div class="note warn-note">讀碼核心異常：${esc(state.selfTest.error)}</div>`;return}
      const results=await scanFiles(imgs);const hits=results.flatMap(fr=>(fr.results||[]).map(r=>({file:fr.name,...r})));
      box.innerHTML=hits.length?`<b>圖片條碼內容：</b>${hits.map(r=>`<div class="scan-result-row"><span class="pill">${esc(r.format)}</span><small>${esc(r.file)}</small><pre>${esc(visibleText(r.text))}</pre></div>`).join('')}`:'<b>圖片條碼內容：</b><div class="footer-note">讀碼核心正常，但沒有讀到可確認的條碼內容。可到「條碼工具」使用精準框選。</div>'
    };state.analysisPatched=true
  }
  function updateVersion(){const small=document.querySelector('.brand small');if(small&&/v\d+(?:\.\d+)*/i.test(small.textContent||''))small.textContent=(small.textContent||'').replace(/v\d+(?:\.\d+)*/i,VERSION)}
  function init(){injectStyles();injectUi();updateVersion();selfTest();let n=0;const t=setInterval(()=>{patchAnalysis();if(state.analysisPatched||n++>80)clearInterval(t)},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

  window.LabelWorkbenchBarcodeReader={formatName,visibleText,resultKey,dedupeResults,selfTest,scanFile,scanFiles,runScanner,scanManualSelection,state};
})();