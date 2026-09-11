/* Label Workbench analysis accuracy guard v1.3
 * Field-aware OCR cleanup, boundary isolation and barcode validation.
 * Important:
 * - A value is only "條碼確認" when the barcode segment belongs to the SAME field code.
 * - OCR text that leaks into the next data identifier is cut at that boundary and downgraded for review.
 * - Repeated OCR alone must be stronger before it can be labelled high confidence.
 */
(function(){
  'use strict';
  const BUILD='20260911-analysis-accuracy-130-boundary-strict';
  const api=()=>window.LabelWorkbenchInterpreter;
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const KNOWN_CODES=['31P','30P','31T','33P','23L','24L','21L','16D','10D','1P','1T','1Y','2Y','4Y','Q'];

  function escapeRx(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
  function fuzzyChar(ch){
    if(ch==='1') return '[1IL|]';
    if(ch==='0') return '[0O]';
    return escapeRx(ch);
  }
  function fuzzyCodePattern(code){
    const chars=code.split('');
    if(chars[0]==='1') return '[1IL|]\\s*[IL|]?\\s*'+chars.slice(1).map(fuzzyChar).join('\\s*');
    return chars.map(fuzzyChar).join('\\s*');
  }
  const FUZZY_CODE_ALT=KNOWN_CODES.map(fuzzyCodePattern).join('|');
  const EXACT_CODE_ALT=KNOWN_CODES.slice().sort((a,b)=>b.length-a.length).map(escapeRx).join('|');
  const TAIL_CODE_RX=new RegExp('\\s*(?:[#＃]+|[\\(\\[]\\s*)(?:'+FUZZY_CODE_ALT+')(?:\\s*[\\)\\]])?\\s*.*$','i');
  const EMBEDDED_CODE_RX=new RegExp('(?:[#＃]+|[¦|]+|[\\(\\[]\\s*|\\s{2,})(?:'+EXACT_CODE_ALT+')(?:\\s*[\\)\\]])?','i');

  function findForeignBoundary(field,value){
    const own=String(field?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const s=String(value??'');
    if(!s)return null;
    const rx=new RegExp('(?:[#＃]+|[¦|]+|[\\(\\[]\\s*|\\s{2,})('+EXACT_CODE_ALT+')(?:\\s*[\\)\\]])?','ig');
    let m;
    while((m=rx.exec(s))){
      const code=String(m[1]||'').toUpperCase();
      if(code&&code!==own){
        return {index:m.index,code,raw:m[0]};
      }
      if(rx.lastIndex===m.index)rx.lastIndex++;
    }
    return null;
  }

  function trimForeignTail(field,value){
    let s=clean(value).replace(/[¦|]+/g,' ').replace(/\s*[;；:,，]+\s*$/,'').trim();
    const hit=findForeignBoundary(field,s);
    if(hit&&hit.index>0)s=s.slice(0,hit.index).trim();
    return s;
  }

  function compactTokenValue(value,field){
    let s=clean(value).replace(/[¦|]+/g,' ').replace(/\s*[;；:,，]+\s*$/,'').trim();
    if(field)s=trimForeignTail(field,s);
    else s=s.replace(TAIL_CODE_RX,'').trim();
    const m=s.match(/^([A-Z0-9][A-Z0-9._\/-]{5,})(?:\s+(.+))?$/i);
    if(m&&m[2]){
      const tail=m[2].trim(),pieces=tail.split(/\s+/).filter(Boolean);
      const junk=pieces.length&&pieces.every(x=>x.length<=2||/^[;:,.()[\]{}'"`~!?\-]+$/.test(x)||/^[\u3400-\u9fff]$/.test(x));
      if(junk)s=m[1];
    }
    return s.replace(/\s+/g,' ').trim();
  }

  function fieldCode(field){return String(field?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
  function fieldKind(field){return fieldCode(field)||norm(field?.name)}
  function tokenField(field){return /PART|LOT|SERIAL|MODEL|ASSY|SHAPE|BIN|DATE|QTY|MLOT|^1P$|^1T$|^Q$/.test(fieldKind(field))}
  function cleanFieldValue(field,value){
    let s=compactTokenValue(value,field);
    if(tokenField(field)){
      const m=s.match(/^([A-Z0-9][A-Z0-9._\/-]{0,})(?:\s+.+)?$/i);
      if(m&&/\s/.test(s)){
        const first=m[1],rest=s.slice(first.length).trim();
        const noisy=/^(?:[()\[\]{};:,.!?'"`~\-]|[A-Z0-9]{1,2}|[\u3400-\u9fff])(?:\s+(?:[()\[\]{};:,.!?'"`~\-]|[A-Z0-9]{1,2}|[\u3400-\u9fff]))*$/i.test(rest);
        if(noisy)s=first;
      }
    }
    return s;
  }

  function rawBarcodeText(barcode){return String(barcode?.text??barcode?.value??barcode?.data??'')}
  function normalizedBarcodeParts(raw){
    let s=String(raw||'')
      .replace(/(?:<GS>|\[GS\]|\{GS\}|␝)/gi,'\x1d')
      .replace(/(?:<RS>|\[RS\]|\{RS\}|␞)/gi,'\x1e');
    // Some scanners/renderers expose printed # separators instead of GS. Treat # as a separator
    // only when it is immediately followed by a known data identifier.
    s=s.replace(new RegExp('#(?=(?:'+EXACT_CODE_ALT+'))','ig'),'\x1d');
    return s
      .split(/[\x1d\x1e\x04]+/)
      .map(x=>clean(x).replace(/^\]>[A-Z0-9]{0,6}/i,'').replace(/^RS\s*0?6/i,'').trim())
      .filter(Boolean);
  }
  function codeRegex(code){
    return new RegExp('^(?:[\\(\\[]\\s*)?'+escapeRx(code)+'(?:\\s*[\\)\\]])?\\s*[:=]?\\s*(.+)$','i');
  }
  function extractCodeValuesFromBarcode(code,barcode){
    if(!code)return[];
    const raw=rawBarcodeText(barcode),out=[];
    for(const part of normalizedBarcodeParts(raw)){
      const m=part.match(codeRegex(code));
      if(m){const v=compactTokenValue(m[1]);if(v)out.push(v)}
    }
    const boundary='(?:^|[\\x1d\\x1e\\x04]|#(?='+EXACT_CODE_ALT+'))';
    const stop='(?=[\\x1d\\x1e\\x04]|#(?='+EXACT_CODE_ALT+')|$)';
    const rx=new RegExp(boundary+'\\s*(?:[\\(\\[]\\s*)?'+escapeRx(code)+'(?:\\s*[\\)\\]])?\\s*[:=]?\\s*([^\\x1d\\x1e\\x04#]+?)'+stop,'ig');
    let m;while((m=rx.exec(raw))){const v=compactTokenValue(m[1]);if(v)out.push(v)}
    const seen=new Set();return out.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true});
  }
  function codeValues(field,barcodes=[]){
    const code=fieldCode(field);if(!code)return[];
    const out=[];for(const b of barcodes)out.push(...extractCodeValuesFromBarcode(code,b));
    const seen=new Set();return out.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true});
  }
  function allCodedValues(barcodes=[]){
    const map=new Map();
    for(const code of KNOWN_CODES){
      const vals=[];for(const b of barcodes)vals.push(...extractCodeValuesFromBarcode(code,b));
      const seen=new Set(),uniq=vals.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true});
      if(uniq.length)map.set(code,uniq);
    }
    return map;
  }

  function genericBarcodeMatch(value,barcodes=[]){
    const v=norm(value);if(v.length<4)return false;
    return barcodes.some(b=>{
      const t=norm(rawBarcodeText(b));
      return t&&(t===v||(v.includes(t)&&t.length>=6));
    });
  }
  function barcodeMatch(field,value,barcodes=[]){
    const v=norm(value);if(v.length<1)return false;
    const code=fieldCode(field);
    if(code){
      return codeValues(field,barcodes).some(x=>norm(x)===v);
    }
    return genericBarcodeMatch(value,barcodes);
  }

  function quality(field,value,barcodes=[]){
    const s=cleanFieldValue(field,value),n=norm(s);if(!n)return-999;
    let score=Math.min(30,n.length);
    if(barcodeMatch(field,s,barcodes))score+=180;
    if(/^[A-Z0-9._\/-]+$/i.test(s))score+=24;
    if(/\s/.test(s))score-=10;
    if(/[;；]/.test(s))score-=14;
    if(/[\u3400-\u9fff]/.test(s)&&tokenField(field))score-=18;
    if(findForeignBoundary(field,value))score-=80;
    return score;
  }

  function chooseCodedWinner(field,candidates,barcodes){
    const exact=codeValues(field,barcodes);
    if(!exact.length)return'';
    const candidateNorms=new Set(candidates.map(norm));
    const matched=exact.find(v=>candidateNorms.has(norm(v)));
    return matched||exact[0];
  }

  function refineLabel(label){
    const fields=Array.isArray(label?.fields)?label.fields:[];
    const bars=Array.isArray(label?.barcodes)?label.barcodes:[];
    const coded=allCodedValues(bars);

    for(const f of fields){
      const originalPrimary=String(f?.value??'');
      const originalAlts=Array.isArray(f?.alternatives)?f.alternatives.map(v=>String(v??'')):[];
      const primaryBoundary=findForeignBoundary(f,originalPrimary);
      const altBoundaries=originalAlts.map(v=>findForeignBoundary(f,v)).filter(Boolean);
      const primary=cleanFieldValue(f,originalPrimary);
      const alts=originalAlts.map(v=>cleanFieldValue(f,v)).filter(Boolean);
      const candidates=[primary,...alts].filter(Boolean);
      const dedup=[],seen=new Set();
      for(const c of candidates){const k=norm(c);if(!k||seen.has(k))continue;seen.add(k);dedup.push(c)}

      let chosen=primary||dedup[0]||'';
      const codedWinner=chooseCodedWinner(f,dedup,bars);
      if(codedWinner)chosen=codedWinner;
      else if(dedup.length)chosen=dedup.slice().sort((a,b)=>quality(f,b,bars)-quality(f,a,bars))[0];

      const chosenNorm=norm(chosen),myCode=fieldCode(f);
      const otherCodeValues=new Set();
      for(const [code,vals] of coded.entries())if(code!==myCode)for(const v of vals)otherCodeValues.add(norm(v));

      const cleanedAlts=dedup.filter(c=>{
        const k=norm(c);if(!k||k===chosenNorm)return false;
        if(otherCodeValues.has(k))return false;
        if(findForeignBoundary(f,c))return false;
        if(quality(f,c,bars)<12)return false;
        return true;
      }).slice(0,2);

      f.value=chosen;
      f.alternatives=cleanedAlts;
      f.conflict=cleanedAlts.length>0;
      f.barcodeVerified=barcodeMatch(f,chosen,bars);
      f.__boundaryTrimmed=!!(primaryBoundary||altBoundaries.length);
      f.__boundaryCode=primaryBoundary?.code||altBoundaries[0]?.code||'';
      if(f.barcodeVerified){f.__boundaryTrimmed=false;f.__boundaryCode=''}
    }
    return label;
  }

  function refineResult(result){if(!result?.labels?.length)return result;result.labels.forEach(refineLabel);return result}
  function stateFor(field,barcodes){
    if(barcodeMatch(field,field?.value,barcodes))return['barcode','✅ 條碼確認'];
    if(field?.__boundaryTrimmed)return['pending','⚠️ 邊界修正待核對'];
    if(field?.conflict)return['pending','⚠️ 有異讀待核對'];
    if(Number(field?.repeat)>=3)return['high','✓ 高可信'];
    if(Number(field?.repeat)>=2&&field?.spatial)return['medium','○ 可先整理'];
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
        content.querySelectorAll('.analysis-alt,.analysis-boundary-note').forEach(n=>n.remove());
        if(field.conflict&&field.alternatives?.length){const small=document.createElement('small');small.className='analysis-alt';small.textContent='另讀到：'+field.alternatives.join(' / ');content.appendChild(small)}
        if(field.__boundaryTrimmed){const small=document.createElement('small');small.className='analysis-boundary-note';small.textContent='已排除疑似下一欄 '+(field.__boundaryCode?`(${field.__boundaryCode})`:'')+' 的混入內容';content.appendChild(small)}
        const [cls,text]=stateFor(field,label.barcodes||[]),badge=status.querySelector('.analysis-status');if(badge){badge.className='analysis-status '+cls;badge.textContent=text}
      });
    });
    window.LabelWorkbenchAnalysisCopy?.decorate?.();
  }

  function install(){
    const A=api();if(!A?.analyze||A.__accuracyWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){const result=await base(files);refineResult(result);patchDom(result);return result};
    A.__accuracyWrapped=true;
    A.refineResult=refineResult;A.refineLabel=refineLabel;A.cleanFieldValue=cleanFieldValue;A.extractCodeValuesFromBarcode=extractCodeValuesFromBarcode;A.findForeignBoundary=findForeignBoundary;
    console.info('[Label Workbench] analysis accuracy guard',BUILD);return true;
  }
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer)},80)}
  window.LabelWorkbenchAnalysisAccuracy={BUILD,refineResult,refineLabel,cleanFieldValue,extractCodeValuesFromBarcode,findForeignBoundary,install};
})();
