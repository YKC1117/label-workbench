/* Label Workbench label interpreter v1.4
 * Purpose: turn real customer scanned label PDFs into manufacturing-ready facts.
 * Evidence priority: decoded barcode > OCR text > visual hints. Never invent missing values.
 */
(function(){
  'use strict';

  const BUILD='20260910-v140';
  const PDF_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
  const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
  const TESS_SRC='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const TESS_WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js';
  let pdfPromise=null,tessPromise=null;

  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const ext=f=>(f?.name?.split('.').pop()||'').toLowerCase();
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');

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
      if(m?.status==='recognizing text'&&Number.isFinite(m.progress))onProgress?.(`OCR ${Math.round(m.progress*100)}%`);
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

  function scoreText(text){
    const t=String(text||'').toUpperCase();
    const words=['PART NO','LOT NO','QTY','DATE','ASSY','SHAPE','MLOT','BIN','MC','VC','P1','P2','GP'];
    let s=Math.min(70,t.replace(/\s/g,'').length/4);
    words.forEach(w=>{if(t.includes(w))s+=24});
    s+=(t.match(/\([0-9A-Z]{1,4}\)/g)||[]).length*6;
    s+=Math.min(30,(t.match(/:/g)||[]).length*3);
    return s;
  }

  async function recognize(worker,canvas){
    const r=await worker.recognize(canvas);return String(r?.data?.text||'').trim();
  }

  async function chooseOrientation(worker,canvas,onProgress){
    const order=[0,90,270,180],tested=[];
    for(const deg of order){
      onProgress?.(`正在判斷標籤方向：${deg}°`);
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
    let rs=mergeRuns(runs([...counts].map(n=>n>threshold)),Math.round(canvas.height*.022));
    rs=rs.filter(r=>r[1]-r[0]>=canvas.height*.055);
    if(rs.length<2||rs.length>8)return [{x:0,y:0,w:canvas.width,h:canvas.height}];
    return rs.map(([a,b])=>{const pad=Math.round(canvas.height*.018),y=Math.max(0,a-pad),y2=Math.min(canvas.height,b+pad);return{x:0,y,w:canvas.width,h:y2-y}});
  }

  function parseFields(text){
    const out=[];
    for(const rawLine of String(text||'').split(/\r?\n/)){
      const line=rawLine.replace(/\s+/g,' ').trim();if(!line)continue;
      const starts=[...line.matchAll(/\(([A-Z0-9]{1,5})\)/gi)];
      for(let i=0;i<starts.length;i++){
        const from=starts[i].index,to=i+1<starts.length?starts[i+1].index:line.length,chunk=line.slice(from,to).trim();
        const m=chunk.match(/^\(([A-Z0-9]{1,5})\)\s*([^:]{1,34}?)\s*:\s*(.+)$/i);
        if(!m)continue;
        const code=m[1].toUpperCase(),name=m[2].replace(/\s+/g,' ').trim(),value=m[3].replace(/\s+/g,' ').trim().replace(/[|]+$/,'');
        if(value)out.push({code,name,value});
      }
    }
    const seen=new Set();return out.filter(f=>{const k=`${f.code}|${f.name}|${f.value}`;if(seen.has(k))return false;seen.add(k);return true});
  }

  function dedupeBarcodes(rows){
    const s=new Set(),out=[];for(const r of rows||[]){const k=`${r.format||''}|${r.text||''}`;if(!r.text||s.has(k))continue;s.add(k);out.push(r)}return out;
  }

  async function scanRegionDeep(canvas,labelNo,onProgress){
    const core=window.LabelWorkbenchBarcodeCore;if(!core?.scanCanvas)return[];
    const candidates=[{c:canvas,name:`標籤 ${labelNo} 全圖`}];
    const bands=7,h=canvas.height*.26;
    for(let i=0;i<bands;i++){
      const y=Math.min(canvas.height-h,i*canvas.height*.125);candidates.push({c:crop(canvas,0,y,canvas.width,h),name:`標籤 ${labelNo} 橫列 ${i+1}`});
    }
    const all=[];
    for(let i=0;i<candidates.length;i++){
      onProgress?.(`標籤 ${labelNo} 條碼掃描 ${i+1}/${candidates.length}`);
      try{all.push(...await core.scanCanvas(candidates[i].c,candidates[i].name))}catch(e){console.warn('[LW interpreter barcode]',e)}
    }
    return dedupeBarcodes(all);
  }

  function fieldVerified(field,barcodes){
    const v=norm(field.value);if(v.length<2)return null;
    return barcodes.find(b=>{const t=norm(b.text);return t===v||t.includes(v)||v.includes(t)&&t.length>=4})||null;
  }

  function detectMarks(text){
    const t=String(text||'').toUpperCase(),out=[];
    if(/ROHS/.test(t))out.push('RoHS');if(/\bHF\b/.test(t))out.push('HF');if(/\bPB\b/.test(t))out.push('Pb 標誌');
    return out;
  }

  function barcodeRowsHtml(rows){
    if(!rows.length)return '<div class="note warn-note">尚未成功解碼任何條碼。這代表「未驗證」，不是代表原稿沒有條碼。</div>';
    const core=window.LabelWorkbenchBarcodeCore;
    return `<div class="table-scroll"><table class="analysis-table"><tr><th>格式</th><th>實際解碼內容</th><th>來源</th></tr>${rows.map(r=>`<tr><td>${esc(r.format||'未知')}</td><td><code>${esc(core?.visibleText?core.visibleText(r.text):r.text)}</code></td><td>${esc(r.source||'')}</td></tr>`).join('')}</table></div>`;
  }

  function fieldTableHtml(fields,barcodes){
    if(!fields.length)return '<div class="note warn-note">OCR 有內容，但尚未能穩定拆成「欄位：值」。請以原稿影像與條碼解碼結果人工確認。</div>';
    return `<div class="table-scroll"><table class="analysis-table"><tr><th>代碼</th><th>欄位</th><th>OCR 值</th><th>驗證</th></tr>${fields.map(f=>{const hit=fieldVerified(f,barcodes);return `<tr><td>${esc(f.code)}</td><td>${esc(f.name)}</td><td><b>${esc(f.value)}</b></td><td>${hit?`✅ 條碼吻合<br><small>${esc(hit.format||'')}</small>`:'⚠️ OCR 待確認'}</td></tr>`}).join('')}</table></div>`;
  }

  async function interpretPdf(file,onProgress){
    const pdfjs=await loadPdf(),pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pageLimit=Math.min(pdf.numPages,3),worker=await createWorker(onProgress),labels=[];
    try{
      for(let p=1;p<=pageLimit;p++){
        onProgress?.(`PDF 第 ${p}/${pageLimit} 頁：轉成高解析影像`);
        const page=await pdf.getPage(p),base=await renderPage(page),best=await chooseOrientation(worker,base,onProgress),bands=detectLabelBands(best.canvas);
        onProgress?.(`PDF 第 ${p} 頁：判斷為 ${best.deg}°，找到 ${bands.length} 個標籤區域`);
        for(let i=0;i<bands.length;i++){
          const b=bands[i],region=crop(best.canvas,b.x,b.y,b.w,b.h);
          let text=await recognize(worker,region);
          if(scoreText(text)<80){
            const retry=await chooseOrientation(worker,region,onProgress);text=retry.text;
          }
          const fields=parseFields(text),barcodes=await scanRegionDeep(region,labels.length+1,onProgress),marks=detectMarks(text);
          labels.push({page:p,index:i+1,rotation:best.deg,text,fields,barcodes,marks});
        }
      }
    }finally{try{await worker.terminate()}catch{}}
    return {pdfPages:pdf.numPages,labels};
  }

  function renderInterpretation(file,result){
    const labels=result.labels||[];
    let html=`<div class="analysis-block"><div class="section-title"><div><h3>製作原稿解析：${esc(file.name)}</h3><p class="muted compact">偵測 ${result.pdfPages} 頁，拆出 ${labels.length} 個標籤區域。證據優先順序：條碼實際解碼 ＞ OCR ＞ 推測。</p></div><span class="pill">製作模式</span></div>`;
    if(!labels.length)return html+'<div class="note warn-note">沒有成功分離出標籤區域，請人工查看原稿。</div></div>';
    labels.forEach((l,idx)=>{
      const verified=l.fields.filter(f=>fieldVerified(f,l.barcodes)).length,unverified=Math.max(0,l.fields.length-verified);
      html+=`<div class="analysis-block"><div class="section-title"><h3>標籤 ${idx+1}</h3><div><span class="file-chip">第 ${l.page} 頁</span> <span class="file-chip">轉正 ${l.rotation}°</span> <span class="file-chip">欄位 ${l.fields.length}</span> <span class="file-chip">解碼 ${l.barcodes.length}</span></div></div>`;
      html+=`<div class="footer-note"><b>製作狀態：</b>${verified?`✅ ${verified} 個欄位已有條碼交叉驗證`:'⚠️ 尚無欄位可用條碼交叉驗證'}${unverified?`；${unverified} 個 OCR 欄位仍需看原稿確認。`:''}</div>`;
      html+='<h4>欄位整理</h4>'+fieldTableHtml(l.fields,l.barcodes);
      html+='<h4>實際條碼解碼</h4>'+barcodeRowsHtml(l.barcodes);
      if(l.marks.length)html+=`<div class="footer-note"><b>辨識到的圖示文字：</b>${l.marks.map(esc).join('、')}。圖示造型仍應依原稿重製/匯入，不用 OCR 猜圖形。</div>`;
      html+=`<details><summary>查看 OCR 原文</summary><pre class="document-preview">${esc(l.text||'沒有 OCR 文字')}</pre></details></div>`;
    });
    html+=`<div class="note"><b>拿去做 BarTender 前：</b>「✅ 條碼吻合」可當高可信資料；「⚠️ OCR 待確認」不可直接當成客戶指定值。標籤實際寬高、字型、線條粗細、LOGO 圖檔與未成功解碼的條碼，仍以客戶原稿/實物為準。</div></div>`;
    return html;
  }

  async function analyze(files){
    const arr=[...files],out=el('analysisResult');if(!out)return;
    const pdfs=arr.filter(f=>ext(f)==='pdf');
    if(pdfs.length!==1||arr.length!==1){
      const base=window.LabelWorkbenchParsers;
      if(base?.analyze)return base.analyze(arr);
      throw new Error('一般文件解析器尚未載入');
    }
    const file=pdfs[0];
    const progress=msg=>{out.innerHTML=`<div class="scan-working"><b>正在完整解讀客戶原稿</b><br>${esc(msg)}<br><small>掃描型 PDF 會比一般 PDF 久，請不要關閉頁面。</small></div>`};
    progress('準備解析…');
    const result=await interpretPdf(file,progress);
    out.innerHTML=renderInterpretation(file,result);
    return result;
  }

  window.LabelWorkbenchInterpreter={BUILD,scoreText,parseFields,detectLabelBands,rotateCanvas,interpretPdf,analyze};
})();
