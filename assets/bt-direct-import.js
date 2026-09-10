/* Label Workbench direct import for BarTender UltraLite v1.0
 * PDF/image analysis -> high-resolution PNG picture objects that BarTender can import directly.
 * Customer source files stay in the current browser; only CDN libraries are requested.
 */
(function(){
  'use strict';

  const BUILD='20260910-btdi100';
  const PDF_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
  const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let pdfPromise=null,zipPromise=null;

  const ext=file=>(file?.name?.split('.').pop()||'').toLowerCase();
  const isImage=file=>!!(file?.type?.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp)$/i.test(file?.name||''));
  const isPdf=file=>file?.type==='application/pdf'||/\.pdf$/i.test(file?.name||'');
  const isMediaFile=file=>isPdf(file)||isImage(file);
  const safeFile=value=>String(value||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const fileBase=file=>safeFile(String(file?.name||'Label').replace(/\.[^.]+$/,''));
  const imageFileName=index=>`BT_Import_Label_${String(index+1).padStart(2,'0')}.png`;

  function groupResultLabels(result={}){
    const groups=new Map();
    for(const label of (result.labels||[])){
      const sourceName=String(label?.sourceName||''),page=Math.max(1,Number(label?.page||1)),key=`${sourceName}\u0000${page}`;
      if(!groups.has(key))groups.set(key,{sourceName,page,labels:[]});
      groups.get(key).labels.push(label);
    }
    return[...groups.values()].map(group=>({...group,labels:group.labels.sort((a,b)=>Number(a?.index||0)-Number(b?.index||0))}));
  }

  function instructionText(count=1){
    return[
      '【Label Workbench｜BarTender UltraLite 直接匯入】','',
      `本包共有 ${count} 張可直接匯入的 Label 圖片。`,'',
      '最快使用方式：',
      '1. 在 BarTender 建立或開啟標籤。',
      '2. 使用「圖片 / Picture → 從檔案 / Insert from File」。',
      '3. 選擇 BT_Import_Label_01.png。',
      '4. 把圖片放到標籤左上角，依實際 Label 尺寸調整大小。',
      '5. 實際測印，並用掃碼槍確認條碼。','',
      '也可以直接從 Windows 檔案總管把 PNG 拖進 BarTender 標籤畫面。','',
      '注意：PNG 匯入後在 BarTender 會是一個圖片物件，不會自動拆成可分別編輯的文字與條碼物件。',
      '若客戶內容需要修改，請回 Label Workbench 重新產生，或在 BarTender 另外建立可編輯物件。'
    ].join('\r\n');
  }

  async function loadPdf(){
    if(globalThis.__LABEL_PDFJS)return globalThis.__LABEL_PDFJS;
    if(!pdfPromise)pdfPromise=import(PDF_SRC).then(mod=>{mod.GlobalWorkerOptions.workerSrc=PDF_WORKER;globalThis.__LABEL_PDFJS=mod;return mod});
    return pdfPromise;
  }
  function loadZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;
    zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)});
    return zipPromise;
  }

  function blankCanvas(width,height){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(width));c.height=Math.max(1,Math.round(height));const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);return c}
  function cropCanvas(src,rect){
    const x=Math.max(0,Math.floor(rect?.x||0)),y=Math.max(0,Math.floor(rect?.y||0)),w=Math.max(1,Math.min(src.width-x,Math.ceil(rect?.w||src.width))),h=Math.max(1,Math.min(src.height-y,Math.ceil(rect?.h||src.height))),c=blankCanvas(w,h);
    c.getContext('2d',{willReadFrequently:true}).drawImage(src,x,y,w,h,0,0,w,h);return c;
  }
  function limitCanvas(src,maxSide=4400){
    const longest=Math.max(src.width,src.height);if(longest<=maxSide)return src;const scale=maxSide/longest,c=blankCanvas(src.width*scale,src.height*scale),x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(src,0,0,c.width,c.height);return c;
  }
  async function imageCanvas(file){
    const image=await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片無法開啟'))};img.src=url});
    const naturalW=image.naturalWidth||image.width||1,naturalH=image.naturalHeight||image.height||1,scale=Math.min(1,4600/Math.max(naturalW,naturalH)),c=blankCanvas(naturalW*scale,naturalH*scale);c.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0,c.width,c.height);return c;
  }
  async function renderPdfPage(file,pageNo){
    const PDF=await loadPdf(),data=await file.arrayBuffer(),doc=await PDF.getDocument({data}).promise;
    try{
      const page=await doc.getPage(Math.min(Math.max(1,pageNo),doc.numPages)),base=page.getViewport({scale:1}),scale=Math.max(2.8,Math.min(5,4600/Math.max(base.width,base.height))),vp=page.getViewport({scale}),c=blankCanvas(vp.width,vp.height);
      await page.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;return c;
    }finally{try{await doc.destroy()}catch{}}
  }
  function canvasBlob(canvas){
    return new Promise((resolve,reject)=>{
      if(typeof canvas.toBlob==='function'){canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 建立失敗')),'image/png');return}
      try{
        const url=canvas.toDataURL('image/png'),base64=url.split(',')[1]||'',bin=atob(base64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);resolve(new Blob([bytes],{type:'image/png'}));
      }catch(err){reject(err)}
    });
  }

  async function buildImportImages(files,result,onProgress){
    const interpreter=window.LabelWorkbenchInterpreter;
    if(!interpreter?.rotateCanvas||!interpreter?.detectLabelBands)throw new Error('快速分析版面元件尚未載入');
    const media=[...(files||[])].filter(isMediaFile),byName=new Map(media.map(file=>[file.name,file])),groups=groupResultLabels(result).filter(group=>byName.has(group.sourceName)),outputs=[];
    if(!groups.length)throw new Error('目前分析結果沒有可直接輸出的 PDF／圖片來源');
    let done=0,total=groups.reduce((n,g)=>n+g.labels.length,0);
    for(const group of groups){
      const file=byName.get(group.sourceName),source=isPdf(file)?await renderPdfPage(file,group.page):await imageCanvas(file),rotation=Number(group.labels[0]?.rotation||0),oriented=interpreter.rotateCanvas(source,rotation),bands=interpreter.detectLabelBands(oriented);
      for(const label of group.labels){
        done++;onProgress?.(`正在建立 BT 匯入圖 ${done}/${total}`);
        const index=Math.max(0,Number(label?.index||1)-1),rect=bands[index]||bands[0]||{x:0,y:0,w:oriented.width,h:oriented.height},canvas=limitCanvas(cropCanvas(oriented,rect)),blob=await canvasBlob(canvas);
        outputs.push({name:imageFileName(outputs.length),blob,width:canvas.width,height:canvas.height,sourceName:group.sourceName,page:group.page,labelIndex:Number(label?.index||index+1)});
      }
    }
    return outputs;
  }

  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
  function indexCsv(images){return['FILE,SOURCE,PAGE,LABEL_INDEX,PIXEL_WIDTH,PIXEL_HEIGHT',...images.map(i=>[i.name,i.sourceName,i.page,i.labelIndex,i.width,i.height].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','))].join('\r\n')}

  async function downloadFromAnalysis(files,result,onProgress){
    const images=await buildImportImages(files,result,onProgress);
    if(images.length===1){downloadBlob(images[0].blob,images[0].name);return{ok:true,type:'png',count:1,name:images[0].name}}
    const JSZip=await loadZip(),zip=new JSZip();
    for(const image of images)zip.file(image.name,await image.blob.arrayBuffer());
    zip.file('BT_Import_Index.csv','\uFEFF'+indexCsv(images));zip.file('BT_直接匯入說明.txt','\uFEFF'+instructionText(images.length));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),base=fileBase([...(files||[])].find(isMediaFile));downloadBlob(blob,`BT_可直接匯入_${base}.zip`);
    return{ok:true,type:'zip',count:images.length,name:`BT_可直接匯入_${base}.zip`};
  }

  window.LabelWorkbenchBtDirectImport={BUILD,isMediaFile,fileBase,imageFileName,groupResultLabels,instructionText,buildImportImages,downloadFromAnalysis};
})();