/* Label Workbench image barcode reader.
 * Robust local 1D / 2D decoding. Customer images stay in this browser.
 */
(function(){
  'use strict';

  const WASM_SRC='https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.3/dist/iife/reader/index.js';
  const MAX_IMAGES=8;
  const MAX_RESULTS=24;
  const MAX_DIM=3200;
  const state={wasmPromise:null,analysisPatched:false};

  function el(id){return document.getElementById(id)}
  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function toast(msg){if(typeof window.toast==='function')window.toast(msg)}
  function isImage(f){return !!(f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''))}
  function formatName(raw){
    const key=String(raw??'').replace(/[\s_\-\/]/g,'').toUpperCase();
    const map={QRCODE:'QR Code',MICROQRCODE:'Micro QR Code',RMQRCODE:'rMQR Code',DATAMATRIX:'Data Matrix',CODE39:'Code 39',CODE93:'Code 93',CODE128:'Code 128',EAN8:'EAN-8',EAN13:'EAN-13',UPCA:'UPC-A',UPCE:'UPC-E',ITF:'ITF / Interleaved 2 of 5',PDF417:'PDF417',AZTEC:'Aztec',CODABAR:'Codabar',DATABAR:'DataBar',DATABAREXP:'DataBar Expanded',DATABARLTD:'DataBar Limited',MAXICODE:'MaxiCode'};
    return map[key]||String(raw||'未知格式').replace(/_/g,' ')
  }
  function visibleText(text){
    return [...String(text??'')].map(ch=>{const n=ch.charCodeAt(0);if(n===29)return '[GS]';if(n===30)return '[RS]';if(n===4)return '[EOT]';if(n===13)return '[CR]';if(n===10)return '[LF]';if(n===9)return '[TAB]';if(n<32||n===127)return `[0x${n.toString(16).toUpperCase().padStart(2,'0')}]`;return ch}).join('')
  }
  function resultKey(r){return `${formatName(r?.format)}\u0000${String(r?.text??'')}`}
  function dedupeResults(items){
    const seen=new Set(),out=[];
    for(const item of items||[]){if(item?.text==null||String(item.text)==='')continue;const r={format:formatName(item.format),text:String(item.text),engine:item.engine||'',source:item.source||'',position:item.position||null};const k=resultKey(r);if(seen.has(k))continue;seen.add(k);out.push(r);if(out.length>=MAX_RESULTS)break}return out
  }
  function hasGs(text){return [...String(text||'')].some(ch=>ch.charCodeAt(0)===29)}
  function copyText(text){navigator.clipboard?.writeText(String(text)).then(()=>toast('已複製條碼內容')).catch(()=>{const ta=document.createElement('textarea');ta.value=String(text);document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('已複製條碼內容')})}

  function loadWasm(){
    if(window.ZXingWASM?.readBarcodes)return Promise.resolve(window.ZXingWASM);
    if(state.wasmPromise)return state.wasmPromise;
    state.wasmPromise=new Promise((resolve,reject)=>{
      const old=document.querySelector('script[data-label-zxing-wasm]');
      if(old){old.addEventListener('load',()=>window.ZXingWASM?.readBarcodes?resolve(window.ZXingWASM):reject(new Error('讀碼核心載入不完整')));old.addEventListener('error',()=>reject(new Error('讀碼核心載入失敗')));return}
      const s=document.createElement('script');s.src=WASM_SRC;s.async=true;s.dataset.labelZxingWasm='true';
      s.onload=()=>window.ZXingWASM?.readBarcodes?resolve(window.ZXingWASM):reject(new Error('讀碼核心載入不完整'));
      s.onerror=()=>reject(new Error('無法載入免費讀碼核心'));
      document.head.appendChild(s)
    });
    return state.wasmPromise
  }

  function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片無法開啟'))};img.src=url})}
  function drawImage(img,scale=1){
    const naturalW=img.naturalWidth||img.width||1,naturalH=img.naturalHeight||img.height||1;
    const cap=Math.min(scale,MAX_DIM/Math.max(naturalW,naturalH));
    const w=Math.max(1,Math.round(naturalW*cap)),h=Math.max(1,Math.round(naturalH*cap));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0,w,h);return c
  }
  function crop(src,x,y,w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));c.getContext('2d',{willReadFrequently:true}).drawImage(src,x,y,w,h,0,0,c.width,c.height);return c}
  function rotate(src,deg){const swap=Math.abs(deg)%180===90,c=document.createElement('canvas');c.width=swap?src.height:src.width;c.height=swap?src.width:src.height;const x=c.getContext('2d',{willReadFrequently:true});x.translate(c.width/2,c.height/2);x.rotate(deg*Math.PI/180);x.imageSmoothingEnabled=false;x.drawImage(src,-src.width/2,-src.height/2);return c}
  function threshold(src,invert=false){
    const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(src,0,0);const im=x.getImageData(0,0,c.width,c.height),d=im.data;let sum=0,count=0;for(let i=0;i<d.length;i+=16){sum+=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;count++}const t=Math.max(80,Math.min(200,sum/Math.max(1,count)));for(let i=0;i<d.length;i+=4){const g=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;let v=g<t?0:255;if(invert)v=255-v;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}x.putImageData(im,0,0);return c
  }
  function imageData(c){return c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height)}
  function variants(base){
    const out=[{canvas:base,source:'整張原圖'}];
    if(base.width>500||base.height>500){
      const tiles=3,overlap=.12,cw=base.width/tiles,ch=base.height/tiles;
      for(let y=0;y<tiles;y++)for(let x=0;x<tiles;x++){
        const x0=Math.max(0,x*cw-cw*overlap),y0=Math.max(0,y*ch-ch*overlap),x1=Math.min(base.width,(x+1)*cw+cw*overlap),y1=Math.min(base.height,(y+1)*ch+ch*overlap);
        out.push({canvas:crop(base,x0,y0,x1-x0,y1-y0),source:`區塊 ${y*tiles+x+1}`})
      }
    }
    out.push({canvas:threshold(base,false),source:'高對比'});
    out.push({canvas:threshold(base,true),source:'反相高對比'});
    out.push({canvas:rotate(base,90),source:'旋轉 90°'});
    out.push({canvas:rotate(base,270),source:'旋轉 270°'});
    return out
  }

  async function decodeWasm(input,source){
    const zx=await loadWasm();
    const rows=await zx.readBarcodes(input,{tryHarder:true,maxNumberOfSymbols:32});
    return (rows||[]).map(r=>({format:r.format||r.symbology||'',text:r.text??'',engine:'ZXing-C++ WASM',source,position:r.position||null}))
  }
  async function decodeNative(canvas){
    if(!('BarcodeDetector' in globalThis))return [];
    try{const formats=await globalThis.BarcodeDetector.getSupportedFormats();if(!formats?.length)return [];const detector=new globalThis.BarcodeDetector({formats});const rows=await detector.detect(canvas);return rows.map(r=>({format:r.format,text:r.rawValue,engine:'BarcodeDetector',source:'瀏覽器原生'}))}catch{return []}
  }
  async function scanFile(file){
    if(!isImage(file))throw new Error('目前圖片讀碼只接受圖片檔');
    const img=await loadImage(file),nativeCanvas=drawImage(img,1),all=[];
    try{all.push(...await decodeWasm(file,'原始檔'))}catch(err){console.warn('[Label Workbench] WASM original decode failed',err)}
    try{all.push(...await decodeNative(nativeCanvas))}catch{}
    if(dedupeResults(all).length===0){
      const base=drawImage(img,Math.max(img.naturalWidth||0,img.naturalHeight||0)<1200?2:1);
      for(const v of variants(base)){
        try{all.push(...await decodeWasm(imageData(v.canvas),v.source))}catch{}
        if(dedupeResults(all).length>=MAX_RESULTS)break
      }
    }
    return {name:file.name,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,results:dedupeResults(all)}
  }
  async function scanFiles(files,onProgress){const arr=[...files].filter(isImage).slice(0,MAX_IMAGES),out=[];for(let i=0;i<arr.length;i++){onProgress?.(i,arr.length,arr[i]);try{out.push(await scanFile(arr[i]))}catch(err){out.push({name:arr[i].name,width:null,height:null,results:[],error:err?.message||String(err)})}}return out}

  function resultCard(fr){
    const rows=fr.results||[];
    const body=rows.length?rows.map((r,i)=>`<div class="scan-result-row"><div class="scan-result-head"><span class="pill">${esc(r.format)}</span>${hasGs(r.text)?'<span class="pill ready">含 [GS] 分隔符</span>':''}<button class="btn ghost small" type="button" data-copy-code="${i}">複製內容</button></div><pre>${esc(visibleText(r.text))}</pre><small>${esc(r.engine)}${r.source?` · ${esc(r.source)}`:''} · ${String(r.text).length} 字元</small></div>`).join(''):`<div class="note warn-note">${fr.error?`讀取失敗：${esc(fr.error)}`:'這張圖仍沒有讀到條碼。請優先使用客戶原始圖片；如果是整張教學圖，建議把條碼附近裁切後再讀。'}</div>`;
    return `<article class="scan-file-card"><div class="section-title"><div><h3>${esc(fr.name)}</h3><p class="muted compact">${fr.width?`${fr.width} × ${fr.height} px`:'圖片尺寸未知'} · 讀到 ${rows.length} 組</p></div></div>${body}</article>`
  }
  function attachCopy(host,results){
    const flat=[];(results||[]).forEach(fr=>(fr.results||[]).forEach(r=>flat.push(r)));
    host.querySelectorAll('.scan-file-card').forEach((card,fi)=>card.querySelectorAll('[data-copy-code]').forEach(btn=>btn.addEventListener('click',()=>{const r=results[fi]?.results?.[Number(btn.dataset.copyCode)];if(r)copyText(r.text)})));
    const all=el('barcodeCopyAll');if(all){all.disabled=!flat.length;all.onclick=()=>copyText(flat.map((r,i)=>`${i+1}. [${r.format}] ${visibleText(r.text)}`).join('\n'))}
  }
  async function runScanner(files,targetId='barcodeScanResults'){
    const target=el(targetId);if(!target)return [];
    const images=[...files].filter(isImage);if(!images.length){target.innerHTML='<div class="empty">請選擇圖片檔。</div>';return []}
    target.innerHTML='<div class="scan-working">正在啟動高可靠讀碼核心…</div>';
    const results=await scanFiles(images,(i,total,file)=>{target.innerHTML=`<div class="scan-working">正在讀取 ${i+1}/${total}：${esc(file.name)}<br><small>會自動嘗試多條碼、旋轉、區域與高對比模式。</small></div>`});
    target.innerHTML=results.map(resultCard).join('');attachCopy(target,results);return results
  }

  function injectStyles(){if(el('barcodeReaderStyle'))return;const s=document.createElement('style');s.id='barcodeReaderStyle';s.textContent=`.scanner-panel{border-color:#cfe0ff}.scanner-actions{display:flex;gap:10px;flex-wrap:wrap}.scanner-actions .btn{display:inline-flex;align-items:center}.scan-working{padding:18px;border:1px dashed #bfd2ee;border-radius:12px;background:#f8fbff;font-weight:800}.scan-working small{font-weight:500;color:#64748b}.scan-file-card{border:1px solid #e3e8ef;border-radius:14px;padding:15px;margin-top:12px;background:#fff}.scan-file-card h3{margin:0;font-size:15px}.scan-result-row{border-top:1px solid #e8edf3;padding:12px 0}.scan-result-row:first-of-type{border-top:0}.scan-result-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.scan-result-row pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0;background:#0f172a;color:#f8fafc;padding:12px;border-radius:10px;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.scan-result-row small{color:#64748b}.scanner-help{line-height:1.65}.scanner-privacy{margin-top:12px}@media(max-width:820px){.scanner-actions .btn{width:100%;justify-content:center}.scan-result-head .btn{width:auto;margin-left:auto}}`;document.head.appendChild(s)}
  function injectUi(){
    const section=el('barcode');if(!section||el('barcodeScannerPanel'))return;
    const panel=document.createElement('div');panel.className='panel scanner-panel';panel.id='barcodeScannerPanel';panel.innerHTML=`<div class="section-title stack-mobile"><div><h3>📷 圖片讀碼｜一維碼 / 二維碼</h3><p class="muted compact scanner-help">客戶丟圖片就直接讀實際內容。新版會一次找多個條碼，並自動嘗試旋轉、裁切區域與高對比處理。</p></div><button id="barcodeCopyAll" class="btn ghost small" type="button" disabled>複製全部結果</button></div><div class="scanner-actions"><label class="btn primary">選擇圖片讀碼<input id="barcodeImageInput" class="hidden" type="file" multiple accept="image/*"></label><label class="btn ghost">手機拍照讀碼<input id="barcodeCameraInput" class="hidden" type="file" accept="image/*" capture="environment"></label></div><div class="note scanner-privacy"><b>隱私：</b>使用 ZXing-C++ WebAssembly 在目前瀏覽器本機解碼，圖片本身不會上傳到讀碼服務。支援 Code 39、Code 93、Code 128、EAN / UPC、ITF、Codabar、DataBar、QR、Data Matrix、PDF417、Aztec、MaxiCode 等。</div><div id="barcodeScanResults" class="form-gap"><div class="empty">尚未選擇圖片。</div></div>`;
    section.insertBefore(panel,section.firstChild);
    el('barcodeImageInput')?.addEventListener('change',e=>{runScanner(e.target.files);e.target.value=''});
    el('barcodeCameraInput')?.addEventListener('change',e=>{runScanner(e.target.files);e.target.value=''})
  }
  function patchAnalysis(){
    if(state.analysisPatched||typeof window.analyzeSelected!=='function')return;
    const base=window.analyzeSelected;
    window.analyzeSelected=async function(files){
      await base(files);
      const imgs=[...files].filter(isImage);if(!imgs.length)return;
      const out=el('analysisResult');if(!out)return;
      const box=document.createElement('div');box.className='analysis-block';box.innerHTML='<b>圖片條碼內容：</b><div class="scan-working">正在讀碼…</div>';out.appendChild(box);
      const results=await scanFiles(imgs);
      const hits=results.flatMap(fr=>(fr.results||[]).map(r=>({file:fr.name,...r})));
      box.innerHTML=hits.length?`<b>圖片條碼內容：</b>${hits.map(r=>`<div class="scan-result-row"><span class="pill">${esc(r.format)}</span><small>${esc(r.file)}</small><pre>${esc(visibleText(r.text))}</pre></div>`).join('')}`:'<b>圖片條碼內容：</b><div class="footer-note">沒有讀到可確認的條碼內容。</div>';
    };
    state.analysisPatched=true;
  }
  function updateVersion(){const small=document.querySelector('.brand small');if(small&&/v0\.\d+/i.test(small.textContent||''))small.textContent=(small.textContent||'').replace(/v0\.\d+/i,'v0.9.1')}
  function init(){injectStyles();injectUi();updateVersion();let n=0;const t=setInterval(()=>{patchAnalysis();if(state.analysisPatched||n++>80)clearInterval(t)},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

  window.LabelWorkbenchBarcodeReader={formatName,visibleText,resultKey,dedupeResults,scanFile,scanFiles,runScanner,state};
})();
