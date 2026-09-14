/* Label Workbench view-state guard v1.1 */
(function(){
  'use strict';
  const BUILD='20260914-view-guard-123-barcode-crosscheck';
  const RELEASE='v1.9.36';
  const UPDATED='2026/09/14 09:23';
  let desiredView=document.querySelector('.view.active')?.id||'barcode';
  let applying=false;
