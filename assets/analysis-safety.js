/* Label Workbench analysis safety guard v1.0
 * 目標：寧可待確認，也不要把不確定候選當正式答案。
 * 修正 Data Matrix / 條碼內容以 # + 欄位代碼串接時，值被吃到下一欄的問題。
 */
(function(){
  'use strict';
  const BUILD='20260911-analysis-safety-100';
  const CODES=['31P','30P','31T','33P','23L','24L','21L','16D','10D','1P','1T','1Y','2Y','4Y','Q'];
  const CODE_ALT=CODES.slice().sort((a,b)=>b.length-a.length).join('|');
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const fieldCode=f=>String(f?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const boundaryRx=new RegExp('\\s*#\\s*(?:'+CODE_ALT+')(?=[A-Z0-9]|\\s|$).*$','i');

  function trimAtNextCode(value){
    let s=clean(value)
      .replace(/(?:<GS>|\[GS\]|\{GS\}|␝)/gi,'\x1d')
      .replace(/(?:<RS>|\[RS\]|\{RS\}|␞)/gi,'\x1e');
    s=s.replace(boundaryRx,'');
    const ctrl=s.search(/[\x1d\x1e\x04]/);
    if(ctrl>=0)s=s.slice(0,ctrl);
    return clean(s).replace(/^[\s:：=._-]+|[\s;；:,，|¦]+$/g,'').trim();
  }

  function rawBarcodeText(b){return String(b?.text??b?.value??b?.data??'')}

  function extractCodedValues(code,barcodes=[]){
    if(!code)return[];
    const out=[];
    const start=new RegExp('(?:^|[#\\x1d\\x1e\\x04])\\s*'+code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[:=]?\\s*','ig');
    for(const b of barcodes){
      const raw=rawBarcodeText(b)
        .replace(/(?:<GS>|\[GS\]|\{GS\}|␝)/gi,'\x1d')
        .replace(/(?:<RS>|\[RS\]|\{RS\}|␞)/gi,'\x1e');
      let m;
      while((m=start.exec(raw))){
        const rest=raw.slice(start.lastIndex);
        const stop=rest.search(new RegExp('(?:[#\\x1d\\x1e\\x04])\\s*(?:'+CODE_ALT+')(?=[A-Z0-9]|\\s|$)','i'));
        const value=trimAtNextCode(stop>=0?rest.slice(0,stop):rest);
        if(value)out.push(value);
        if(start.lastIndex===m.index)start.lastIndex++;
      }
    }
    const seen=new Set();
    return out.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true});
  }

  function candidateList(field){
    const raw=[field?.value,...(Array.isArray(field?.alternatives)?field.alternatives:[])];
    const out=[],seen=new Set();
    for(const v of raw){
      const c=trimAtNextCode(v),k=norm(c);
      if(!k||seen.has(k))continue;
      seen.add(k);out.push(c);
    }
    return out;
  }

  function refineField(field,barcodes=[]){
    const candidates=candidateList(field);
    const code=fieldCode(field);
    const coded=extractCodedValues(code,barcodes);
    let confirmed='';

    if(coded.length===1){
      confirmed=coded[0];
      field.barcodeVerified=true;
    }else if(coded.length>1){
      const overlap=coded.find(v=>candidates.some(c=>norm(c)===norm(v)));
      if(overlap){confirmed=overlap;field.barcodeVerified=true}
    }

    if(!confirmed&&candidates.length===1)confirmed=candidates[0];

    if(confirmed){
      field.value=confirmed;
      field.alternatives=candidates.filter(v=>norm(v)!==norm(confirmed)).slice(0,3);
      field.conflict=field.alternatives.length>0&&!field.barcodeVerified;
      field.needsReview=field.conflict;
      if(field.conflict){
        field.candidates=[confirmed,...field.alternatives];
        field.value='';
      }else field.candidates=[];
    }else if(candidates.length){
      field.value='';
      field.alternatives=[];
      field.candidates=candidates.slice(0,4);
      field.conflict=true;
      field.needsReview=true;
      field.barcodeVerified=false;
    }else{
      field.value='';field.alternatives=[];field.candidates=[];field.conflict=false;field.needsReview=true;field.barcodeVerified=false;
    }
    return field;
  }

  function refineResult(result){
    for(const label of result?.labels||[]){
      const bars=Array.isArray(label?.barcodes)?label.barcodes:[];
      for(const field of label?.fields||[])refineField(field,bars);
    }
    return result;
  }

  function stateFor(field){
    if(field?.barcodeVerified)return['barcode','✅ 條碼確認'];
    if(field?.needsReview||field?.conflict)return['pending','⚠️ 待確認'];
    if(Number(field?.repeat)>=2)return['high','✓ 高可信'];
    if(field?.spatial)return['medium','○ 可先整理'];
    return['pending','⚠️ 待確認'];
  }

  function patchDom(result){
    const host=document.getElementById('analysisResult');if(!host||!result?.labels)return;
    const cards=[...host.querySelectorAll('.analysis-label-card')].filter(card=>card.querySelector('section h4'));
    result.labels.forEach((label,idx)=>{
      const card=cards[idx];if(!card)return;
      const fieldSection=[...card.querySelectorAll('section')].find(s=>(s.querySelector('h4')?.textContent||'').includes('欄位內容'));
      const rows=[...(fieldSection?.querySelectorAll('tbody tr')||[])];
      (label.fields||[]).forEach((field,i)=>{
        const row=rows[i];if(!row)return;
        const cells=row.querySelectorAll('td');if(cells.length<3)return;
        const content=cells[1],status=cells[2];
        const strong=content.querySelector('strong');
        if(strong)strong.textContent=field.value||'待確認';
        content.querySelectorAll('.analysis-alt,.analysis-candidates').forEach(n=>n.remove());
        const choices=field.candidates?.length?field.candidates:(field.alternatives||[]);
        if(choices.length){
          const small=document.createElement('small');
          small.className='analysis-candidates';
          small.textContent='候選：'+choices.join(' / ');
          content.appendChild(small);
        }
        const [cls,text]=stateFor(field),badge=status.querySelector('.analysis-status');
        if(badge){badge.className='analysis-status '+cls;badge.textContent=text}
      });
    });
    window.LabelWorkbenchAnalysisCopy?.decorate?.();
  }

  function install(){
    const A=window.LabelWorkbenchInterpreter;
    if(!A?.analyze||A.__safetyWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){
      const result=await base(files);
      refineResult(result);
      patchDom(result);
      return result;
    };
    A.__safetyWrapped=true;
    A.analysisSafety={BUILD,trimAtNextCode,extractCodedValues,refineResult};
    console.info('[Label Workbench] analysis safety guard',BUILD);
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>200)clearInterval(timer)},80);
  }
  window.LabelWorkbenchAnalysisSafety={BUILD,trimAtNextCode,extractCodedValues,refineResult,install};
})();
