/* Label Workbench deterministic BTW production core v1.
 * Final analysis -> safety gate -> explicit generator selection -> download.
 * This path does NOT depend on wrapper-mutated downloadFromAnalysis() functions.
 */
(function(){
  'use strict';

  const BUILD='20260921-btw-production-core-150-layout-safe';
  const JSZIP_SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let zipPromise=null;

  const safeFile=v=>String(v||'Label')
    .replace(/[\\/:*?"<>|]+/g,'_')
    .replace(/\s+/g,'_')
    .replace(/^_+|_+$/g,'')
    .slice(0,70)||'Label';

  function loadZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);
    if(zipPromise)return zipPromise;
    zipPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=JSZIP_SRC;
      s.async=true;
      s.crossOrigin='anonymous';
      s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP 元件載入不完整'));
      s.onerror=()=>reject(new Error('ZIP 元件載入失敗'));
      document.head.appendChild(s);
    }).finally(()=>{zipPromise=null});
    return zipPromise;
  }

  function saveBlob(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1800);
  }

  function prepare(result){
    const gate=window.LabelWorkbenchBtwProductionGate;
    if(!gate?.prepareResult)throw new Error('BTW production safety gate 尚未載入');
    return gate.prepareResult(result);
  }

  function physicalSize(label){
    const g=label?.sourceGeometry||{},width=Number(g.widthMm),height=Number(g.heightMm);
    return width>=5&&width<=1000&&height>=5&&height<=1000?{width,height,sizeSource:g.sizeSource||'confirmed'}:null
  }
  function requireProductionGeometry(label,index){
    const size=physicalSize(label);
    if(!size)throw new Error(`標籤 ${index+1} 尚未確認實際寬 × 高 mm，停止產生 BTW`);
    const rows=[...(label?.textObjects||[]),...(label?.barcodes||[])].filter(x=>String(x?.text??x?.value??x?.data??'').trim());
    const missing=rows.filter(x=>!x?.sourceBox);
    if(missing.length)throw new Error(`標籤 ${index+1} 有 ${missing.length} 個物件缺少校正後位置，停止產生 BTW，避免套用 donor 預設座標`);
    return size
  }

  function selectGenerator(label){
    const F=window.LabelWorkbenchBtwFamilyNative;
    const S=window.LabelWorkbenchBtwSecondNative;
    const R=window.LabelWorkbenchBtwRichNative;
    const N=window.LabelWorkbenchBtwNative;

    if(F?.canGenerate?.(label)&&F?.generateOne)return{mode:'family',api:F};
    if(S?.canGenerate?.(label)&&S?.generateOne)return{mode:'second',api:S};
    if(R?.canGenerate?.(label)&&R?.generateOne)return{mode:'rich',api:R};
    if(N?.generateOne)return{mode:'native',api:N};
    throw new Error('沒有可用的 BarTender 2022 BTW generator');
  }

  async function generate(result,files,onProgress){
    const prepared=prepare(result);
    const labels=(prepared.result?.labels||[]).slice(0,20);
    if(!labels.length)throw new Error('目前沒有可建立 BTW 的安全分析結果');

    if(prepared.report.pendingTotal>0){
      onProgress?.(`已略過 ${prepared.report.pendingTotal} 個待核對欄位，準備建立 BTW…`);
    }

    const outputs=[];
    const routes=[];
    for(let i=0;i<labels.length;i++){
      requireProductionGeometry(labels[i],i);
      const route=selectGenerator(labels[i]);
      routes.push(route.mode);
      const modeText=route.mode==='family'?'QR / Code39 / UPC-A / EAN-13 / GS1-128 / PDF417 / ITF-14 原生條碼':route.mode==='second'?'5C128+1DM':route.mode==='rich'?'多物件':'CEA fallback';
      onProgress?.(`正在建立 ${modeText} 可編輯 BTW ${i+1}/${labels.length}`);
      const out=await route.api.generateOne(labels[i],i);
      outputs.push({...out,productionMode:route.mode});
    }

    return{prepared,labels,outputs,routes,files:[...(files||[])]};
  }

  async function downloadGenerated(generated){
    const {outputs,labels,files,routes,prepared}=generated;
    if(outputs.length===1){
      saveBlob(new Blob([outputs[0].bytes],{type:'application/octet-stream'}),outputs[0].name);
      return{
        ok:true,type:'btw',count:1,outputs,routes,
        pendingTotal:prepared.report.pendingTotal,
        report:prepared.report
      };
    }

    const JSZip=await loadZip(),zip=new JSZip();
    for(const out of outputs)zip.file(out.name,out.bytes);
    zip.file('README.txt',
      'Label Workbench editable BarTender 2022 BTW output.\n'+
      'Each file is generated from the final safety-filtered analysis result.\n'+
      'Text and supported barcode objects remain independent native objects.\n'+
      'Open in BarTender 2022 and verify content/layout before printing.\n'+
      'Generator routes: '+routes.join(', ')
    );
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    const base=safeFile(String(labels[0]?.sourceName||files?.[0]?.name||'Label').replace(/\.[^.]+$/,''));
    saveBlob(blob,`BT_Editable_${base}.zip`);
    return{
      ok:true,type:'zip',count:outputs.length,outputs,routes,
      pendingTotal:prepared.report.pendingTotal,
      report:prepared.report
    };
  }

  async function downloadFromAnalysis(result,files,onProgress){
    const generated=await generate(result,files,onProgress);
    return downloadGenerated(generated);
  }

  window.LabelWorkbenchBtwProductionCore={
    BUILD,prepare,physicalSize,requireProductionGeometry,selectGenerator,generate,downloadGenerated,downloadFromAnalysis
  };
  console.info('[Label Workbench] deterministic BTW production core',BUILD);
})();