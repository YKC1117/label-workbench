/* Label Workbench label interpreter v1.6
 * Customer file -> production-ready facts.
 * Recognition is internal. UI shows fields, decoded barcodes, confidence and next actions.
 * Evidence priority: decoded barcode > repeated recognition > single recognition. Never invent missing values.
 */
(function(){
  'use strict';

  const BUILD='20260910-v160';
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

  const FIELD_DEFS=[
    {code:'1P',name:'PART NO',aliases:['PART NO','PART NUMBER','P/N','PN']},
    {code:'1T',name:'LOT NO',aliases:['LOT NO','LOT NUMBER','LOT']},
    {code:'30P',name:'SHAPE',aliases:['SHAPE']},
    {code:'31P',name:'GP',aliases:['GP']},
    {code:'Q',name:'QTY',aliases:['QTY','QUANTITY']},
    {code:'10D',name:'DATE NO',aliases:['DATE NO','DATE NUMBER']},
    {code:'21L',name:'ASSY',aliases:['ASSY','ASSEMBLY']},
    {code:'16D',name:'DATE',aliases:['DATE']},
    {code:'31T',name:'MLOT NO',aliases:['MLOT NO','MLOT']},
    {code:'33P',name:'BIN',aliases:['BIN']},
    {code:'23L',name:'MC',aliases:['MC']},
    {code:'24L',name:'VC',aliases:['VC']},
    {code:'1Y',name:'P1',aliases:['P1']},
    {code:'2Y',name:'P2',aliases:['P2']},
    {code:'4Y',name:'4Y',aliases:['4Y']},
    {code:'',name:'SERIAL',aliases:['SERIAL NO','SERIAL NUMBER','SERIAL','S/N']},
    {code:'',name:'MODEL',aliases:['MODEL NO','MODEL NUMBER','MODEL']}
  ];
  const CODE_MAP=Object.fromEntries(FIELD_DEFS.filter(x=>x.code).map(x=>[x.code,x.name]));
  const KNOWN_CODES=FIELD_DEFS.filter(x=>x.code).map(x=>x.code).sort((a,b)=>b.length-a.length);

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
    const worker=await T.createWorker(['eng','chi_tra'],1,{workerPath:TESS_WORKER,logger:m=>{
      if(m?.status==='recognizing text'&&Number.isFinite(m.progress))onProgress?.(`正在讀取文字… ${Math.round(m.progress*100)}%`);
    }});
    try{await worker.setParameters({preserve_interword_spaces:'1'})}catch{}
    return worker;
  }

  async function renderPage(page){
    const base=page.getViewport({scale:1});
    const scale=Math.max(2.6,Math.min(4.2,4300/Math.max(base.width,base.height)));
    const vp=page.getViewport({scale});
    const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:x,viewport:vp}).promise;return c;
  }

  function rotateCanvas(src,deg){
    const d=((deg%360)+360)%360;if(!d)return src;const swap=d===90||d===270,c=document.createElement('canvas');c.width=swap?src.height:src.width;c.height=swap?src.width:src.height;
    const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.translate(c.width/2,c.height/2);x.rotate(d*Math.PI/180);x.drawImage(src,-src.width/2,-src.height/2);return c;
  }

  function crop(src,x,y,w,h){
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));const z=c.getContext('2d',{willReadFrequently:true});z.fillStyle='#fff';z.fillRect(0,0,c.width,c.height);z.drawImage(src,x,y,w,h,0,0,c.width,c.height);return c;
  }

  async function imageCanvas(file){
    const img=await new Promise((resolve,reject)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);resolve(i)};i.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('圖片無法開啟'))};i.src=u});
    const max=Math.max(img.naturalWidth||1,img.naturalHeight||1),scale=Math.max(1,Math.min(3,4200/max));const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);return c;
  }

  function grayAt(d,i){return(d[i]*77+d[i+1]*150+d[i+2]*29)>>8}

  function contentBounds(canvas,threshold=242){
    const x=canvas.getContext('2d',{willReadFrequently:true}),im=x.getImageData(0,0,canvas.width,canvas.height),d=im.data,sx=Math.max(1,Math.ceil(canvas.width/1800)),sy=Math.max(1,Math.ceil(canvas.height/1800));let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y+=sy)for(let xx=0;xx<canvas.width;xx+=sx){const i=(y*canvas.width+xx)*4;if(grayAt(d,i)<threshold){if(xx<minX)minX=xx;if(xx>maxX)maxX=xx;if(y<minY)minY=y;if(y>maxY)maxY=y}}
    if(maxX<0)return{x:0,y:0,w:canvas.width,h:canvas.height};const px=Math.round(canvas.width*.018),py=Math.round(canvas.height*.018);minX=Math.max(0,minX-px);minY=Math.max(0,minY-py);maxX=Math.min(canvas.width-1,maxX+px);maxY=Math.min(canvas.height-1,maxY+py);return{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
  }

  function trimCanvas(canvas){const b=contentBounds(canvas);return crop(canvas,b.x,b.y,b.w,b.h)}

  function enhanceCanvas(src,mode='gray'){
    const trimmed=trimCanvas(src),target=Math.min(3600,Math.max(trimmed.width,2200)),scale=Math.max(1,Math.min(2.2,target/Math.max(1,trimmed.width)));const c=document.createElement('canvas');c.width=Math.round(trimmed.width*scale);c.height=Math.round(trimmed.height*scale);const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.drawImage(trimmed,0,0,c.width,c.height);
    const im=x.getImageData(0,0,c.width,c.height),d=im.data;let lo=255,hi=0;for(let i=0;i<d.length;i+=16){const g=grayAt(d,i);if(g<lo)lo=g;if(g>hi)hi=g}if(hi-lo<40){lo=0;hi=255}
    for(let i=0;i<d.length;i+=4){let g=grayAt(d,i);g=Math.max(0,Math.min(255,(g-lo)*255/Math.max(1,hi-lo)));if(mode==='bw')g=g<190?0:255;else g=Math.max(0,Math.min(255,(g-128)*1.28+128));d[i]=d[i+1]=d[i+2]=g;d[i+3]=255}x.putImageData(im,0,0);return c;
  }

  function scoreText(text){const t=String(text||'').toUpperCase(),words=['PART NO','PART NUMBER','LOT NO','QTY','QUANTITY','DATE','ASSY','SHAPE','MLOT','BIN','MC','VC','P1','P2','GP','SERIAL','S/N','MODEL'];let s=Math.min(70,t.replace(/\s/g,'').length/4);words.forEach(w=>{if(t.includes(w))s+=24});s+=(t.match(/\([0-9A-Z]{1,5}\)/g)||[]).length*7;s+=Math.min(36,(t.match(/[:：]/g)||[]).length*4);return s}

  async function recognize(worker,canvas,psm='6'){try{await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1'})}catch{}const r=await worker.recognize(canvas);return{text:String(r?.data?.text||'').trim(),confidence:Number(r?.data?.confidence||0)}}

  async function chooseOrientation(worker,canvas,onProgress){
    const preview=enhanceCanvas(canvas,'gray'),order=[0,90,270,180],tested=[];for(let i=0;i<order.length;i++){const deg=order[i];onProgress?.(`正在判斷原稿方向… ${i+1}/${order.length}`);const r=await recognize(worker,rotateCanvas(preview,deg),'6'),score=scoreText(r.text)+(r.confidence||0)*.25;tested.push({deg,score});if(score>=220&&r.text.length>=90)break}tested.sort((a,b)=>b.score-a.score);const best=tested[0]||{deg:0};return{deg:best.deg,canvas:rotateCanvas(canvas,best.deg)};
  }

  function runs(flags){const out=[];let start=null;for(let i=0;i<flags.length;i++){if(flags[i]&&start===null)start=i;if(!flags[i]&&start!==null){out.push([start,i-1]);start=null}}if(start!==null)out.push([start,flags.length-1]);return out}
  function mergeRuns(list,maxGap){const out=[];for(const r of list){if(!out.length||r[0]-out[out.length-1][1]>maxGap)out.push([...r]);else out[out.length-1][1]=r[1]}return out}

  function detectLabelBands(canvas){
    const x=canvas.getContext('2d',{willReadFrequently:true}),im=x.getImageData(0,0,canvas.width,canvas.height),d=im.data,step=Math.max(1,Math.ceil(canvas.width/1500)),counts=new Uint32Array(canvas.height),sampled=Math.ceil(canvas.width/step);
    for(let y=0;y<canvas.height;y++){let n=0;for(let xx=0;xx<canvas.width;xx+=step){const i=(y*canvas.width+xx)*4;if(grayAt(d,i)<225)n++}counts[y]=n}
    const threshold=Math.max(5,Math.round(sampled*.005));let rs=mergeRuns(runs([...counts].map(n=>n>threshold)),Math.max(12,Math.round(canvas.height*.022)));rs=rs.filter(r=>r[1]-r[0]>=Math.max(50,canvas.height*.045));if(rs.length<2||rs.length>8)rs=[[0,canvas.height-1]];
    return rs.map(([a,b])=>{const py=Math.round(canvas.height*.015),y=Math.max(0,a-py),y2=Math.min(canvas.height,b+py),rough=crop(canvas,0,y,canvas.width,y2-y),cb=contentBounds(rough,238);return{x:cb.x,y:y+cb.y,w:cb.w,h:cb.h}});
  }

  function cleanLine(v){return String(v||'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[|¦]+/g,' ').replace(/\s+/g,' ').trim()}
  function cleanValue(v){let s=cleanLine(v).replace(/^[\s:：=._-]+/,'').replace(/[\s|¦]+$/,'');s=s.replace(/\s+(?:ROHS|COMPLIANT|HF|PB)\b.*$/i,'').trim();return s.slice(0,120)}
  function aliasPattern(alias){return alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*')}

  function parseCodeChunks(line){
    const codeAlt=KNOWN_CODES.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),rx=new RegExp(`[\\(\\[]?\\s*(${codeAlt})\\s*[\\)\\]]?`,'ig'),ms=[...line.matchAll(rx)];if(!ms.length)return[];const out=[];
    for(let i=0;i<ms.length;i++){
      const m=ms[i],code=m[1].toUpperCase(),end=i+1<ms.length?ms[i+1].index:line.length,chunk=cleanLine(line.slice((m.index||0)+m[0].length,end)),def=FIELD_DEFS.find(d=>d.code===code),name=def?.name||code;let rest=chunk;
      for(const a of (def?.aliases||[]).sort((a,b)=>b.length-a.length))rest=rest.replace(new RegExp('^\\s*'+aliasPattern(a)+'\\s*[:：=]?\\s*','i'),'');
      rest=rest.replace(/^\s*[^:：]{0,28}[:：]\s*/,'');const value=cleanValue(rest);if(value&&/[A-Z0-9+\-]/i.test(value))out.push({code,name,value});
    }
    return out;
  }

  function parseKnownNames(line){
    const hits=[];
    for(const def of FIELD_DEFS){for(const alias of def.aliases){const short=alias.replace(/[^A-Z0-9]/gi,'').length<=3,suffix=short?'\\s*[:：=]':'\\s*[:：=]?';const rx=new RegExp(aliasPattern(alias)+suffix,'ig');let m;while((m=rx.exec(line)))hits.push({start:m.index,end:rx.lastIndex,def,alias})}}
    hits.sort((a,b)=>a.start-b.start||b.end-a.end);const anchors=[];for(const h of hits){if(anchors.some(x=>h.start>=x.start&&h.end<=x.end))continue;anchors.push(h)}
    const out=[];for(let i=0;i<anchors.length;i++){const a=anchors[i],next=anchors[i+1],value=cleanValue(line.slice(a.end,next?next.start:line.length));if(value&&/[A-Z0-9+\-]/i.test(value))out.push({code:'',name:a.def.name,value})}return out;
  }

  function parseFields(text){
    const out=[];for(const raw of String(text||'').split(/\r?\n/)){const line=cleanLine(raw);if(!line)continue;const coded=parseCodeChunks(line);if(coded.length){out.push(...coded);continue}const known=parseKnownNames(line);if(known.length){out.push(...known);continue}const m=line.match(/^([A-Z][A-Z0-9 ._/#\-]{1,38}?)\s*[:：=]\s*(.{1,120})$/i);if(m){const name=cleanLine(m[1]),value=cleanValue(m[2]);if(value&&/[A-Z0-9]/i.test(value))out.push({code:'',name,value})}}
    const seen=new Set();return out.filter(f=>{const k=`${norm(f.code)}|${norm(f.name)}|${norm(f.value)}`;if(!norm(f.value)||seen.has(k))return false;seen.add(k);return true});
  }

  function fieldKey(f){return norm(f.code)||norm(f.name)}
  function aggregateFields(passes){
    const buckets=new Map();for(const pass of passes){for(const f of parseFields(pass.text)){const key=fieldKey(f);if(!key)continue;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({...f,passConfidence:pass.confidence||0})}}
    const out=[];for(const rows of buckets.values()){const variants=new Map();for(const r of rows){const k=norm(r.value);if(!k)continue;if(!variants.has(k))variants.set(k,{count:0,confidence:0,rows:[]});const v=variants.get(k);v.count++;v.confidence+=r.passConfidence||0;v.rows.push(r)}const ranked=[...variants.entries()].sort((a,b)=>b[1].count-a[1].count||b[1].confidence-a[1].confidence);if(!ranked.length)continue;const bestMeta=ranked[0][1],base=bestMeta.rows.sort((a,b)=>(b.passConfidence||0)-(a.passConfidence||0))[0];out.push({code:base.code,name:base.name,value:base.value,repeat:bestMeta.count,conflict:ranked.length>1,alternatives:ranked.slice(1,3).map(x=>x[1].rows[0].value)})}return out;
  }

  function dedupeBarcodes(rows){const s=new Set(),out=[];for(const r of rows||[]){const k=`${r.format||''}|${r.text||''}`;if(!r.text||s.has(k))continue;s.add(k);out.push(r)}return out}

  async function scanRegionDeep(canvas,labelNo,onProgress){
    const core=window.LabelWorkbenchBarcodeCore;if(!core?.scanCanvas)return[];const c=trimCanvas(canvas),candidates=[{c,name:`標籤 ${labelNo} 全圖`}],h=c.height*.30;for(let i=0;i<6;i++){const y=Math.min(c.height-h,i*c.height*.14);candidates.push({c:crop(c,0,y,c.width,h),name:`標籤 ${labelNo} 區域 ${i+1}`})}
    const all=[];for(let i=0;i<candidates.length;i++){onProgress?.(`正在讀取標籤 ${labelNo} 的條碼… ${i+1}/${candidates.length}`);try{all.push(...await core.scanCanvas(candidates[i].c,candidates[i].name))}catch(e){console.warn('[LW interpreter barcode]',e)}}return dedupeBarcodes(all);
  }

  function fieldVerified(field,barcodes){const v=norm(field.value);if(v.length<2)return null;return barcodes.find(b=>{const t=norm(b.text);return t===v||t.includes(v)||(v.includes(t)&&t.length>=4)})||null}
  function fieldState(field,barcodes){if(fieldVerified(field,barcodes))return'barcode';if(field.repeat>=2&&!field.conflict)return'repeated';return'pending'}
  function detectMarks(text){const t=String(text||'').toUpperCase(),out=[];if(/ROHS/.test(t))out.push('RoHS');if(/\bHF\b/.test(t))out.push('HF');if(/\bPB\b/.test(t))out.push('Pb 標誌');return out}

  function makeTiles(canvas){const c=enhanceCanvas(canvas,'gray'),out=[],overlap=.08;for(let ry=0;ry<2;ry++)for(let rx=0;rx<2;rx++){const x0=Math.max(0,(rx*.5-overlap)*c.width),y0=Math.max(0,(ry*.5-overlap)*c.height),x1=Math.min(c.width,((rx+1)*.5+overlap)*c.width),y1=Math.min(c.height,((ry+1)*.5+overlap)*c.height);out.push(crop(c,x0,y0,x1-x0,y1-y0))}return out}

  async function readRegionFields(worker,region,onProgress){
    const passes=[];onProgress?.('正在整理欄位內容…');passes.push(await recognize(worker,enhanceCanvas(region,'gray'),'6'));passes.push(await recognize(worker,enhanceCanvas(region,'bw'),'6'));let fields=aggregateFields(passes);
    if(fields.length<6||fields.some(f=>f.conflict)){const tiles=makeTiles(region);for(let i=0;i<tiles.length;i++){onProgress?.(`正在補讀細小欄位… ${i+1}/${tiles.length}`);passes.push(await recognize(worker,tiles[i],'6'))}fields=aggregateFields(passes)}return{fields,passes};
  }

  async function processCanvas(canvas,sourceName,pageNo,worker,labels,onProgress){
    const best=await chooseOrientation(worker,canvas,onProgress),bands=detectLabelBands(best.canvas);onProgress?.(`找到 ${bands.length} 個標籤區域，正在逐張讀取…`);
    for(let i=0;i<bands.length;i++){const b=bands[i],region=crop(best.canvas,b.x,b.y,b.w,b.h),read=await readRegionFields(worker,region,onProgress),barcodes=await scanRegionDeep(region,labels.length+1,onProgress),allText=read.passes.map(p=>p.text).join('\n'),marks=detectMarks(allText);labels.push({sourceName,page:pageNo,index:i+1,rotation:best.deg,fields:read.fields,barcodes,marks})}
  }

  async function interpretPdf(file,onProgress,sharedWorker){const pdfjs=await loadPdf(),pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,pageLimit=Math.min(pdf.numPages,3),labels=[],own=!sharedWorker,worker=sharedWorker||await createWorker(onProgress);try{for(let p=1;p<=pageLimit;p++){onProgress?.(`正在讀取 ${file.name} 第 ${p}/${pageLimit} 頁…`);const page=await pdf.getPage(p),canvas=await renderPage(page);await processCanvas(canvas,file.name,p,worker,labels,onProgress)}}finally{if(own)try{await worker.terminate()}catch{}}return{pdfPages:pdf.numPages,labels}}
  async function interpretImage(file,onProgress,sharedWorker){const own=!sharedWorker,worker=sharedWorker||await createWorker(onProgress),labels=[];try{onProgress?.(`正在讀取圖片 ${file.name}…`);await processCanvas(await imageCanvas(file),file.name,1,worker,labels,onProgress)}finally{if(own)try{await worker.terminate()}catch{}}return{imageCount:1,labels}}
  async function interpretFiles(files,onProgress){const arr=[...files].filter(f=>ext(f)==='pdf'||isImage(f)).slice(0,4),labels=[];if(!arr.length)return{files:0,pages:0,labels:[]};const worker=await createWorker(onProgress);let pages=0;try{for(let i=0;i<arr.length;i++){const f=arr[i];onProgress?.(`正在分析 ${i+1}/${arr.length}：${f.name}`);if(ext(f)==='pdf'){const r=await interpretPdf(f,onProgress,worker);pages+=r.pdfPages;labels.push(...r.labels)}else{const r=await interpretImage(f,onProgress,worker);pages+=1;labels.push(...r.labels)}}}finally{try{await worker.terminate()}catch{}}return{files:arr.length,pages,labels}}

  function fieldName(f){return`${f.code?`(${f.code}) `:''}${f.name||'未命名欄位'}`}
  function fieldTableHtml(fields,barcodes){if(!fields.length)return'<div class="note warn-note">目前沒有可靠拆出欄位。請先看條碼內容；若條碼也讀不到，這份原稿需要更清楚的檔案或人工確認。</div>';return`<div class="table-scroll"><table class="analysis-table"><tr><th>欄位</th><th>內容</th><th>可信度</th></tr>${fields.map(f=>{const state=fieldState(f,barcodes),status=state==='barcode'?'✅ 條碼已確認':state==='repeated'?'✓ 重複辨識一致':'⚠️ 請核對原稿',alt=f.conflict&&f.alternatives?.length?`<br><small>另讀到：${esc(f.alternatives.join(' / '))}</small>`:'';return`<tr><td>${esc(fieldName(f))}</td><td><b>${esc(f.value)}</b>${alt}</td><td>${status}</td></tr>`}).join('')}</table></div>`}
  function barcodeRowsHtml(rows){if(!rows.length)return'<div class="footer-note">目前沒有成功解出條碼內容；不代表原稿沒有條碼。</div>';const core=window.LabelWorkbenchBarcodeCore;return`<div class="table-scroll"><table class="analysis-table"><tr><th>條碼類型</th><th>實際掃描內容</th></tr>${rows.map(r=>`<tr><td>${esc(r.format||'未知')}</td><td><b>${esc(core?.visibleText?core.visibleText(r.text):r.text)}</b></td></tr>`).join('')}</table></div>`}

  function totals(result){const labels=result.labels||[];let fields=0,barcodes=0,confirmed=0,pending=0;for(const l of labels){fields+=(l.fields||[]).length;barcodes+=(l.barcodes||[]).length;for(const f of l.fields||[]){if(fieldState(f,l.barcodes||[])==='pending')pending++;else confirmed++}}return{fields,barcodes,confirmed,pending}}
  function productionText(result){const lines=['【客戶原稿分析結果】'];(result.labels||[]).forEach((l,i)=>{lines.push(`\n標籤 ${i+1}${l.sourceName?`｜${l.sourceName}`:''}`);(l.fields||[]).forEach(f=>{const s=fieldState(f,l.barcodes||[]);lines.push(`${fieldName(f)}：${f.value}${s==='barcode'?'（條碼已確認）':s==='repeated'?'（文字重複辨識一致）':'（待核對）'}`)});(l.barcodes||[]).forEach((b,j)=>lines.push(`條碼 ${j+1}［${b.format||'未知'}］：${b.text}`));if(l.marks?.length)lines.push(`圖示／標記：${l.marks.join('、')}`)});return lines.join('\n')}
  function questionsText(result){const q=[];(result.labels||[]).forEach((l,i)=>(l.fields||[]).forEach(f=>{if(fieldState(f,l.barcodes||[])==='pending')q.push(`標籤 ${i+1}「${fieldName(f)}」是否為 ${f.value}`)}));q.push('標籤實際尺寸（寬 × 高 mm）');q.push('字型、LOGO／圖示、線條位置是否需要完全依原稿');return`您好～原稿已收到，製作前再麻煩確認：\n${q.slice(0,14).map((x,i)=>`${i+1}. ${x}`).join('\n')}`}
  async function copyText(text,msg){try{await navigator.clipboard.writeText(text);if(typeof window.toast==='function')window.toast(msg)}catch{if(typeof window.toast==='function')window.toast('複製失敗')}}

  function renderInterpretation(files,result){
    const labels=result.labels||[],t=totals(result),names=[...files].map(f=>f.name).join('、'),state=t.fields||t.barcodes?(t.pending?'已讀出內容，部分待確認':'主要內容已讀出'):'需要補資料';let html=`<div class="analysis-block"><div class="section-title"><div><h3>分析完成</h3><p class="muted compact">${esc(names)}</p></div><span class="pill">${state}</span></div><div class="file-chips"><span class="file-chip">標籤 ${labels.length} 張</span><span class="file-chip">欄位 ${t.fields} 個</span><span class="file-chip">條碼 ${t.barcodes} 個</span><span class="file-chip">可信 ${t.confirmed} 個</span>${t.pending?`<span class="file-chip">待確認 ${t.pending} 個</span>`:''}</div><div class="generator-actions"><button id="analysisCopyProduction" class="btn primary" type="button">複製製作資料</button><button id="analysisCopyQuestions" class="btn ghost" type="button">複製給客戶確認</button></div>`;
    if(!labels.length)return html+'<div class="note warn-note">沒有成功讀出可製作內容。請確認檔案是否正確，或改用更清楚的原稿。</div></div>';
    labels.forEach((l,idx)=>{const pending=(l.fields||[]).filter(f=>fieldState(f,l.barcodes||[])==='pending').length,good=(l.fields||[]).length-pending;html+=`<div class="analysis-block"><div class="section-title"><h3>標籤 ${idx+1}</h3><div><span class="file-chip">${esc(l.sourceName||'原稿')}</span>${l.page>1?` <span class="file-chip">第 ${l.page} 頁</span>`:''}</div></div><div class="footer-note"><b>可直接整理：</b>${good} 個欄位${pending?`；另有 ${pending} 個需要核對。`:'，目前沒有文字衝突。'}</div><h4>欄位內容</h4>${fieldTableHtml(l.fields||[],l.barcodes||[])}<h4>條碼內容</h4>${barcodeRowsHtml(l.barcodes||[])}${l.marks?.length?`<div class="footer-note"><b>圖示／標記：</b>${l.marks.map(esc).join('、')}</div>`:''}</div>`});
    html+=`<div class="note ${t.pending?'warn-note':''}"><b>下一步：</b>${t.pending?'先核對標成「請核對原稿」的欄位；其他一致資料可先拿去整理製作。':'主要文字內容已重複辨識一致或由條碼確認，可先進入製作整理。'} 標籤尺寸、字型、LOGO／圖示與線條位置若客戶沒有提供規格，仍需確認。</div></div>`;return html;
  }

  function wireResultButtons(){const a=el('analysisCopyProduction'),b=el('analysisCopyQuestions');if(a)a.onclick=()=>copyText(productionText(lastResult),'已複製製作資料');if(b)b.onclick=()=>copyText(questionsText(lastResult),'已複製客戶確認內容')}
  async function analyze(files){const arr=[...files],out=el('analysisResult');if(!out)return;const eligible=arr.filter(f=>ext(f)==='pdf'||isImage(f));if(!eligible.length||eligible.length!==arr.length){const base=window.LabelWorkbenchParsers;if(base?.analyze)return base.analyze(arr);throw new Error('文件解析器尚未載入')}lastFiles=eligible;const progress=msg=>{out.innerHTML=`<div class="scan-working"><b>正在完整讀取客戶原稿</b><br>${esc(msg)}<br><small>系統會自動分標籤、補讀小字並交叉比對條碼。</small></div>`};progress('準備分析…');lastResult=await interpretFiles(eligible,progress);out.innerHTML=renderInterpretation(eligible,lastResult);wireResultButtons();return lastResult}

  window.LabelWorkbenchInterpreter={BUILD,scoreText,parseFields,aggregateFields,detectLabelBands,rotateCanvas,interpretPdf,interpretImage,interpretFiles,productionText,questionsText,analyze};
})();
