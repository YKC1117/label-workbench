/* Label Workbench barcode reader v4.1 loader. */
(function(){
  'use strict';
  const BUILD='20260911-v348-btw-layout-map';
  const modules=['assets/view-state-guard.js','assets/barcode-reader-core.js','assets/barcode-reader-ui.js','assets/barcode-generator.js','assets/label-interpreter.js','assets/analysis-accuracy.js','assets/analysis-pdf-native.js','assets/analysis-geometry.js','assets/analysis-field-consistency.js','assets/analysis-copy.js','assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-native.js','assets/bt-bridge.js','assets/workbench-priority.js','assets/bt-native-primary.js','assets/analysis-confidence-guard.js','assets/analysis-final-display.js'];
  function loadNext(){
    const src=modules.shift();if(!src)return;
    if(src.includes('view-state-guard')&&window.LabelWorkbenchViewGuard){loadNext();return}
    if(src.includes('core')&&window.LabelWorkbenchBarcodeCore){loadNext();return}
    if(src.includes('ui')&&window.LabelWorkbenchBarcodeUI){loadNext();return}
    if(src.includes('barcode-generator')&&window.LabelWorkbenchBarcodeGenerator){loadNext();return}
    if(src.includes('label-interpreter')&&window.LabelWorkbenchInterpreter){loadNext();return}
    if(src.includes('analysis-accuracy')&&window.LabelWorkbenchAnalysisAccuracy){loadNext();return}
    if(src.includes('analysis-pdf-native')&&window.LabelWorkbenchPdfNative){loadNext();return}
    if(src.includes('analysis-geometry')&&window.LabelWorkbenchAnalysisGeometry){loadNext();return}
    if(src.includes('analysis-field-consistency')&&window.LabelWorkbenchFieldConsistency){loadNext();return}
    if(src.includes('analysis-copy')&&window.LabelWorkbenchAnalysisCopy){loadNext();return}
    if(src.includes('btw-format')&&window.LabelWorkbenchBtwFormat){loadNext();return}
    if(src.includes('btw-object-map')&&window.LabelWorkbenchBtwObjectMap){loadNext();return}
    if(src.includes('btw-layout-map')&&window.LabelWorkbenchBtwLayout){loadNext();return}
    if(src.includes('btw-native')&&window.LabelWorkbenchBtwNative){loadNext();return}
    if(src.includes('bt-bridge')&&window.LabelWorkbenchBtBridge){loadNext();return}
    if(src.includes('workbench-priority')&&window.LabelWorkbenchPriority){loadNext();return}
    if(src.includes('bt-native-primary')&&window.LabelWorkbenchBtNativePrimary){loadNext();return}
    if(src.includes('analysis-confidence-guard')&&window.LabelWorkbenchConfidenceGuard){loadNext();return}
    if(src.includes('analysis-final-display')&&window.LabelWorkbenchFinalDisplay){loadNext();return}
    const s=document.createElement('script');
    s.src=src+'?v='+BUILD+'&t='+Date.now();
    s.async=false;
    s.onload=loadNext;
    s.onerror=()=>{console.error('[Label Workbench] module load failed:',src);loadNext()};
    document.head.appendChild(s);
  }
  loadNext();
})();
