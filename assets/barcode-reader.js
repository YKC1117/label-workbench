/* Label Workbench barcode reader v1 loader.
 * Runtime implementation is split so each module can be independently syntax-checked.
 */
(function(){
  'use strict';
  const BUILD='20260907-v100';
  const modules=['assets/barcode-reader-core.js','assets/barcode-reader-ui.js'];
  function loadNext(){
    const src=modules.shift();
    if(!src)return;
    if(src.includes('core')&&window.LabelWorkbenchBarcodeCore){loadNext();return}
    if(src.includes('ui')&&window.LabelWorkbenchBarcodeUI){loadNext();return}
    const s=document.createElement('script');
    s.src=`${src}?v=${BUILD}`;
    s.async=false;
    s.onload=loadNext;
    s.onerror=()=>{console.error('[Label Workbench] barcode module load failed:',src);loadNext()};
    document.head.appendChild(s)
  }
  loadNext()
})();