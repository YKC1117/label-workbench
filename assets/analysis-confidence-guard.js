/* Label Workbench final confidence guard v1.1
 * Final pass after OCR/barcode/cross-field refinements.
 * Prevents short, conflicting, empty, or cross-field-contaminated values from being presented as fully confirmed.
 */
(function(){
  'use strict';
  const BUILD='20260911-confidence-guard-110-candidate-cleanup';
  const api=()=>window.LabelWorkbenchInterpreter;
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tokenName=f=>String(f?.name||'').toUpperCase().trim();
  const CANONICAL=['PART NO','LOT NO','SHAPE','GP','QTY','DATE NO','ASSY','DATE','MLOT NO','BIN','MC','VC','P1','P2','4Y','SERIAL','MODEL'];
  const tokenField=f=>/PART|LOT|MLOT|SERIAL|MODEL|ASSY|SHAPE|BIN|DATE|QTY|GP|MC|VC/.test(tokenName(f))||!!String(f?.code||'').trim();
  const noisy=v=>{const s=String(v||'').trim();return !s||/[\u3400-\u9fff]/.test(s)||(/\s/.test(s)&&s.split(/\s+/).length>=3)||(/[(){}]/.test(s)&&s.length>10)};
  const same=(a,b)=>{const x=norm(a),y=norm(b);return !!x&&x===y};

  function candidateLooksLikeSuffixNoise(main,candidate){
    const a=norm(main),b=norm(candidate);if(!a||!b||!b.startsWith(a)||b===a)return false;
    const tail=b.slice(a.length);
    return tail.length<=4&&/^[A-Z]+$/.test(tail);
  }

  function fragmentName(name){
    const n=String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(n.length<2||n.length>4)return false;
    return CANONICAL.some(x=>{const c=x.replace(/[^A-Z0-9]/g,'');return c!==n&&c.endsWith(n)});
  }

  function refine(result){
    for(const label of result?.labels||[]){
      const fields=label?.fields||[];
      const codedNames=new Set(fields.filter(f=>String(f?.code||'').trim()).map(f=>tokenName(f)));
      const mainValues=fields.map(f=>({field:f,value:norm(f?.value)})).filter(x=>x.value);

      for(const f of fields){
        const main=norm(f.value);
        const name=tokenName(f);
        const code=String(f?.code||'').trim();

        // Hide obvious OCR label-name fragments (e.g. ATE from DATE), and uncoded duplicates
        // when a proper coded field with the same canonical name already exists.
        f.__finalHidden=(!code&&fragmentName(name))||(!code&&codedNames.has(name));

        if(Array.isArray(f.alternatives)){
          const seen=new Set();
          f.alternatives=f.alternatives.filter(v=>{
            const nv=norm(v);if(!nv||seen.has(nv))return false;seen.add(nv);
            if(tokenField(f)&&noisy(v))return false;
            if(main&&nv===main)return false;
            if(candidateLooksLikeSuffixNoise(f.value,v))return false;
            // A candidate identical to another field's accepted main value is almost always
            // a neighbouring-field leak (e.g. MLOT leaking into LOT).
            if(mainValues.some(x=>x.field!==f&&x.value===nv))return false;
            return true;
          }).slice(0,2);
          f.conflict=f.alternatives.length>0;
        }

        f.__finalShortBarcode=!!((f.barcodeVerified||f.barcodeAligned)&&main.length>0&&main.length<=2);
        if(f.__finalShortBarcode)f.barcodeVerified=false;
        f.__finalEmpty=!main;
      }
    }
    return result;
  }

  function stateFor(f){
    if(f?.__finalEmpty)return['pending','⚠️ 未確認'];
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
        const row=rows[i];if(!row)return;
        if(f.__finalHidden){row.remove();return;}
        const cells=row.querySelectorAll('td');if(cells.length<3)return;
        const content=cells[1],status=cells[2],strong=content.querySelector('strong');
        if(strong)strong.textContent=f.value||'';
        content.querySelectorAll('.analysis-alt').forEach(n=>n.remove());
        if(f.conflict&&f.alternatives?.length){const s=document.createElement('small');s.className='analysis-alt';s.textContent='另讀到：'+f.alternatives.join(' / ');content.appendChild(s)}
        const badge=status.querySelector('.analysis-status');if(badge){const [cls,text]=stateFor(f);badge.className='analysis-status '+cls;badge.textContent=text}
      });
    });
  }

  function stripHidden(result){
    for(const label of result?.labels||[])if(Array.isArray(label.fields))label.fields=label.fields.filter(f=>!f.__finalHidden);
    return result;
  }

  function install(){
    const A=api();if(!A?.analyze||A.__finalConfidenceWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){const result=await base(files);refine(result);patchDom(result);stripHidden(result);return result};
    A.__finalConfidenceWrapped=true;
    console.info('[Label Workbench] final confidence guard',BUILD);return true;
  }
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},80)}
  window.LabelWorkbenchConfidenceGuard={BUILD,refine,stateFor,install};
})();
