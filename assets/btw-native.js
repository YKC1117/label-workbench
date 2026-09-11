/* Label Workbench native editable BTW generator v0.4
 * PDF/image Quick Analysis -> BarTender 2022 R2 .btw.
 * Safety rule: never inject demo/fake values. Only real analyzed PDF/image values are written.
 */
(function(){
  'use strict';

  const BUILD='20260911-btwn320-safe-no-demo';
  const SEED_ID='LW-2022R2-100x65-SANITIZED';
  const SEED_SRC='assets/btw-seed-2022r2.js?v=20260911-local-seed-001';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let zipPromise=null, seedScriptPromise=null, seedPromise=null;

  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const normalizeFormat=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const barcodeText=b=>clean(b?.text??b?.value??b?.data??'');
  const fieldText=f=>clean(f?.value??f?.text??'');
  const fieldName=f=>clean(f?.name||f?.code||'欄位');
  const compact=s=>clean(s).slice(0,1800);
  function outputName(label,index=0){const base=safeFile(String(label?.sourceName||'Label').replace(/\.[^.]+$/,''));return`BT_Editable_${base}_L${String(index+1).padStart(2,'0')}.btw`}

  function allFields(label){
    const raw=(label?.fields||[])
      .map((f,i)=>({name:fieldName(f)||`欄位${i+1}`, value:fieldText(f)}))
      .filter(f=>f.value);
    if(raw.length) return raw.slice(0,40);
    const texts=(label?.texts||label?.ocr||[])
      .map((v,i)=>({name:`文字${i+1}`,value:clean(v)}))
      .filter(f=>f.value);
    return texts.slice(0,40);
  }
  function allBarcodes(label){
    return (label?.barcodes||[])
      .map((b,i)=>({format:clean(b?.format||b?.type||'Barcode'),value:barcodeText(b),index:i+1}))
      .filter(b=>b.value);
  }
  function fieldSummary(label){
    const lines=[];
    const src=clean(label?.sourceName||'');
    if(src) lines.push(`來源：${src}`);
    if(label?.page) lines.push(`頁數：${label.page}`);
    for(const f of allFields(label).slice(0,30)) lines.push(`${f.name}: ${f.value}`);
    for(const b of allBarcodes(label).slice(0,10)) lines.push(`${b.format}: ${b.value}`);
    return lines.join('\r').slice(0,4200);
  }
  function plan(label){
    const fields=allFields(label);
    const bars=allBarcodes(label);
    const c128=bars.filter(b=>/code128|c128/.test(normalizeFormat(b.format))).map(b=>b.value);
    const dm=bars.find(b=>/datamatrix|dm/.test(normalizeFormat(b.format)))?.value || '';
    const value1=c128[0] || fields[0]?.value || '';
    const value2=c128[1] || fields[1]?.value || '';
    const value3=fields.find(f=>/qty|數量|quantity|q$/i.test(f.name))?.value || fields[2]?.value || '';
    const otherBarcode=bars.find(b=>b.value!==value1&&b.value!==value2)?.value || '';
    const dmValue=dm || otherBarcode;
    const hasRealContent=fields.length>0 || bars.length>0;
    return {
      fields,bars,summary:fieldSummary(label),hasRealContent,
      label1:fields[0]?.name?`${fields[0].name}：`:'',
      label2:fields[1]?.name?`${fields[1].name}：`:'',
      label3:fields[2]?.name?`${fields[2].name}：`:'',
      value1,value2,value3,dmValue,
      hasCode128:c128.length>0,
      hasDm:!!dm,
      source:clean(label?.sourceName||''),
      kind: dm?'dm':(c128.length?'c128':(bars.length?'barcode':'text'))
    };
  }

  function loadScript(src,test,tag){
    if(test()) return Promise.resolve(test());
    return new Promise((resolve,reject)=>{
      const old=document.querySelector(`script[data-btw-native-loader="${tag}"]`);
      if(old) old.remove();
      const s=document.createElement('script');
      s.src=src+(src.includes('?')?'&':'?')+'t='+Date.now();
      s.async=false;
      s.dataset.btwNativeLoader=tag;
      s.onload=()=>test()?resolve(test()):reject(new Error(`${tag} 元件載入不完整`));
      s.onerror=()=>reject(new Error(`${tag} 元件載入失敗`));
      document.head.appendChild(s);
    });
  }
  async function ensureSeedApi(){
    if(window.LabelWorkbenchBtwSeed2022R2?.bytes) return window.LabelWorkbenchBtwSeed2022R2;
    if(seedScriptPromise) return seedScriptPromise;
    seedScriptPromise=loadScript(SEED_SRC,()=>window.LabelWorkbenchBtwSeed2022R2,'BTW seed').finally(()=>{seedScriptPromise=null});
    return seedScriptPromise;
  }
  async function fetchSeed(){
    if(seedPromise) return seedPromise;
    seedPromise=(async()=>{
      const api=await ensureSeedApi();
      if(api.ID!==SEED_ID) throw new Error('BTW 本機種子版本不正確');
      return api.bytes();
    })().catch(err=>{seedPromise=null; throw err});
    return seedPromise;
  }

  function addExact(reps,entries,text,value,limit=Infinity){
    let count=0;
    for(const e of entries){
      if(e.text===text && count<limit){ reps.push({entry:e,value:String(value??'')}); count++; }
    }
  }
  function addWhere(reps,entries,predicate,value,limit=Infinity){
    let count=0;
    for(const e of entries){
      if(predicate(e.text,e) && count<limit){ reps.push({entry:e,value:String(value??'')}); count++; }
    }
  }
  function applyReplacements(F,container,reps){
    let out=container;
    const seen=new Set();
    for(const r of reps.sort((a,b)=>b.entry.offset-a.entry.offset)){
      if(seen.has(r.entry.offset)) continue;
      seen.add(r.entry.offset);
      out=F.replaceStringAt(out,r.entry,r.value);
    }
    return out;
  }

  function scanTags(container){
    const data=container instanceof Uint8Array?container:new Uint8Array(container),out=[];
    for(let i=0;i+8<data.length;i++){
      if(data[i]!==0xff||data[i+1]!==0xff||data[i+2]!==0x01||data[i+3]!==0x00) continue;
      const len=data[i+4]|(data[i+5]<<8);
      if(len<3||len>80||i+6+len>data.length) continue;
      let ok=true;
      for(let j=0;j<len;j++){const b=data[i+6+j];if(b<0x20||b>0x7e){ok=false;break}}
      if(!ok) continue;
      const type=new TextDecoder('ascii').decode(data.slice(i+6,i+6+len));
      if(/Data$/i.test(type)) out.push({offset:i,type,nameLength:len,coordOffset:i+6+len});
    }
    return out;
  }
  function setI32(data,offset,value){
    if(offset<0||offset+4>data.length) return false;
    new DataView(data.buffer,data.byteOffset,data.byteLength).setInt32(offset,Math.trunc(value),true);
    return true;
  }
  function moveObjects(data,tags,type,x,y){
    let moved=0;
    for(const t of tags.filter(v=>v.type===type)){
      if(setI32(data,t.coordOffset,x)&&setI32(data,t.coordOffset+4,y)) moved++;
    }
    return moved;
  }

  function patchSeed(F,container,label){
    const data=new Uint8Array(container);
    const entries=F.scanUtf16Strings(data,{minLength:1,maxLength:5000});
    const tags=scanTags(data);
    const p=plan(label),reps=[];
    if(!p.hasRealContent) throw new Error('快速分析沒有辨識到可寫入 BTW 的實際文字或條碼；已停止產生，避免塞入假資料。');

    // Captions. Blank if we cannot identify a real field name.
    addExact(reps,entries,'(1P) PART NO :',p.label1,1);
    addExact(reps,entries,'(1T) LOT NO :',p.label2,1);
    addExact(reps,entries,'(Q)QTY:',p.label3,2);

    // Replace seed placeholders only with values actually read from this analysis.
    addExact(reps,entries,'LW_PART_VALUE',compact(p.value1),5);
    addExact(reps,entries,'PART00000001',compact(p.value1),5);
    addExact(reps,entries,'LW_LOT_VALUE',compact(p.value2),5);
    addExact(reps,entries,'LOT000001',compact(p.value2),5);
    addExact(reps,entries,'LW_QTY_VALUE',compact(p.value3),5);
    addExact(reps,entries,'0001',compact(p.value3),2);
    addExact(reps,entries,'LOT00000100',compact(p.value3),2);

    // Barcode values. If a real barcode was not detected, hide barcode objects instead of inventing data.
    addExact(reps,entries,'LW_DM_VALUE',compact(p.dmValue),10);
    addWhere(reps,entries,text=>/^LWDM\|PART00000001\|LOT000001\|/.test(text),compact(p.dmValue),10);
    if(!p.hasDm && !p.dmValue) moveObjects(data,tags,'BcDatamatrixData',50000,50000);
    if(!p.hasCode128) moveObjects(data,tags,'BcC128Data',50000,50000);

    // Source / note fields are only production reminders, not fake label data.
    addExact(reps,entries,'Label_Workbench_Source.pdf',compact(p.source),2);
    addWhere(reps,entries,text=>/範本檔\.pdf$/.test(text)||/Label_Workbench_Source\.pdf$/.test(text),compact(p.source),2);
    addExact(reps,entries,'NOTE',p.source?`來源：${compact(p.source)}`:'',2);
    addExact(reps,entries,'COMPLIANT','請依客戶原稿確認尺寸與內容',2);
    addExact(reps,entries,'文字範例',p.summary,4);

    const patched=applyReplacements(F,data,reps);
    return {container:patched,summary:p.summary,plan:p,replacements:reps.length,seed:SEED_ID};
  }

  async function generateOne(label,index=0){
    const F=window.LabelWorkbenchBtwFormat;
    if(!F?.parseStructure||!F?.inflateContainer||!F?.rebuild) throw new Error('BTW 原生格式元件尚未載入');
    const seed=await fetchSeed();
    const parsed=F.parseStructure(seed);
    if(parsed.header?.applicationVersion!=='2022 R2'||!/^2022/.test(parsed.header?.compatibleVersion||'')) throw new Error('BTW 本機種子不是 BarTender 2022 R2/R1 相容格式');
    const container=await F.inflateContainer(parsed);
    const patched=patchSeed(F,container,label);
    const rebuilt=await F.rebuild(parsed,patched.container);
    const check=F.parseStructure(rebuilt);
    const round=await F.inflateContainer(check);
    const strings=F.scanUtf16Strings(round,{minLength:1,maxLength:5000});
    const expected=[patched.plan.value1,patched.plan.value2,patched.plan.value3,patched.plan.dmValue].map(compact).filter(Boolean);
    if(expected.length && !expected.some(v=>strings.some(e=>e.text===v))) throw new Error('BTW 實際資料寫入驗證失敗');
    if(!expected.length && !strings.some(e=>e.text===patched.summary)) throw new Error('BTW 文字摘要寫入驗證失敗');
    return {name:outputName(label,index),bytes:rebuilt,kind:patched.plan.kind,summary:patched.summary,barcodeValue:patched.plan.dmValue,replacements:patched.replacements,header:check.header,seed:SEED_ID};
  }

  function loadZip(){
    if(window.JSZip) return Promise.resolve(window.JSZip);
    if(zipPromise) return zipPromise;
    zipPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=JSZIP_SRC; s.async=true; s.crossOrigin='anonymous';
      s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));
      s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));
      document.head.appendChild(s);
    });
    return zipPromise;
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800)}
  async function downloadFromAnalysis(result,files,onProgress){
    const labels=(result?.labels||[]).slice(0,20);
    if(!labels.length) throw new Error('目前沒有可建立 BTW 的分析結果');
    const outputs=[];
    for(let i=0;i<labels.length;i++){
      onProgress?.(`正在建立 BarTender 2022 可編輯 BTW ${i+1}/${labels.length}`);
      outputs.push(await generateOne(labels[i],i));
    }
    if(outputs.length===1){
      downloadBlob(new Blob([outputs[0].bytes],{type:'application/octet-stream'}),outputs[0].name);
      return{ok:true,type:'btw',count:1,outputs};
    }
    const JSZip=await loadZip(),zip=new JSZip();
    for(const out of outputs) zip.file(out.name,out.bytes);
    zip.file('README.txt','Label Workbench 只會寫入 PDF/圖片快速分析實際辨識到的文字或條碼；沒有辨識到的內容會留空或不產生，不會塞入測試假資料。請用 BarTender 開啟後確認尺寸、位置、條碼內容，再列印。');
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    const base=safeFile(String(labels[0]?.sourceName||files?.[0]?.name||'Label').replace(/\.[^.]+$/,''));
    downloadBlob(blob,`BT_Editable_${base}.zip`);
    return{ok:true,type:'zip',count:outputs.length,outputs};
  }

  window.LabelWorkbenchBtwNative={BUILD,SEED_ID,seedSource:SEED_SRC,fetchSeed,fieldSummary,plan,patchSeed,generateOne,downloadFromAnalysis,scanTags};
})();