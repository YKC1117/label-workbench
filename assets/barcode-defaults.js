/* Label Workbench barcode defaults v1.8 */
(function(){
  'use strict';
  function apply(){
    const height=document.getElementById('genHeight');
    if(height && (height.value==='' || height.value==='6')) height.value='4';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,0),{once:true});
  else setTimeout(apply,0);
})();
