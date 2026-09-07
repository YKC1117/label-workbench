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
  function scaleCanvas(src,factor){