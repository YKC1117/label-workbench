/* Label Workbench native editable BTW generator v0.1
 * Quick Analysis -> native BarTender .btw candidate with editable Text/Code128/DataMatrix objects.
 * Uses public Seagull samples only as runtime format seeds; customer data stays in the browser.
 */
(function(){
  'use strict';

  const BUILD='20260910-btwn100';
  const SEEDS={
    c128:'https://raw.githubusercontent.com/Seagull-Scientific/bartender-cloud-api/main/Sample_Doc1.btw',
    dm:'https://support.seagullsoftware.com/hc/en-us/article_attachments/360011164514'
  };
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let zipPromise=null;

  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const normalizeFormat=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function barcodeKind(label){
    const rows=label?.barcodes||[];
    if(rows.some(b=>/datamatrix/.test(normalizeFormat(b?.format))))return'dm';
    if(rows.some(b=>/code128|c128/.test(normalizeFormat(b?.format))))return'c128';
    return'text';
  }
  function supportedBarcode(label,kind){
    const rows=label?.barcodes||[];
    if(kind==='dm')return rows.find(b=>/datamatrix/.test(normalizeFormat(b?.format)))||null;
    if(kind==='c128')return rows.find(b=>/code128|c128/.test(normalizeFormat(b?.format)))||null;
    return null;
  }
  function fieldLabel(f){return`${f?.code?`(${f.code}) `:''}${String(f?.name||'FIELD').trim()}`}
  function fieldSummary(label){
    const lines=(label?.fields||[]).filter(f=>String(f?.value??'').trim()).slice(0,24).map(f=>`${fieldLabel(f)}: ${String(f.value).trim()}`);
    if(!lines.length)lines.push('Label Workbench');
    return lines.join('\r').slice(0,3600);
  }
  function outputName(label,index=0){const base=safeFile(String(label?.sourceName||'Label').replace(/\.[^.]+$/,''));return`BT_Editable_${base}_L${String(index+1).padStart(2,'0')}.btw`}

  function scanTags(container){
    const data=container instanceof Uint8Array?container:new Uint8Array(container),out=[];
    for(let i=0;i+8<data.length;i++){
      if(data[i]!==0xff||data[i+1]!==0xff||data[i+2]!==0x01||data[i+3]!==0x00)continue;
      const len=data[i+4]|(data[i+5]<<8);if(len<3||len>80||i+6+len>data.length)continue;
      let ok=true;for(let j=0;j<len;j++){const b=data[i+6+j];if(b<0x20||b>0x7e){ok=false;break}}if(!ok)continue;
      const type=new TextDecoder('ascii').decode(data.slice(i+6,i+6+len));
      if(/Data$/i.test(type))out.push({offset:i,type,nameLength:len,coordOffset:i+6+len});
    }
    return out;
  }
  function topObjectEnd(tags,index,length){for(let i=index+1;i<tags.length;i++)if(/^(?:TextData|Bc|PictureData|BackgroundData)/.test(tags[i].type))return tags[i].offset;return length}
  function tagRange(tags,type,length){const i=tags.findIndex(t=>t.type===type);if(i<0)return null;return{tag:tags[i],start:tags[i].offset,end:topObjectEnd(tags,i,length)}}
  function setI32(data,offset,value){if(offset<0||offset+4>data.length)return false;new DataView(data.buffer,data.byteOffset,data.byteLength).setInt32(offset,Math.trunc(value),true);return true}
  function moveObject(data,tags,type,x,y){const t=tags.find(v=>v.type===type);if(!t)return false;setI32(data,t.coordOffset,x);setI32(data,t.coordOffset+4,y);return true}

  function findEntries(F,container,predicate){return F.scanUtf16Strings(container,{minLength:1,maxLength:5000}).filter(predicate)}
  function applyReplacements(F,container,replacements){let out=container;for(const r of replacements.sort((a,b)=>b.entry.offset-a.entry.offset))out=F.replaceStringAt(out,r.entry,r.value);return out}
  function entriesIn(entries,range,pred){return entries.filter(e=>e.offset>=range.start&&e.offset<range.end&&pred(e))}

  function patchCode128(F,container,label){
    const data=new Uint8Array(container),tags=scanTags(data),textRange=tagRange(tags,'TextData',data.length),bcRange=tagRange(tags,'BcC128Data',data.length),entries=F.scanUtf16Strings(data,{minLength:1,maxLength:5000}),summary=fieldSummary(label),barcode=supportedBarcode(label,'c128'),value=String(barcode?.text||'').trim(),rep=[];
    if(!textRange||!bcRange)throw new Error('Code 128 BTW 種子缺少原生文字或條碼物件');
    const ndsOne=entries.find(e=>e.text==='NDS_One'),ndsTwo=entries.find(e=>e.text==='NDS_Two');
    const preText=entries.filter(e=>e.offset<textRange.start&&e.text==='Sample Text');if(preText.length)rep.push({entry:preText[preText.length-1],value:summary});
    if(ndsOne&&ndsTwo){for(const e of entries.filter(e=>e.offset>ndsTwo.offset&&e.offset<ndsOne.offset&&e.text==='12345678'))rep.push({entry:e,value:value||'LW_NO_BARCODE'})}
    const textName=entriesIn(entries,textRange,e=>e.text==='Text 1')[0];if(textName)rep.push({entry:textName,value:'LW_FIELDS'});
    const bcName=entriesIn(entries,bcRange,e=>e.text==='Barcode 1')[0];if(bcName)rep.push({entry:bcName,value:'LW_CODE128'});
    moveObject(data,tags,'TextData',180,180);if(value)moveObject(data,tags,'BcC128Data',180,2500);else moveObject(data,tags,'BcC128Data',50000,50000);
    return{container:applyReplacements(F,data,rep),kind:'c128',summary,barcodeValue:value};
  }

  function patchDataMatrix(F,container,label){
    const data=new Uint8Array(container),tags=scanTags(data),dmRange=tagRange(tags,'BcDatamatrixData',data.length),textRange=tagRange(tags,'TextData',data.length),entries=F.scanUtf16Strings(data,{minLength:1,maxLength:5000}),summary=fieldSummary(label),barcode=supportedBarcode(label,'dm'),value=String(barcode?.text||'').trim(),rep=[];
    if(!dmRange||!textRange)throw new Error('Data Matrix BTW 種子缺少原生文字或條碼物件');
    const dmValue=entriesIn(entries,dmRange,e=>e.text==='barcodes are fun :)')[0];if(!dmValue)throw new Error('找不到 Data Matrix 原生資料欄位');rep.push({entry:dmValue,value:value||'LW_NO_BARCODE'});
    const dmName=entriesIn(entries,dmRange,e=>e.text==='Barcode 2')[0];if(dmName)rep.push({entry:dmName,value:'LW_DATAMATRIX'});
    const visibleText=entriesIn(entries,textRange,e=>/^Scan with your\s/i.test(e.text))[0];if(visibleText)rep.push({entry:visibleText,value:summary});
    const textNames=entriesIn(entries,textRange,e=>/^Text [12]$/.test(e.text));if(textNames[0])rep.push({entry:textNames[0],value:'LW_FIELDS'});if(textNames[1])rep.push({entry:textNames[1],value:'LW_BARCODE_TEXT'});
    for(const e of entriesIn(entries,textRange,e=>e.text==='123456789104'))rep.push({entry:e,value:value||'NO BARCODE'});
    moveObject(data,tags,'BcDatamatrixData',120,120);moveObject(data,tags,'TextData',1100,180);moveObject(data,tags,'PictureData',50000,50000);
    return{container:applyReplacements(F,data,rep),kind:'dm',summary,barcodeValue:value};
  }

  function patchTextOnly(F,container,label){const patched=patchCode128(F,container,{...label,barcodes:[]});patched.kind='text';patched.barcodeValue='';return patched}

  async function fetchSeed(kind){const url=kind==='dm'?SEEDS.dm:SEEDS.c128,r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`無法取得 BarTender 原生格式種子 (${r.status})`);return r.arrayBuffer()}
  async function generateOne(label,index=0){
    const F=window.LabelWorkbenchBtwFormat;if(!F?.parseStructure||!F?.inflateContainer||!F?.rebuild)throw new Error('BTW 原生格式元件尚未載入');
    const kind=barcodeKind(label),seedKind=kind==='dm'?'dm':'c128',seed=await fetchSeed(seedKind),parsed=F.parseStructure(seed),container=await F.inflateContainer(parsed),patched=kind==='dm'?patchDataMatrix(F,container,label):kind==='c128'?patchCode128(F,container,label):patchTextOnly(F,container,label),rebuilt=await F.rebuild(parsed,patched.container),check=F.parseStructure(rebuilt),round=await F.inflateContainer(check),strings=F.scanUtf16Strings(round,{minLength:1,maxLength:5000});
    if(!strings.some(e=>e.text===patched.summary))throw new Error('BTW 原生文字驗證失敗');
    if(patched.barcodeValue&&!strings.some(e=>e.text===patched.barcodeValue))throw new Error('BTW 原生條碼資料驗證失敗');
    return{name:outputName(label,index),bytes:rebuilt,kind:patched.kind,summary:patched.summary,barcodeValue:patched.barcodeValue,header:check.header};
  }

  function loadZip(){if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)});return zipPromise}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800)}
  async function downloadFromAnalysis(result,files,onProgress){
    const labels=(result?.labels||[]).slice(0,20);if(!labels.length)throw new Error('目前沒有可建立 BTW 的分析結果');
    const outputs=[];for(let i=0;i<labels.length;i++){onProgress?.(`正在建立可編輯 BTW ${i+1}/${labels.length}`);outputs.push(await generateOne(labels[i],i))}
    if(outputs.length===1){downloadBlob(new Blob([outputs[0].bytes],{type:'application/octet-stream'}),outputs[0].name);return{ok:true,type:'btw',count:1,outputs}}
    const JSZip=await loadZip(),zip=new JSZip();for(const out of outputs)zip.file(out.name,out.bytes);zip.file('README.txt','Each .btw is a native BarTender document candidate generated from Quick Analysis. Open it in BarTender and verify/edit text and barcode objects before printing.');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),base=safeFile(String(labels[0]?.sourceName||files?.[0]?.name||'Label').replace(/\.[^.]+$/,''));downloadBlob(blob,`BT_Editable_${base}.zip`);return{ok:true,type:'zip',count:outputs.length,outputs}
  }

  window.LabelWorkbenchBtwNative={BUILD,SEEDS,barcodeKind,supportedBarcode,fieldSummary,scanTags,tagRange,patchCode128,patchDataMatrix,generateOne,downloadFromAnalysis};
})();
