/* Label Workbench barcode cross-check v1.0
 * Uses decoded barcode payloads as hard evidence for field values.
 * Exact barcode evidence may upgrade a field to barcode-confirmed.
 * Near-but-not-equal OCR candidates remain pending; this module never guesses a character.
 */
(function(){
  'use strict';
  const BUILD='20260918-barcode-crosscheck-108-clear-stale-ocr';
  const api=()=>window.LabelWorkbenchInterpreter;
  const CODES=['31P','30P','31T','33P','23L','24L','21L','16D','10D','1P','1T','1Y','2Y','4Y','Q'];
  const CODE_ALT=CODES.slice().sort((a,b)=>b.length-a.length).join('|');
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const rawBarcode=b=>String(b?.text??b?.value??b?.data??'');
  function splitRaw(raw){return String(raw||'').replace(/(?:<GS>|\[GS\]|\{GS\}|␝)/gi,'\x1d').replace(/(?:<RS>|\[RS\]|\{RS\}|␞)/gi,'\x1e').replace(/\r?\n/g,'\x1d')}
  function uniq(values){const seen=new Set();return values.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true})}
  function isSuffixOfLongerCode(raw,index,code){return CODES.some(other=>other.length>code.length&&other.endsWith(code)&&raw.slice(index-(other.length-code.length),index+code.length).toUpperCase()===other)}
  function extractCodeValues(code,barcode){
    const raw=splitRaw(rawBarcode(barcode));if(!raw)return[];
    const normalizedCode=String(code).toUpperCase();
    const esc=normalizedCode.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const compact=[];
    // Parse separatorless payloads by marker positions, e.g. 1Pvalue1Tvalue.
    // Skip suffix matches inside longer known AIs such as 1P inside 31P.
    const targetRx=new RegExp(esc,'ig');
    const markerRx=new RegExp(CODE_ALT,'ig');
    let m;
    while((m=targetRx.exec(raw))){
      if(isSuffixOfLongerCode(raw,m.index,normalizedCode))continue;
      const start=m.index+m[0].length;
      markerRx.lastIndex=start;
      const next=markerRx.exec(raw);
      const rest=raw.slice(start);
      const sep=rest.search(/[\x1d\x1e]/);
      const sepEnd=sep>=0?start+sep:raw.length;
      const end=next?Math.min(next.index,sepEnd):sepEnd;
      const v=clean(raw.slice(start,end).replace(/^[\s\(\)\]\:=]+|[\s\(\)\]\:=]+$/g,''));
      if(v)compact.push(v);
    }
    if(compact.length)return uniq(compact);
    const delimited=[];
    const rx=new RegExp('(?:^|[\\x1d\\x1e#|;])\\s*\\(?'+esc+'\\)?\\s*[:=]?\\s*([A-Z0-9._\\/-]+?)(?=(?:\\x1d|\\x1e|#|\\||;|$))','ig');
    while((m=rx.exec(raw))){const v=clean(m[1]);if(v)delimited.push(v)}
    return uniq(delimited);
  }
  function barcodeValues(code,barcodes){const out=[];for(const b of barcodes||[])out.push(...extractCodeValues(code,b));return uniq(out)}
  function syncCorrectedTextObjects(label,beforeValue,afterValue){
    const before=clean(beforeValue),after=clean(afterValue),beforeNorm=norm(before),afterNorm=norm(after);
    if(!before||!after||beforeNorm===afterNorm)return 0;
    const needle=before.toLowerCase();let changed=0;
    for(const obj of label?.textObjects||[]){
      const raw=String(obj?.text||'');if(!raw)continue;
      if(norm(raw)===beforeNorm){obj.text=after;changed++;continue}
      const at=raw.toLowerCase().indexOf(needle);
      if(at>=0){obj.text=raw.slice(0,at)+after+raw.slice(at+before.length);changed++}
    }
    return changed
  }
  function editDistance(a,b){const x=norm(a),y=norm(b);if(!x||!y)return 999;const prev=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){const cur=[i];for(let j=1;j<=y.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));for(let j=0;j<cur.length;j++)prev[j]=cur[j]}return prev[y.length]}
  function refineField(field,barcodes){
    const code=String(field?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!code)return field;
    const values=barcodeValues(code,barcodes);if(!values.length)return field;
    const current=String(field?.value||'').trim();const candidates=[current,...(Array.isArray(field?.alternatives)?field.alternatives:[])].map(clean).filter(Boolean);
    const exact=values.find(v=>candidates.some(c=>norm(c)===norm(v)));
    if(exact){field.value=exact;field.alternatives=[];field.conflict=false;field.barcodeVerified=true;field.__barcodeEvidence=exact;field.__barcodeEvidenceSource='decoded';field.__barcodeConflict=false;field.__barcodeCorrectedFromOcr=!!current&&norm(current)!==norm(exact);return field}
    if(values.length===1){const only=values[0];field.value=only;field.alternatives=[];field.barcodeVerified=true;field.__barcodeEvidence=only;field.__barcodeEvidenceSource='decoded';field.__barcodeCorrectedFromOcr=!!current&&norm(current)!==norm(only);field.__barcodeConflict=false;return field}
    field.__barcodeConflict=true;field.__barcodeEvidence=values.join(' / ');field.__barcodeEvidenceSource='decoded-conflict';field.barcodeVerified=false;
    const merged=[...values,...(field.alternatives||[])];field.alternatives=uniq(merged).slice(0,3);return field;
  }
  function refineLabel(label){
    const bars=Array.isArray(label?.barcodes)?label.barcodes:[];
    for(const field of label?.fields||[]){
      const before=String(field?.value||'');
      refineField(field,bars);
      if(field?.__barcodeCorrectedFromOcr&&before&&String(field?.value||''))syncCorrectedTextObjects(label,before,field.value)
    }
    return label
  }
  function refineResult(result){for(const label of result?.labels||[])refineLabel(label);return result}
  function patchDom(result){
    const host=document.getElementById('analysisResult');if(!host||!result?.labels)return;
    const cards=[...host.querySelectorAll('.analysis-label-card')].filter(card=>card.querySelector('section h4'));
    result.labels.forEach((label,idx)=>{const card=cards[idx];if(!card)return;const section=[...card.querySelectorAll('section')].find(s=>(s.querySelector('h4')?.textContent||'').includes('欄位內容'));const rows=[...(section?.querySelectorAll('tbody tr')||[])];(label.fields||[]).forEach((f,i)=>{const cells=rows[i]?.querySelectorAll('td');if(!cells||cells.length<3)return;const content=cells[1],status=cells[2];const strong=content.querySelector('strong');if(strong)strong.textContent=f.value||'';content.querySelectorAll('.analysis-barcode-evidence').forEach(n=>n.remove());if(f.__barcodeEvidence){const small=document.createElement('small');small.className='analysis-barcode-evidence';small.textContent=f.__barcodeConflict?'條碼讀值：'+f.__barcodeEvidence:'條碼確認：'+f.__barcodeEvidence;content.appendChild(small)}const badge=status.querySelector('.analysis-status');if(badge){if(f.barcodeVerified){badge.className='analysis-status barcode';badge.textContent='✅ 條碼確認'}else if(f.__barcodeConflict){badge.className='analysis-status pending';badge.textContent='⚠️ 條碼有多組候選，待核對'}}})});
    window.LabelWorkbenchAnalysisCopy?.decorate?.();
  }
  function install(){const A=api();if(!A?.analyze||A.__barcodeCrosscheckWrapped)return false;const base=A.analyze.bind(A);A.analyze=async function(files){const result=await base(files);refineResult(result);patchDom(result);return result};A.__barcodeCrosscheckWrapped=true;console.info('[Label Workbench] barcode cross-check',BUILD);return true}
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},80)}
  window.LabelWorkbenchBarcodeCrosscheck={BUILD,extractCodeValues,barcodeValues,syncCorrectedTextObjects,editDistance,refineField,refineLabel,refineResult,install};
})();
