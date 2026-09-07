/* Label Workbench private attachment add-on for Supabase. */
(function(){
  'use strict';

  const BUCKET='label-attachments';
  const MAX_FILE_SIZE=20*1024*1024;
  const state={pendingFiles:[],patched:false,fileMetaPatched:false,observer:null};
  let baseSaveCases=null;
  let baseFileMeta=null;
  let baseEditCase=null;

  function el(id){return document.getElementById(id)}
  function cloud(){return window.LabelWorkbenchCloud||null}
  function cloudState(){return cloud()?.state||null}
  function session(){return cloudState()?.session||null}
  function client(){return cloudState()?.client||null}
  function uid(){return globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():'att-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}
  function safeSegment(v){return String(v||'item').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'item'}
  function fingerprint(f){return [f?.name||'',f?.size||0,f?.lastModified||0].join('|')}
  function ensureMeta(meta){const m={...(meta||{})};if(!m.attachmentId)m.attachmentId=uid();m.cloudStatus=m.cloudPath?'uploaded':(m.cloudStatus||'local');return m}
  function formatBytes(n=0){if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`}
  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function js(v=''){return String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\r\n]/g,' ')}
  function toast(msg){if(typeof window.toast==='function')window.toast(msg)}
  function getCases(){return typeof window.loadCases==='function'?window.loadCases():[]}
  function changedCases(before,after){const old=new Map((before||[]).map(c=>[c.id,JSON.stringify(c)]));return (after||[]).filter(c=>!old.has(c.id)||old.get(c.id)!==JSON.stringify(c))}
  function newestCase(items){return [...items].sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||0)-Date.parse(a.updatedAt||a.createdAt||0))[0]}

  function updateUiCopy(){
    const small=document.querySelector('.brand small');
    if(small&&/v0\.\d+/i.test(small.textContent||''))small.textContent=(small.textContent||'').replace(/v0\.\d+/i,'v0.7');
    const dashboard=el('dashboard');
    const oldNote=[...(dashboard?.querySelectorAll('.warn-note')||[])].find(n=>(n.textContent||'').includes('目前同步狀態'));
    if(oldNote)oldNote.innerHTML='<b>雲端模式：</b>案件登入後自動同步；附件會存到私人 Supabase Storage。未登入時仍可本機工作。';
    const editor=el('caseEditor');
    const attachNote=[...(editor?.querySelectorAll('.note')||[])].find(n=>(n.textContent||'').includes('附件安全'));
    if(attachNote)attachNote.innerHTML='<b>附件安全：</b>登入雲端時，20 MB 以內的原稿會上傳到你的私人 Supabase Storage；未登入時只保留檔名與大小等資訊。客戶原稿不會提交到 GitHub。';
  }

  function patchFileMeta(){
    if(state.fileMetaPatched||typeof window.fileMeta!=='function')return;
    baseFileMeta=window.fileMeta;
    baseEditCase=window.editCase;
    window.fileMeta=function(files){
      const fresh=baseFileMeta(files).map(ensureMeta);
      const caseId=el('caseEditor')?.dataset?.cloudCaseId||'';
      if(!caseId)return fresh;
      const existing=getCases().find(c=>c.id===caseId)?.files||[];
      const merged=[...existing.map(ensureMeta),...fresh];
      const seen=new Set();
      return merged.filter(m=>{const key=m.attachmentId||fingerprint(m);if(seen.has(key))return false;seen.add(key);return true});
    };
    if(typeof baseEditCase==='function')window.editCase=function(id){const r=baseEditCase(id);const e=el('caseEditor');if(e)e.dataset.cloudCaseId=id||'';return r};
    ['topNewCase','dashNewCase','cancelEditBtn'].forEach(id=>el(id)?.addEventListener('click',()=>{const e=el('caseEditor');if(e)e.dataset.cloudCaseId=''}));
    state.fileMetaPatched=true;
  }

  function captureFiles(){
    const input=el('caseFiles');
    if(!input)return;
    input.addEventListener('change',e=>{
      state.pendingFiles=[...(e.target.files||[])];
      const tooLarge=state.pendingFiles.filter(f=>f.size>MAX_FILE_SIZE);
      if(tooLarge.length)toast(`${tooLarge.length} 個檔案超過 20 MB，這些檔案只會先記錄檔名`);
    },true);
  }

  function patchSaveCases(){
    if(state.patched||typeof window.saveCases!=='function')return;
    baseSaveCases=window.saveCases;
    window.saveCases=function(cases){
      const before=getCases();
      const changed=changedCases(before,cases);
      baseSaveCases(cases);
      decorateCases();
      const editor=el('caseEditor');if(editor&&changed.length)editor.dataset.cloudCaseId='';
      if(state.pendingFiles.length&&changed.length){
        const files=state.pendingFiles.slice();state.pendingFiles=[];
        const target=newestCase(changed);
        if(session())uploadFiles(target.id,files).catch(err=>{console.warn(err);toast('附件上傳失敗，案件仍已保存在本機')});
        else toast('案件已存本機；登入雲端後可到「附件」補上傳原檔');
      }
    };
    state.patched=true;
  }

  function findMeta(files,file){return (files||[]).find(m=>fingerprint(m)===fingerprint(file)&&!m.cloudPath)||(files||[]).find(m=>m.name===file.name&&m.size===file.size&&!m.cloudPath)}

  async function uploadFiles(caseId,files){
    const cclient=client(),sess=session();
    if(!cclient||!sess)throw new Error('請先登入雲端');
    let cases=getCases();
    const c=cases.find(x=>x.id===caseId);if(!c)throw new Error('找不到案件');
    c.files=(c.files||[]).map(ensureMeta);
    let uploaded=0,skipped=0;
    for(const file of files||[]){
      if(file.size>MAX_FILE_SIZE){skipped++;continue}
      let meta=findMeta(c.files,file);
      if(!meta){meta=ensureMeta({name:file.name,size:file.size,type:file.type||'',lastModified:file.lastModified||null,ext:(file.name.split('.').pop()||'').toLowerCase()});c.files.push(meta)}
      const path=`${sess.user.id}/${safeSegment(caseId)}/${safeSegment(meta.attachmentId)}-${safeSegment(file.name)}`;
      const {error}=await cclient.storage.from(BUCKET).upload(path,file,{upsert:true,contentType:file.type||undefined,cacheControl:'3600'});
      if(error)throw error;
      meta.cloudPath=path;meta.cloudStatus='uploaded';meta.cloudUploadedAt=new Date().toISOString();uploaded++;
    }
    c.updatedAt=new Date().toISOString();
    window.saveCases(cases.map(x=>x.id===caseId?c:x));
    if(cloud()?.syncNow)await cloud().syncNow({silent:true});
    toast(`附件已上傳 ${uploaded} 個${skipped?`，${skipped} 個超過 20 MB 未上傳`:''}`);
    return {uploaded,skipped};
  }

  async function downloadAttachment(caseId,attachmentId){
    const cclient=client(),sess=session();
    if(!cclient||!sess){toast('請先登入雲端');return}
    const meta=getCases().find(c=>c.id===caseId)?.files?.find(f=>f.attachmentId===attachmentId);
    if(!meta?.cloudPath){toast('這個附件尚未上傳雲端');return}
    try{
      const {data,error}=await cclient.storage.from(BUCKET).download(meta.cloudPath);if(error)throw error;
      const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=meta.name||'attachment';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(err){toast('附件下載失敗：'+(err?.message||err))}
  }

  function chooseUpload(caseId,attachmentId){
    if(!session()){toast('請先登入雲端');return}
    const input=document.createElement('input');input.type='file';
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;if(file.size>MAX_FILE_SIZE){toast('單檔上限 20 MB');return}
      try{
        const cases=getCases(),c=cases.find(x=>x.id===caseId),meta=c?.files?.find(f=>f.attachmentId===attachmentId);
        if(meta){meta.name=file.name;meta.size=file.size;meta.type=file.type||'';meta.lastModified=file.lastModified||null;meta.ext=(file.name.split('.').pop()||'').toLowerCase();delete meta.cloudPath;meta.cloudStatus='local';c.updatedAt=new Date().toISOString();baseSaveCases(cases)}
        await uploadFiles(caseId,[file]);showAttachments(caseId);
      }catch(err){toast('附件上傳失敗：'+(err?.message||err))}
    };
    input.click();
  }

  async function removeAttachment(caseId,attachmentId){
    const cases=getCases(),c=cases.find(x=>x.id===caseId),meta=c?.files?.find(f=>f.attachmentId===attachmentId);if(!c||!meta)return;
    if(meta.cloudPath&&!session()){toast('這是雲端附件，請先登入後再移除');return}
    if(!confirm(`確定移除附件「${meta.name}」嗎？`))return;
    if(meta.cloudPath){try{const {error}=await client().storage.from(BUCKET).remove([meta.cloudPath]);if(error)throw error}catch(err){toast('雲端附件刪除失敗：'+(err?.message||err));return}}
    c.files=(c.files||[]).filter(f=>f.attachmentId!==attachmentId);c.updatedAt=new Date().toISOString();window.saveCases(cases.map(x=>x.id===caseId?c:x));showAttachments(caseId);toast('附件已移除');
  }

  function row(caseId,m){
    const uploaded=!!m.cloudPath,id=String(m.attachmentId||'');
    return `<div class="cloud-attachment-row"><div class="cloud-attachment-main"><b>${esc(m.name||'未命名')}</b><small>${formatBytes(m.size||0)} · ${uploaded?'☁️ 已上傳':'僅本機資料'}</small></div><div class="toolbar">${uploaded?`<button class="btn ghost small" type="button" onclick="LabelWorkbenchAttachments.downloadAttachment('${js(caseId)}','${js(id)}')">下載</button>`:`<button class="btn ghost small" type="button" onclick="LabelWorkbenchAttachments.chooseUpload('${js(caseId)}','${js(id)}')">補上傳</button>`}<button class="btn danger small" type="button" onclick="LabelWorkbenchAttachments.removeAttachment('${js(caseId)}','${js(id)}')">移除</button></div></div>`
  }

  function showAttachments(caseId){
    const cases=getCases(),c=cases.find(x=>x.id===caseId);if(!c)return;
    let changed=false;c.files=(c.files||[]).map(f=>{if(f.attachmentId)return f;changed=true;return ensureMeta(f)});
    if(changed){c.updatedAt=new Date().toISOString();window.saveCases(cases)}
    const body=c.files.length?c.files.map(f=>row(caseId,f)).join(''):'<div class="empty">這個案件目前沒有附件。</div>';
    if(typeof window.openModal==='function')window.openModal(`附件管理｜${c.customer}｜${c.labelName}`,`<div class="cloud-attachment-list">${body}</div><div class="footer-note">私人附件單檔上限 20 MB。舊案件若只有檔名資料，可按「補上傳」重新選擇原檔。</div>`,[{label:'關閉',onClick:window.closeModal}]);
  }

  function decorateCases(){
    const box=el('caseList');if(!box)return;const cases=getCases();
    box.querySelectorAll('.case-item').forEach(article=>{
      if(article.dataset.attachmentDecorated==='1')return;
      const idNode=[...article.querySelectorAll('.pill')].find(p=>/^LW-/.test((p.textContent||'').trim()));const caseId=(idNode?.textContent||'').trim();if(!caseId)return;
      const c=cases.find(x=>x.id===caseId),toolbars=article.querySelectorAll('.toolbar'),actions=toolbars[toolbars.length-1];if(!actions)return;
      const b=document.createElement('button');b.type='button';b.className='btn ghost small';b.textContent=`附件${c?.files?.length?` (${c.files.length})`:''}`;b.addEventListener('click',()=>showAttachments(caseId));actions.appendChild(b);article.dataset.attachmentDecorated='1';
    });
  }

  function observe(){const box=el('caseList');if(!box||state.observer)return;state.observer=new MutationObserver(decorateCases);state.observer.observe(box,{childList:true,subtree:true});decorateCases()}

  function waitForCloud(attempt=0){
    if(window.LabelWorkbenchCloud?.state){patchFileMeta();captureFiles();patchSaveCases();observe();decorateCases();updateUiCopy();return}
    if(attempt<80)setTimeout(()=>waitForCloud(attempt+1),100);
  }

  function init(){updateUiCopy();waitForCloud()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

  window.LabelWorkbenchAttachments={safeSegment,ensureMeta,fingerprint,uploadFiles,downloadAttachment,chooseUpload,removeAttachment,showAttachments,state};
})();
