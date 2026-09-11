/* Label Workbench source-geometry assist v1.0
 * Runs after field values are already decided. It does NOT change OCR values.
 * It only locates known field values in the source label and stores normalized x/y/w/h
 * so the BTW generator can reproduce the customer's layout.
 */
(function(){
  'use strict';
  const BUILD='20260911-analysis-geometry-100';
  const PDF_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
  const TESS_SRC='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const TESS_WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js';
  let pdfPromise=null,scriptPromise=null;

  const ext=f=>(f?.name?.split('.').pop()||'').toLowerCase();
  const isImage=f=>!!(f?.type?.startsWith?.('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9\u3400-\u9FFF]/g,'');
  const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));

  function loadScript(src,globalName){
    if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=true;s.crossOrigin='anonymous';s.onload=()=>globalThis[globalName]?resolve(globalThis[globalName]):reject(new Error(`${globalName} 未載入`));s.onerror=()=>reject(new Error(`無法載入：${src}`));document.head.appendChild(s)}).finally(()=>{scriptPromise=null});
    return scriptPromise;
  }
  async function pdfjs(){if(globalThis.__LABEL_PDFJS)return globalThis.__LABEL_PDFJS;if(!pdfPromise)pdfPromise=import(PDF_SRC).then(m=>{globalThis.__LABEL_PDFJS=m;return m});return pdfPromise}

  function boxOf(v){const b=v?.bbox||v?.boundingBox||{};const x0=Number(b.x0??b.left??0),y0=Number(b.y0??b.top??0),x1=Number(b.x1??((b.left||0)+(b.width||0))),y1=Number(b.y1??((b.top||0)+(b.height||0)));return{x0,y0,x1,y1,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0)}}
  function wordsFromBlocks(blocks=[]){
    const out=[];
    for(const block of blocks||[])for(const para of block?.paragraphs||[])for(const line of para?.lines||[]){
      if(line?.words?.length){for(const word of line.words){const text=String(word?.text||'').trim();if(text)out.push({text,confidence:Number(word?.confidence||line?.confidence||0),...boxOf(word)})}}
      else{const text=String(line?.text||'').trim();if(text)out.push({text,confidence:Number(line?.confidence||0),...boxOf(line)})}
    }
    return out.sort((a,b)=>Math.abs(a.y0-b.y0)<Math.max(a.h,b.h)*.45?a.x0-b.x0:a.y0-b.y0)
  }
  function unionBoxes(items){const x0=Math.min(...items.map(x=>x.x0)),y0=Math.min(...items.map(x=>x.y0)),x1=Math.max(...items.map(x=>x.x1)),y1=Math.max(...items.map(x=>x.y1));return{x0,y0,x1,y1,w:x1-x0,h:y1-y0}}
  function sameRow(a,b){const ov=Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));return ov/Math.max(1,Math.min(a.h,b.h))>.25}
  function candidateSpans(words,maxWords=5){
    const out=[];
    for(let i=0;i<words.length;i++){
      let row=[words[i]];out.push({text:words[i].text,items:[words[i]],...unionBoxes([words[i]])});
      for(let n=2;n<=maxWords&&i+n<=words.length;n++){
        const next=words[i+n-1];if(!sameRow(row[row.length-1],next))break;row=[...row,next];const b=unionBoxes(row);out.push({text:row.map(x=>x.text).join(' '),items:row,...b})
      }
    }
    return out
  }
  function charSimilarity(a,b){const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length);let same=0;const m=Math.min(x.length,y.length);for(let i=0;i<m;i++)if(x[i]===y[i])same++;return same/Math.max(x.length,y.length)}
  function matchKnownFields(fields,words,width,height){
    const spans=candidateSpans(words),used=new Set(),matches=[];
    for(const field of fields||[]){
      const value=String(field?.value??'').trim(),target=norm(value);if(!target||target.length<1)continue;
      let best=null,bestScore=0;
      for(const span of spans){
        if(span.items.some(x=>used.has(x)))continue;
        const s=charSimilarity(value,span.text);const lenRatio=Math.min(target.length,norm(span.text).length)/Math.max(target.length,norm(span.text).length||1);const score=s*.82+lenRatio*.18;
        const exact=target===norm(span.text);if((exact||score>=.84)&&score>bestScore){best=span;bestScore=score}
      }
      if(!best)continue;
      best.items.forEach(x=>used.add(x));
      const confidence=Math.min(...best.items.map(x=>Number(x.confidence||0)));
      const sourceBox={x:clamp01(best.x0/width),y:clamp01(best.y0/height),w:clamp01(best.w/width),h:clamp01(best.h/height),confidence:Math.round(confidence*10)/10,match:Math.round(bestScore*1000)/1000};
      matches.push({field,sourceBox,text:best.text});
    }
    return matches
  }

  function crop(src,x,y,w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));const q=c.getContext('2d',{willReadFrequently:true});q.fillStyle='#fff';q.fillRect(0,0,c.width,c.height);q.drawImage(src,x,y,w,h,0,0,c.width,c.height);return c}
  async function imageCanvas(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const max=Math.max(img.naturalWidth||1,img.naturalHeight||1),scale=Math.max(1,Math.min(2.5,3600/max)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);const q=c.getContext('2d',{willReadFrequently:true});q.fillStyle='#fff';q.fillRect(0,0,c.width,c.height);q.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片無法開啟'))};img.src=url})}
  async function pdfPageCanvas(file,pageNo){const P=await pdfjs(),pdf=await P.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,page=await pdf.getPage(pageNo),base=page.getViewport({scale:1}),scale=Math.max(2,Math.min(4,3600/Math.max(base.width,base.height))),vp=page.getViewport({scale}),c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);const q=c.getContext('2d',{willReadFrequently:true});q.fillStyle='#fff';q.fillRect(0,0,c.width,c.height);await page.render({canvasContext:q,viewport:vp,background:'rgb(255,255,255)'}).promise;return c}
  async function createWorker(){const T=await loadScript(TESS_SRC,'Tesseract');const worker=await T.createWorker(['eng','chi_tra'],1,{workerPath:TESS_WORKER});try{await worker.setParameters({tessedit_pageseg_mode:T.PSM?.SPARSE_TEXT||'11',preserve_interword_spaces:'1'})}catch{}return worker}
  async function recognizeWords(worker,canvas){const r=await worker.recognize(canvas,{}, {text:true,blocks:true});return wordsFromBlocks(r?.data?.blocks||[])}

  async function locateFile(file,labels,worker,A){
    const pages=[...new Set(labels.map(l=>Number(l.page||1)))];
    for(const pageNo of pages){
      let canvas=ext(file)==='pdf'?await pdfPageCanvas(file,pageNo):await imageCanvas(file);
      const pageLabels=labels.filter(l=>Number(l.page||1)===pageNo).sort((a,b)=>Number(a.index||1)-Number(b.index||1));
      const rotation=Number(pageLabels[0]?.rotation||0);if(rotation&&typeof A.rotateCanvas==='function')canvas=A.rotateCanvas(canvas,rotation);
      let bands=typeof A.detectLabelBands==='function'?A.detectLabelBands(canvas):[{x:0,y:0,w:canvas.width,h:canvas.height}];
      if(bands.length!==pageLabels.length&&pageLabels.length===1)bands=[{x:0,y:0,w:canvas.width,h:canvas.height}];
      for(let i=0;i<Math.min(pageLabels.length,bands.length);i++){
        const label=pageLabels[i],b=bands[i],region=crop(canvas,b.x,b.y,b.w,b.h),words=await recognizeWords(worker,region),matches=matchKnownFields(label.fields||[],words,region.width,region.height);
        for(const m of matches)m.field.sourceBox=m.sourceBox;
        label.sourceGeometry={widthPx:region.width,heightPx:region.height,locatedFields:matches.length,totalFields:(label.fields||[]).length,method:'known-value-layout-ocr'};
      }
    }
  }
  async function refine(files,result){
    const A=window.LabelWorkbenchInterpreter;if(!A||!result?.labels?.length)return result;
    const media=[...(files||[])].filter(f=>ext(f)==='pdf'||isImage(f));if(!media.length)return result;
    let worker=null;
    try{worker=await createWorker();for(const file of media){const labels=result.labels.filter(l=>l.sourceName===file.name).slice(0,8);if(labels.length)await locateFile(file,labels,worker,A)}}catch(err){console.warn('[Label Workbench] geometry assist skipped',err)}finally{if(worker)try{await worker.terminate()}catch{}}
    return result
  }
  function install(){const A=window.LabelWorkbenchInterpreter;if(!A?.analyze||A.__geometryWrapped)return false;const base=A.analyze.bind(A);A.analyze=async function(files){const arr=[...(files||[])],result=await base(arr);return refine(arr,result)};A.__geometryWrapped=true;A.refineGeometry=refine;console.info('[Label Workbench] source geometry assist',BUILD);return true}
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},80)}

  window.LabelWorkbenchAnalysisGeometry={BUILD,norm,charSimilarity,wordsFromBlocks,candidateSpans,matchKnownFields,refine,install};
})();
