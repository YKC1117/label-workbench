/* Label Workbench barcode layout keyboard shortcuts v2.1
 * Keeps editing fields untouched; shortcuts only run in the barcode Generate layout workspace.
 */
(function(){
  'use strict';

  const BUILD='20260910-v210';
  let copiedId=null;
  let bound=false;

  const el=id=>document.getElementById(id);
  const toast=message=>{ if(typeof window.toast==='function') window.toast(message); };

  function commandFor(event){
    const key=String(event?.key||'');
    const lower=key.toLowerCase();
    const mod=!!(event?.ctrlKey||event?.metaKey);
    if(mod&&!event?.shiftKey&&lower==='c') return 'copy';
    if(mod&&!event?.shiftKey&&lower==='v') return 'paste';
    if(mod&&!event?.shiftKey&&lower==='d') return 'duplicate';
    if(!mod&&(key==='Delete'||key==='Backspace')) return 'delete';
    if(!mod&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) return 'move';
    if(!mod&&key==='Escape') return 'escape';
    return '';
  }

  function editableTarget(target){
    if(!target) return false;
    if(target.isContentEditable) return true;
    const tag=String(target.tagName||'').toLowerCase();
    if(['input','textarea','select'].includes(tag)) return true;
    return !!target.closest?.('[contenteditable="true"],[contenteditable="plaintext-only"]');
  }

  function generatorApi(){ return window.LabelWorkbenchBarcodeGenerator||null; }
  function selectedNode(){ return el('layoutBoard')?.querySelector('.layout-barcode-item.selected')||null; }

  function generateModeActive(){
    const view=document.querySelector?.('#barcode.view.active');
    const body=el('barcodeGenerateBody');
    return !!(view&&body&&!body.classList.contains('hidden')&&el('layoutBoard'));
  }

  function copySelected(){
    const node=selectedNode();
    if(!node){ toast('請先選取一個條碼'); return false; }
    copiedId=node.dataset.layoutId||null;
    el('genCopyImage')?.click();
    return true;
  }

  function pasteCopied(){
    const api=generatorApi();
    const source=(api?.layoutItems||[]).find(item=>item.id===copiedId);
    if(!source){ toast('請先選取條碼後按 Ctrl+C'); return false; }
    api.selectLayoutItem?.(source.id);
    el('layoutDuplicate')?.click();
    return true;
  }

  function duplicateSelected(){
    if(!selectedNode()){ toast('請先選取一個條碼'); return false; }
    el('layoutDuplicate')?.click();
    return true;
  }

  function deleteSelected(){
    if(!selectedNode()) return false;
    el('layoutDelete')?.click();
    return true;
  }

  function moveSelected(event){
    const node=selectedNode();
    if(!node) return false;
    const synthetic=new KeyboardEvent('keydown',{
      key:event.key,
      shiftKey:!!event.shiftKey,
      bubbles:false,
      cancelable:true
    });
    node.dispatchEvent(synthetic);
    return true;
  }

  function handleKey(event){
    if(!generateModeActive()||editableTarget(event.target)) return;
    const command=commandFor(event);
    if(!command) return;

    // A focused barcode already owns Delete and arrow keys. Let its local handler run once.
    const onLayoutItem=!!event.target?.closest?.('.layout-barcode-item');
    if(onLayoutItem&&(command==='delete'||command==='move')) return;

    event.preventDefault();
    if(command==='copy') copySelected();
    else if(command==='paste') pasteCopied();
    else if(command==='duplicate') duplicateSelected();
    else if(command==='delete') deleteSelected();
    else if(command==='move') moveSelected(event);
    else if(command==='escape') generatorApi()?.selectLayoutItem?.(null);
  }

  function injectHint(){
    const footer=document.querySelector?.('.layout-footer');
    if(!footer||el('layoutShortcutHint')) return;
    const hint=document.createElement('div');
    hint.id='layoutShortcutHint';
    hint.className='layout-shortcut-hint';
    hint.innerHTML='<b>鍵盤快捷鍵</b><span><kbd>Ctrl+C</kbd> 複製</span><span><kbd>Ctrl+V</kbd> 貼上</span><span><kbd>Ctrl+D</kbd> 複製一份</span><span><kbd>Delete</kbd> 刪除</span><span><kbd>方向鍵</kbd> 微調</span><span><kbd>Shift+方向鍵</kbd> 大移動</span><span><kbd>Esc</kbd> 取消選取</span><span><kbd>Ctrl+Enter</kbd> 加入排版</span>';
    footer.parentElement?.insertBefore(hint,footer);

    if(!el('layoutShortcutStyle')){
      const style=document.createElement('style');
      style.id='layoutShortcutStyle';
      style.textContent=`
        .layout-shortcut-hint{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid #e7ecf2;background:#fbfdff;color:#64748b;font-size:10px}
        .layout-shortcut-hint>b{color:#334155;margin-right:2px}
        .layout-shortcut-hint span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
        .layout-shortcut-hint kbd{font:600 9px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;color:#334155;background:#fff;border:1px solid #cbd5e1;border-bottom-width:2px;border-radius:5px;padding:2px 5px;box-shadow:0 1px 1px rgba(15,23,42,.04)}
        @media(max-width:820px){.layout-shortcut-hint{display:none}}
      `;
      document.head.appendChild(style);
    }
  }

  function bind(){
    if(bound) return;
    if(!generatorApi()||!el('layoutBoard')){ setTimeout(bind,120); return; }
    bound=true;
    window.addEventListener('keydown',handleKey,true);
    injectHint();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,0),{once:true});
  else setTimeout(bind,0);

  window.LabelWorkbenchLayoutShortcuts={
    BUILD,commandFor,editableTarget,handleKey,
    get copiedId(){ return copiedId; }
  };
})();

/* Load local BTW template lab. This avoids the external BarTender seed endpoint that caused 502 errors. */
(function(){
  'use strict';
  const BUILD='20260911-btw-template-lab-001';
  function load(){
    if(window.LabelWorkbenchBtwTemplateLab||document.querySelector('script[data-lw-module="assets/btw-template-lab.js"]')) return;
    const s=document.createElement('script');
    s.src=`assets/btw-template-lab.js?v=${BUILD}&t=${Date.now()}`;
    s.dataset.lwModule='assets/btw-template-lab.js';
    s.async=false;
    s.onerror=()=>console.warn('[Label Workbench] BTW template lab load failed');
    document.head.appendChild(s);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load,{once:true}); else load();
})();