/* Label Workbench quick-analysis cell copy v1.0
 * Adds a small copy button to every result table cell for fast BarTender paste workflow.
 */
(function(){
  'use strict';
  const BUILD='20260911-analysis-copy-100';
  const ROOT_ID='analysisResult';

  function toast(msg){ if(typeof window.toast==='function') window.toast(msg); }
  function cleanCellText(td){
    const clone=td.cloneNode(true);
    clone.querySelectorAll('[data-analysis-cell-copy]').forEach(n=>n.remove());
    return String(clone.innerText||clone.textContent||'').replace(/\s+/g,' ').trim();
  }
  async function copyText(text,button){
    if(!text){ toast('這格沒有可複製內容'); return; }
    try{
      await navigator.clipboard.writeText(text);
      const old=button.textContent;
      button.textContent='已複製';
      button.classList.add('copied');
      toast('已複製：'+(text.length>28?text.slice(0,28)+'…':text));
      setTimeout(()=>{button.textContent=old;button.classList.remove('copied')},900);
    }catch(err){
      try{
        const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('已複製');
      }catch{ toast('複製失敗'); }
    }
  }
  function decorate(root=document){
    const host=root.getElementById?root.getElementById(ROOT_ID):document.getElementById(ROOT_ID);
    if(!host) return;
    host.querySelectorAll('.analysis-table tbody td').forEach(td=>{
      if(td.dataset.analysisCopyReady==='1') return;
      td.dataset.analysisCopyReady='1';
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='analysis-cell-copy';
      btn.dataset.analysisCellCopy='1';
      btn.textContent='複製';
      btn.title='複製這一格';
      btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();copyText(cleanCellText(td),btn)});
      td.appendChild(btn);
    });
  }
  function style(){
    if(document.getElementById('analysisCopyStyle')) return;
    const s=document.createElement('style');s.id='analysisCopyStyle';s.textContent=`
      #analysisResult .analysis-table tbody td{position:relative;padding-right:58px}
      #analysisResult .analysis-cell-copy{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:7px;padding:4px 7px;font-size:10px;font-weight:800;line-height:1;cursor:pointer;opacity:.82}
      #analysisResult .analysis-cell-copy:hover{opacity:1;border-color:#93b4ff;color:#1d4ed8;background:#f8fbff}
      #analysisResult .analysis-cell-copy.copied{color:#087a55;border-color:#86efac;background:#f0fdf4}
      @media(max-width:820px){#analysisResult .analysis-table tbody td{padding-right:52px}.analysis-cell-copy{font-size:9px!important;padding:4px 6px!important}}
    `;document.head.appendChild(s);
  }
  function init(){
    style();decorate();
    const host=document.getElementById(ROOT_ID);
    if(host&&typeof MutationObserver==='function') new MutationObserver(()=>decorate()).observe(host,{childList:true,subtree:true});
    console.info('[Label Workbench] analysis cell copy',BUILD);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
  window.LabelWorkbenchAnalysisCopy={BUILD,decorate,cleanCellText};
})();