/* Label Workbench BT Quick Production v1.3
 * Robust Quick Analysis -> BarTender-ready CSV/maps/ZIP.
 * The public API is registered before UI initialization so stale local data cannot make the module disappear.
 */
(function(){
  'use strict';

  const BUILD='20260910-bt130';
  const STORAGE_KEY='labelWorkbench.btDraft.v1';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let zipPromise=null,draft=null,initDone=false;

  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const toast=msg=>{if(typeof window.toast==='function')window.toast(msg)};

  const FIELD_NAMES={'1P':'PART_NO','1T':'LOT_NO','30P':'SHAPE','31P':'GP','Q':'QTY','10D':'DATE_NO','21L':'ASSY','16D':'DATE','31T':'MLOT_NO','33P':'BIN','23L':'MC','24L':'VC','1Y':'P1','2Y':'P2','4Y':'FIELD_4Y'};

  function csvCell(value){const s=String(value??'');return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
  function sanitizeFieldName(field,index=1){
    const byCode=FIELD_NAMES[String(field?.code||'').toUpperCase()];if(byCode)return byCode;
    let s=String(field?.name||`FIELD_${index}`).toUpperCase().trim().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').replace(/_+/g,'_');
    if(!s)s=`FIELD_${index}`;if(/^\d/.test(s))s=`FIELD_${s}`;return s.slice(0,40)
  }
  function uniqueNames(names){const used=new Map();return names.map(name=>{const base=name||'FIELD',n=(used.get(base)||0)+1;used.set(base,n);return n===1?base:`${base}_${n}`})}
  function fieldState(field,barcodes=[]){
    const value=norm(field?.value),hit=value.length>1&&barcodes.some(b=>{const t=norm(b?.text);return t===value||t.includes(value)||(value.includes(t)&&t.length>=4)});
    if(hit)return'barcode';if(Number(field?.repeat)>=2&&!field?.conflict)return'high';if(field?.spatial&&!field?.conflict)return'medium';return'pending'
  }
  function makeColumns(labels=[]){
    const defs=[],seen=new Set();
    labels.forEach(label=>(label.fields||[]).forEach((f,index)=>{
      const key=norm(f.code)||norm(f.name)||`FIELD${index+1}`;if(seen.has(key))return;seen.add(key);
      defs.push({key,code:f.code||'',name:f.name||'',btName:sanitizeFieldName(f,defs.length+1),kind:'text'})
    }));
    const names=uniqueNames(defs.map(d=>d.btName));defs.forEach((d,i)=>d.btName=names[i]);return defs
  }
  function labelValue(label,column){const hit=(label?.fields||[]).find(f=>(norm(f.code)||norm(f.name))===column.key);return hit?.value??''}
  function inferFieldUsage(labels=[],columns=[]){return columns.map(col=>{const values=labels.map(l=>labelValue(l,col)).filter(v=>String(v)!==''),distinct=[...new Set(values.map(String))];return{...col,usage:labels.length>1&&distinct.length>1?'本批有變動':'本批固定',examples:distinct.slice(0,3)}})}
  function barcodeFormatFamily(format=''){return /QR|DATA.?MATRIX|AZTEC|PDF417/.test(String(format).toUpperCase())?'2D':'1D'}
  function mapBarcodes(labels=[],columns=[]){
    const rows=[];
    labels.forEach((label,labelIndex)=>(label.barcodes||[]).forEach((b,index)=>{
      const text=String(b.text??''),n=norm(text),matched=columns.find(col=>{const v=norm(labelValue(label,col));return v&&n&&(n===v||n.includes(v)||(v.includes(n)&&n.length>=4))});
      rows.push({label:labelIndex+1,objectName:`BARCODE_${String(index+1).padStart(2,'0')}`,format:b.format||'未知',family:barcodeFormatFamily(b.format),text,sourceField:matched?.btName||'',sourceType:matched?'欄位連結':'固定/組合內容'})
    }));
    return rows
  }
  function recommendTemplate(labels=[],barcodeRows=[],usage=[]){
    const has1=barcodeRows.some(r=>r.family==='1D'),has2=barcodeRows.some(r=>r.family==='2D'),variable=usage.some(r=>r.usage==='本批有變動');
    const base=has1&&has2?'混合條碼母版':has2?'二維碼母版':has1?'一維碼母版':'文字母版';
    return variable?`${base}＋CSV 可變資料`:base
  }
  function templateBaseName(d=draft){
    const choice=d?.settings?.template&&d.settings.template!=='自動判斷'?d.settings.template:d?.recommendation||'文字母版';
    if(choice.includes('混合條碼'))return'BT_混合條碼母版.btw';
    if(choice.includes('二維碼'))return'BT_二維碼母版.btw';
    if(choice.includes('一維碼'))return'BT_一維碼母版.btw';
    return'BT_文字母版.btw'
  }

  function normalizeLabel(l={},i=0,sourceFiles=[]){
    return{
      sourceName:l.sourceName||sourceFiles[0]||'',page:Number(l.page||1),index:Number(l.index||i+1),
      fields:Array.isArray(l.fields)?l.fields.map(f=>({code:f?.code||'',name:f?.name||'',value:String(f?.value??''),repeat:Number(f?.repeat||0),spatial:!!f?.spatial,conflict:!!f?.conflict,alternatives:Array.isArray(f?.alternatives)?[...f.alternatives]:[]})):[],
      barcodes:Array.isArray(l.barcodes)?l.barcodes.map(b=>({format:b?.format||'',text:String(b?.text??'')})).filter(b=>b.text):[],
      marks:Array.isArray(l.marks)?[...l.marks]:[]
    }
  }
  function normalizeDraft(value){
    if(!value||!Array.isArray(value.labels))return null;
    const sourceFiles=Array.isArray(value.sourceFiles)?value.sourceFiles.filter(Boolean):[];
    const labels=value.labels.map((l,i)=>normalizeLabel(l,i,sourceFiles));
    const columns=makeColumns(labels),usage=inferFieldUsage(labels,columns),barcodes=mapBarcodes(labels,columns);
    const settings={customer:'',labelName:'',width:'',height:'',dpi:'203',orientation:'自動/依原稿',template:'自動判斷',...(value.settings||{})};
    return{...value,version:3,sourceFiles,labels,columns,usage,barcodes,settings,recommendation:recommendTemplate(labels,barcodes,usage)}
  }
  function buildDraft(result={},sourceFiles=[]){
    return normalizeDraft({version:3,createdAt:new Date().toISOString(),sourceFiles:[...sourceFiles],labels:Array.isArray(result.labels)?result.labels:[],settings:{customer:'',labelName:'',width:'',height:'',dpi:'203',orientation:'自動/依原稿',template:'自動判斷'}})
  }
  function buildDataCsv(d=draft){if(!d)return'';const cols=d.columns||[],header=['LABEL_NO',...cols.map(c=>c.btName)],rows=(d.labels||[]).map((label,i)=>[i+1,...cols.map(c=>labelValue(label,c))]);return[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')}
  function buildFieldMapCsv(d=draft){
    if(!d)return'';const um=new Map((d.usage||[]).map(u=>[u.key,u])),rows=[['BT_FIELD','SOURCE_CODE','SOURCE_NAME','USAGE_IN_THIS_SAMPLE','EXAMPLE','CONFIDENCE_NOTE']];
    (d.columns||[]).forEach(col=>{const u=um.get(col.key),states=[];(d.labels||[]).forEach(l=>{const f=(l.fields||[]).find(x=>(norm(x.code)||norm(x.name))===col.key);if(f)states.push(fieldState(f,l.barcodes||[]))});const note=states.includes('pending')?'含待核對值':states.includes('barcode')?'有條碼交叉確認':states.length&&states.every(x=>x==='high')?'重複辨識一致':'可先整理';rows.push([col.btName,col.code,col.name,u?.usage||'本批固定',(u?.examples||[]).join(' / '),note])});
    return rows.map(r=>r.map(csvCell).join(',')).join('\r\n')
  }
  function buildBarcodeMapCsv(d=draft){if(!d)return'';const rows=[['LABEL_NO','BT_OBJECT','BARCODE_TYPE','DATA_SOURCE','SOURCE_FIELD','EXAMPLE_CONTENT']];(d.barcodes||[]).forEach(r=>rows.push([r.label,r.objectName,r.format,r.sourceType,r.sourceField,r.text]));return rows.map(r=>r.map(csvCell).join(',')).join('\r\n')}
  function unresolved(d=draft){const out=[];(d?.labels||[]).forEach((label,i)=>(label.fields||[]).forEach(f=>{if(fieldState(f,label.barcodes||[])==='pending')out.push(`標籤 ${i+1}｜${f.code?`(${f.code}) `:''}${f.name}：${f.value}`)}));if(!d?.settings?.width||!d?.settings?.height)out.push('Label 實際尺寸（寬 × 高 mm）');return[...new Set(out)]}

  function buildOpenCmd(d=draft){
    const preferred=templateBaseName(d);
    return[
      '@echo off','chcp 65001 >nul','setlocal','cd /d "%~dp0"','',
      'set "DATA=%~dp0BT_Data.csv"',`set "PREFERRED=%~dp0${preferred}"`,'set "TEMPLATE="','set "BTEXE="','',
      'if not exist "%DATA%" (','  echo [錯誤] 找不到 BT_Data.csv','  pause','  exit /b 1',')','',
      'if exist "%PREFERRED%" set "TEMPLATE=%PREFERRED%"','if not defined TEMPLATE for %%F in ("%~dp0*.btw") do if not defined TEMPLATE if exist "%%~fF" set "TEMPLATE=%%~fF"','',
      'if not defined TEMPLATE (','  echo [尚未放入母版]','  echo 請把公司最接近的 BarTender 母版 .btw 複製到這個資料夾。',`  echo 建議母版檔名：${preferred}`,'  pause','  exit /b 2',')','',
      'for /f "delims=" %%I in (\'where bartend.exe 2^>nul\') do if not defined BTEXE set "BTEXE=%%I"',
      'if not defined BTEXE if exist "%ProgramFiles%" for /f "delims=" %%I in (\'where /r "%ProgramFiles%" bartend.exe 2^>nul\') do if not defined BTEXE set "BTEXE=%%I"',
      'if not defined BTEXE if defined ProgramFiles(x86) for /f "delims=" %%I in (\'where /r "%ProgramFiles(x86)%" bartend.exe 2^>nul\') do if not defined BTEXE set "BTEXE=%%I"','',
      'if not defined BTEXE (','  echo [提示] 找不到 bartend.exe，先用 Windows 預設關聯開啟母版。','  start "" "%TEMPLATE%"','  pause','  exit /b 0',')','',
      'start "" "%BTEXE%" /F="%TEMPLATE%" /D="%DATA%" /DbTextHeader=1','',
      'echo 已開啟 BarTender；本助手不會自動列印。','timeout /t 2 >nul','exit /b 0'
    ].join('\r\n')
  }
  function buildReadme(d=draft){
    if(!d)return'';const s=d.settings||{},pending=unresolved(d),src=(d.sourceFiles||[]).join('、')||'未記錄',template=templateBaseName(d);
    return[
      '【Label Workbench｜BT 快速製作包】','',`來源：${src}`,`客戶：${s.customer||'未填'}`,`標籤名稱：${s.labelName||'未填'}`,`尺寸：${s.width&&s.height?`${s.width} × ${s.height} mm`:'待確認'}`,`DPI：${s.dpi||'待確認'}`,`方向：${s.orientation||'依原稿'}`,`建議母版：${s.template==='自動判斷'?d.recommendation:s.template}`,`建議母版檔名：${template}`,'',
      '【最快製作方式｜Windows 公司電腦】','1. 解壓縮 ZIP。',`2. 把最接近的公司母版 .btw 放進同一資料夾；建議命名 ${template}。`,'3. 雙擊 BT_Open.cmd。','4. 確認 CSV 欄位連結，再依客戶原稿微調版面。','5. 實際測印與掃碼驗證。','',
      '【目前分析】',`標籤：${(d.labels||[]).length} 張`,`欄位：${(d.columns||[]).length} 組`,`條碼：${(d.barcodes||[]).length} 個`,`本批有變動欄位：${(d.usage||[]).filter(x=>x.usage==='本批有變動').map(x=>x.btName).join('、')||'未發現'}`,'',
      '【製作前仍需確認】',...(pending.length?pending.map((x,i)=>`${i+1}. ${x}`):['主要資料已整理；仍需以客戶原稿與實機測試為準。']),'',
      '【安全】','BT_Open.cmd 只開啟母版並指定 BT_Data.csv，不包含自動列印參數。','本工具不會偽造 .btw；母版必須由公司現有的 BarTender 文件提供。'
    ].join('\r\n')
  }

  function save(){if(!draft)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(draft))}catch(err){console.warn('[BT Quick] local save skipped',err)}}
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;
      const repaired=normalizeDraft(JSON.parse(raw));
      if(repaired){localStorage.setItem(STORAGE_KEY,JSON.stringify(repaired));return repaired}
    }catch(err){console.warn('[BT Quick] stale draft ignored',err)}
    try{localStorage.removeItem(STORAGE_KEY)}catch{}
    return null
  }

  function setText(id,value){const n=el(id);if(n)n.textContent=value}
  function usageBadge(u){return u==='本批有變動'?'<span class="btq-badge variable">本批有變動</span>':'<span class="btq-badge fixed">本批固定</span>'}
  function renderFields(d){
    if(!(d.columns||[]).length)return'<div class="btq-empty">目前沒有可整理的文字欄位。</div>';
    const um=new Map((d.usage||[]).map(x=>[x.key,x]));
    return`<div class="table-scroll"><table class="analysis-table btq-table"><thead><tr><th>BT 欄位名</th><th>原稿欄位</th><th>判斷</th><th>範例</th></tr></thead><tbody>${d.columns.map(c=>{const u=um.get(c.key);return`<tr><td><code>${esc(c.btName)}</code></td><td>${esc(c.code?`(${c.code}) ${c.name}`:c.name)}</td><td>${usageBadge(u?.usage)}</td><td><strong>${esc((u?.examples||[]).join(' / '))}</strong></td></tr>`}).join('')}</tbody></table></div>`
  }
  function renderBarcodes(d){
    if(!(d.barcodes||[]).length)return'<div class="btq-empty">目前沒有成功解出的條碼；建版時仍需依原稿確認。</div>';
    return`<div class="table-scroll"><table class="analysis-table btq-table"><thead><tr><th>標籤</th><th>類型</th><th>BT 資料來源</th><th>內容</th></tr></thead><tbody>${d.barcodes.map(r=>`<tr><td>${r.label}</td><td>${esc(r.format)}</td><td>${r.sourceField?`連結 <code>${esc(r.sourceField)}</code>`:'固定／組合內容'}</td><td><strong class="mono">${esc(r.text)}</strong></td></tr>`).join('')}</tbody></table></div>`
  }
  function templateOptions(selected='自動判斷'){return['自動判斷','文字母版','一維碼母版','二維碼母版','混合條碼母版','混合條碼母版＋CSV 可變資料'].map(x=>`<option ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}
  function styles(){
    if(el('btQuickStyle'))return;
    const style=document.createElement('style');style.id='btQuickStyle';style.textContent=`
      #bartender.btq-ready{display:none}#bartender.btq-ready.active{display:block}.btq-shell{display:grid;gap:16px}
      .btq-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:22px 24px;border-radius:20px;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff}
      .btq-hero h2{margin:4px 0 7px;font-size:24px}.btq-hero p{margin:0;color:#dbeafe;line-height:1.6;font-size:13px}.btq-kicker{font-size:10px;font-weight:900;letter-spacing:.14em;color:#93c5fd}
      .btq-hero-actions,.btq-export{display:flex;gap:8px;flex-wrap:wrap}.btq-hero .btn.primary{background:#fff;color:#1d4ed8}.btq-hero .btn.ghost{background:#ffffff16;color:#fff;border-color:#ffffff38}
      .btq-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.btq-stat,.btq-panel{background:#fff;border:1px solid #e2e8f0;border-radius:16px}.btq-stat{padding:14px}.btq-stat span{display:block;color:#64748b;font-size:11px}.btq-stat b{display:block;margin-top:4px;font-size:20px}.btq-panel{padding:18px}
      .btq-panel-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.btq-panel-head h3{margin:0;font-size:16px}.btq-panel-head p{margin:4px 0 0;color:#64748b;font-size:11px}
      .btq-settings{display:grid;grid-template-columns:1.25fr 1.25fr .7fr .7fr .75fr 1.1fr;gap:10px}.btq-field{display:grid;gap:6px}.btq-field label{font-size:11px;font-weight:900;color:#475569}
      .btq-field input,.btq-field select{width:100%;height:40px;border:1px solid #d8dee8;border-radius:10px;padding:8px 10px;background:#fff;font:inherit}.btq-recommend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding:11px 12px;border-radius:12px;background:#eff6ff;border:1px solid #dbeafe;font-size:12px}
      .btq-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.btq-badge{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900}.btq-badge.fixed{background:#f1f5f9;color:#475569}.btq-badge.variable{background:#fff7ed;color:#c2410c}
      .btq-empty{padding:22px;text-align:center;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:12px}.btq-note,.btq-windows{font-size:11px;line-height:1.65;color:#64748b}.btq-windows{margin-top:12px;padding:12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0}.btq-pending{color:#b45309}.btq-ok{color:#087a55}
      @media(max-width:1100px){.btq-settings{grid-template-columns:repeat(3,1fr)}}@media(max-width:820px){.btq-hero{grid-template-columns:1fr;padding:18px}.btq-status{grid-template-columns:repeat(2,1fr)}.btq-settings,.btq-grid{grid-template-columns:1fr}.btq-export .btn{width:100%}}
    `;document.head.appendChild(style)
  }
  function emptyHtml(){return`<div class="btq-shell"><div class="btq-hero"><div><div class="btq-kicker">BT QUICK PRODUCTION</div><h2>先分析，再快速進 BarTender</h2><p>把客戶 PDF／圖片／Excel／CSV 丟進快速分析，系統會整理成 BT 可用資料。</p></div><div class="btq-hero-actions"><button id="btGoAnalysis" class="btn primary" type="button">⚡ 去快速分析</button></div></div><div class="btq-panel"><div class="btq-empty"><b>目前還沒有帶入製作資料</b><br><br>先使用「快速分析」。</div></div></div>`}
  function render(){
    const section=el('bartender');if(!section)return;
    styles();section.classList.add('btq-ready');
    if(!draft){section.innerHTML=emptyHtml();el('btGoAnalysis')?.addEventListener('click',()=>window.showView?.('analysis'));return}
    draft=normalizeDraft(draft)||null;if(!draft){section.innerHTML=emptyHtml();return}
    const s=draft.settings||{},pending=unresolved(draft),variable=(draft.usage||[]).filter(x=>x.usage==='本批有變動').length,template=templateBaseName(draft);
    section.innerHTML=`<div class="btq-shell">
      <div class="btq-hero"><div><div class="btq-kicker">BT QUICK PRODUCTION</div><h2>BT 快速製作</h2><p>分析結果已整理。可直接下載 BT_Data.csv，或下載完整 ZIP 回公司套用母版。</p></div><div class="btq-hero-actions"><button id="btBackAnalysis" class="btn ghost" type="button">回快速分析</button><button id="btZip" class="btn primary" type="button">下載完整 BT 製作包</button></div></div>
      <div class="btq-status"><div class="btq-stat"><span>標籤</span><b>${draft.labels.length}</b></div><div class="btq-stat"><span>欄位</span><b>${draft.columns.length}</b></div><div class="btq-stat"><span>條碼</span><b>${draft.barcodes.length}</b></div><div class="btq-stat"><span>變動欄位</span><b>${variable}</b></div></div>
      <div class="btq-panel"><div class="btq-panel-head"><div><h3>1｜BT 基本設定</h3><p>不知道的資料可以先空白。</p></div><span class="pill">本機暫存</span></div><div class="btq-settings">
        <div class="btq-field"><label>客戶</label><input id="btCustomer" value="${esc(s.customer||'')}" placeholder="XX 公司"></div>
        <div class="btq-field"><label>標籤名稱</label><input id="btLabelName" value="${esc(s.labelName||'')}" placeholder="產品 Label"></div>
        <div class="btq-field"><label>寬 mm</label><input id="btWidth" inputmode="decimal" value="${esc(s.width||'')}" placeholder="100"></div>
        <div class="btq-field"><label>高 mm</label><input id="btHeight" inputmode="decimal" value="${esc(s.height||'')}" placeholder="60"></div>
        <div class="btq-field"><label>DPI</label><select id="btDpi">${['203','300','600','待確認'].map(x=>`<option ${s.dpi===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="btq-field"><label>方向</label><select id="btOrientation">${['自動/依原稿','橫向','直向'].map(x=>`<option ${s.orientation===x?'selected':''}>${x}</option>`).join('')}</select></div>
      </div><div class="btq-recommend">建議母版：<b id="btRecommendation">${esc(s.template==='自動判斷'?draft.recommendation:s.template)}</b><select id="btTemplate">${templateOptions(s.template||'自動判斷')}</select><span>檔名：<code id="btTemplateFile">${esc(template)}</code></span></div></div>
      <div class="btq-grid"><div class="btq-panel"><div class="btq-panel-head"><div><h3>2｜文字欄位</h3><p>可直接做成 BarTender 資料欄位。</p></div></div>${renderFields(draft)}</div><div class="btq-panel"><div class="btq-panel-head"><div><h3>3｜條碼物件</h3><p>條碼內容與可連結欄位。</p></div></div>${renderBarcodes(draft)}</div></div>
      <div class="btq-panel"><div class="btq-panel-head"><div><h3>4｜輸出給 BarTender</h3><p>至少先拿 BT_Data.csv；完整 ZIP 另含欄位對照、條碼對照與 Windows 開啟助手。</p></div><span id="btPendingState" class="${pending.length?'btq-pending':'btq-ok'}">${pending.length?`${pending.length} 項待確認`:'主要資料可先製作'}</span></div>
        <div class="btq-export"><button id="btCsv" class="btn primary" type="button">下載 BT_Data.csv</button><button id="btZip2" class="btn ghost" type="button">下載完整 ZIP</button><button id="btCmd" class="btn ghost" type="button">下載 BT_Open.cmd</button><button id="btCopySummary" class="btn ghost" type="button">複製製作摘要</button><button id="btClear" class="btn danger" type="button">清除本次製作</button></div>
        <div class="btq-windows"><b>公司電腦：</b>解壓 ZIP → 放入公司母版 .btw → 雙擊 <code>BT_Open.cmd</code>。不會自動列印。</div>
      </div>
    </div>`;
    for(const id of ['btCustomer','btLabelName','btWidth','btHeight','btDpi','btOrientation','btTemplate'])el(id)?.addEventListener('change',syncSettingsFromUi);
    for(const id of ['btCustomer','btLabelName','btWidth','btHeight'])el(id)?.addEventListener('input',syncSettingsFromUi);
    el('btBackAnalysis')?.addEventListener('click',()=>window.showView?.('analysis'));
    el('btZip')?.addEventListener('click',downloadZip);el('btZip2')?.addEventListener('click',downloadZip);
    el('btCsv')?.addEventListener('click',downloadDataCsv);el('btCmd')?.addEventListener('click',downloadOpenCmd);
    el('btCopySummary')?.addEventListener('click',copySummary);el('btClear')?.addEventListener('click',clearDraft)
  }
  function safeRender(){
    try{render();return true}catch(err){
      console.error('[Label Workbench] BT Quick render failed; repairing draft',err);
      const repaired=normalizeDraft(draft);draft=repaired;save();
      try{render();return true}catch(err2){console.error('[Label Workbench] BT Quick recovery render failed',err2);return false}
    }
  }
  function renderSummaryOnly(){if(!draft)return;const s=draft.settings||{};setText('btRecommendation',s.template==='自動判斷'?draft.recommendation:s.template);setText('btTemplateFile',templateBaseName(draft));const p=unresolved(draft),node=el('btPendingState');if(node){node.textContent=p.length?`${p.length} 項待確認`:'主要資料可先製作';node.className=p.length?'btq-pending':'btq-ok'}}
  function syncSettingsFromUi(){
    if(!draft)return;const s=draft.settings||(draft.settings={});
    for(const [id,key] of [['btCustomer','customer'],['btLabelName','labelName'],['btWidth','width'],['btHeight','height'],['btDpi','dpi'],['btOrientation','orientation'],['btTemplate','template']]){const node=el(id);if(node)s[key]=node.value}
    save();renderSummaryOnly()
  }
  function receiveAnalysis(result,sourceFiles=[],options={}){
    draft=buildDraft(result,sourceFiles);save();safeRender();if(!options.silent)toast('已送到 BT 快速製作');return draft
  }
  function downloadText(name,text,type='text/plain;charset=utf-8',bom=true){
    const blob=new Blob([bom?'\uFEFF':'',text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function downloadDataCsv(){if(!draft)return false;syncSettingsFromUi();downloadText('BT_Data.csv',buildDataCsv(draft),'text/csv;charset=utf-8');toast('BT_Data.csv 已下載');return true}
  function downloadOpenCmd(){if(!draft)return false;syncSettingsFromUi();downloadText('BT_Open.cmd',buildOpenCmd(draft),'application/octet-stream',false);return true}
  async function copySummary(){if(!draft)return false;syncSettingsFromUi();try{await navigator.clipboard.writeText(buildReadme(draft));toast('已複製 BT 製作摘要');return true}catch{toast('複製失敗');return false}}
  function loadZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;
    zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)});
    return zipPromise
  }
  async function downloadZip(){
    if(!draft)return false;syncSettingsFromUi();
    try{
      const JSZip=await loadZip(),zip=new JSZip();
      zip.file('BT_Data.csv','\uFEFF'+buildDataCsv(draft));zip.file('BT_Field_Map.csv','\uFEFF'+buildFieldMapCsv(draft));zip.file('BT_Barcode_Map.csv','\uFEFF'+buildBarcodeMapCsv(draft));
      zip.file('BT_製作說明.txt','\uFEFF'+buildReadme(draft));zip.file('BT_Open.cmd',buildOpenCmd(draft));zip.file('BT_WorkPack.json',JSON.stringify(draft,null,2));
      zip.file('請放入公司BT母版.txt','請將最接近的公司 BarTender 母版 .btw 放在此資料夾，再雙擊 BT_Open.cmd。\r\n建議母版檔名：'+templateBaseName(draft)+'\r\nBT_Open.cmd 不會自動列印。');
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),url=URL.createObjectURL(blob),a=document.createElement('a'),base=safeFile([draft.settings?.customer,draft.settings?.labelName].filter(Boolean).join('_')||draft.sourceFiles?.[0]?.replace(/\.[^.]+$/,'')||'Label');
      a.href=url;a.download=`BT_製作包_${base}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('BT 製作包已下載');return true
    }catch(err){console.error('[BT Quick ZIP]',err);toast('ZIP 產生失敗，已改下載 BT_Data.csv');return downloadDataCsv()}
  }
  function clearDraft(){if(typeof window.confirm==='function'&&!window.confirm('要清除目前 BT 快速製作資料嗎？'))return;draft=null;try{localStorage.removeItem(STORAGE_KEY)}catch{}safeRender();toast('已清除 BT 製作暫存')}

  function init(){
    if(initDone)return true;initDone=true;
    try{draft=load();safeRender();return true}catch(err){console.error('[Label Workbench] BT Quick init failed',err);draft=null;safeRender();return false}
  }

  const API={BUILD,STORAGE_KEY,receiveAnalysis,buildDraft,normalizeDraft,buildDataCsv,buildFieldMapCsv,buildBarcodeMapCsv,buildReadme,buildOpenCmd,templateBaseName,sanitizeFieldName,inferFieldUsage,mapBarcodes,recommendTemplate,unresolved,render,safeRender,downloadDataCsv,downloadZip,downloadOpenCmd,init,get draft(){return draft}};
  window.LabelWorkbenchBtQuick=API;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();