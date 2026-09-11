/* Label Workbench final confidence guard v1.0
 * Final pass after OCR/barcode/cross-field refinements.
 * Prevents short or conflicting values from being presented as fully confirmed.
 */
(function(){
  'use strict';
  const BUILD='20260911-confidence-guard-100';
  const api=()=>window.LabelWorkbenchInterpreter;
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tokenName=f=>String(f?.name||'').toUpperCase();
  const tokenField=f=>/PART|LOT|MLOT|SERIAL|MODEL|ASSY|SHAPE|BIN|DATE|QTY|GP|MC|VC/.test(tokenName(f))||!!String(f?.code||'').trim();
  const noisy=v=>{const s=String(v||'').trim();return !s||/[\u3400-\u9fff]/.test(s)||(/\s/.test(s)&&s.split(/\s+/).length>=3)||(/[(){}]/.test(s)&&s.length>10)};

  function refine(result){
    for(const label of result?.labels||[]){
      for(const f of label?.fields||[]){
        if(Array.isArray(f.alternatives)){
          f.alternatives=f.alternatives.filter(v=>!tokenField(f)||!noisy(v)).slice(0,2);
          f.conflict=f.alternatives.length>0;
        }
        const n=norm(f.value);
        f.__finalShortBarcode=!!((f.barcodeVerified||f.barcodeAligned)&&n.length>0&&n.length<=2);
        if(f.__finalShortBarcode)f.barcodeVerified=false;
      }
    }
    return result;
  }

  function stateFor(f){
    if(f?.conflict)return['pending','⚠️ 有異讀待核對'];
    if(f?.__consistencyResolved)return['pending','⚠️ 欄位交叉修正待核對'];
    if(f?.__boundaryTrimmed)return['pending','⚠️ 邊界修正待核對'];
    if(f?.__finalShortBarcode)return['medium','○ 條碼對應，建議核對'];
    if(f?.barcodeVerified)return['barcode','✅ 條碼確認'];
    if(f?.barcodeAligned)return['medium','○ 條碼對應，建議核對'];
    if(Number(f?.repeat)>=3)return['high','✓ 高可信'];
    if(f?.spatial)return['medium','○ 可先整理'];
    return['pending','⚠️ 建議核對'];
  }

  function patchDom(result){
    const host=document.getElementById('analysisResult');if(!host)return;
    const cards=[...host.querySelectorAll('.analysis-label-card')].filter(card=>card.querySelector('section h4'));
    (result?.labels||[]).forEach((label,idx)=>{
      const card=cards[idx];if(!card)return;
      const section=[...card.querySelectorAll('section')].find(s=>(s.querySelector('h4')?.textContent||'').includes('欄位內容'));
      const rows=[...(section?.querySelectorAll('tbody tr')||[])];
      (label.fields||[]).forEach((f,i)=>{
        const cells=rows[i]?.querySelectorAll('td');if(!cells||cells.length<3)return;
        const content=cells[1],status=cells[2],strong=content.querySelector('strong');
        if(strong)strong.textContent=f.value||'';
        content.querySelectorAll('.analysis-alt').forEach(n=>n.remove());
        if(f.conflict&&f.alternatives?.length){const s=document.createElement('small');s.className='analysis-alt';s.textContent='另讀到：'+f.alternatives.join(' / ');content.appendChild(s)}
        const badge=status.querySelector('.analysis-status');if(badge){const [cls,text]=stateFor(f);badge.className='analysis-status '+cls;badge.textContent=text}
      });
    });
  }

  function install(){
    const A=api();if(!A?.analyze||A.__finalConfidenceWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){const result=await base(files);refine(result);patchDom(result);return result};
    A.__finalConfidenceWrapped=true;
    console.info('[Label Workbench] final confidence guard',BUILD);return true;
  }
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},80)}
  window.LabelWorkbenchConfidenceGuard={BUILD,refine,stateFor,install};
})();
