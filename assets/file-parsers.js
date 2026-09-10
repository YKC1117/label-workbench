/* Label Workbench local document parsers. Customer file content stays in the browser. */
(function(){
  'use strict';

  const XLSX_SRC='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const MAMMOTH_SRC='https://cdn.jsdelivr.net/npm/mammoth@1.12.2/mammoth.browser.min.js';
  const PDF_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
  const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
  const TESSERACT_SRC='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const TESSERACT_WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js';
  const OCR_MAX_PAGES=3;
  const scriptPromises=new Map();
  let pdfModulePromise=null;
  let baseAnalyze=null;

  function el(id){return document.getElementById(id)}
  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function formatBytes(n=0){if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`}
  function ext(file){return (file?.name?.split('.').pop()||'').toLowerCase()}
  function parseCsvLine(line){const out=[];let cur='',quote=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quote&&line[i+1]==='"'){cur+='"';i++}else quote=!quote}else if(ch===','&&!quote){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
  function classify(files){const g={image:0,pdf:0,excel:0,word:0,csv:0,btw:0,other:0};for(const f of files){const e=ext(f);if(['jpg','jpeg','png','webp'].includes(e))g.image++;else if(e==='pdf')g.pdf++;else if(['xls','xlsx'].includes(e))g.excel++;else if(['doc','docx'].includes(e))g.word++;else if(e==='csv')g.csv++;else if(e==='btw')g.btw++;else g.other++}return g}
  function loadScript(src,globalName){
    if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);
    if(scriptPromises.has(src))return scriptPromises.get(src);
    const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=true;s.crossOrigin='anonymous';s.onload=()=>globalThis[globalName]?resolve(globalThis[globalName]):reject(new Error(`${globalName} 未載入`));s.onerror=()=>reject(new Error(`無法載入解析元件：${src}`));document.head.appendChild(s)});
    scriptPromises.set(src,p);return p
  }
  async function loadPdf(){
    if(globalThis.__LABEL_PDFJS)return globalThis.__LABEL_PDFJS;
    if(!pdfModulePromise)pdfModulePromise=import(PDF_SRC).then(m=>{m.GlobalWorkerOptions.workerSrc=PDF_WORKER;globalThis.__LABEL_PDFJS=m;return m});
    return pdfModulePromise
  }
  function sampleTable(rows,maxRows=5,maxCols=10){
    const slice=(rows||[]).slice(0,maxRows).map(r=>(r||[]).slice(0,maxCols));
    if(!slice.length)return '<div class="footer-note">沒有可顯示的資料列。</div>';
    const width=Math.max(...slice.map(r=>r.length),0);
    return `<div class="table-scroll"><table class="analysis-table"><tbody>${slice.map((r,ri)=>`<tr>${Array.from({length:width},(_,i)=>`<${ri===0?'th':'td'}>${esc(r[i]??'')}</${ri===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`
  }
  function labelKeywords(text){
    const source=String(text||'').toLowerCase();
    const terms=['Vendor','Vendor PN','P/N','Part No','ASUS PN','Product Name','Spec','Stage','QTY','Quantity','Date Code','LOT','Lot No','Origin','Carton No','MSL','Net Weight','Gross Weight','Serial','S/N','Barcode','QR Code','Data Matrix'];
    return terms.filter(t=>source.includes(t.toLowerCase())).filter((v,i,a)=>a.indexOf(v)===i)
  }
  async function imageInfo(file){return new Promise(resolve=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{resolve({w:img.naturalWidth,h:img.naturalHeight});URL.revokeObjectURL(url)};img.onerror=()=>{resolve({w:null,h:null});URL.revokeObjectURL(url)};img.src=url})}

  async function parseExcel(file){
    const XLSX=await loadScript(XLSX_SRC,'XLSX');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const sheets=wb.SheetNames||[];
    if(!sheets.length)return {html:'<div class="footer-note">找不到工作表。</div>',text:''};
    const firstName=sheets[0],ws=wb.Sheets[firstName];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false});
    const headers=(rows[0]||[]).map(x=>String(x||'').trim()).filter(Boolean);
    const text=rows.slice(0,50).flat().join(' ');
    const keys=labelKeywords([headers.join(' '),text].join(' '));
    return {text,html:`<div class="analysis-block"><b>Excel：${esc(file.name)}</b><div class="file-chips"><span class="file-chip">工作表 ${sheets.length} 個</span><span class="file-chip">第一張：${esc(firstName)}</span><span class="file-chip">資料列約 ${Math.max(rows.length-1,0)}</span><span class="file-chip">欄位 ${headers.length}</span></div>${headers.length?`<div class="footer-note">欄位：${headers.slice(0,30).map(esc).join('、')}</div>`:''}${sampleTable(rows)}${keys.length?`<div class="footer-note"><b>原稿文字中出現：</b>${keys.map(esc).join('、')}</div>`:''}<div class="footer-note">其他工作表：${sheets.slice(1,12).map(esc).join('、')||'—'}</div></div>`}
  }

  async function parseCsv(file){
    const text=(await file.text()).replace(/^\uFEFF/,'');
    const lines=text.split(/\r?\n/).filter(x=>x.trim()).slice(0,101);
    const rows=lines.map(parseCsvLine),headers=rows[0]||[];
    const keys=labelKeywords(text.slice(0,20000));
    return {text,html:`<div class="analysis-block"><b>CSV：${esc(file.name)}</b><div class="file-chips"><span class="file-chip">欄位 ${headers.filter(Boolean).length}</span><span class="file-chip">預覽資料列 ${Math.max(rows.length-1,0)}</span></div><div class="footer-note">欄位：${headers.map(h=>esc(h||'(空白)')).join('、')}</div>${sampleTable(rows)}${keys.length?`<div class="footer-note"><b>原稿文字中出現：</b>${keys.map(esc).join('、')}</div>`:''}</div>`}
  }

  async function parseDocx(file){
    if(ext(file)==='doc')return {text:'',html:`<div class="analysis-block"><b>Word：${esc(file.name)}</b><div class="note warn-note">舊版 .doc 是二進位格式，瀏覽器不做不可靠的硬解析。請客戶改存 .docx / PDF，或回公司用 Word 開啟確認。</div></div>`};
    const mammoth=await loadScript(MAMMOTH_SRC,'mammoth');
    const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    const text=(result.value||'').trim();
    const keys=labelKeywords(text),preview=text.slice(0,3500);
    return {text,html:`<div class="analysis-block"><b>Word：${esc(file.name)}</b><div class="file-chips"><span class="file-chip">文字 ${text.length} 字元</span><span class="file-chip">段落約 ${text?text.split(/\n+/).filter(Boolean).length:0}</span></div>${keys.length?`<div class="footer-note"><b>原稿文字中出現：</b>${keys.map(esc).join('、')}</div>`:''}<div class="document-preview">${preview?esc(preview):'沒有擷取到文字內容'}</div>${text.length>preview.length?'<div class="footer-note">預覽只顯示前 3,500 字。</div>':''}</div>`}
  }

  async function renderPdfPage(page){
    const base=page.getViewport({scale:1});
    const scale=Math.min(2.6,2600/Math.max(base.width,base.height));
    const viewport=page.getViewport({scale:Math.max(1.6,scale)});
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(viewport.width));canvas.height=Math.max(1,Math.round(viewport.height));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:ctx,viewport}).promise;
    return canvas
  }

  async function createOcrWorker(onProgress){
    const Tesseract=await loadScript(TESSERACT_SRC,'Tesseract');
    if(typeof Tesseract?.createWorker!=='function')throw new Error('OCR 元件載入不完整');
    return Tesseract.createWorker(['eng','chi_tra'],1,{
      workerPath:TESSERACT_WORKER,
      logger:m=>{
        if(!onProgress)return;
        if(m?.status==='recognizing text'&&Number.isFinite(m.progress))onProgress(`OCR 文字辨識中… ${Math.round(m.progress*100)}%`);
        else if(m?.status)onProgress(`OCR：${m.status}`);
      }
    })
  }

  async function scanPdfCanvas(canvas,pageNo){
    const core=window.LabelWorkbenchBarcodeCore;
    if(!core||typeof core.scanCanvas!=='function')return[];
    try{return await core.scanCanvas(canvas,`PDF 第 ${pageNo} 頁`)}catch(err){console.warn('[Label Workbench] PDF barcode scan failed',err);return[]}
  }

  function barcodeHtml(rows){
    if(!rows.length)return '<div class="footer-note">這幾頁沒有讀到可辨識的一維碼 / 二維碼。</div>';
    return rows.map(r=>`<div class="scan-row"><div class="scan-head"><span class="pill">${esc(r.format||'條碼')}</span><small>${esc(r.source||'')}</small></div><pre>${esc(window.LabelWorkbenchBarcodeCore?.visibleText?window.LabelWorkbenchBarcodeCore.visibleText(r.text):r.text)}</pre></div>`).join('')
  }

  async function parsePdf(file,onProgress){
    const pdfjs=await loadPdf(),data=new Uint8Array(await file.arrayBuffer());
    const pdf=await pdfjs.getDocument({data}).promise;
    const textPages=Math.min(pdf.numPages,12),chunks=[];
    for(let p=1;p<=textPages;p++){
      const page=await pdf.getPage(p),content=await page.getTextContent();
      chunks.push(content.items.map(x=>x.str||'').join(' '));
    }
    const layerText=chunks.join('\n').trim();
    const hasUsefulText=layerText.replace(/\s/g,'').length>=12;

    if(hasUsefulText){
      const keys=labelKeywords(layerText),preview=layerText.slice(0,5000);
      return {text:layerText,html:`<div class="analysis-block"><b>PDF：${esc(file.name)}</b><div class="file-chips"><span class="file-chip">共 ${pdf.numPages} 頁</span><span class="file-chip">文字層</span><span class="file-chip">文字 ${layerText.length} 字元</span></div>${keys.length?`<div class="footer-note"><b>原稿文字中出現：</b>${keys.map(esc).join('、')}</div>`:''}<div class="document-preview">${esc(preview)}</div>${layerText.length>preview.length?'<div class="footer-note">預覽只顯示前 5,000 字。</div>':''}</div>`}
    }

    const ocrPages=Math.min(pdf.numPages,OCR_MAX_PAGES),ocrChunks=[],barcodes=[];
    let worker=null,ocrError='';
    try{
      onProgress?.(`PDF 沒有文字層，準備 OCR（前 ${ocrPages} 頁）…`);
      worker=await createOcrWorker(onProgress);
      for(let p=1;p<=ocrPages;p++){
        onProgress?.(`掃描型 PDF：正在處理第 ${p}/${ocrPages} 頁…`);
        const page=await pdf.getPage(p),canvas=await renderPdfPage(page);
        const [ocrResult,barcodeRows]=await Promise.all([
          worker.recognize(canvas).catch(err=>({data:{text:''},__error:err})),
          scanPdfCanvas(canvas,p)
        ]);
        const pageText=String(ocrResult?.data?.text||'').trim();
        if(pageText)ocrChunks.push(`【第 ${p} 頁】\n${pageText}`);
        (barcodeRows||[]).forEach(r=>barcodes.push(r));
      }
    }catch(err){
      ocrError=err?.message||String(err);
    }finally{
      if(worker){try{await worker.terminate()}catch{}}
    }

    const ocrText=ocrChunks.join('\n\n').trim(),keys=labelKeywords(ocrText),preview=ocrText.slice(0,7000);
    const status=ocrText?`OCR 讀到 ${ocrText.length} 字元`:'OCR 沒有讀到文字';
    return {text:ocrText,html:`<div class="analysis-block"><b>PDF：${esc(file.name)}</b><div class="file-chips"><span class="file-chip">共 ${pdf.numPages} 頁</span><span class="file-chip">掃描型 PDF</span><span class="file-chip">OCR 前 ${ocrPages} 頁</span><span class="file-chip">${esc(status)}</span></div>${ocrError?`<div class="note warn-note"><b>OCR 載入 / 辨識失敗：</b>${esc(ocrError)}</div>`:''}${keys.length?`<div class="footer-note"><b>OCR 找到標籤欄位：</b>${keys.map(esc).join('、')}</div>`:''}${preview?`<div class="document-preview">${esc(preview)}</div>`:'<div class="note warn-note">這份 PDF 沒有文字層，而且 OCR 也沒有讀到可用文字。若原稿很模糊、旋轉或字非常小，可改用原始圖片再測。</div>'}${ocrText.length>preview.length?'<div class="footer-note">OCR 預覽只顯示前 7,000 字。</div>':''}<div class="analysis-block"><b>PDF 條碼偵測：</b>${barcodeHtml(barcodes)}</div>${pdf.numPages>ocrPages?`<div class="footer-note">為避免手機 / 電腦卡住，掃描型 PDF 先自動 OCR 前 ${ocrPages} 頁。</div>`:''}</div>`}
  }

  async function parseOne(file,onProgress){const e=ext(file);if(['xls','xlsx'].includes(e))return parseExcel(file);if(e==='csv')return parseCsv(file);if(['doc','docx'].includes(e))return parseDocx(file);if(e==='pdf')return parsePdf(file,onProgress);return null}

  async function analyze(files){
    const arr=[...files],out=el('analysisResult');if(!out)return;
    if(!arr.length){out.textContent='等待檔案';return}
    out.innerHTML='本機解析中…';
    const groups=classify(arr),groupText=Object.entries(groups).filter(([,n])=>n).map(([k,n])=>`${k.toUpperCase()} × ${n}`).join('｜');
    let html=`<b>已收到：${groupText}</b><div class="analysis-block"><b>檔案：</b><br>${arr.map(f=>`• ${esc(f.name)}（${formatBytes(f.size)}）`).join('<br>')}</div>`;
    const images=arr.filter(f=>['jpg','jpeg','png','webp'].includes(ext(f)));
    if(images.length){const infos=await Promise.all(images.slice(0,10).map(async f=>({name:f.name,...await imageInfo(f)})));html+=`<div class="analysis-block"><b>圖片尺寸：</b><table class="analysis-table"><tr><th>檔名</th><th>像素尺寸</th></tr>${infos.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.w?`${x.w} × ${x.h} px`:'無法讀取'}</td></tr>`).join('')}</table><div class="footer-note">圖片條碼會在同一次快速分析中自動讀取。</div></div>`}
    const parseTargets=arr.filter(f=>['xls','xlsx','csv','doc','docx','pdf'].includes(ext(f))).slice(0,8);
    for(const f of parseTargets){
      const progress=msg=>{out.innerHTML=html+`<div class="scan-working">${esc(msg)}</div>`};
      try{const result=await parseOne(f,progress);if(result)html+=result.html}
      catch(err){html+=`<div class="analysis-block"><b>${esc(f.name)}</b><div class="note warn-note">解析失敗：${esc(err?.message||err)}</div></div>`}
      out.innerHTML=html+'<div class="footer-note">持續解析中…</div>';
    }
    if(groups.btw)html+=`<div class="analysis-block"><b>BarTender .btw</b><div class="note warn-note">已辨識為 BarTender 檔案，但不會在外部瀏覽器假裝解析物件內容。正式內容仍回公司用 BarTender 2022 R2 開啟確認。</div></div>`;
    html+=`<div class="analysis-block"><b>製作前仍要確認：</b><br>• Label 實際尺寸（寬 × 高）<br>• 印表機品牌 / 型號 / DPI<br>• 固定欄位與每張變動欄位<br>• 條碼種類、真正掃描內容、前後綴與 GS1 規則<br>• Excel / CSV 每列資料是否就是一張標籤</div><div class="note"><b>隱私：</b>PDF / Excel / Word / CSV、OCR 與條碼辨識都在你的瀏覽器本機執行。解析程式與 OCR 語言資料會從公開 CDN 載入，但客戶檔案本身不會上傳到 CDN。</div>`;
    out.innerHTML=html;
  }

  function updateUi(){
    const note=[...(el('analysis')?.querySelectorAll('.warn-note')||[])].find(n=>(n.textContent||'').includes('已啟用本機解析'));
    if(note)note.innerHTML='<b>已啟用本機解析：</b>Excel / CSV 可讀工作表與欄位、DOCX 可擷取文字、PDF 先讀文字層；掃描型 PDF 會自動轉圖片做 OCR，並同時嘗試辨識一維碼 / 二維碼。';
    const quick=[...(el('dashboard')?.querySelectorAll('.quick button')||[])].find(b=>(b.textContent||'').includes('客戶原稿快速分析'));
    const span=quick?.querySelector('span');if(span)span.textContent='PDF 文字層 / 掃描 OCR、Excel、Word、CSV 與圖片條碼';
  }

  function patch(){if(typeof window.analyzeSelected==='function'&&!baseAnalyze){baseAnalyze=window.analyzeSelected;window.analyzeSelected=analyze}updateUi()}
  function init(){let count=0;const t=setInterval(()=>{patch();if(baseAnalyze||count++>80)clearInterval(t)},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

  window.LabelWorkbenchParsers={parseCsvLine,labelKeywords,classify,parseExcel,parseCsv,parseDocx,parsePdf,renderPdfPage,analyze};
})();
