/* Label Workbench barcode core v1.2 - fast local decoding with normalized canvas + ZXing + ZBar fallback. */
(function(){
  'use strict';

  const ZX='3.1.3';
  const ZX_JS=`https://cdn.jsdelivr.net/npm/zxing-wasm@${ZX}/dist/iife/reader/index.js`;
  const ZX_WASM=`https://cdn.jsdelivr.net/npm/zxing-wasm@${ZX}/dist/reader/zxing_reader.wasm`;
  const ZBAR_URL='https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.11.0/dist/inlined/index.mjs';
  const MAX_DIM=3400,MAX_RESULTS=32;
  const state={zxLoad:null,zxPrepared:false,zbarLoad:null};

  const fmtMap={
    QRCODE:'QR Code',QR:'QR Code',MICROQRCODE:'Micro QR Code',RMQRCODE:'rMQR Code',
    DATAMATRIX:'Data Matrix',CODE39:'Code 39',CODE39STD:'Code 39',CODE39EXT:'Code 39 Extended',
    CODE93:'Code 93',CODE128:'Code 128',EAN8:'EAN-8',EAN13:'EAN-13',UPCA:'UPC-A',UPCE:'UPC-E',
    EANUPC:'EAN / UPC',ITF:'ITF / Interleaved 2 of 5',I25:'ITF / Interleaved 2 of 5',
    ITF14:'ITF-14',PDF417:'PDF417',AZTEC:'Aztec',CODABAR:'Codabar',
    DATABAR:'DataBar',DATABAREXP:'DataBar Expanded',DATABARLTD:'DataBar Limited',MAXICODE:'MaxiCode'
  };

  const fastProfile={tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,minLineCount:1,maxNumberOfSymbols:32,binarizer:'LocalAverage'};
  const deepProfile={...fastProfile,tryDenoise:true,binarizer:'GlobalHistogram'};

  function formatName(v){
    const k=String(v??'').replace(/[\s_\-\/]/g,'').toUpperCase();
    return fmtMap[k]||String(v||'未知格式').replace(/_/g,' ');
  }
  function visibleText(v){
    return [...String(v??'')].map(c=>{const n=c.charCodeAt(0);if(n===29)return'[GS]';if(n===30)return'[RS]';if(n===4)return'[EOT]';if(n===13)return'[CR]';if(n===10)return'[LF]';if(n===9)return'[TAB]';if(n<32||n===127)return`[0x${n.toString(16).toUpperCase().padStart(2,'0')}]`;return c}).join('');
  }
  function key(r){return`${formatName(r?.format)}\0${String(r?.text??'')}`}
  function dedupe(a){
    const s=new Set(),o=[];
    for(const x of a||[]){
      if(x?.text==null||String(x.text)==='')continue;
      const r={format:formatName(x.format),text:String(x.text),engine:x.engine||'',source:x.source||'',position:x.position||null};
      const k=key(r);if(s.has(k))continue;s.add(k);o.push(r);if(o.length>=MAX_RESULTS)break;
    }
    return o;
  }

  function prepZX(z){
    if(state.zxPrepared)return;
    if(typeof z?.prepareZXingModule==='function')z.prepareZXingModule({overrides:{locateFile:(p,pre)=>p.endsWith('.wasm')?ZX_WASM:pre+p}});
    state.zxPrepared=true;
  }
  function loadZX(){
    if(window.ZXingWASM?.readBarcodes){prepZX(window.ZXingWASM);return Promise.resolve(window.ZXingWASM)}
    if(state.zxLoad)return state.zxLoad;
    state.zxLoad=new Promise((res,rej)=>{
      const done=()=>{if(window.ZXingWASM?.readBarcodes){prepZX(window.ZXingWASM);res(window.ZXingWASM)}else rej(new Error('ZXing 載入不完整'))};
      const old=document.querySelector('script[data-lw-zxing]');
      if(old){old.addEventListener('load',done,{once:true});old.addEventListener('error',()=>rej(new Error('ZXing 載入失敗')),{once:true});return}
      const s=document.createElement('script');s.src=ZX_JS;s.async=true;s.dataset.lwZxing='1';s.crossOrigin='anonymous';s.onload=done;s.onerror=()=>rej(new Error('無法載入 ZXing'));document.head.appendChild(s);
    });
    return state.zxLoad;
  }
  function loadZBar(){
    if(state.zbarLoad)return state.zbarLoad;
    state.zbarLoad=import(ZBAR_URL).then(m=>m?.scanImageData?m:Promise.reject(new Error('ZBar 載入不完整')));
    return state.zbarLoad;
  }

  async function decodeZX(input,source,profile=fastProfile){
    const z=await loadZX();let rows=[];
    try{rows=await z.readBarcodes(input,profile)}catch(e){console.warn('[LW ZXing]',source,e);return[]}
    return dedupe((rows||[]).filter(r=>r?.isValid!==false&&!r?.error).map(r=>({format:r.format||r.symbology||'',text:r.text??'',engine:'ZXing-C++ WASM',source,position:r.position||null})));
  }
  async function decodeZBar(data,source){
    try{
      const z=await loadZBar(),rows=await z.scanImageData(data);
      return dedupe((rows||[]).map(r=>({format:r.typeName||r.type||'',text:typeof r.decode==='function'?r.decode():String(r.data??''),engine:'ZBar WASM',source,position:null})));
    }catch(e){console.warn('[LW ZBar]',source,e);return[]}
  }
  async function selfTest(){
    try{await loadZX();return{ok:true,error:''}}catch(e){return{ok:false,error:e?.message||String(e)}}
  }

  function loadImage(f){return new Promise((res,rej)=>{const i=new Image(),u=URL.createObjectURL(f);i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('圖片無法開啟'))};i.src=u})}
  function canvasFromImage(img,scale=1){
    const w0=img.naturalWidth||img.width||1,h0=img.naturalHeight||img.height||1,sc=Math.min(scale,MAX_DIM/Math.max(w0,h0)),c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w0*sc));c.height=Math.max(1,Math.round(h0*sc));
    const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=false;
    x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);return c;
  }
  function crop(src,x,y,w,h){
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));
    const q=c.getContext('2d',{willReadFrequently:true});q.imageSmoothingEnabled=false;q.fillStyle='#fff';q.fillRect(0,0,c.width,c.height);q.drawImage(src,x,y,w,h,0,0,c.width,c.height);return c;
  }
  function scale(src,f=1){
    f=Math.max(1,Math.min(f,MAX_DIM/Math.max(src.width,src.height)));if(f<=1.05)return src;
    const c=document.createElement('canvas');c.width=Math.round(src.width*f);c.height=Math.round(src.height*f);
    const q=c.getContext('2d',{willReadFrequently:true});q.imageSmoothingEnabled=false;q.fillStyle='#fff';q.fillRect(0,0,c.width,c.height);q.drawImage(src,0,0,c.width,c.height);return c;
  }
  function threshold(src,invert=false){
    const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const q=c.getContext('2d',{willReadFrequently:true});q.fillStyle='#fff';q.fillRect(0,0,c.width,c.height);q.drawImage(src,0,0);
    const im=q.getImageData(0,0,c.width,c.height),d=im.data;let sum=0,n=0;
    for(let i=0;i<d.length;i+=16){sum+=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;n++}
    const t=Math.max(70,Math.min(210,sum/Math.max(1,n)));
    for(let i=0;i<d.length;i+=4){const g=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;let v=g<t?0:255;if(invert)v=255-v;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}
    q.putImageData(im,0,0);return c;
  }
  function imageData(c){return c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height)}
  function native(canvas){
    if(!('BarcodeDetector'in globalThis))return Promise.resolve([]);
    return (async()=>{try{const f=await BarcodeDetector.getSupportedFormats();if(!f?.length)return[];const d=new BarcodeDetector({formats:f}),r=await d.detect(canvas);return dedupe(r.map(x=>({format:x.format,text:x.rawValue,engine:'BarcodeDetector',source:'瀏覽器原生'})))}catch{return[]}})();
  }

  function deepCandidates(base){
    const out=[];
    for(let i=0;i<5;i++){
      const h=base.height*.30,y=Math.min(base.height-h,i*base.height*.175),c=crop(base,0,y,base.width,h);
      out.push({canvas:scale(c,1.5),source:`橫向區域 ${i+1}`});
    }
    const n=3,cw=base.width/n,ch=base.height/n;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const x0=Math.max(0,x*cw-cw*.16),y0=Math.max(0,y*ch-ch*.16),x1=Math.min(base.width,(x+1)*cw+cw*.16),y1=Math.min(base.height,(y+1)*ch+ch*.16);
      out.push({canvas:scale(crop(base,x0,y0,x1-x0,y1-y0),1.8),source:`分區 ${y*n+x+1}`});
    }
    out.push({canvas:threshold(base),source:'高對比'});
    return out;
  }

  async function quickScan(file,img,base,onStage){
    const all=[];
    onStage?.('快速掃描');
    all.push(...await decodeZX(file,'原始檔'));
    if(!dedupe(all).length)all.push(...await decodeZX(imageData(base),'標準化全圖'));
    if(!dedupe(all).length)all.push(...await native(base));
    if(!dedupe(all).length){onStage?.('一維碼相容掃描');all.push(...await decodeZBar(imageData(base),'ZBar 全圖'))}
    return dedupe(all);
  }
  async function deepScan(base,onStage){
    const longSide=Math.max(base.width,base.height),factor=longSide<1600?Math.min(3,1600/Math.max(1,longSide)):1;
    const prepared=scale(base,factor),all=[],list=deepCandidates(prepared);
    for(let i=0;i<list.length;i++){
      const item=list[i];onStage?.(`加強讀取 ${i+1}/${list.length}`);
      const data=imageData(item.canvas);
      all.push(...await decodeZX(data,item.source,deepProfile));
      if(!dedupe(all).length)all.push(...await decodeZBar(data,item.source+' · ZBar'));
      if(dedupe(all).length)break;
    }
    return dedupe(all);
  }
  async function scanFile(file,onStage,options={}){
    const img=await loadImage(file),base=canvasFromImage(img),all=[];
    all.push(...await quickScan(file,img,base,onStage));
    if(!dedupe(all).length&&options.deep)all.push(...await deepScan(base,onStage));
    return{name:file.name,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,img,results:dedupe(all)};
  }
  async function scanCanvas(c,source='指定區域'){
    const z=scale(c,Math.max(1.5,Math.min(4,MAX_DIM/Math.max(c.width,c.height)))),all=[],data=imageData(z);
    all.push(...await decodeZX(data,source,deepProfile));
    if(!dedupe(all).length)all.push(...await decodeZBar(data,source+' · ZBar'));
    if(!dedupe(all).length)all.push(...await decodeZX(imageData(threshold(z)),source+' · 高對比',deepProfile));
    return dedupe(all);
  }

  window.LabelWorkbenchBarcodeCore={VERSION:'1.2',ZXING_VERSION:ZX,formatName,visibleText,key,dedupe,selfTest,loadImage,canvasFromImage,crop,scale,threshold,imageData,scanFile,scanCanvas,state};
})();