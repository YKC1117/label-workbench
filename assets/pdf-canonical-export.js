/* Label Workbench vector PDF -> canonical JSON export (browser adapter).
 * Independent of the RC2 binary BTW path: it needs only the selected PDF file.
 * Gathers plain inputs with the site's existing modules (LabelWorkbenchPdfNative
 * pdf.js instance, LabelWorkbenchBarcodeCore.scanCanvas, bwip-js 4.6.0) and
 * hands them to the shared core assets/pdf-canonical.js. No rule lives here.
 */
(function(){
  'use strict';
  const BUILD='20261104-pdf-canonical-export-v1';
  const BWIP_SRC='https://cdn.jsdelivr.net/npm/bwip-js@4.6.0/dist/bwip-js-min.js';
  const HOST_ID='pdfCanonicalExport';
  let bwipPromise=null;

  function loadBwip(){
    if(window.bwipjs?.raw)return Promise.resolve(window.bwipjs);
    if(bwipPromise)return bwipPromise;
    bwipPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=BWIP_SRC;s.async=true;s.crossOrigin='anonymous';
      s.onload=()=>window.bwipjs?.raw?resolve(window.bwipjs):reject(new Error('bwip-js raw() unavailable'));
      s.onerror=()=>reject(new Error('bwip-js load failed'));document.head.appendChild(s);
    });
    return bwipPromise;
  }
  // Same legacy build URL as label-interpreter.js (shared ES module instance) and
  // the Node adapter. The modern build needs ES2025/2026 built-ins
  // (Uint8Array#toHex, Map#getOrInsertComputed) that many browsers lack.
  const PDF_LEGACY='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs';
  let pdfPromise=null;
  async function pdfjs(){
    if(!pdfPromise)pdfPromise=import(PDF_LEGACY);
    const P=await pdfPromise;
    if(P.GlobalWorkerOptions&&!P.GlobalWorkerOptions.workerSrc)P.GlobalWorkerOptions.workerSrc=PDF_LEGACY.replace(/pdf\.min\.mjs$/,'pdf.worker.min.mjs');
    return P;
  }
  async function extract(file){
    const Core=window.LabelWorkbenchPdfCanonical,BC=window.LabelWorkbenchBarcodeCore;
    if(!Core||!BC?.scanCanvas)throw new Error('Canonical core or barcode reader not ready');
    const P=await pdfjs(),pdf=await P.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,page=await pdf.getPage(1);
    const opList=await page.getOperatorList(),textContent=await page.getTextContent({includeMarkedContent:false});
    const fontNames={};
    for(const id of new Set(textContent.items.map(i=>i.fontName)))if(page.commonObjs.has(id))fontNames[id]=page.commonObjs.get(id).name;
    const vp=page.getViewport({scale:Core.RENDER_DPI/72}),c=document.createElement('canvas');
    c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:ctx,viewport:vp,background:'rgb(255,255,255)'}).promise;
    const gray=Core.grayFromRgba(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height);
    const pageMm=Core.pageInfo({view:page.view,rotate:page.rotate,userUnit:page.userUnit});
    const rows=await BC.scanCanvas(c,'PDF canonical');
    const decodedBarcodes=(rows||[]).filter(r=>r?.sourceBox).map(r=>({format:r.format,text:r.text??r.value,boxMm:Core.regionBoxToPageMm(r.sourceBox,{imageWidthPx:c.width,imageHeightPx:c.height},pageMm)}));
    return {sourceName:file.name,numPages:pdf.numPages,page:{view:Array.from(page.view),rotate:page.rotate,userUnit:page.userUnit},
      textContent:{items:textContent.items.map(i=>({str:i.str,transform:Array.from(i.transform),width:i.width,fontName:i.fontName})),styles:textContent.styles},
      fontNames,ops:Core.normalizeOps(opList,P.OPS),raster:{width:c.width,height:c.height,gray,pxPerMm:Core.RENDER_DPI/25.4},decodedBarcodes,encoder:await loadBwip()};
  }
  async function convert(file){return window.LabelWorkbenchPdfCanonical.build(await extract(file));}
  function download(name,obj){
    const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)+'\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function host(){
    let h=document.getElementById(HOST_ID);
    if(!h||!h.isConnected){const files=document.getElementById('analysisFiles');if(!files)return null;h=document.createElement('div');h.id=HOST_ID;files.insertAdjacentElement('afterend',h);}
    return h;
  }
  function render(files){
    const h=host();if(!h)return;h.replaceChildren();
    for(const file of [...(files||[])].filter(f=>/\.pdf$/i.test(f.name))){
      const row=document.createElement('div');row.className='pdf-canonical-row';
      const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='匯出 canonical JSON · '+file.name;b.dataset.file=file.name;
      const status=document.createElement('span');status.className='pdf-canonical-status';status.setAttribute('data-status','idle');
      const pre=document.createElement('pre');pre.className='pdf-canonical-report';pre.hidden=true;
      b.onclick=async()=>{
        b.disabled=true;status.dataset.status='running';status.textContent=' 轉換中…';
        try{
          const {report,canonical}=await convert(file);
          pre.textContent=JSON.stringify(report,null,2);pre.hidden=false;
          if(canonical){download(file.name.replace(/\.pdf$/i,'')+'.canonical.json',canonical);status.dataset.status='complete';status.textContent=' 已匯出（'+canonical.objects.length+' 個物件）';}
          else{status.dataset.status='rejected';status.textContent=' 不支援，未輸出 canonical：'+[...new Set(report.reasons.map(r=>r.code))].join('、');}
        }catch(e){status.dataset.status='error';status.textContent=' 錯誤：'+e.message;}
        finally{b.disabled=false;}
      };
      row.append(b,status,pre);h.append(row);
    }
  }
  // Delegated: other UI scripts rebuild the analysis panel and replace the input.
  function install(){
    if(document.__lwbCanonicalExport)return true;
    document.addEventListener('change',e=>{if(e.target&&e.target.id==='analysisFiles')render(e.target.files);},true);
    document.__lwbCanonicalExport=true;
    const input=document.getElementById('analysisFiles');if(input?.files?.length)render(input.files);
    return true;
  }
  install();
  window.LabelWorkbenchPdfCanonicalExport={BUILD,extract,convert,render,install};
})();
