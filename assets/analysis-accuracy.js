/* Label Workbench analysis accuracy guard v1.0
 * Restores tolerant field-code cleanup and removes obvious OCR cross-field contamination.
 * Runs after label-interpreter and before the BT bridge so refined values are what BTW export receives.
 */
(function(){
  'use strict';
  const BUILD='20260911-analysis-accuracy-100';
  const api=()=>window.LabelWorkbenchInterpreter;
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const KNOWN_CODES=['1P','1T','30P','31P','Q','10D','21L','16D','31T','33P','23L','24L','1Y','2Y','4Y'];

  function fuzzyCodePattern(code){
    return code.split('').map(ch=>{
      if(ch==='1') return '[1IL|]';
      if(ch==='0') return '[0O]';
      return ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    }).join('\\s*');
  }
  const FUZZY_CODE_ALT=KNOWN_CODES.map(fuzzyCodePattern).join('|');
  const TAIL_CODE_RX=new RegExp('\\s*[\\(\\[]\\s*(?:'+FUZZY_CODE_ALT+')\\s*[\\)\\]]\\s*.*$','i');

  function compactTokenValue(value){
    let s=clean(value)
      .replace(/[¦|]+/g,' ')
      .replace(/\s*[;；:,，]+\s*$/,'')
      .trim();
    s=s.replace(TAIL_CODE_RX,'').trim();

    // If OCR read a strong part/lot-like token and only tiny garbage after it, keep the strong token.
    const m=s.match(/^([A-Z0-9][A-Z0-9._\/-]{5,})(?:\s+(.+))?$/i);
    if(m&&m[2]){
      const tail=m[2].trim();
      const pieces=tail.split(/\s+/).filter(Boolean);
      const junk=pieces.length&&pieces.every(x=>x.length<=2||/^[;:,.()[\]{}'"`~!?\-]+$/.test(x)||/^[\u3400-\u9fff]$/.test(x));
      if(junk) s=m[1];
    }
    return s.replace(/\s+/g,' ').trim();
  }

  function fieldKind(field){return norm(field?.code)||norm(field?.name)}
  function tokenField(field){
    const k=fieldKind(field);
    return /PART|LOT|SERIAL|MODEL|ASSY|SHAPE|BIN|DATE|QTY|MLOT|^1P$|^1T$|^Q$/.test(k);
  }
  function cleanFieldValue(field,value){
    let s=compactTokenValue(value);
    if(tokenField(field)){
      const m=s.match(/^([A-Z0-9][A-Z0-9._\/-]{2,})(?:\s+.+)?$/i);
      if(m&&/\s/.test(s)){
        const first=m[1],rest=s.slice(first.length).trim();
        const noisy=/^(?:[()\[\]{};:,.!?'"`~\-]|[A-Z0-9]{1,2}|[\u3400-\u9fff])(?:\s+(?:[()\[\]{};:,.!?'"`~\-]|[A-Z0-9]{1,2}|[\u3400-\u9fff]))*$/i.test(rest);
        if(noisy) s=first;
      }
    }
    return s;
  }

  function barcodeMatch(value,barcodes=[]){
    const v=norm(value);if(v.length<3)return false;
    return barcodes.some(b=>{const t=norm(b?.text);return t&&(t===v||t.includes(v)||(v.includes(t)&&t.length>=5))});
  }

  function quality(field,value,barcodes=[]){
    const s=cleanFieldValue(field,value),n=norm(s);if(!n)return-999;
    let score=Math.min(30,n.length);
    if(barcodeMatch(s,barcodes))score+=120;
    if(/^[A-Z0-9._\/-]+$/i.test(s))score+=24;
    if(/\s/.test(s))score-=10;
    if(/[;；]/.test(s))score-=14;
    if(/[\u3400-\u9fff]/.test(s)&&tokenField(field))score-=18;
    if(/\([^)]{1,5}\)\s*$/.test(s))score-=8;
    return score;
  }

  function refineLabel(label){
    const fields=Array.isArray(label?.fields)?label.fields:[];
    const bars=Array.isArray(label?.barcodes)?label.barcodes:[];
    const otherPrimary=new Set();
    for(const f of fields){const c=cleanFieldValue(f,f?.value);if(c)otherPrimary.add(norm(c));}

    for(const f of fields){
      const original=clean(f?.value);
      const primary=cleanFieldValue(f,original);
      const alts=(Array.isArray(f?.alternatives)?f.alternatives:[])
        .map(v=>cleanFieldValue(f,v))
        .filter(Boolean);
      const candidates=[primary,...alts].filter(Boolean);
      const dedup=[];const seen=new Set();
      for(const c of candidates){const k=norm(c);if(!k||seen.has(k))continue;seen.add(k);dedup.push(c)}

      let chosen=primary||dedup[0]||'';
      const chosenScore=quality(f,chosen,bars);
      const barcodeWinner=dedup
        .filter(c=>barcodeMatch(c,bars))
        .sort((a,b)=>quality(f,b,bars)-quality(f,a,bars))[0];
      if(barcodeWinner&&quality(f,barcodeWinner,bars)>chosenScore+25) chosen=barcodeWinner;

      const chosenNorm=norm(chosen);
      const cleanedAlts=dedup.filter(c=>{
        const k=norm(c);if(!k||k===chosenNorm)return false;
        // If this candidate is clearly another field's primary value, don't show it as an alternative here.
        if(otherPrimary.has(k)&&!norm(original).includes(k))return false;
        // Hide obvious OCR junk instead of frightening the operator with meaningless alternatives.
        if(quality(f,c,bars)<12)return false;
        return true;
      }).slice(0,2);

      f.value=chosen;
      f.alternatives=cleanedAlts;
      f.conflict=cleanedAlts.length>0;
    }
    return label;
  }

  function refineResult(result){
    if(!result?.labels?.length)return result;
    result.labels.forEach(refineLabel);
    return result;
  }

  function stateFor(field,barcodes){
    if(barcodeMatch(field?.value,barcodes))return['barcode','✅ 條碼確認'];
    if(Number(field?.repeat)>=2&&!field?.conflict)return['high','✓ 高可信'];
    if(field?.spatial&&!field?.conflict)return['medium','○ 可先整理'];
    return['pending','⚠️ 建議核對'];
  }

  function patchDom(result){
    const host=document.getElementById('analysisResult');if(!host||!result?.labels)return;
    const cards=[...host.querySelectorAll('.analysis-label-card')].filter(card=>card.querySelector('section h4'));
    result.labels.forEach((label,idx)=>{
      const card=cards[idx];if(!card)return;
      const sections=[...card.querySelectorAll('section')];
      const fieldSection=sections.find(s=>(s.querySelector('h4')?.textContent||'').includes('欄位內容'));
      const rows=[...(fieldSection?.querySelectorAll('tbody tr')||[])];
      (label.fields||[]).forEach((field,i)=>{
        const row=rows[i];if(!row)return;
        const cells=row.querySelectorAll('td');if(cells.length<3)return;
        const content=cells[1],status=cells[2];
        const strong=content.querySelector('strong');if(strong)strong.textContent=field.value;
        content.querySelectorAll('.analysis-alt').forEach(n=>n.remove());
        if(field.conflict&&field.alternatives?.length){
          const small=document.createElement('small');small.className='analysis-alt';small.textContent='另讀到：'+field.alternatives.join(' / ');content.appendChild(small);
        }
        const [cls,text]=stateFor(field,label.barcodes||[]);const badge=status.querySelector('.analysis-status');if(badge){badge.className='analysis-status '+cls;badge.textContent=text}
      });
    });
    window.LabelWorkbenchAnalysisCopy?.decorate?.();
  }

  function install(){
    const A=api();if(!A?.analyze||A.__accuracyWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){
      const result=await base(files);
      refineResult(result);
      patchDom(result);
      return result;
    };
    A.__accuracyWrapped=true;
    A.refineResult=refineResult;
    A.refineLabel=refineLabel;
    console.info('[Label Workbench] analysis accuracy guard',BUILD);
    return true;
  }
  if(!install()){
    let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer)},80);
  }
  window.LabelWorkbenchAnalysisAccuracy={BUILD,refineResult,refineLabel,cleanFieldValue,install};
})();
