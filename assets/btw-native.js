/* Label Workbench native editable BTW generator v0.2.2
 * Quick Analysis -> native BarTender .btw with editable Text / Code 128 / Data Matrix objects.
 * Structural seed: Seagull Scientific's official CEALabelCode-128.btw (BarTender 2022 R5),
 * fetched through the fixed btw-seed CORS proxy. Customer label values are patched locally in the browser.
 */
(function(){
  'use strict';

  const BUILD='20260911-btwn220-geometry-safe-c128';
  const SEED_ID='CEA-2022-R5';
  const SEED_FUNCTION='btw-seed';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const CEA_DEFAULTS={serial:'MH80312',part:'F100200300400AP',cage:'1U2R7'};
  const DM_FIXED=['«GS»','17V','S','1P','«RS»«EOT»'];
  let zipPromise=null,seedPromise=null;

  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const normalizeFormat=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const barcodeText=b=>String(b?.text??b?.value??'').trim();
  const isDm=b=>/datamatrix/.test(normalizeFormat(b?.format));
  const isC128=b=>/code128|c128/.test(normalizeFormat(b?.format));
  function barcodeKind(label){
    const rows=label?.barcodes||[],dm=rows.some(b=>isDm(b)&&barcodeText(b)),c128=rows.some(b=>isC128(b)&&barcodeText(b));
    if(dm&&c128)return'mixed';if(dm)return'dm';if(c128)return'c128';return'text';
  }
  function supportedBarcodes(label,kind){
    const rows=label?.barcodes||[];
    if(kind==='dm')return rows.filter(b=>isDm(b)&&barcodeText(b));
    if(kind==='c128')return rows.filter(b=>isC128(b)&&barcodeText(b));
    return[];
  }
  function supportedBarcode(label,kind){return supportedBarcodes(label,kind)[0]||null}
  function unsupportedBarcodes(label){return(label?.barcodes||[]).filter(b=>barcodeText(b)&&!isDm(b)&&!isC128(b))}
  function fieldLabel(f){return`${f?.code?`(${f.code}) `:''}${String(f?.name||'FIELD').trim()}`}
  function fieldSummary(label){
    const lines=(label?.fields||[]).filter(f=>String(f?.value??'').trim()).slice(0,28).map(f=>`${fieldLabel(f)}: ${String(f.value).trim()}`);
    if(!lines.length)lines.push('Label Workbench');
    return lines.join('\r').slice(0,4200);
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
  function entriesIn(entries,range,pred=()=>true){return entries.filter(e=>e.offset>=range.start&&e.offset<range.end&&pred(e))}
  function addReplacement(map,entry,value){if(entry)map.set(entry.offset,{entry,value:String(value??'')})}
  function addAll(map,entries,value){for(const e of entries)addReplacement(map,e,value)}
  function applyReplacements(F,container,map){let out=container;for(const r of[...map.values()].sort((a,b)=>b.entry.offset-a.entry.offset))out=F.replaceStringAt(out,r.entry,r.value);return out}
  function setI32(data,offset,value){if(offset<0||offset+4>data.length)return false;new DataView(data.buffer,data.byteOffset,data.byteLength).setInt32(offset,Math.trunc(value),true);return true}
  function getI32(data,offset){if(offset<0||offset+4>data.length)return null;return new DataView(data.buffer,data.byteOffset,data.byteLength).getInt32(offset,true)}
  function moveTopObject(data,tags,type,x,y){const t=tags.find(v=>v.type===type);if(!t)return false;return setI32(data,t.coordOffset,x)&&setI32(data,t.coordOffset+4,y)}
  function topObjectPosition(data,tags,type){const t=tags.find(v=>v.type===type);if(!t)return null;return{xMil:getI32(data,t.coordOffset),yMil:getI32(data,t.coordOffset+4)}}
  function sourceBarcodeLayout(label,kind){
    const L=window.LabelWorkbenchBtwLayout,row=supportedBarcode(label,kind);
    if(!L?.boxToLayout||!row?.sourceBox)return null;
    try{return L.boxToLayout(row.sourceBox)}catch{return null}
  }

  function sourcePlan(label){
    const dmRows=supportedBarcodes(label,'dm'),c128Rows=supportedBarcodes(label,'c128'),unsupported=unsupportedBarcodes(label);
    if(unsupported.length)throw new Error(`目前原生 BTW 尚不支援：${unsupported.map(b=>b.format||'未知條碼').join('、')}`);
    if(dmRows.length>1)throw new Error('單張標籤目前最多建立 1 個原生 Data Matrix；已保留 PNG 製作備援');
    if(c128Rows.length>1)throw new Error('目前已驗證的 CEA 種子只有 1 個獨立 Code 128 物件；多支 Code 128 請先使用 PNG／BarTender 人工製作備援');
    const dm=barcodeText(dmRows[0]),c128=c128Rows.map(barcodeText);
    const named={part:c128[0]||'',serial:'',cage:''};
    return{dm,c128,named,kind:barcodeKind(label)};
  }

  function patchCea(F,container,label){
    const data=new Uint8Array(container),tags=scanTags(data),textRange=tagRange(tags,'TextData',data.length),dmRange=tagRange(tags,'BcDatamatrixData',data.length),c128Range=tagRange(tags,'BcC128Data',data.length);
    if(!textRange||!dmRange||!c128Range)throw new Error('官方 CEA BTW 種子缺少文字、Data Matrix 或 Code 128 原生物件');
    const entries=F.scanUtf16Strings(data,{minLength:1,maxLength:6000}),summary=fieldSummary(label),plan=sourcePlan(label),rep=new Map(),globalRange={start:0,end:textRange.start};
    const layout={dataMatrix:sourceBarcodeLayout(label,'dm'),code128:sourceBarcodeLayout(label,'c128')};

    addAll(rep,entriesIn(entries,globalRange,e=>e.text===CEA_DEFAULTS.part),plan.named.part);
    addAll(rep,entriesIn(entries,globalRange,e=>e.text===CEA_DEFAULTS.serial),plan.named.serial);
    addAll(rep,entriesIn(entries,globalRange,e=>e.text===CEA_DEFAULTS.cage),plan.named.cage);

    const summaryEntry=entriesIn(entries,textRange,e=>e.text==='(17V) MFR ID CAGE')[0];
    if(!summaryEntry)throw new Error('找不到官方 CEA 文字資料欄位');
    addReplacement(rep,summaryEntry,summary);
    addReplacement(rep,entriesIn(entries,textRange,e=>e.text==='Text 1')[0],'LW_FIELDS');
    addAll(rep,entriesIn(entries,textRange,e=>e.text==='(S) '),'');

    const dmPrefix=entriesIn(entries,dmRange,e=>e.text==='[)>«RS»06«GS»')[0];
    if(!dmPrefix)throw new Error('找不到官方 CEA Data Matrix 主資料欄位');
    addReplacement(rep,dmPrefix,plan.dm);
    for(const token of DM_FIXED)addAll(rep,entriesIn(entries,dmRange,e=>e.text===token),'');
    addAll(rep,entriesIn(entries,dmRange,e=>e.text==='SERIAL'||e.text==='PART'),'');
    addReplacement(rep,entriesIn(entries,dmRange,e=>e.text==='Barcode 1')[0],plan.dm?'LW_DATAMATRIX':'LW_DATAMATRIX_UNUSED');
    if(plan.dm&&layout.dataMatrix?.mil)moveTopObject(data,tags,'BcDatamatrixData',layout.dataMatrix.mil.x,layout.dataMatrix.mil.y);
    else if(!plan.dm)moveTopObject(data,tags,'BcDatamatrixData',50000,50000);

    const names=[
      ['Barcode 4',plan.named.part?'LW_CODE128_01':'LW_CODE128_UNUSED_01'],
      ['Barcode 3','LW_CODE128_UNUSED_02'],
      ['Barcode 2','LW_CODE128_UNUSED_03']
    ];
    for(const[n,v]of names)addReplacement(rep,entriesIn(entries,c128Range,e=>e.text===n)[0],v);
    addAll(rep,entriesIn(entries,c128Range,e=>e.text==='(1P) SPLR PART'),'');
    if(plan.c128[0]&&layout.code128?.mil)moveTopObject(data,tags,'BcC128Data',layout.code128.mil.x,layout.code128.mil.y);
    else if(!plan.c128[0])moveTopObject(data,tags,'BcC128Data',50000,50000);

    return{container:applyReplacements(F,data,rep),summary,plan,layout,seed:SEED_ID};
  }

  function seedEndpoint(){
    const cfg=window.LABEL_WORKBENCH_CLOUD||window.LabelWorkbenchCloudConfig||{};
    const base=String(cfg.url||'').replace(/\/$/,'');
    if(!base||!String(cfg.key||'').startsWith('sb_publishable_'))throw new Error('BTW 官方種子連線設定未載入');
    return{url:`${base}/functions/v1/${SEED_FUNCTION}`,key:String(cfg.key)};
  }
  async function fetchSeed(){
    if(seedPromise)return seedPromise;
    seedPromise=(async()=>{
      const ep=seedEndpoint(),r=await fetch(ep.url,{cache:'force-cache',headers:{apikey:ep.key}});
      if(!r.ok)throw new Error(`無法取得官方 BarTender 2022 種子 (${r.status})`);
      if(r.headers.get('x-label-workbench-seed')!==SEED_ID)throw new Error('BTW 官方種子版本驗證失敗');
      const bytes=await r.arrayBuffer(),head=new TextDecoder('latin1').decode(new Uint8Array(bytes).slice(0,900)).replace(/\0/g,'');
      if(!/Bar Tender Format File/.test(head)||!/Application:\s*Version=2022 R5/.test(head)||!/Document:\s*CompatibleVersion=2022/.test(head))throw new Error('BTW 官方種子不是已驗證的 2022 R5 格式');
      return bytes;
    })().catch(err=>{seedPromise=null;throw err});
    return seedPromise;
  }

  async function generateOne(label,index=0){
    const F=window.LabelWorkbenchBtwFormat;if(!F?.parseStructure||!F?.inflateContainer||!F?.rebuild)throw new Error('BTW 原生格式元件尚未載入');
    const seed=await fetchSeed(),parsed=F.parseStructure(seed);
    if(parsed.header?.applicationVersion!=='2022 R5'||parsed.header?.compatibleVersion!=='2022')throw new Error('BTW 種子版本不是 BarTender 2022 R5');
    const container=await F.inflateContainer(parsed),patched=patchCea(F,container,label),rebuilt=await F.rebuild(parsed,patched.container),check=F.parseStructure(rebuilt),round=await F.inflateContainer(check),strings=F.scanUtf16Strings(round,{minLength:1,maxLength:6000}),types=scanTags(round).map(x=>x.type);
    for(const type of['TextData','BcDatamatrixData','BcC128Data'])if(!types.includes(type))throw new Error(`BTW 原生物件驗證失敗：${type}`);
    if(!strings.some(e=>e.text===patched.summary))throw new Error('BTW 原生文字驗證失敗');
    if(patched.plan.dm&&!strings.some(e=>e.text===patched.plan.dm))throw new Error('BTW Data Matrix 資料驗證失敗');
    for(const value of patched.plan.c128)if(value&&!strings.some(e=>e.text===value))throw new Error('BTW Code 128 資料驗證失敗');
    if(check.header?.applicationVersion!=='2022 R5'||check.header?.compatibleVersion!=='2022')throw new Error('BTW 重建後版本驗證失敗');
    return{name:outputName(label,index),bytes:rebuilt,kind:patched.plan.kind,summary:patched.summary,barcodeValue:patched.plan.dm||patched.plan.c128[0]||'',barcodes:{dataMatrix:patched.plan.dm,code128:patched.plan.c128},layout:patched.layout,header:check.header,seed:SEED_ID};
  }

  function loadZip(){if(window.JSZip)return Promise.resolve(window.JSZip);if(zipPromise)return zipPromise;zipPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSZIP_SRC;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));document.head.appendChild(s)});return zipPromise}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800)}
  async function downloadFromAnalysis(result,files,onProgress){
    const labels=(result?.labels||[]).slice(0,20);if(!labels.length)throw new Error('目前沒有可建立 BTW 的分析結果');
    const outputs=[];for(let i=0;i<labels.length;i++){onProgress?.(`正在建立 BarTender 2022 可編輯 BTW ${i+1}/${labels.length}`);outputs.push(await generateOne(labels[i],i))}
    if(outputs.length===1){downloadBlob(new Blob([outputs[0].bytes],{type:'application/octet-stream'}),outputs[0].name);return{ok:true,type:'btw',count:1,outputs}}
    const JSZip=await loadZip(),zip=new JSZip();for(const out of outputs)zip.file(out.name,out.bytes);zip.file('README.txt','These BTW files preserve native editable Text, Data Matrix and Code 128 objects from Seagull Scientific\'s official BarTender 2022 R5 CEA template structure. Quick Analysis values are patched locally in the browser. Open each file in BarTender and verify layout/content before printing.');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),base=safeFile(String(labels[0]?.sourceName||files?.[0]?.name||'Label').replace(/\.[^.]+$/,''));downloadBlob(blob,`BT_Editable_${base}.zip`);return{ok:true,type:'zip',count:outputs.length,outputs}
  }

  window.LabelWorkbenchBtwNative={BUILD,SEED_ID,SEED_FUNCTION,CEA_DEFAULTS,barcodeKind,supportedBarcode,supportedBarcodes,unsupportedBarcodes,fieldSummary,scanTags,tagRange,sourcePlan,patchCea,topObjectPosition,seedEndpoint,fetchSeed,generateOne,downloadFromAnalysis};
})();
