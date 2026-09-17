/* Retired: rich failure must never fall back to a CEA summary object. */
(function(){
  'use strict';
  const install=()=>false;
  async function richDownload(){throw new Error('BTW_BINARY_EXPORT_DISABLED: Windows runtime verification required');}
  window.LabelWorkbenchBtwRichBridge={install,richDownload,installed:false};
})();
