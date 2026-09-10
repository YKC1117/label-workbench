/* Label Workbench label interpreter v1.5
 * Customer file -> production-ready facts. OCR is internal only; users see fields, barcodes and actions.
 * Evidence priority: decoded barcode > recognized text > visual hints. Never invent missing values.
 */
(function(){
  'use strict';

  const BUILD='20260910-v150';
  const PDF_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
  const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
  const TESS_SRC='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const TESS_WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js';
  let pdfPromise=null,tessPromise=null,lastResult=null,lastFiles=[];

  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const ext=f=>(f?.name?.split('.').pop()||'').toLowerCase();
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const isImage=f=>!!(f?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(f?.name||''));

  function loadScript(src,globalName){
    if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);
    if(tessPromise)return tessPromise;
    tessPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=src;s.async=true;s.crossOrigin='anonymous';
      s.onload=()=>globalThis[globalName]?resolve(globalThis[globalName]):reject(new Error(`${globalName} 未載入`));
      s.onerror=()=>reject(new Error(`無法載入：${src}`));document.head.appendChild(s);
    });
    return tessPromise;
  }

  async function loadPdf(){
    if(globalThis.__LABEL_PDFJS)return globalThis.__LABEL_PDFJS;
    if(!pdfPromise)pdfPromise=import(PDF_SRC).then(m=>{m.GlobalWorkerOptions.workerSrc=PDF_WORKER;globalThis.__LABEL_PDFJS=m;return m});
    return pdfPromise;
  }

  async function createWorker(onProgress){
    const T=await loadScript(TESS_SRC,'Tesseract');
    return T.createWorker(['eng','chi_tra'],1,{workerPath:TESS_WORKER,logger:m=>{
      if(m?.status==='recognizing text'&&Number.isFinite(m.progress))onProgress?.(`正在辨識文字… ${Math.round(m.progress*100)}%`);
    }});
  }

  async function renderPage(page){
    const base=page.getViewport({scale:1});
    const scale=Math.max(2.2,Math.min(3.5,3600/Math.max(base.width,base.height)));
    const vp=page.getViewport({scale});
    const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    const x=c.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:x,viewport:vp}).promise;
    return c;
  }

  function rotateCanvas(src,deg){
    const d=((deg%360)+360)%360;if(!d)return src;
    const swap=d===90||d===270,c=document.createElement('canvas');
    c.width=swap?src.height:src.width;c.height=swap?src.width:src.height;
    const x=c.getContext('2d',{willReadFrequently:true});x.translate(c.width/2,c.height/2);x.rotate(d*Math.PI/180);x.drawImage(src,-src.width/2,-src.height/2);return c;
  }

  function crop(src,x,y,w,h){
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));
    c.getContext('2d',{willReadFrequently:true}).drawImage(src,x,y,w,h,0,0,c.width,c.height);return c;
  }

  async function imageCanvas(file){
    const img=await new Promise((resolve,reject)=>{
      const i=new Image(),u=URL.createObjectURL(file);
      i.onload=()=>{URL.revokeObjectURL(u);resolve(i)};i.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('圖片無法開啟'))};i.src=u;
    });
    const max=Math.max(img.naturalWidth||1,img.naturalHeight||1),scale=Math.max(1,Math.min(2.5,3600/max));
    const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);
    c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,c.width,c.height);return c;
  }

  function scoreText(text){
    const t=String(text||'').toUpperCase();
    const words=['PART NO','PART NUMBER','LOT NO','LOT','QTY','QUANTITY','DATE','ASSY','SHAPE','MLOT','BIN','MC','VC','P1','P2','GP','SERIAL','S/N','PN','P/N','MODEL'];
    let s=Math.min(70,t.replace(/\s/g,'').length/4);
    words.forEach(w=>{if(t.includes(w))s+=22});
    s+=(t.match(/\([0-9A-Z]{1,5}\)/g)||[]).length*6;
    s+=Math.min(30,(t.match(/[:：]/g)||[]).length*3);
    return s;
  }

  async function recognize(worker,canvas){
    const r=await worker.recognize(canvas);return String(r?.data?.text||'').trim();
  }

  async function chooseOrientation(worker,canvas,onProgress){
    const order=[0,90,270,180],tested=[];
    for(let i=0;i<order.length;i++){
      const deg=order[i];onProgress?.(`正在判斷原稿方向… ${i+1}/${order.length}`);
      const c=rotateCanvas(canvas,deg),text=await recognize(worker,c),score=scoreText(text);
      tested.push({deg,canvas:c,text,score});
      if(score>=180&&text.length>=80)break;
    }
    tested.sort((a,b)=>b.score-a.score);return tested[0];
  }

  function runs(flags){
    const out=[];let start=null;
    for(let i=0;i<flags.length;i++){
      if(flags[i]&&start===null)start=i;
      if(!flags[i]&&start!==null){out.push([start,i-1]);start=null}
    }
    if(start!==null)out.push([start,flags.length-1]);return out;
  }

  function mergeRuns(list,maxGap){
    const out=[];for(const r of list){if(!out.length||r[0]-out[out.length-1][1]>maxGap)out.push([...r]);else out[out.length-1][1]=r[1]}return out;
  }

  function detectLabelBands(canvas){
    const x=canvas.getContext('2d',{willReadFrequently:true}),im=x.getImageData(0,0,canvas.width,canvas.height),d=im.data;
    const step=Math.max(1,Math.ceil(canvas.width/1400)),counts=new Uint32Array(canvas.height);
    for(let yy=0;yy<canvas.height;yy++){
      let n=0;for(let xx=0;xx<canvas.width;xx+=step){const i=(yy*canvas.width+xx)*4,g=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;if(g<220)n++}counts[yy]=n;
    }
    const sampled=Math.ceil(canvas.width/step),threshold=Math.max(7,Math.round(sampled*.008));
    let rs=mergeRuns(runs([...counts].map(n=>n>threshold)),Math.round(canvas.height*.04));
    rs=rs.filter(r=>r[1]-r[0]>=canvas.height*.07);
    if(rs.length<2||rs.length>6)return [{x:0,y:0,w:canvas.width,h:canvas.height}];
    return rs.map(([a,b])=>{const pad=Math.round(canvas.height*.022),y=Math.max(0,a-pad),y2=Math.min(canvas.height,b+pad);return{x:0,y,w:canvas.width,h:y2-y}});
  }

  function cleanValue(v){return String(v||'').replace(/\s+/g,' ').trim().replace(/^[|:：]+|[|]+$/g,'').slice(0,120)}
  function parseFields(text){
    const out=[];
    for(const rawLine of String(text||'').split(/\r?\n/)){
      const line=rawLine.replace(/\s+/g,' ').trim();if(!line)continue;
      const starts=[...line.matchAll(/\(([A-Z0-9]{1,5})\)/gi)];
      if(starts.length){
        for(let i=0;i<starts.length;i++){
          const from=starts[i].index,to=i+1<starts.length?starts[i+1].index:line.length,chunk=line.slice(from,to).trim();
          const m=chunk.match(/^\(([A-Z0-9]{1,5})\)\s*([^:：]{1,40}?)\s*[:：]\s*(.+)$/i);
          if(!m)continue;const value=cleanValue(m[3]);if(value)out.push({code:m[1].toUpperCase(),name:cleanValue(m[2]),value});
        }
        continue;
      }
      const m=line.match(/^([A-Z][A-Z0-9 ._/#\-]{1,38}?)\s*[:：]\s*(.{1,120})$/i);
      if(m){const name=cleanValue(m[1]),value=cleanValue(m[2]);if(value&&/[A-Z0-9]/i.test(value))out.push({code:'',name,value})}
    }
    const seen=new Set();return out.filter(f=>{const k=`${norm(f.code)}|${norm(f.name)}|${norm(f.value)}`;if(seen.has(k))return false;seen.add(k);return true});
  }

  function dedupeBarcodes(rows){
    const s=new Set(),out=[];for(const r of rows||[]){const k=`${r.format||''}|${r.text||''}`;if(!r.text||s.has(k))continue;s.add(k);out.push(r)}return out;
  }

  async function scanRegionDeep(canvas,labelNo,onProgress){
    const core=window.LabelWorkbenchBarcodeCore;if(!core?.scanCanvas)return[];
    const candidates=[{c:canvas,name:`標籤 ${labelNo} 全圖`}],h=canvas.height*.28;
    for(let i=0;i<7;i++){
      const y=Math.min(canvas.height-h,i*canvas.height*.12);candidates.push({c:crop(canvas,0,y,canvas.width,h),name:`標籤 ${labelNo} 區域 ${i+1}`});
    }
    const all=[];
    for(let i=0;i<candidates.length;i++){
      onProgress?.(`正在讀取標籤 ${labelNo} 的條碼… ${i+1}/${candidates.length}`);
      try{all.push(...await core.scanCanvas(candidates[i].c,candidates[i].name))}catch(e){console.warn('[LW interpreter barcode]',e)}
    }
    return dedupeBarcodes(all);
  }

  function fieldVerified(field,barcodes){
    const v=norm(field.value);if(v.length<2)return null;
    return barcodes.find(b=>{const t=norm(b.text);return t===v||t.includes(v)||(v.includes(t)&&t.length>=4)})||null;
  }

  function detectMarks(text){
    const t=String(text||'').toUpperCase(),out=[];
    if(/ROHS/.test(t))out.push('RoHS');if(/\bHF\b/.test(t))out.push('HF');if(/\bPB\b/.test(t))out.push('Pb 標誌');
    return out;
  }

  async function processCanvas(canvas,sourceName,pageNo,worker,labels,onProgress){
    const best=await chooseOrientation(worker,canvas,onProgress),bands=detectLabelBands(best.canvas);
    onProgress?.(`已找到 ${bands.length} 個標籤區域，正在整理內容…`);
    for(let i=0;i<bands.length;i++){
      const b=bands[i],region=crop(best.canvas,b.x,b.y,b.w,b.h);
      let text=await recognize(worker,region);
      if(scoreText(text)<70){const retry=await chooseOrientation(worker,region,onProgress);text=retry.text}
      const fields=parseFields(text),barcodes=await scanRegionDeep(region,labels.length+1,onProgress),marks=detectMarks(text);
      labels.push({sourceName,page:pageNo,index:i+1,rotation:best.deg,text,fields,barcodes,marks});
    }
  }

  async function interpretPdf(file,onProgress,sharedWorker){
    const pdfjs=await loadPdf(),pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pageLimit=Math.min(pdf.numPages,3),labels=[],own=!sharedWorker,worker=sharedWorker||await createWorker(onProgress);
    try{
      for(let p=1;p<=pageLimit;p++){
        onProgress?.(`正在讀取 ${file.name} 第 ${p}/${pageLimit} 頁…`);
        const page=await pdf.getPage(p),canvas=await renderPage(page);
        await processCanvas(canvas,file.name,p,worker,labels,onProgress);
      }
    }finally{if(own)try{await worker.terminate()}catch{}}
    return {pdfPages:pdf.numPages,labels};
  }

  async function interpretImage(file,onProgress,sharedWorker){
    const own=!sharedWorker,worker=sharedWorker||await createWorker(onProgress),labels=[];
    try{
      onProgress?.(`正在讀取圖片 ${file.name}…`);
      await processCanvas(await imageCanvas(file),file.name,1,worker,labels,onProgress);
    }finally{if(own)try{await worker.terminate()}catch{}}
    return {imageCount:1,labels};
  }

  async function interpretFiles(files,onProgress){
    const arr=[...files].filter(f=>ext(f)==='pdf'||isImage(f)).slice(0,4),labels=[];
    if(!arr.length)return {files:0,pages:0,labels:[]};
    const worker=await createWorker(onProgress);let pages=0;
    try{
      for(let i=0;i<arr.length;i++){
        const f=arr[i];onProgress?.(`正在分析 ${i+1}/${arr.length}：${f.name}`);
        if(ext(f)==='pdf'){
          const r=await interpretPdf(f,onProgress,worker);pages+=r.pdfPages;labels.push(...r.labels);
        }else{
          const r=await interpretImage(f,onProgress,worker);pages+=1;labels.push(...r.labels);
        }
      }
    }finally{try{await worker.terminate()}catch{}}
    return {files:arr.length,pages,labels};
  }

  function fieldName(f){return `${f.code?`(${f.code}) `:''}${f.name||'未命名欄位'}`}
  function fieldTableHtml(fields,barcodes){
    if(!fields.length)return '<div class="note warn-note">目前沒有穩定拆出欄位名稱與內容。請先看下方條碼結果；若條碼也沒有讀到，建議向客戶確認原始檔或更清楚的圖。</div>';
    return `<div class="table-scroll"><table class="analysis-table"><tr><th>欄位</th><th>內容</th><th>狀態</th></tr>${fields.map(f=>{const hit=fieldVerified(f,barcodes);return `<tr><td>${esc(fieldName(f))}</td><td><b>${esc(f.value)}</b></td><td>${hit?'✅ 條碼已確認':'⚠️ 請核對原稿'}</td></tr>`}).join('')}</table></div>`;
  }

  function barcodeRowsHtml(rows){
    if(!rows.length)return '<div class="footer-note">目前沒有成功解出條碼內容；不代表原稿沒有條碼。</div>';
    const core=window.LabelWorkbenchBarcodeCore;
    return `<div class="table-scroll"><table class="analysis-table"><tr><th>條碼類型</th><th>實際掃描內容</th></tr>${rows.map(r=>`<tr><td>${esc(r.format||'未知')}</td><td><b>${esc(core?.visibleText?core.visibleText(r.text):r.text)}</b></td></tr>`).join('')}</table></div>`;
  }

  function totals(result){
    const labels=result.labels||[];return {
      fields:labels.reduce((n,l)=>n+(l.fields||[]).length,0),
      barcodes:labels.reduce((n,l)=>n+(l.barcodes||[]).length,0),
      verified:labels.reduce((n,l)=>n+(l.fields||[]).filter(f=>fieldVerified(f,l.barcodes||[])).length,0),
      pending:labels.reduce((n,l)=>n+(l.fields||[]).filter(f=>!fieldVerified(f,l.barcodes||[])).length,0)
    };
  }

  function productionText(result){
    const lines=['【客戶原稿分析結果】'];
    (result.labels||[]).forEach((l,i)=>{
      lines.push(`\n標籤 ${i+1}${l.sourceName?`｜${l.sourceName}`:''}`);
      (l.fields||[]).forEach(f=>lines.push(`${fieldName(f)}：${f.value}${fieldVerified(f,l.barcodes||[])?'（條碼已確認）':''}`));
      (l.barcodes||[]).forEach((b,j)=>lines.push(`條碼 ${j+1}［${b.format||'未知'}］：${b.text}`));
      if(l.marks?.length)lines.push(`圖示／標記：${l.marks.join('、')}`);
    });
    return lines.join('\n');
  }

  function questionsText(result){
    const pending=[];
    (result.labels||[]).forEach((l,i)=>(l.fields||[]).forEach(f=>{if(!fieldVerified(f,l.barcodes||[]))pending.push(`標籤 ${i+1}「${fieldName(f)}」是否為 ${f.value}`)}));
    const q=[];
    if(pending.length)q.push(...pending.slice(0,12));
    q.push('標籤實際尺寸（寬 × 高 mm）');
    q.push('字型、LOGO／圖示、線條位置是否需要完全依原稿');
    return `您好～原稿已收到，製作前再麻煩確認：\n${q.map((x,i)=>`${i+1}. ${x}`).join('\n')}`;
  }

  async function copyText(text,msg){
    try{await navigator.clipboard.writeText(text);if(typeof window.toast==='function')window.toast(msg)}catch{if(typeof window.toast==='function')window.toast('複製失敗')}
  }

  function renderInterpretation(files,result){
    const labels=result.labels||[],t=totals(result),names=[...files].map(f=>f.name).join('、');
    const canStart=t.fields>0||t.barcodes>0;
    let html=`<div class="analysis-block"><div class="section-title"><div><h3>分析完成</h3><p class="muted compact">${esc(names)}</p></div><span class="pill">${canStart?'可以開始整理製作':'需要補資料'}</span></div>`;
    html+=`<div class="file-chips"><span class="file-chip">標籤 ${labels.length} 張</span><span class="file-chip">欄位 ${t.fields} 個</span><span class="file-chip">條碼 ${t.barcodes} 個</span>${t.verified?`<span class="file-chip">已確認 ${t.verified} 個</span>`:''}</div>`;
    html+=`<div class="generator-actions"><button id="analysisCopyProduction" class="btn primary" type="button">複製製作資料</button><button id="analysisCopyQuestions" class="btn ghost" type="button">複製給客戶確認</button></div>`;
    if(!labels.length)return html+'<div class="note warn-note">沒有成功讀出可製作內容。請改用更清楚的原稿或確認檔案是否正確。</div></div>';

    labels.forEach((l,idx)=>{
      const verified=(l.fields||[]).filter(f=>fieldVerified(f,l.barcodes||[])).length,pending=(l.fields||[]).length-verified;
      html+=`<div class="analysis-block"><div class="section-title"><h3>標籤 ${idx+1}</h3><div><span class="file-chip">${esc(l.sourceName||'原稿')}</span>${l.page>1?` <span class="file-chip">第 ${l.page} 頁</span>`:''}</div></div>`;
      if(verified||pending)html+=`<div class="footer-note"><b>目前可用：</b>${verified?`${verified} 個欄位已由條碼確認`:'尚無欄位完成條碼交叉確認'}${pending?`；${pending} 個欄位請再核對原稿。`:''}</div>`;
      html+='<h4>文字／欄位內容</h4>'+fieldTableHtml(l.fields||[],l.barcodes||[]);
      html+='<h4>條碼內容</h4>'+barcodeRowsHtml(l.barcodes||[]);
      if(l.marks?.length)html+=`<div class="footer-note"><b>圖示／標記：</b>${l.marks.map(esc).join('、')}</div>`;
      html+='</div>';
    });

    const pendingNames=[];(labels||[]).forEach((l,i)=>(l.fields||[]).forEach(f=>{if(!fieldVerified(f,l.barcodes||[]))pendingNames.push(`標籤 ${i+1}「${fieldName(f)}」`)}));
    html+=`<div class="note ${pendingNames.length?'warn-note':''}"><b>下一步：</b>${pendingNames.length?`請優先核對 ${esc(pendingNames.slice(0,8).join('、'))}${pendingNames.length>8?'…':''}。`: '目前讀到的欄位已有條碼交叉確認。'} 標籤實際尺寸、字型、LOGO／圖示與線條位置若原稿沒有明確規格，仍需向客戶確認。</div></div>`;
    return html;
  }

  function wireResultButtons(){
    const a=el('analysisCopyProduction'),b=el('analysisCopyQuestions');
    if(a)a.onclick=()=>copyText(productionText(lastResult),'已複製製作資料');
    if(b)b.onclick=()=>copyText(questionsText(lastResult),'已複製客戶確認內容');
  }

  async function analyze(files){
    const arr=[...files],out=el('analysisResult');if(!out)return;
    const eligible=arr.filter(f=>ext(f)==='pdf'||isImage(f));
    if(!eligible.length||eligible.length!==arr.length){
      const base=window.LabelWorkbenchParsers;
      if(base?.analyze)return base.analyze(arr);
      throw new Error('文件解析器尚未載入');
    }
    lastFiles=eligible;
    const progress=msg=>{out.innerHTML=`<div class="scan-working"><b>正在讀取客戶原稿</b><br>${esc(msg)}<br><small>完成後只會顯示可製作內容與需要確認的項目。</small></div>`};
    progress('準備分析…');
    lastResult=await interpretFiles(eligible,progress);
    out.innerHTML=renderInterpretation(eligible,lastResult);wireResultButtons();
    return lastResult;
  }

  window.LabelWorkbenchInterpreter={BUILD,scoreText,parseFields,detectLabelBands,rotateCanvas,interpretPdf,interpretImage,interpretFiles,productionText,questionsText,analyze};
})();
