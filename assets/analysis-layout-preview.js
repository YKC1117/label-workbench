/* Label Workbench analysis layout preview v1.
 * Visualizes final sourceBox geometry before BTW serialization.
 * This is intentionally independent from BarTender so OCR/layout errors and
 * BTW serialization errors can be diagnosed separately.
 */
(function(){
  'use strict';
  const BUILD='20260929-analysis-layout-preview-100';
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const valid=b=>b&&[b.x,b.y,b.w,b.h].every(v=>Number.isFinite(Number(v)))&&Number(b.w)>0&&Number(b.h)>0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  function overlap(a,b){
    if(!valid(a)||!valid(b))return 0;
    const x=Math.max(0,Math.min(Number(a.x)+Number(a.w),Number(b.x)+Number(b.w))-Math.max(Number(a.x),Number(b.x)));
    const y=Math.max(0,Math.min(Number(a.y)+Number(a.h),Number(b.y)+Number(b.h))-Math.max(Number(a.y),Number(b.y)));
    const inter=x*y,area=Math.max(.000001,Math.min(Number(a.w)*Number(a.h),Number(b.w)*Number(b.h)));
    return inter/area
  }
  function ratio(label){
    const g=label?.sourceGeometry||{},w=Number(g.widthMm||g.widthPx),h=Number(g.heightMm||g.heightPx);
    if(w>0&&h>0)return clamp(h/w,.16,1.8);
    return .38
  }
  function textValue(o){return String(o?.text??o?.value??'').trim()}
  function barcodeValue(o){return String(o?.text??o?.value??'').trim()}
  function drawLabel(label,index){
    const W=1000,H=Math.round(W*ratio(label)),texts=(label?.textObjects||[]).filter(o=>textValue(o)),bars=(label?.barcodes||[]).filter(o=>barcodeValue(o));
    const rows=[...texts.map((o,i)=>({kind:'text',i,box:o.sourceBox,label:textValue(o)})),...bars.map((o,i)=>({kind:'barcode',i,box:o.sourceBox,label:(o.format||'Barcode')+' '+barcodeValue(o)}))];
    const missing=rows.filter(x=>!valid(x.box)).length,located=rows.filter(x=>valid(x.box));
    let collisions=0;
    for(let i=0;i<located.length;i++)for(let j=i+1;j<located.length;j++)if(overlap(located[i].box,located[j].box)>.62)collisions++;
    const rects=located.map(row=>{
      const b=row.box,x=clamp(b.x,0,1)*W,y=clamp(b.y,0,1)*H,w=clamp(b.w,0,1)*W,h=clamp(b.h,0,1)*H,barcode=row.kind==='barcode';
      const label=esc(row.label).slice(0,42),font=Math.max(10,Math.min(24,h*.55));
      return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1,w).toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" fill="none" stroke="currentColor" stroke-width="${barcode?3:1.6}" ${barcode?'stroke-dasharray="10 6"':''}/><text x="${(x+3).toFixed(1)}" y="${Math.max(font,y+font).toFixed(1)}" font-size="${font.toFixed(1)}" fill="currentColor">${label}</text></g>`
    }).join('');
    const size=label?.sourceGeometry?.widthMm&&label?.sourceGeometry?.heightMm?`${label.sourceGeometry.widthMm} × ${label.sourceGeometry.heightMm} mm`:'尺寸待確認';
    return `<div class="analysis-label-card"><div class="analysis-label-head"><div><span>BTW 前版面檢查</span><h3>標籤 ${index+1}｜${esc(label?.sourceName||'原稿')}</h3></div><div class="analysis-label-count">${size}</div></div><div class="note"><b>網站目前理解：</b>${located.length} 個已定位物件${missing?`，${missing} 個缺位置`:''}${collisions?`，${collisions} 組高度重疊`:''}。這裡若已經錯位，問題在 OCR／版面模型；這裡正確但 BarTender 錯，才是 BTW 序列化問題。</div><div style="overflow:auto;border:1px solid currentColor;border-radius:10px;padding:8px;opacity:.92"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="標籤版面預覽" style="display:block;width:100%;min-width:520px;background:white;color:#111">${rects}</svg></div></div>`
  }
  function render(result){
    const host=document.getElementById('analysisResult');if(!host)return;
    host.querySelectorAll('.lw-analysis-layout-preview').forEach(n=>n.remove());
    const labels=result?.labels||[];if(!labels.length)return;
    const wrap=document.createElement('div');wrap.className='lw-analysis-layout-preview';
    wrap.innerHTML=labels.slice(0,8).map(drawLabel).join('');
    host.appendChild(wrap)
  }
  window.LabelWorkbenchLayoutPreview={BUILD,valid,overlap,render};
  console.info('[Label Workbench] analysis layout preview',BUILD);
})();