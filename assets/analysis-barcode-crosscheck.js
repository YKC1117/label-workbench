/* Label Workbench barcode cross-check v1.0
 * Uses decoded barcode payloads as hard evidence for field values.
 * Exact barcode evidence may upgrade a field to barcode-confirmed.
 * Near-but-not-equal OCR candidates remain pending; this module never guesses a character.
 */
(function(){
  'use strict';
  const BUILD='20260914-barcode-crosscheck-100';
  const api=()=>window.LabelWorkbenchInterpreter;
  const CODES=['31P','30P','31T','33P','23L','24L','21L','16D','10D','1P','1T','1Y','2Y','4Y','Q'];
  const CODE_ALT=CODES.slice().sort((a,b)=>b.length-a.length).join('|');
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const rawBarcode=b=>String(b?.text??b?.value??b?.data??'');

  function splitRaw(raw){
    return String(raw||'')
      .replace(/(?:<GS>|\[GS\]|\{GS\}|␝)/gi,'\x1d')
      .replace(/(?:<RS>|\[RS\]|\{RS\}|␞)/gi,'\x1e')
      .replace(/\r?\n/g,'\x1d');
  }

  function extractCodeValues(code,barcode){
    const raw=splitRaw(rawBarcode(barcode));
    if(!raw)return[];
    const esc=String(code).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const out=[];
    // Handles explicit AI/data-identifier forms such as (1P)VALUE, 1P:VALUE, 1P VALUE,
    // and concatenated forms where the next known identifier terminates the value.
    const rx=new RegExp('(?:^|[\\x1d\\x1e#|;])\\s*\\(?'+esc+'\\)?\\s*[:=]?\\s*([A-Z0-9._\\/-]+?)(?=(?:\\x1d|\\x1e|#|\\||;|$))','ig');
    let m;while((m=rx.exec(raw))){const v=clean(m[1]);if(v)out.push(v)}
    const compactRx=new RegExp('(?:^|\\x1d|\\x1e|\\(|\\[|\\s)\\s*'+esc+'\\s*[\\)\\]]?\\s*[:=]?\\s*([A-Z0-9._\\/-]+?)(?=\\s*(?:\\(?'+CODE_ALT+'\\)?\\s*[:=]?|\\x1d|\\x1e|$))','ig');
    while((m=compactRx.exec(raw))){const v=clean(m[1]);if(v)out.push(v)}
    const seen=new Set();return out.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true});
  }

  function barcodeValues(code,barcodes){
    const out=[];for(const b of barcodes||[])out.push(...extractCodeValues(code,b));
    const seen=new Set();return out.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true});
  }

  function editDistance(a,b){
    const x=norm(a),y=norm(b);if(!x||!y)return 999;
    const prev=Array.from({length:y.length+1},(_,i)=>i);
    for(let i=1;i<=x.length;i++){
      const cur=[i];
      for(let j=1;j<=y.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
      for(let j=0;j<cur.length;j++)prev[j]=cur[j];
    }
    return prev[y.length];
  }

  function refineField(field,barcodes){
    const code=String(field?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!code)return field;
    const values=barcodeValues(code,barcodes);
    if(!values.length)return field;
    const current=String(field?.value||'').trim();
    const candidates=[current,...(Array.isArray(field?.alternatives)?field.alternatives:[])].map(clean).filter(Boolean);
    const exact=values.find(v=>candidates.some(c=>norm(c)===norm(v)));
    if(exact){
      field.value=exact;
      field.alternatives=(field.alternatives||[]).filter(v=>norm(v)!==norm(exact));
      field.barcodeVerified=true;
      field.__barcodeEvidence=exact;
      field.__barcodeEvidenceSource='decoded';
      field.__barcodeConflict=false;
      return field;
    }
    if(values.length===1){
      const only=values[0];
      field.value=only;
      field.alternatives=[];
      field.barcodeVerified=true;
      field.__barcodeEvidence=only;
      field.__barcodeEvidenceSource='decoded';
      field.__barcodeCorrectedFromOcr=!!current && norm(current)!==norm(only);
      field.__barcodeConflict=false;
      return field;
    }
    field.__barcodeConflict=true;
    field.__barcodeEvidence=values.join(' / ');
    field.__barcodeEvidenceSource='decoded-conflict';
    field.barcodeVerified=false;
    const merged=[...values,...(field.alternatives||[])];
    const seen=new Set();field.alternatives=merged.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true}).slice(0,3);
    return field;
  }

  function refineLabel(label){
    const bars=Array.isArray(label?.barcodes)?label.barcodes:[];
    for(const field of label?.fields||[])refineField(field,bars);
    return label;
  }
  function refineResult(result){for(const label of result?.labels||[])refineLabel(label);return result}

  function patchDom(result){
    const host=document.getElementById('analysisResult');if(!host||!result?.labels)return;
    const cards=[...host.querySelectorAll('.analysis-label-card')].filter(card=>card.querySelector('section h4'));
    result.labels.forEach((label,idx)=>{
      const card=cards[idx];if(!card)return;
      const section=[...card.querySelectorAll('section')].find(s=>(s.querySelector('h4')?.textContent||'').includes('欄位內容'));
      const rows=[...(section?.querySelectorAll('tbody tr')||[])];
      (label.fields||[]).forEach((f,i)=>{
        const cells=rows[i]?.querySelectorAll('td');if(!cells||cells.length<3)return;
        const content=cells[1],status=cells[2];
        const strong=content.querySelector('strong');if(strong)strong.textContent=f.value||'';
        content.querySelectorAll('.analysis-barcode-evidence').forEach(n=>n.remove());
        if(f.__barcodeEvidence){
          const small=document.createElement('small');small.className='analysis-barcode-evidence';
          small.textContent=f.__barcodeConflict?'條碼讀值：'+f.__barcodeEvidence:'條碼確認：'+f.__barcodeEvidence;
          content.appendChild(small);
        }
        const badge=status.querySelector('.analysis-status');
        if(badge){
          if(f.barcodeVerified){badge.className='analysis-status barcode';badge.textContent='✅ 條碼確認'}
          else if(f.__barcodeConflict){badge.className='analysis-status pending';badge.textContent='⚠️ 條碼有多組候選，待核對'}
        }
      });
    });
    window.LabelWorkbenchAnalysisCopy?.decorate?.();
  }

  function install(){
    const A=api();if(!A?.analyze||A.__barcodeCrosscheckWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){const result=await base(files);refineResult(result);patchDom(result);return result};
    A.__barcodeCrosscheckWrapped=true;
    console.info('[Label Workbench] barcode cross-check',BUILD);return true;
  }
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},80)}
  window.LabelWorkbenchBarcodeCrosscheck={BUILD,extractCodeValues,barcodeValues,editDistance,refineField,refineLabel,refineResult,install};
})();
