/* Label Workbench final confidence guard v1.5
 * Conservative final pass: never rewrite accepted values or destroy OCR evidence.
 * Only adjusts display confidence and cleans clearly redundant/noisy candidate text.
 */
(function(){
  'use strict';
  const BUILD='20260911-confidence-guard-150-display-cleanup';
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

  function nearSame(a,b){
    const x=norm(a),y=norm(b);if(!x||!y)return false;
    if(x===y)return true;
    const min=Math.min(x.length,y.length),max=Math.max(x.length,y.length);
    return min>=4&&(x.startsWith(y)||y.startsWith(x))&&(max-min)<=4;
  }

  function obviousSuffixNoise(main,candidate){
    const a=norm(main),b=norm(candidate);if(!a||!b||b===a||!b.startsWith(a))return false;
    const tail=b.slice(a.length);
    return tail.length<=4&&/^[A-Z]+$/.test(tail);
  }

  function displayAlternatives(f,allFields){
    const main=norm(f?.value),seen=new Set(),others=(allFields||[]).map(x=>x===f?'':norm(x?.value)).filter(Boolean);
    const name=tokenName(f),code=String(f?.code||'').toUpperCase();
    const collapseNear=['PART NO','LOT NO','MLOT NO','QTY','DATE'].includes(name)||['1P','1T','31T','Q','16D'].includes(code);
    return (Array.isArray(f?.alternatives)?f.alternatives:[]).filter(v=>{
      const nv=norm(v);if(!nv||seen.has(nv))return false;seen.add(nv);
      if(main&&nv===main)return false;
      if(others.includes(nv))return false;
      if(collapseNear&&main&&nearSame(main,nv))return false;
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

  function cleanBaseCandidateNodes(content,f){
    if(!content)return;
    const main=String(f?.value||'').trim();
    const mainNorm=norm(main);
    content.querySelectorAll('small').forEach(node=>{
      if(node.classList.contains('analysis-alt'))return;
      const text=String(node.textContent||'').trim();
      if(!/^候選\s*[:：]/.test(text))return;
      const raw=text.replace(/^候選\s*[:：]\s*/,'').trim();
      if(!raw){node.remove();return}

      if(mainNorm){
        const pieces=raw.split(/\s*\/\s*|\s+/).map(x=>x.trim()).filter(Boolean);
        const useful=pieces.filter(x=>/^[A-Z0-9._-]+$/i.test(x));
        if(useful.length&&useful.every(x=>nearSame(main,x)||obviousSuffixNoise(main,x))){node.remove();return}
        const first=pieces[0]||'';
        if(first&&nearSame(main,first)&&pieces.slice(1).every(x=>/^[A-Z]{1,4}$/i.test(x))){node.remove();return}
        return;
      }

      // No accepted main value: keep one compact leading token as a visible candidate,
      // instead of exposing an entire OCR line contaminated by neighbouring fields.
      const m=raw.match(/[A-Z0-9][A-Z0-9._\/-]{4,}/i);
      if(m){node.textContent='候選：'+m[0]}
      else node.remove();
    });
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
        cleanBaseCandidateNodes(content,f);
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
  window.LabelWorkbenchConfidenceGuard={BUILD,refine,stateFor,displayAlternatives,cleanBaseCandidateNodes,patchDom,install};
})();
