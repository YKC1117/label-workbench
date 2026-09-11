/* Label Workbench cross-field consistency guard v1.0
 * Prevents PART / LOT / MLOT values from being swapped when OCR/barcode candidates overlap.
 */
(function(){
  'use strict';
  const BUILD='20260911-field-consistency-100';
  const api=()=>window.LabelWorkbenchInterpreter;
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const code=f=>String(f?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const plausible=v=>/^[A-Z0-9][A-Z0-9._\/-]{4,}$/i.test(String(v||'').trim());
  const lotCodes=new Set(['1T','31T']);

  function nearSame(a,b){
    const x=norm(a),y=norm(b);if(x.length<5||y.length<5)return false;
    if(x===y)return true;
    const min=Math.min(x.length,y.length);
    return (x.startsWith(y)||y.startsWith(x))&&min>=6;
  }
  function conflictsWithOtherField(field,value,fields){
    const c=code(field);
    for(const other of fields){
      if(other===field)continue;
      const oc=code(other);
      if(!oc)continue;
      if(c==='1P'&&lotCodes.has(oc)&&nearSame(value,other.value))return true;
      if(lotCodes.has(c)&&oc==='1P'&&nearSame(value,other.value))return true;
    }
    return false;
  }

  function refineLabel(label){
    const fields=Array.isArray(label?.fields)?label.fields:[];
    for(const f of fields){
      const c=code(f);if(c!=='1P'&&!lotCodes.has(c))continue;
      const current=String(f.value||'').trim();
      const alts=(Array.isArray(f.alternatives)?f.alternatives:[]).map(v=>String(v||'').trim()).filter(Boolean);
      const currentConflicts=conflictsWithOtherField(f,current,fields);
      const uniqueAlt=alts.find(v=>plausible(v)&&!conflictsWithOtherField(f,v,fields));
      if(currentConflicts&&uniqueAlt){
        f.value=uniqueAlt;
        f.alternatives=[];
        f.conflict=false;
        f.barcodeVerified=false;
        f.__consistencyResolved=true;
      }else{
        const kept=alts.filter(v=>!conflictsWithOtherField(f,v,fields));
        f.alternatives=kept;
        f.conflict=kept.length>0;
      }
    }
    return label;
  }
  function refineResult(result){if(result?.labels?.length)result.labels.forEach(refineLabel);return result}

  function patchDom(result){
    const host=document.getElementById('analysisResult');if(!host||!result?.labels)return;
    const cards=[...host.querySelectorAll('.analysis-label-card')].filter(card=>card.querySelector('section h4'));
    result.labels.forEach((label,idx)=>{
      const card=cards[idx];if(!card)return;
      const section=[...card.querySelectorAll('section')].find(s=>(s.querySelector('h4')?.textContent||'').includes('欄位內容'));
      const rows=[...(section?.querySelectorAll('tbody tr')||[])];
      (label.fields||[]).forEach((f,i)=>{
        const cells=rows[i]?.querySelectorAll('td');if(!cells||cells.length<3)return;
        const strong=cells[1].querySelector('strong');if(strong)strong.textContent=f.value;
        cells[1].querySelectorAll('.analysis-alt').forEach(n=>n.remove());
        if(f.alternatives?.length){const s=document.createElement('small');s.className='analysis-alt';s.textContent='另讀到：'+f.alternatives.join(' / ');cells[1].appendChild(s)}
        if(f.__consistencyResolved){const badge=cells[2].querySelector('.analysis-status');if(badge){badge.className='analysis-status high';badge.textContent='✓ 欄位交叉確認'}}
      });
    });
    window.LabelWorkbenchAnalysisCopy?.decorate?.();
  }

  function install(){
    const A=api();if(!A?.analyze||A.__fieldConsistencyWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){const result=await base(files);refineResult(result);patchDom(result);return result};
    A.__fieldConsistencyWrapped=true;
    console.info('[Label Workbench] field consistency guard',BUILD);return true;
  }
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer)},80)}
  window.LabelWorkbenchFieldConsistency={BUILD,refineResult,refineLabel,install};
})();