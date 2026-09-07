/* Label Workbench image barcode reader.
 * Reads 1D / 2D barcode contents locally in the browser.
 * No customer image is uploaded by this module.
 */
(function(){
  'use strict';

  const ZXING_SRC='https://unpkg.com/@zxing/browser@0.1.5';
  const MAX_DIM=2600;
  const MAX_IMAGES=8;
  const MAX_RESULTS=12;
  const state={zxingPromise:null,analysisPatched:false};

  function el(id){return document.getElementById(id)}
  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function toast(msg){if(typeof window.toast==='function')window.toast(msg)}
  function formatName(raw){
    const s=String(raw??'').toUpperCase().replace(/-/g,'_');
    const map={QR_CODE:'QR Code',DATA_MATRIX:'Data Matrix',CODE_39:'Code 39',CODE_93:'Code 93',CODE_128:'Code 128',EAN_8:'EAN-8',EAN_13:'EAN-13',UPC_A:'UPC-A',UPC_E:'UPC-E',ITF:'ITF / Interleaved 2 of 5',PDF_417:'PDF417',PDF417:'PDF417',AZTEC:'Aztec',CODABAR:'Codabar'};
    return map[s]||String(raw||'未知格式').replace(/_/g,' ')
  }
  function visibleText(text){
    return [...String(text??'')].map(ch=>{
      const n=ch.charCodeAt(0);
      if(n===29)return '[GS]';
      if(n===30)return '[RS]';
      if(n===4)return '[EOT]';
      if(n===13)return '[CR]';
      if(n===10)return '[LF]';
      if(n===9)return '[TAB]';
      if(n<32||n===127)return `[0x${n.toString(16).toUpperCase().padStart(2,'0')}]`;
      return ch
    }).join('')
  }
  function resultKey(r){return `${r.format||''}\u0000${r.text||''}`}
  function dedupeResults(items){
    const seen=new Set(),out=[];
    for(const item of items||[]){
      if(!item||item.text==null)continue;
      const r={format:formatName(item.format),text:String(item.text),engine:item.engine||'',source:item.source||''};
      const key=resultKey(r);if(seen.has(key))continue;seen.add(key);out.push(r);if(out.length>=MAX_RESULTS)break
    }
    return out
  }
  function hasGs(text){return [...String(text||'')].some(ch=>ch.charCodeAt(0)===29)}
  function zxingFormat(result){
    try{
      const f=result.getBarcodeFormat();
      const z=window.ZXingBrowser;
      return z?.BarcodeFormat?.[f]??f
    }catch{return '未知格式'}
  }
  function loadZxing(){
    if(window.ZXingBrowser?.BrowserMultiFormatReader)return Promise.resolve(window.ZXingBrowser);
    if(state.zxingPromise)return state.zxingPromise;
    state.zxingPromise=new Promise((resolve,reject)=>{
      const old=document.querySelector('script[data-label-zxing]');
      if(old){old.addEventListener('load',()=>resolve(window.ZXingBrowser));old.addEventListener('error',()=>reject(new Error('ZXing 載入失敗')));return}
      const s=document.createElement('script');s.src=ZXING_SRC;s.async=true;s.dataset.labelZxing='true';
      s.onload=()=>window.ZXingBrowser?.BrowserMultiFormatReader?resolve(window.ZXingBrowser):reject(new Error('ZXing 未正確載入'));
      s.onerror=()=>reject(new Error('無法載入免費讀碼元件'));
      document.head.appendChild(s)
    });
    return state.zxingPromise
  }
  function loadImage(file){
    return new Promise((resolve,reject)=>{
      const img=new Image(),url=URL.createObjectURL(file);
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片無法開啟'))};
      img.src=url
    })
  }
  function drawScaled(img){
    const scale=Math.min(1,MAX_DIM/Math.max(img.naturalWidth||img.width||1,img.naturalHeight||img.height||1));
    const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.drawImage(img,0,0,w,h);return c
  }
  function cropCanvas(src,x,y,w,h){
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));c.getContext('2d',{willReadFrequently:true}).drawImage(src,x,y,w,h,0,0,c.width,c.height);return c
  }
  function rotateCanvas(src,deg){
    const swap=Math.abs(deg)%180===90,c=document.createElement('canvas');c.width=swap?src.height:src.width;c.height=swap?src.width:src.height;const x=c.getContext('2d',{willReadFrequently:true});x.translate(c.width/2,c.height/2);x.rotate(deg*Math.PI/180);x.drawImage(src,-src.width/2,-src.height/2);return c
  }
  function candidates(base){
    const list=[{canvas:base,source:'整張'}];
    if(base.width>=700||base.height>=700){
      const ox=base.width*.08,oy=base.height*.08,w=base.width*.58,h=base.height*.58;
      list.push({canvas:cropCanvas(base,0,0,w,h),source:'左上區域'});
      list.push({canvas:cropCanvas(base,Math.max(0,base.width-w),0,w,h),source:'右上區域'});
      list.push({canvas:cropCanvas(base,0,Math.max(0,base.height-h),w,h),source:'左下區域'});
      list.push({canvas:cropCanvas(base,Math.max(0,base.width-w),Math.max(0,base.height-h),w,h),source:'右下區域'});
      if(ox&&oy)list.push({canvas:cropCanvas(base,ox,oy,base.width-2*ox,base.height-2*oy),source:'中央區域'})
    }
    list.push({canvas:rotateCanvas(base,90),source:'旋轉 90°'});
    list.push({canvas:rotateCanvas(base,180),source:'旋轉 180°'});
    list.push({canvas:rotateCanvas(base,270),source:'旋轉 270°'});
    return list
  }
  async function nativeFormats(){
    if(!('BarcodeDetector' in globalThis))return [];
    try{return await globalThis.BarcodeDetector.getSupportedFormats()}catch{return []}
  }
  async function detectNative(canvas){
    const formats=await nativeFormats();if(!formats.length)return [];
    try{
      const detector=new globalThis.BarcodeDetector({formats});
      const rows=await detector.detect(canvas);
      return rows.map(r=>({format:r.format,text:r.rawValue,engine:'BarcodeDetector',source:'整張'}))
    }catch{return []}
  }
  async function detectZxing(variants){
    const ZX=await loadZxing(),reader=new ZX.BrowserMultiFormatReader(),out=[];
    for(const v of variants){
      try{
        const r=await reader.decodeFromCanvas(v.canvas);
        if(r)out.push({format:zxingFormat(r),text:r.getText(),engine:'ZXing',source:v.source})
      }catch{}
      if(dedupeResults(out).length>=MAX_RESULTS)break
    }
    try{reader.reset?.()}catch{}
    return out
  }
  async function scanFile(file){
    if(!file?.type?.startsWith('image/')&&!/\.(jpe?g|png|webp|gif|bmp)$/i.test(file?.name||''))throw new Error('目前圖片讀碼只接受圖片檔');
    const img=await loadImage(file),base=drawScaled(img),native=await detectNative(base);
    let zxing=[];
    try{zxing=await detectZxing(candidates(base))}catch(err){if(!native.length)throw err}
    return {name:file.name,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,results:dedupeResults([...native,...zxing])}
  }
  async function scanFiles(files,onProgress){
    const arr=[...files].filter(f=>f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||'')).slice(0,MAX_IMAGES),out=[];
    for(let i=0;i<arr.length;i++){
      onProgress?.(i,arr.length,arr[i]);
      try{out.push(await scanFile(arr[i]))}catch(err){out.push({name:arr[i].name,width:null,height:null,results:[],error:err?.message||String(err)})}
    }
    return out
  }
  function resultCard(fileResult){
    const rows=fileResult.results||[];
    const body=rows.length?rows.map((r,i)=>`<div class="scan-result-row"><div class="scan-result-head"><span class="pill">${esc(r.format)}</span>${hasGs(r.text)?'<span class="pill ready">含 [GS] 分隔符</span>':''}<button class="btn ghost small" type="button" data-copy-code="${i}">複製內容</button></div><pre>${esc(visibleText(r.text))}</pre><small>${r.engine?esc(r.engine):''}${r.source?` · ${esc(r.source)}`:''} · ${String(r.text).length} 字元</small></div>`).join(''):`<div class="note warn-note">${fileResult.error?`讀取失敗：${esc(fileResult.error)}`:'沒有讀到條碼。可嘗試用較清楚、較近、沒有反光的原圖，或先把條碼區域裁切後再丟一次。'}</div>`;
    return `<article class="scan-file-card" data-scan-file="${esc(fileResult.name)}"><div class="section-title"><div><h3>${esc(fileResult.name)}</h3><p class="muted compact">${fileResult.width?`${fileResult.width} × ${fileResult.height} px`:'圖片尺寸未知'} · 讀到 ${rows.length} 組</p></div></div>${body}</article>`
  }
  function attachCopyHandlers(host,results){
    const flat=[];(results||[]).forEach(fr=>fr.results.forEach(r=>flat.push(r)));
    host.querySelectorAll('.scan-file-card').forEach((card,fi)=>{
      card.querySelectorAll('[data-copy-code]').forEach(btn=>btn.addEventListener('click',()=>{
        const r=results[fi]?.results?.[Number(btn.dataset.copyCode)];if(r)copyText(r.text)
      }))
    });
    const all=el('barcodeCopyAll');if(all){all.disabled=!flat.length;all.onclick=()=>copyText(flat.map((r,i)=>`${i+1}. [${r.format}] ${visibleText(r.text)}`).join('\n'))}
  }
  function copyText(text){
    navigator.clipboard?.writeText(String(text)).then(()=>toast('已複製條碼內容')).catch(()=>{const ta=document.createElement('textarea');ta.value=String(text);document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('已複製條碼內容')})
  }
  async function runScanner(files,targetId='barcodeScanResults'){
    const target=el(targetId);if(!target)return [];
    const images=[...files].filter(f=>f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));
    if(!images.length){target.innerHTML='<div class="empty">請選擇圖片檔。</div>';return []}
    target.innerHTML='<div class="scan-working">正在本機讀取條碼…</div>';
    const results=await scanFiles(images,(i,total,file)=>{target.innerHTML=`<div class="scan-working">正在讀取 ${i+1}/${total}：${esc(file.name)}</div>`});
    target.innerHTML=results.map(resultCard).join('');attachCopyHandlers(target,results);return results
  }
  function injectStyles(){
    if(el('barcodeReaderStyle'))return;const s=document.createElement('style');s.id='barcodeReaderStyle';s.textContent=`.scanner-panel{border-color:#cfe0ff}.scanner-actions{display:flex;gap:10px;flex-wrap:wrap}.scanner-actions .btn{display:inline-flex;align-items:center}.scan-working{padding:18px;border:1px dashed #bfd2ee;border-radius:12px;background:#f8fbff;font-weight:800}.scan-file-card{border:1px solid #e3e8ef;border-radius:14px;padding:15px;margin-top:12px;background:#fff}.scan-file-card h3{margin:0;font-size:15px}.scan-result-row{border-top:1px solid #e8edf3;padding:12px 0}.scan-result-row:first-of-type{border-top:0}.scan-result-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.scan-result-row pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0;background:#0f172a;color:#f8fafc;padding:12px;border-radius:10px;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.scan-result-row small{color:#64748b}.scanner-help{line-height:1.65}.scanner-privacy{margin-top:12px}@media(max-width:820px){.scanner-actions .btn{width:100%;justify-content:center}.scan-result-head .btn{width:auto;margin-left:auto}}`;document.head.appendChild(s)
  }
  function injectUi(){
    const section=el('barcode');if(!section||el('barcodeScannerPanel'))return;
    const panel=document.createElement('div');panel.className='panel scanner-panel';panel.id='barcodeScannerPanel';panel.innerHTML=`<div class="section-title stack-mobile"><div><h3>📷 圖片讀碼｜一維碼 / 二維碼</h3><p class="muted compact scanner-help">客戶丟條碼圖片時直接選圖，就能讀出實際內容，不用再接掃描器掃到記事本。</p></div><button id="barcodeCopyAll" class="btn ghost small" type="button" disabled>複製全部結果</button></div><div class="scanner-actions"><label class="btn primary">選擇圖片讀碼<input id="barcodeImageInput" class="hidden" type="file" multiple accept="image/*"></label><label class="btn ghost">手機拍照讀碼<input id="barcodeCameraInput" class="hidden" type="file" accept="image/*" capture="environment"></label></div><div class="note scanner-privacy"><b>隱私：</b>圖片在目前瀏覽器本機讀碼，不會因為這個功能送到 AI 或第三方伺服器。支援常見 Code 39、Code 128、EAN、ITF、QR Code、Data Matrix、PDF417、Aztec 等；實際可讀格式仍依圖片品質與瀏覽器而定。</div><div id="barcodeScanResults" class="form-gap"><div class="empty">尚未選擇圖片。</div></div>`;
    section.insertBefore(panel,section.firstChild);
    el('barcodeImageInput')?.addEventListener('change',e=>{runScanner(e.target.files);e.target.value=''});
    el('barcodeCameraInput')?.addEventListener('change',e=>{runScanner(e.target.files);e.target.value=''})
  }
  function addDashboardShortcut(){
    const quick=el('dashboard')?.querySelector('.quick');if(!quick||quick.querySelector('[data-scan-shortcut]'))return;
    const b=document.createElement('button');b.dataset.scanShortcut='1';b.innerHTML='<strong>📷 圖片讀碼</strong><span>直接讀一維碼、QR、Data Matrix 等實際內容</span>';b.addEventListener('click',()=>{if(typeof window.showView==='function')window.showView('barcode');setTimeout(()=>el('barcodeScannerPanel')?.scrollIntoView({behavior:'smooth'}),120)});quick.appendChild(b)
  }
  function analysisSummary(results){
    const rows=[];for(const fr of results||[])for(const r of fr.results||[])rows.push({file:fr.name,...r});
    if(!rows.length)return '<div class="analysis-block"><b>圖片條碼辨識：</b><div class="footer-note">這批圖片沒有可靠讀到一維碼 / 二維碼內容。</div></div>';
    return `<div class="analysis-block"><b>圖片條碼辨識：</b><div class="file-chips"><span class="file-chip">讀到 ${rows.length} 組</span></div>${rows.map(r=>`<div class="scan-result-row"><div><span class="pill">${esc(r.format)}</span> <small>${esc(r.file)}</small></div><pre>${esc(visibleText(r.text))}</pre></div>`).join('')}</div>`
  }
  function patchQuickAnalysis(){
    if(state.analysisPatched)return;
    const parser=window.LabelWorkbenchParsers;
    if(!parser||window.analyzeSelected!==parser.analyze)return;
    const base=window.analyzeSelected;
    window.analyzeSelected=async function(files){
      await base(files);
      const images=[...files].filter(f=>f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||'')).slice(0,MAX_IMAGES);
      if(!images.length)return;
      const out=el('analysisResult');if(out)out.insertAdjacentHTML('beforeend','<div id="analysisBarcodeProgress" class="footer-note">正在本機讀取圖片條碼…</div>');
      const results=await scanFiles(images);
      el('analysisBarcodeProgress')?.remove();out?.insertAdjacentHTML('beforeend',analysisSummary(results))
    };
    state.analysisPatched=true
  }
  function updateVersion(){const small=document.querySelector('.brand small');if(small&&/v0\.\d+/i.test(small.textContent||''))small.textContent=(small.textContent||'').replace(/v0\.\d+/i,'v0.9')}
  function waitForAnalysisPatch(attempt=0){patchQuickAnalysis();if(!state.analysisPatched&&attempt<100)setTimeout(()=>waitForAnalysisPatch(attempt+1),100)}
  function init(){injectStyles();injectUi();addDashboardShortcut();updateVersion();waitForAnalysisPatch()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

  window.LabelWorkbenchBarcodeReader={formatName,visibleText,resultKey,dedupeResults,scanFile,scanFiles,runScanner,state};
})();
