/* Label Workbench PDF native-text assist v1.0
 * For PDFs with a real text layer, use the PDF's own text as higher-confidence evidence than OCR.
 * Scanned/image PDFs still fall back to the existing OCR + barcode pipeline.
 */
(function(){
  'use strict';
  const BUILD='20260911-pdf-native-100';
  const PDF_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
  const api=()=>window.LabelWorkbenchInterpreter;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const ext=f=>(f?.name?.split('.').pop()||'').toLowerCase();
  let pdfPromise=null;

  async function pdfjs(){
    if(globalThis.__LABEL_PDFJS)return globalThis.__LABEL_PDFJS;
    if(!pdfPromise)pdfPromise=import(PDF_SRC).then(m=>{globalThis.__LABEL_PDFJS=m;return m});
    return pdfPromise;
  }

  function textItemsToLines(items=[]){
    const raw=items
      .filter(i=>clean(i?.str))
      .map(i=>({
        text:String(i.str),
        x:Number(i.transform?.[4]||0),
        y:Number(i.transform?.[5]||0),
        w:Number(i.width||0),
        h:Math.max(1,Math.abs(Number(i.height||i.transform?.[3]||10)))
      }))
      .sort((a,b)=>b.y-a.y||a.x-b.x);
    const lines=[];
    for(const item of raw){
      let line=lines.find(l=>Math.abs(l.y-item.y)<=Math.max(2.5,Math.min(8,(l.h+item.h)*.30)));
      if(!line){line={y:item.y,h:item.h,items:[]};lines.push(line)}
      line.items.push(item);line.h=Math.max(line.h,item.h);
    }
    lines.sort((a,b)=>b.y-a.y);
    return lines.map(line=>{
      const arr=line.items.sort((a,b)=>a.x-b.x);let text='',lastRight=null,lastH=10;
      for(const item of arr){
        if(lastRight!==null){const gap=item.x-lastRight;if(gap>Math.max(1.5,lastH*.18))text+=' '}
        text+=item.text;lastRight=item.x+Math.max(0,item.w);lastH=item.h||lastH;
      }
      return{y:line.y,text:clean(text)};
    }).filter(l=>l.text);
  }

  function parsedFieldsByLine(lines,A){
    const out=[];
    for(const line of lines){
      const fields=A.parseFields?.(line.text)||[];
      for(const f of fields){
        const value=clean(f?.value);if(!value)continue;
        out.push({...f,value,y:line.y,__nativePdf:true});
      }
    }
    return out;
  }

  function fieldKey(f){return String(f?.code||'').toUpperCase()||norm(f?.name)}
  function splitGroups(rows=[]){
    const groups=[];let current=[],seen=new Set();
    for(const row of rows){
      const key=fieldKey(row);if(!key)continue;
      const restart=current.length>=4&&(key==='1P'||seen.has(key));
      if(restart){groups.push(current);current=[];seen=new Set()}
      current.push(row);seen.add(key);
    }
    if(current.length)groups.push(current);
    return groups.filter(g=>g.length);
  }

  function valueSimilarity(a,b){
    const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 10;
    if((x.includes(y)||y.includes(x))&&Math.min(x.length,y.length)>=5)return 5;
    let same=0;for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]===y[i])same++;
    return same/Math.max(x.length,y.length)>=.75?2:0;
  }
  function groupScore(label,group){
    let score=0;
    const existing=new Map((label?.fields||[]).map(f=>[fieldKey(f),f]));
    for(const nf of group){
      const old=existing.get(fieldKey(nf));if(!old)continue;
      score+=1+valueSimilarity(old.value,nf.value);
      for(const alt of old.alternatives||[])score+=valueSimilarity(alt,nf.value)*.7;
    }
    return score;
  }

  function assignGroups(labels,groups){
    if(!labels.length||!groups.length)return new Map();
    const map=new Map();
    if(labels.length===groups.length){labels.forEach((l,i)=>map.set(l,groups[i]));return map}
    const used=new Set();
    for(const label of labels){
      let best=-1,bestScore=-1;
      groups.forEach((g,i)=>{if(used.has(i))return;const s=groupScore(label,g);if(s>bestScore){bestScore=s;best=i}});
      if(best>=0){map.set(label,groups[best]);used.add(best)}
    }
    return map;
  }

  function mergeNativeFields(label,nativeFields){
    if(!label||!nativeFields?.length)return label;
    const fields=Array.isArray(label.fields)?label.fields:(label.fields=[]);
    const byKey=new Map(fields.map(f=>[fieldKey(f),f]));
    for(const nf of nativeFields){
      const key=fieldKey(nf);if(!key)continue;
      const old=byKey.get(key);
      if(old){
        const oldValue=clean(old.value);
        old.value=nf.value;
        old.__nativePdfValue=nf.value;
        old.nativeTextVerified=true;
        old.repeat=Math.max(Number(old.repeat||0),3);
        old.spatial=true;
        old.conflict=false;
        old.alternatives=[];
        if(oldValue&&norm(oldValue)!==norm(nf.value))old.__ocrValue=oldValue;
      }else{
        const added={code:nf.code||'',name:nf.name||key,value:nf.value,__nativePdfValue:nf.value,repeat:3,spatial:true,conflict:false,alternatives:[],nativeTextVerified:true};
        fields.push(added);byKey.set(key,added);
      }
    }
    label.nativePdfText=true;
    return label;
  }

  async function extractPdfEvidence(file,result,A){
    const P=await pdfjs(),pdf=await P.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const labels=(result?.labels||[]).filter(l=>l.sourceName===file.name);
    if(!labels.length)return 0;
    let merged=0;
    const pageLimit=Math.min(pdf.numPages,3);
    for(let p=1;p<=pageLimit;p++){
      const page=await pdf.getPage(p),tc=await page.getTextContent({includeMarkedContent:false});
      const lines=textItemsToLines(tc.items||[]);
      if(lines.length<2)continue;
      const rows=parsedFieldsByLine(lines,A);
      if(!rows.length)continue;
      const groups=splitGroups(rows);
      const pageLabels=labels.filter(l=>Number(l.page||1)===p);
      if(!pageLabels.length)continue;
      const assigned=assignGroups(pageLabels,groups.length?groups:[rows]);
      for(const label of pageLabels){
        const group=assigned.get(label);if(!group?.length)continue;
        mergeNativeFields(label,group);merged+=group.length;
      }
    }
    return merged;
  }

  function nativeBarcodeState(field,barcodes=[]){
    const acc=window.LabelWorkbenchAnalysisAccuracy;
    const code=String(field?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!code||typeof acc?.extractCodeValuesFromBarcode!=='function')return{matched:false,conflict:false,values:[]};
    const values=[];
    for(const b of barcodes){
      try{values.push(...(acc.extractCodeValuesFromBarcode(code,b)||[]))}catch{}
    }
    const seen=new Set(),uniq=values.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true});
    const target=norm(field?.__nativePdfValue||field?.value);
    return{matched:uniq.some(v=>norm(v)===target),conflict:uniq.length>0&&!uniq.some(v=>norm(v)===target),values:uniq};
  }

  function patchDom(result){
    const host=document.getElementById('analysisResult');if(!host||!result?.labels)return;
    const cards=[...host.querySelectorAll('.analysis-label-card')].filter(card=>card.querySelector('section h4'));
    result.labels.forEach((label,idx)=>{
      const card=cards[idx];if(!card)return;
      const section=[...card.querySelectorAll('section')].find(s=>(s.querySelector('h4')?.textContent||'').includes('欄位內容'));
      const rows=[...(section?.querySelectorAll('tbody tr')||[])];
      (label.fields||[]).forEach((field,i)=>{
        if(!field.nativeTextVerified)return;
        const cells=rows[i]?.querySelectorAll('td');if(!cells||cells.length<3)return;
        const nativeValue=field.__nativePdfValue||field.value;
        field.value=nativeValue;
        field.alternatives=[];field.conflict=false;
        const state=nativeBarcodeState(field,label.barcodes||[]);
        field.barcodeVerified=state.matched;
        field.nativeBarcodeConflict=state.conflict;
        const strong=cells[1].querySelector('strong');if(strong)strong.textContent=nativeValue;
        cells[1].querySelectorAll('.analysis-alt').forEach(n=>n.remove());
        const badge=cells[2].querySelector('.analysis-status');
        if(badge){
          if(state.matched){badge.className='analysis-status barcode';badge.textContent='✅ PDF 原文＋條碼'}
          else if(state.conflict){badge.className='analysis-status pending';badge.textContent='⚠️ 原文／條碼不一致'}
          else{badge.className='analysis-status high';badge.textContent='✓ PDF 原文'}
        }
      });
    });
    window.LabelWorkbenchAnalysisCopy?.decorate?.();
  }

  async function refine(files,result){
    const A=api();if(!A||!result?.labels?.length)return result;
    const pdfs=[...(files||[])].filter(f=>ext(f)==='pdf');
    let count=0;
    for(const file of pdfs){
      try{count+=await extractPdfEvidence(file,result,A)}
      catch(err){console.warn('[Label Workbench] native PDF text assist skipped',file?.name,err)}
    }
    if(count){result.nativePdfFields=count;patchDom(result)}
    return result;
  }

  function install(){
    const A=api();if(!A?.analyze||A.__pdfNativeWrapped)return false;
    const base=A.analyze.bind(A);
    A.analyze=async function(files){const result=await base(files);return refine(files,result)};
    A.__pdfNativeWrapped=true;
    A.refineWithPdfText=refine;
    console.info('[Label Workbench] PDF native-text assist',BUILD);return true;
  }
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer)},80)}
  window.LabelWorkbenchPdfNative={BUILD,refine,extractPdfEvidence,textItemsToLines,splitGroups,mergeNativeFields,nativeBarcodeState,patchDom,install};
})();
