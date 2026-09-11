/* Label Workbench barcode reader v3.2 loader. */
(function(){
  'use strict';
  const BUILD='20260911-v240-safe-ui';
  const modules=['assets/barcode-reader-core.js','assets/barcode-reader-ui.js','assets/barcode-generator.js','assets/label-interpreter.js','assets/bt-quick.js','assets/bt-direct-import.js','assets/btw-format.js','assets/btw-native.js','assets/bt-bridge.js','assets/workbench-priority.js','assets/bt-native-primary.js'];
  function loadNext(){
    const src=modules.shift();if(!src)return;
    if(src.includes('core')&&window.LabelWorkbenchBarcodeCore){loadNext();return}
    if(src.includes('ui')&&window.LabelWorkbenchBarcodeUI){loadNext();return}
    if(src.includes('barcode-generator')&&window.LabelWorkbenchBarcodeGenerator){loadNext();return}
    if(src.includes('label-interpreter')&&window.LabelWorkbenchInterpreter){loadNext();return}
    if(src.includes('bt-quick')&&window.LabelWorkbenchBtQuick){loadNext();return}
    if(src.includes('bt-direct-import')&&window.LabelWorkbenchBtDirectImport){loadNext();return}
    if(src.includes('btw-format')&&window.LabelWorkbenchBtwFormat){loadNext();return}
    if(src.includes('btw-native')&&window.LabelWorkbenchBtwNative){loadNext();return}
    if(src.includes('bt-bridge')&&window.LabelWorkbenchBtBridge){loadNext();return}
    if(src.includes('workbench-priority')&&window.LabelWorkbenchPriority){loadNext();return}
    if(src.includes('bt-native-primary')&&window.LabelWorkbenchBtNativePrimary){loadNext();return}
    const s=document.createElement('script');
    s.src=`${src}?v=${BUILD}&t=${Date.now()}`;
    s.async=false;
    s.onload=loadNext;
    s.onerror=()=>{console.error('[Label Workbench] barcode/workbench module load failed:',src);loadNext()};
    document.head.appendChild(s);
  }
  loadNext();
})();
