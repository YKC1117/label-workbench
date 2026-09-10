/* Label Workbench barcode reader v1.8 loader. */
(function(){
  'use strict';
  const BUILD='20260910-v181';
  const modules=['assets/barcode-reader-core.js','assets/barcode-reader-ui.js','assets/barcode-generator.js','assets/label-interpreter.js','assets/workbench-priority.js'];
  function loadNext(){
    const src=modules.shift();if(!src)return;
    if(src.includes('core')&&window.LabelWorkbenchBarcodeCore){loadNext();return}
    if(src.includes('ui')&&window.LabelWorkbenchBarcodeUI){loadNext();return}
    if(src.includes('barcode-generator')&&window.LabelWorkbenchBarcodeGenerator){loadNext();return}
    if(src.includes('label-interpreter')&&window.LabelWorkbenchInterpreter){loadNext();return}
    if(src.includes('workbench-priority')&&window.LabelWorkbenchPriority){loadNext();return}
    const s=document.createElement('script');s.src=`${src}?v=${BUILD}`;s.async=false;s.onload=loadNext;s.onerror=()=>{console.error('[Label Workbench] barcode/workbench module load failed:',src);loadNext()};document.head.appendChild(s);
  }
  loadNext();
})();