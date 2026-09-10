/* Label Workbench cloud sync (Supabase)
 * Local-first: cloud failure must never block the core app.
 */
(function(){
  'use strict';

  const TABLE = 'label_cases';
  const cfg = window.LABEL_WORKBENCH_CLOUD || {};
  const state = {client:null,session:null,syncing:false,timer:null,lastSync:null,patched:false};

  function el(id){ return document.getElementById(id); }
  function safeDate(v){ const n = Date.parse(v || ''); return Number.isFinite(n) ? n : 0; }
  function cloudReady(){ return !!(cfg.enabled && cfg.url && cfg.key && window.supabase && typeof window.supabase.createClient === 'function'); }
  function setText(id, value){ const node = el(id); if(node) node.textContent = value; }
  function setStatus(kind, text){ const dot=el('cloudDot'),label=el('cloudStatusText');if(label)label.textContent=text;if(dot)dot.className='cloud-dot '+kind; }
  function describeError(err){ return err?.message || String(err || '未知錯誤'); }

  function injectCss(){
    if(document.querySelector('link[data-label-cloud]')) return;
    const link=document.createElement('link');link.rel='stylesheet';link.href='assets/cloud.css';link.dataset.labelCloud='true';document.head.appendChild(link);
  }

  function injectPanel(){
    const host=el('dashboard');if(!host||el('cloudPanel'))return;
    const panel=document.createElement('div');panel.id='cloudPanel';panel.className='panel cloud-panel';
    panel.innerHTML=`<div class="section-title"><h3>☁️ 跨裝置同步</h3><div class="cloud-state"><span id="cloudDot" class="cloud-dot off"></span><span id="cloudStatusText">尚未設定</span></div></div><p class="muted cloud-copy">採「本機優先」設計：就算雲端或網路暫時故障，案件建立、編輯、條碼工具與 BarTender 前置工作仍可正常使用。</p><div id="cloudSetupBox" class="note warn-note">雲端後端尚未啟用。完成 Supabase 專案與安全規則後，這裡會自動切換成登入與同步控制。</div><div id="cloudAuthBox" class="cloud-auth hidden"><div class="field cloud-email-field"><label for="cloudEmail">登入 Email</label><input id="cloudEmail" type="email" autocomplete="email" placeholder="輸入你的 Email"></div><div class="toolbar cloud-buttons"><button id="cloudLoginBtn" class="btn primary" type="button">寄送登入連結</button><button id="cloudSyncBtn" class="btn ghost hidden" type="button">立即同步</button><button id="cloudLogoutBtn" class="btn ghost hidden" type="button">登出</button></div><div id="cloudMessage" class="footer-note"></div></div>`;
    host.appendChild(panel);
  }

  function renderAuth(){
    const setup=el('cloudSetupBox'),auth=el('cloudAuthBox'),sync=el('cloudSyncBtn'),logout=el('cloudLogoutBtn'),login=el('cloudLoginBtn'),email=el('cloudEmail');
    if(!cloudReady()){setup?.classList.remove('hidden');auth?.classList.add('hidden');setStatus('off','尚未啟用');return;}
    setup?.classList.add('hidden');auth?.classList.remove('hidden');const userEmail=state.session?.user?.email||'';
    if(state.session){if(email){email.value=userEmail;email.disabled=true}login?.classList.add('hidden');sync?.classList.remove('hidden');logout?.classList.remove('hidden');setStatus('ok',state.syncing?'同步中':'已登入');setText('cloudMessage',state.lastSync?`最後同步：${new Date(state.lastSync).toLocaleString()}`:`已登入：${userEmail}`)}
    else{if(email)email.disabled=false;login?.classList.remove('hidden');sync?.classList.add('hidden');logout?.classList.add('hidden');setStatus('idle','等待登入');setText('cloudMessage','使用 Email 登入後，公司電腦、家裡電腦、手機和平板可接續同一批案件。')}
  }

  async function sendMagicLink(){
    const email=(el('cloudEmail')?.value||'').trim();if(!email){setText('cloudMessage','請先輸入 Email。');return}const redirect=location.origin+location.pathname;setText('cloudMessage','正在寄送登入連結…');
    try{const {error}=await state.client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect}});if(error)throw error;setText('cloudMessage','登入連結已寄出。請到信箱點一下，完成後會回到 Label Workbench。')}
    catch(err){setStatus('error','登入失敗');setText('cloudMessage','登入連結寄送失敗：'+describeError(err))}
  }

  function mergeCases(localCases,remoteRows){
    const map=new Map();(localCases||[]).forEach(c=>map.set(c.id,c));
    (remoteRows||[]).forEach(row=>{const remote=row.payload||{};if(!remote.id)remote.id=row.case_id;const local=map.get(remote.id);if(!local||safeDate(remote.updatedAt||row.updated_at)>safeDate(local.updatedAt))map.set(remote.id,remote)});
    return[...map.values()].sort((a,b)=>safeDate(b.updatedAt||b.createdAt)-safeDate(a.updatedAt||a.createdAt));
  }

  async function syncNow(options={silent:false}){
    if(!state.client||!state.session||state.syncing)return;state.syncing=true;renderAuth();setStatus('work','同步中');if(!options.silent)setText('cloudMessage','正在同步案件…');
    try{
      const userId=state.session.user.id;const {data:remoteRows,error:readError}=await state.client.from(TABLE).select('case_id,payload,updated_at').eq('user_id',userId);if(readError)throw readError;
      const localCases=typeof window.loadCases==='function'?window.loadCases():[],merged=mergeCases(localCases,remoteRows||[]),rows=merged.map(c=>({user_id:userId,case_id:c.id,payload:c,updated_at:c.updatedAt||c.createdAt||new Date().toISOString()}));
      if(rows.length){const {error:writeError}=await state.client.from(TABLE).upsert(rows,{onConflict:'user_id,case_id'});if(writeError)throw writeError}
      if(JSON.stringify(localCases)!==JSON.stringify(merged)&&typeof originalSaveCases==='function')originalSaveCases(merged);
      state.lastSync=new Date().toISOString();setStatus('ok','已同步');setText('cloudMessage',`同步完成：${merged.length} 筆案件 · ${new Date(state.lastSync).toLocaleString()}`);
    }catch(err){console.warn('[Label Workbench] cloud sync failed:',err);setStatus('error','同步失敗');setText('cloudMessage','雲端同步失敗，但本機功能不受影響。'+describeError(err))}
    finally{state.syncing=false}
  }

  function scheduleSync(){if(!state.session)return;clearTimeout(state.timer);state.timer=setTimeout(()=>syncNow({silent:true}),900)}
  const originalSaveCases=window.saveCases;
  function patchLocalSave(){if(state.patched||typeof originalSaveCases!=='function')return;window.saveCases=function(cases){originalSaveCases(cases);scheduleSync()};state.patched=true}
  async function signOut(){try{await state.client.auth.signOut()}catch(err){console.warn('[Label Workbench] sign out failed:',err)}}

  async function bootClient(){
    if(!cloudReady()){renderAuth();return}
    try{state.client=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});patchLocalSave();const {data}=await state.client.auth.getSession();state.session=data?.session||null;renderAuth();state.client.auth.onAuthStateChange((_event,session)=>{state.session=session;renderAuth();if(session)setTimeout(()=>syncNow({silent:true}),0)});if(state.session)await syncNow({silent:true})}
    catch(err){console.warn('[Label Workbench] cloud bootstrap failed:',err);setStatus('error','雲端初始化失敗');setText('cloudMessage','雲端初始化失敗，本機功能仍可使用。'+describeError(err))}
  }

  function bind(){el('cloudLoginBtn')?.addEventListener('click',sendMagicLink);el('cloudSyncBtn')?.addEventListener('click',()=>syncNow());el('cloudLogoutBtn')?.addEventListener('click',signOut);el('cloudEmail')?.addEventListener('keydown',e=>{if(e.key==='Enter')sendMagicLink()})}
  function init(){injectCss();injectPanel();bind();renderAuth();bootClient()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.LabelWorkbenchCloud={syncNow,mergeCases,state};
})();

/* Load optional workbench modules in a fixed order with an explicit cache key. */
(function(){
  const BUILD='20260910-v161';
  const queue=['assets/cloud-attachments.js','assets/file-parsers.js','assets/barcode-reader.js'];
  function next(){const src=queue.shift();if(!src)return;if(document.querySelector(`script[data-lw-module="${src}"]`)){next();return}const s=document.createElement('script');s.src=`${src}?v=${BUILD}`;s.dataset.lwModule=src;s.async=false;s.onload=next;s.onerror=()=>{console.warn('[Label Workbench] module load failed:',src);next()};document.head.appendChild(s)}
  next();
})();
