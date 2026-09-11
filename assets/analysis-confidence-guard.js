/* Label Workbench final confidence guard v1.4
 * Conservative final pass: do not destroy OCR candidates or rewrite accepted values.
 * Only adjusts display confidence and suppresses clearly redundant/noisy alternatives.
 */
(function(){
  'use strict';
  const BUILD='20260911-confidence-guard-140-conservative';
  const api=()=>window.LabelWorkbenchInterpreter;
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tokenName=f=>String(f?.name||'').toUpperCase().trim();
  const coded=f=>!!String(f?.code||'').trim();
  const CANONICAL=['PART NO','LOT NO','SHAPE','GP','QTY','DATE NO','ASSY','DATE','MLOT NO','BIN','MC','VC','P1','P2','4Y','SERIAL','MODEL'];

  function fragmentName(name){
    const n=String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(n.length<2||n.length>4)return false;
    return CANONICAL.some(x=>{const c=x.replace(/[^A-Z0-9]/g,'');return c!==n&&c.endsWith(n)});
  }

  function obviousSuffixNoise(main,candidate){
    const a=norm(main),b=norm(candidate);if(!a||!b||b===a||!b.startsWith(a))return false;
    const tail=b.slice(a.length);
    return tail.length<=4&&/^[A-Z]+$/.test(tail);
  }

  function displayAlternatives(f,allFields){
    const main=norm(f?.value),seen=new Set(),others=(allFields||[]).map(x=>x===f?'':norm(x?.value)).filter(Boolean);
    return (Array.isArray(f?.alternatives)?f.alternatives:[]).filter(v=>{
      const nv=norm(v);if(!nv||seen.has(nv))return false;seen.add(nv);
      if(main&&nv===main)return false;
      if(others.includes(nv))return false;
      const name=tokenName(f),code=String(f?.code||'').toUpperCase();
      if((name==='QTY'||code==='Q'||name==='DATE'||code==='16D')&&obviousSuffixNoise(f.value,v))return false;
      return true;
    }).slice(0,2);
  }

  function refine(result){
    for(const label of result?.labels||[]){
      const fields=label?.fields||[];
      const codedNames=new Set(fields.filter(coded).map(tokenName));
      for(const f of fields){
        const main=norm(f?.value),name=tokenName(f),code=String(f?.code||'').trim();
        f.__finalHidden=(!code&&fragmentName(name))||(!code&&codedNames.has(name));
        f.__displayAlternatives=displayAlternatives(f,fields);
        f.__displayConflict=f.__displayAlternatives.length>0;
        f.__finalEmpty=!main;
        // Very short coded values are valid possibilities, but not enough evidence for "high confidence".
        f.__finalShortToken=!!(code&&main.length>0&&main.length<=2);
      }
    }
    return result;
  }

  function stateFor(f){
    if(f?.__finalEmpty)return['pending','⚠️ 未確認'];
    if(f?.__displayConflict)return['pending','⚠️ 有異讀待核對'];
    if(f?.__consistencyResolved)return['pending','⚠️ 欄位交叉修正待核對'];
    if(f?.__boundaryTrimmed)return['pending','⚠️ 邊界修正待核對'];
    if(f?.__finalShortToken)return['medium','○ 條碼對應，建議核對'];
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
        const row=rows[i];if(!row)return;
        if(f.__finalHidden){row.style.display='none';return;}
        row.style.display='';
        const cells=row.querySelectorAll('td');if(cells.length<3)return;
        const content=cells[1],status=cells[2],strong=content.querySelector('strong');
        if(strong)strong.textContent=f.value||'';
        content.querySelectorAll('.analysis-alt').forEach(n=>n.remove());
        if(f.__displayAlternatives?.length){const s=document.createElement('small');s.className='analysis-alt';s.textContent='另讀到：'+f.__displayAlternatives.join(' / ');content.appendChild(s)}
        const badge=status.querySelector('.analysis-status');if(badge){const [cls,text]=stateFor(f);badge.className='analysis-status '+cls;badge.textContent=text}
      });
      const visible=(label.fields||[]).filter(f=>!f.__finalHidden);
      const pending=visible.filter(f=>stateFor(f)[0]==='pending').length;
      const usable=visible.length-pending;
      const count=card.querySelector('.analysis-label-count');if(count)count.textContent=`${usable} 可用 · ${pending} 待核對`;
    });
  }

  function install(){
    const A=api();if(!A?.analyze||A.__finalConfidenceWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){
      const result=await base(files);
      refine(result);patchDom(result);
      setTimeout(()=>patchDom(result),120);
      return result;
    };
    A.__finalConfidenceWrapped=true;
    console.info('[Label Workbench] final confidence guard',BUILD);return true;
  }
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},80)}
  window.LabelWorkbenchConfidenceGuard={BUILD,refine,stateFor,displayAlternatives,patchDom,install};
})();
