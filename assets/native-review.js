(function(){
  'use strict';
  const BUILD='20261102-layout-rc2';
  async function build(out){
    if(out.productionMode!=='second'||out.request?.revision!==BUILD||
       window.LabelWorkbenchAnalysisGeometry?.BUILD!==BUILD)throw Error('此產檔路徑或幾何模組缺少 RC2 決策紀錄。');
    const layout=out.request;
    if(!layout.physicalSizeKnown||!layout.objects.length||layout.objects.some(o=>!o.sourceBox))
      throw Error('缺少已確認紙張尺寸或來源框。');
    if(out.layout.textCompaction.omitted.length)throw Error('已有文字因 donor 容量或整理規則省略，無法驗收完整標籤。');
    const bytes=out.bytes;
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    let binary='';
    for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {schema:'lwb-production-review-v2',revision:BUILD,layout,
      sha256:Array.from(digest,b=>b.toString(16).padStart(2,'0')).join(''),btwBase64:btoa(binary)};
  }
  function render(outputs){
    const host=document.getElementById('nativeReviewActions');
    if(!host)return;
    host.replaceChildren();
    for(const out of outputs||[]){
      const button=document.createElement('button');
      button.type='button';button.className='btn';button.textContent='匯出 RC2 驗證資料 · '+out.name;
      button.onclick=async()=>{
        try{
          const data=await build(out),url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
          const a=document.createElement('a');a.href=url;a.download=out.name+'.review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }catch(error){window.alert(error.message);}
      };
      host.append(button);
    }
  }
  window.LabelWorkbenchNativeReview={BUILD,build,render};
})();
