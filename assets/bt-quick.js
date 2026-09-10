/* Label Workbench BT Quick Production v1.0
 * Turns Quick Analysis facts into BarTender-ready data files and a production handoff pack.
 * This module does not fabricate .btw files. It prepares the repeatable work that UltraLite can consume manually.
 */
(function(){
  'use strict';

  const BUILD='20260910-bt100';
  const STORAGE_KEY='labelWorkbench.btDraft.v1';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let zipPromise=null;
  let draft=null;

  const el=id=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,70)||'Label';
  const toast=msg=>{if(typeof window.toast==='function')window.toast(msg)};

  const FIELD_NAMES={
    '1P':'PART_NO','1T':'LOT_NO','30P':'SHAPE','31P':'GP','Q':'QTY','10D':'DATE_NO','21L':'ASSY','16D':'DATE',
    '31T':'MLOT_NO','33P':'BIN','23L':'MC','24L':'VC','1Y':'P1','2Y':'P2','4Y':'FIELD_4Y'
  };

  function csvCell(value){
    const s=String(value??'');
    return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
  }

  function sanitizeFieldName(field,index=1){
    const byCode=FIELD_NAMES[String(field?.code||'').toUpperCase()];
    if(byCode)return byCode;
    let s=String(field?.name||`FIELD_${index}`).toUpperCase().trim()
      .replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').replace(/_+/g,'_');
    if(!s)s=`FIELD_${index}`;
    if(/^\d/.test(s))s=`FIELD_${s}`;
    return s.slice(0,40);
  }

  function uniqueNames(names){
    const used=new Map();
    return names.map(name=>{
      const base=name||'FIELD';
      const n=(used.get(base)||0)+1;used.set(base,n);
      return n===1?base:`${base}_${n}`;
    });
  }

  function fieldState(field,barcodes=[]){
    const value=norm(field?.value);
    const barcodeHit=value.length>1&&barcodes.some(b=>{const t=norm(b?.text);return t===value||t.includes(value)||(value.includes(t)&&t.length>=4)});
    if(barcodeHit)return'barcode';
    if(Number(field?.repeat)>=2&&!field?.conflict)return'high';
    if(field?.spatial&&!field?.conflict)return'medium';
    return'pending';
  }

  function makeColumns(labels=[]){
    const defs=[],seen=new Set();
    labels.forEach((label,labelIndex)=>{
      (label.fields||[]).forEach((f,index)=>{
        const key=norm(f.code)||norm(f.name)||`FIELD${index+1}`;
        if(seen.has(key))return;
        seen.add(key);
        defs.push({key,code:f.code||'',name:f.name||'',btName:sanitizeFieldName(f,defs.length+1),kind:'text'});
      });
    });
    const names=uniqueNames(defs.map(d=>d.btName));
    defs.forEach((d,i)=>d.btName=names[i]);
    return defs;
  }

  function labelValue(label,column){
    const rows=label?.fields||[];
    const hit=rows.find(f=>(norm(f.code)||norm(f.name))===column.key);
    return hit?.value??'';
  }

  function inferFieldUsage(labels=[],columns=[]){
    return columns.map(col=>{
      const values=labels.map(l=>labelValue(l,col)).filter(v=>String(v)!=='');
      const distinct=[...new Set(values.map(String))];
      return {...col,usage:labels.length>1&&distinct.length>1?'本批有變動':'本批固定',examples:distinct.slice(0,3)};
    });
  }

  function barcodeFormatFamily(format=''){
    const t=String(format).toUpperCase();
    if(/QR|DATA.?MATRIX|AZTEC|PDF417/.test(t))return'2D';
    return'1D';
  }

  function mapBarcodes(labels=[],columns=[]){
    const rows=[];
    labels.forEach((label,labelIndex)=>{
      (label.barcodes||[]).forEach((b,index)=>{
        const text=String(b.text??'');
        const n=norm(text);
        const matched=columns.find(col=>{
          const value=labelValue(label,col),v=norm(value);
          return v&&n&&(n===v||n.includes(v)||(v.includes(n)&&n.length>=4));
        });
        rows.push({
          label:labelIndex+1,
          objectName:`BARCODE_${String(index+1).padStart(2,'0')}`,
          format:b.format||'未知',family:barcodeFormatFamily(b.format),text,
          sourceField:matched?.btName||'',sourceType:matched?'欄位連結':'固定/組合內容'
        });
      });
    });
    return rows;
  }

  function recommendTemplate(labels=[],barcodeRows=[],usage=[]){
    const has1=barcodeRows.some(r=>r.family==='1D'),has2=barcodeRows.some(r=>r.family==='2D');
    const variable=usage.some(r=>r.usage==='本批有變動');
    const base=has1&&has2?'混合條碼母版':has2?'二維碼母版':has1?'一維碼母版':'文字母版';
    return variable?`${base}＋CSV 可變資料`:base;
  }

  function buildDraft(result={},sourceFiles=[]){
    const labels=(result.labels||[]).map((l,i)=>({
      sourceName:l.sourceName||sourceFiles[0]||'',page:l.page||1,index:l.index||i+1,
      fields:(l.fields||[]).map(f=>({code:f.code||'',name:f.name||'',value:String(f.value??''),repeat:Number(f.repeat||0),spatial:!!f.spatial,conflict:!!f.conflict,alternatives:[...(f.alternatives||[])]})),
      barcodes:(l.barcodes||[]).map(b=>({format:b.format||'',text:String(b.text??'')})),marks:[...(l.marks||[])]
    }));
    const columns=makeColumns(labels),usage=inferFieldUsage(labels,columns),barcodes=mapBarcodes(labels,columns);
    return {
      version:1,createdAt:new Date().toISOString(),sourceFiles:[...sourceFiles],labels,columns,usage,barcodes,
      settings:{customer:'',labelName:'',width:'',height:'',dpi:'203',orientation:'自動/依原稿',template:'自動判斷'},
      recommendation:recommendTemplate(labels,barcodes,usage)
    };
  }

  function buildDataCsv(d=draft){
    if(!d)return'';
    const cols=d.columns||[];
    const header=['LABEL_NO',...cols.map(c=>c.btName)];
    const rows=(d.labels||[]).map((label,i)=>[i+1,...cols.map(c=>labelValue(label,c))]);
    return [header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
  }

  function buildFieldMapCsv(d=draft){
    if(!d)return'';
    const usageMap=new Map((d.usage||[]).map(u=>[u.key,u]));
    const rows=[['BT_FIELD','SOURCE_CODE','SOURCE_NAME','USAGE_IN_THIS_SAMPLE','EXAMPLE','CONFIDENCE_NOTE']];
    (d.columns||[]).forEach(col=>{
      const u=usageMap.get(col.key),samples=(u?.examples||[]).join(' / '),states=[];
      (d.labels||[]).forEach(l=>{const f=(l.fields||[]).find(x=>(norm(x.code)||norm(x.name))===col.key);if(f)states.push(fieldState(f,l.barcodes||[]))});
      const note=states.includes('pending')?'含待核對值':states.includes('barcode')?'有條碼交叉確認':states.every(x=>x==='high')?'重複辨識一致':'可先整理';
      rows.push([col.btName,col.code,col.name,u?.usage||'本批固定',samples,note]);
    });
    return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
  }

  function buildBarcodeMapCsv(d=draft){
    if(!d)return'';
    const rows=[['LABEL_NO','BT_OBJECT','BARCODE_TYPE','DATA_SOURCE','SOURCE_FIELD','EXAMPLE_CONTENT']];
    (d.barcodes||[]).forEach(r=>rows.push([r.label,r.objectName,r.format,r.sourceType,r.sourceField,r.text]));
    return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
  }

  function unresolved(d=draft){
    const out=[];
    (d.labels||[]).forEach((label,i)=>(label.fields||[]).forEach(f=>{if(fieldState(f,label.barcodes||[])==='pending')out.push(`標籤 ${i+1}｜${f.code?`(${f.code}) `:''}${f.name}：${f.value}`)}));
    if(!d?.settings?.width||!d?.settings?.height)out.push('Label 實際尺寸（寬 × 高 mm）');
    return [...new Set(out)];
  }

  function buildReadme(d=draft){
    if(!d)return'';
    const s=d.settings||{},pending=unresolved(d),src=(d.sourceFiles||[]).join('、')||'未記錄';
    const lines=[
      '【Label Workbench｜BT 快速製作包】','',
      `來源：${src}`,
      `客戶：${s.customer||'未填'}`,
      `標籤名稱：${s.labelName||'未填'}`,
      `尺寸：${s.width&&s.height?`${s.width} × ${s.height} mm`:'待確認'}`,
      `DPI：${s.dpi||'待確認'}`,
      `方向：${s.orientation||'依原稿'}`,
      `建議母版：${s.template==='自動判斷'?d.recommendation:s.template}`,'',
      '【最快製作方式】',
      '1. 回公司先開最接近的 BTW 母版，不要從空白檔重做。',
      '2. 若有多張/可變資料，將 BT_Data.csv 設為資料來源；欄位名稱已整理成適合 BarTender 使用的英文欄位名。',
      '3. 依 BT_Field_Map.csv 建立/連結文字物件。',
      '4. 依 BT_Barcode_Map.csv 建立真正的 BarTender 條碼物件；有 SOURCE_FIELD 的優先直接連同名欄位。',
      '5. 依客戶原稿微調位置、字型、線框、Logo，再實際列印與掃碼驗證。','',
      '【目前分析】',
      `標籤：${(d.labels||[]).length} 張`,
      `欄位：${(d.columns||[]).length} 組`,
      `條碼：${(d.barcodes||[]).length} 個`,
      `本批有變動欄位：${(d.usage||[]).filter(x=>x.usage==='本批有變動').map(x=>x.btName).join('、')||'未發現'}`,'',
      '【製作前仍需確認】',
      ...(pending.length?pending.map((x,i)=>`${i+1}. ${x}`):['主要資料已整理；仍需以客戶原稿與實機測試為準。']),
      '',
      '注意：本工具不會偽造 .btw。製作包的目的，是把抄資料、整理欄位、判斷可變值、整理條碼內容這些耗時步驟先完成。'
    ];
    return lines.join('\r\n');
  }

  function save(){
    if(!draft)return;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(draft))}catch{}
  }
  function load(){
    try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(v&&Array.isArray(v.labels))return v}catch{}
    return null;
  }

  function receiveAnalysis(result,sourceFiles=[],options={}){
    draft=buildDraft(result,sourceFiles);
    save();
    render();
    if(!options.silent)toast('已送到 BT 快速製作');
    return draft;
  }

  function syncSettingsFromUi(){
    if(!draft)return;
    const s=draft.settings||(draft.settings={});
    for(const [id,key] of [['btCustomer','customer'],['btLabelName','labelName'],['btWidth','width'],['btHeight','height'],['btDpi','dpi'],['btOrientation','orientation'],['btTemplate','template']]){
      const node=el(id);if(node)s[key]=node.value;
    }
    save();renderSummaryOnly();
  }

  function setText(id,value){const n=el(id);if(n)n.textContent=value}

  function usageBadge(u){return u==='本批有變動'?'<span class="btq-badge variable">本批有變動</span>':'<span class="btq-badge fixed">本批固定</span>'}

  function renderFields(d){
    if(!(d.columns||[]).length)return'<div class="btq-empty">目前沒有可整理的文字欄位。</div>';
    const um=new Map((d.usage||[]).map(x=>[x.key,x]));
    return `<div class="table-scroll"><table class="analysis-table btq-table"><thead><tr><th>BT 欄位名</th><th>原稿欄位</th><th>判斷</th><th>範例</th></tr></thead><tbody>${d.columns.map(c=>{const u=um.get(c.key);return`<tr><td><code>${esc(c.btName)}</code></td><td>${esc(c.code?`(${c.code}) ${c.name}`:c.name)}</td><td>${usageBadge(u?.usage)}</td><td><strong>${esc((u?.examples||[]).join(' / '))}</strong></td></tr>`}).join('')}</tbody></table></div>`;
  }

  function renderBarcodes(d){
    if(!(d.barcodes||[]).length)return'<div class="btq-empty">目前沒有成功解出的條碼；回公司建版時仍需依原稿確認。</div>';
    return `<div class="table-scroll"><table class="analysis-table btq-table"><thead><tr><th>標籤</th><th>類型</th><th>BT 資料來源</th><th>內容</th></tr></thead><tbody>${d.barcodes.map(r=>`<tr><td>${r.label}</td><td>${esc(r.format)}</td><td>${r.sourceField?`連結 <code>${esc(r.sourceField)}</code>`:'固定／組合內容'}</td><td><strong class="mono">${esc(r.text)}</strong></td></tr>`).join('')}</tbody></table></div>`;
  }

  function templateOptions(selected='自動判斷'){
    const opts=['自動判斷','文字母版','一維碼母版','二維碼母版','混合條碼母版','混合條碼母版＋CSV 可變資料'];
    return opts.map(x=>`<option ${x===selected?'selected':''}>${esc(x)}</option>`).join('');
  }

  function styles(){
    if(el('btQuickStyle'))return;
    const style=document.createElement('style');style.id='btQuickStyle';style.textContent=`
      #bartender.btq-ready{display:none}#bartender.btq-ready.active{display:block}
      .btq-shell{display:grid;gap:16px}.btq-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:22px 24px;border-radius:20px;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;box-shadow:0 14px 36px rgba(15,23,42,.14)}
      .btq-kicker{font-size:10px;font-weight:900;letter-spacing:.14em;color:#93c5fd}.btq-hero h2{margin:6px 0 7px;font-size:24px}.btq-hero p{margin:0;max-width:820px;color:#dbeafe;line-height:1.65;font-size:13px}.btq-hero-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.btq-hero .btn.primary{background:#fff;color:#1d4ed8}.btq-hero .btn.ghost{background:#ffffff16;color:#fff;border-color:#ffffff38}
      .btq-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.btq-stat{padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.btq-stat span{display:block;color:#64748b;font-size:11px}.btq-stat b{display:block;margin-top:5px;font-size:20px;color:#172033}
      .btq-panel{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:18px}.btq-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.btq-panel-head h3{margin:0;font-size:16px}.btq-panel-head p{margin:4px 0 0;color:#64748b;font-size:11px;line-height:1.5}
      .btq-settings{display:grid;grid-template-columns:1.25fr 1.25fr .7fr .7fr .75fr 1.1fr;gap:10px}.btq-field{display:grid;gap:6px}.btq-field label{font-size:11px;font-weight:900;color:#475569}.btq-field input,.btq-field select{width:100%;height:40px;border:1px solid #d8dee8;border-radius:10px;padding:8px 10px;background:#fff;font:inherit}.btq-field input:focus,.btq-field select:focus{outline:3px solid #dbeafe;border-color:#60a5fa}
      .btq-recommend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding:11px 12px;border-radius:12px;background:#eff6ff;border:1px solid #dbeafe;color:#1e3a8a;font-size:12px}.btq-recommend b{color:#1d4ed8}.btq-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.btq-table code{font-weight:800;color:#1d4ed8}.btq-badge{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900}.btq-badge.fixed{background:#f1f5f9;color:#475569}.btq-badge.variable{background:#fff7ed;color:#c2410c}.btq-empty{padding:22px;text-align:center;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:12px}
      .btq-export{display:flex;gap:8px;flex-wrap:wrap}.btq-export .btn.primary{min-width:180px}.btq-note{font-size:11px;color:#64748b;line-height:1.6}.btq-source{font-weight:700;color:#334155}.btq-pending{color:#b45309}.btq-ok{color:#087a55}
      @media(max-width:1100px){.btq-settings{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:820px){.btq-hero{grid-template-columns:1fr;padding:18px}.btq-hero-actions{justify-content:flex-start}.btq-status{grid-template-columns:repeat(2,1fr)}.btq-settings,.btq-grid{grid-template-columns:1fr}.btq-export .btn{width:100%}}
    `;document.head.appendChild(style);
  }

  function emptyHtml(){
    return `<div class="btq-shell"><div class="btq-hero"><div><div class="btq-kicker">BT QUICK PRODUCTION</div><h2>先分析，再快速進 BarTender</h2><p>這裡不要求先建立案件。把客戶 PDF／圖片丟進快速分析，系統會把欄位、條碼、可變資料整理成 BT 製作包。</p></div><div class="btq-hero-actions"><button id="btGoAnalysis" class="btn primary" type="button">⚡ 去快速分析</button></div></div><div class="btq-panel"><div class="btq-empty"><b>目前還沒有帶入製作資料</b><br><br>先使用「快速分析」，分析完成後按「送到 BT 快速製作」。</div></div></div>`;
  }

  function render(){
    const section=el('bartender');if(!section)return;styles();section.classList.add('btq-ready');
    if(!draft){section.innerHTML=emptyHtml();el('btGoAnalysis')?.addEventListener('click',()=>window.showView?.('analysis'));return}
    const s=draft.settings||{},pending=unresolved(draft),variable=(draft.usage||[]).filter(x=>x.usage==='本批有變動').length;
    section.innerHTML=`<div class="btq-shell">
      <div class="btq-hero"><div><div class="btq-kicker">BT QUICK PRODUCTION</div><h2>BT 快速製作</h2><p>快速分析已整理完成。先確認尺寸與 DPI，再下載製作包；回公司直接套最接近的 BTW 母版，不需要重新抄資料。</p></div><div class="btq-hero-actions"><button id="btBackAnalysis" class="btn ghost" type="button">回快速分析</button><button id="btZip" class="btn primary" type="button">下載 BT 製作包 ZIP</button></div></div>
      <div class="btq-status"><div class="btq-stat"><span>標籤</span><b>${draft.labels.length}</b></div><div class="btq-stat"><span>欄位</span><b>${draft.columns.length}</b></div><div class="btq-stat"><span>條碼</span><b>${draft.barcodes.length}</b></div><div class="btq-stat"><span>本批變動欄位</span><b>${variable}</b></div></div>
      <div class="btq-panel"><div class="btq-panel-head"><div><h3>1｜BT 基本設定</h3><p>只有真正影響建版的資料；不知道的可以先空白。</p></div><span class="pill">本機暫存</span></div><div class="btq-settings">
        <div class="btq-field"><label>客戶（選填）</label><input id="btCustomer" value="${esc(s.customer||'')}" placeholder="例如：XX 公司"></div>
        <div class="btq-field"><label>標籤名稱（選填）</label><input id="btLabelName" value="${esc(s.labelName||'')}" placeholder="例如：產品 Label"></div>
        <div class="btq-field"><label>寬 mm</label><input id="btWidth" inputmode="decimal" value="${esc(s.width||'')}" placeholder="100"></div>
        <div class="btq-field"><label>高 mm</label><input id="btHeight" inputmode="decimal" value="${esc(s.height||'')}" placeholder="60"></div>
        <div class="btq-field"><label>DPI</label><select id="btDpi"><option ${s.dpi==='203'?'selected':''}>203</option><option ${s.dpi==='300'?'selected':''}>300</option><option ${s.dpi==='600'?'selected':''}>600</option><option ${s.dpi==='待確認'?'selected':''}>待確認</option></select></div>
        <div class="btq-field"><label>方向</label><select id="btOrientation"><option ${s.orientation==='自動/依原稿'?'selected':''}>自動/依原稿</option><option ${s.orientation==='橫向'?'selected':''}>橫向</option><option ${s.orientation==='直向'?'selected':''}>直向</option></select></div>
      </div><div class="btq-recommend"><span>建議母版：</span><b id="btRecommendation">${esc(s.template==='自動判斷'?draft.recommendation:s.template)}</b><select id="btTemplate">${templateOptions(s.template||'自動判斷')}</select></div></div>
      <div class="btq-grid"><div class="btq-panel"><div class="btq-panel-head"><div><h3>2｜文字欄位</h3><p>已整理成適合當 BarTender 資料欄位的名稱。</p></div></div>${renderFields(draft)}</div><div class="btq-panel"><div class="btq-panel-head"><div><h3>3｜條碼物件</h3><p>能對到文字欄位的條碼，直接告訴你應連哪個欄位。</p></div></div>${renderBarcodes(draft)}</div></div>
      <div class="btq-panel"><div class="btq-panel-head"><div><h3>4｜輸出給 BarTender</h3><p>製作包會把資料、欄位對照、條碼對照與製作說明一次整理好。</p></div><span id="btPendingState" class="${pending.length?'btq-pending':'btq-ok'}">${pending.length?`${pending.length} 項待確認`:'主要資料可先製作'}</span></div><div class="btq-export"><button id="btZip2" class="btn primary" type="button">下載完整 ZIP</button><button id="btCsv" class="btn ghost" type="button">下載 BT_Data.csv</button><button id="btCopySummary" class="btn ghost" type="button">複製製作摘要</button><button id="btClear" class="btn danger" type="button">清除本次製作</button></div><p class="btq-note">來源：<span class="btq-source">${esc((draft.sourceFiles||[]).join('、')||'未記錄')}</span><br>製作包不會產生假的 BTW；它把最耗時的抄資料、欄位命名、可變值判斷、條碼內容整理先完成，回公司只剩套母版、微調與實機驗證。</p></div>
    </div>`;
    for(const id of ['btCustomer','btLabelName','btWidth','btHeight','btDpi','btOrientation','btTemplate'])el(id)?.addEventListener('change',syncSettingsFromUi);
    for(const id of ['btCustomer','btLabelName','btWidth','btHeight'])el(id)?.addEventListener('input',syncSettingsFromUi);
    el('btBackAnalysis')?.addEventListener('click',()=>window.showView?.('analysis'));
    el('btZip')?.addEventListener('click',downloadZip);el('btZip2')?.addEventListener('click',downloadZip);el('btCsv')?.addEventListener('click',downloadDataCsv);el('btCopySummary')?.addEventListener('click',copySummary);el('btClear')?.addEventListener('click',clearDraft);
  }

  function renderSummaryOnly(){
    if(!draft)return;const s=draft.settings||{};setText('btRecommendation',s.template==='自動判斷'?draft.recommendation:s.template);const p=unresolved(draft),node=el('btPendingState');if(node){node.textContent=p.length?`${p.length} 項待確認`:'主要資料可先製作';node.className=p.length?'btq-pending':'btq-ok'}
  }

  function downloadText(name,text,type='text/plain;charset=utf-8'){
    const blob=new Blob(['\uFEFF',text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadDataCsv(){if(!draft)return;syncSettingsFromUi();downloadText('BT_Data.csv',buildDataCsv(draft),'text/csv;charset=utf-8')}
  async function copySummary(){if(!draft)return;syncSettingsFromUi();const text=buildReadme(draft);try{await navigator.clipboard.writeText(text);toast('已複製 BT 製作摘要')}catch{toast('複製失敗')}}
  function loadZip(){if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)});return zipPromise}
  async function downloadZip(){
    if(!draft)return;syncSettingsFromUi();try{const JSZip=await loadZip(),zip=new JSZip();zip.file('BT_Data.csv','\uFEFF'+buildDataCsv(draft));zip.file('BT_Field_Map.csv','\uFEFF'+buildFieldMapCsv(draft));zip.file('BT_Barcode_Map.csv','\uFEFF'+buildBarcodeMapCsv(draft));zip.file('BT_製作說明.txt','\uFEFF'+buildReadme(draft));zip.file('BT_WorkPack.json',JSON.stringify(draft,null,2));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),url=URL.createObjectURL(blob),a=document.createElement('a'),base=safeFile([draft.settings?.customer,draft.settings?.labelName].filter(Boolean).join('_')||'Label');a.href=url;a.download=`BT_製作包_${base}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('BT 製作包已下載')}catch(err){console.error('[BT Quick ZIP]',err);toast('ZIP 產生失敗，請先下載 BT_Data.csv')}}
  function clearDraft(){if(typeof window.confirm==='function'&&!window.confirm('要清除目前 BT 快速製作資料嗎？'))return;draft=null;try{localStorage.removeItem(STORAGE_KEY)}catch{}render();toast('已清除 BT 製作暫存')}

  function init(){draft=load();render()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.LabelWorkbenchBtQuick={
    BUILD,STORAGE_KEY,receiveAnalysis,buildDraft,buildDataCsv,buildFieldMapCsv,buildBarcodeMapCsv,buildReadme,
    sanitizeFieldName,inferFieldUsage,mapBarcodes,recommendTemplate,unresolved,render,get draft(){return draft}
  };
})();