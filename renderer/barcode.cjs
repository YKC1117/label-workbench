'use strict';
const bwip=require('bwip-js');
// Inject the encoder so synthetic geometry and actual BarTender measurements
// remain independent. No payload-length width guesses or arbitrary stretching.
function footprint(o,encoder=bwip){
  const opts={bcid:o.type==='barcode1d'?'code128':o.gs1?'gs1datamatrix':'datamatrix',text:o.value,includetext:false};
  if(o.type==='barcode2d'&&o.rows!==null&&o.columns!==null)opts.version=o.rows+'x'+o.columns;
  const [raw]=encoder.raw(opts);
  if(o.type==='barcode1d'){
    const modules=raw.sbs.reduce((a,b)=>a+b,0),width=modules*o.moduleMm;
    return {widthMm:width+2*o.quietZoneMm,heightMm:o.barHeightMm,symbolWidthMm:width,symbolHeightMm:o.barHeightMm,modules,quietZoneMm:o.quietZoneMm,humanReadable:o.humanReadable,opts,raw,confidence:o.humanReadable?'DIAGNOSTIC_ONLY':'ENCODER_FOOTPRINT'};
  }
  if(!raw?.pixx||!raw?.pixy)throw Error('Encoder did not provide matrix dimensions');
  return {widthMm:raw.pixx*o.moduleMm,heightMm:raw.pixy*o.moduleMm,symbolWidthMm:raw.pixx*o.moduleMm,symbolHeightMm:raw.pixy*o.moduleMm,rows:raw.pixy,columns:raw.pixx,opts,raw,confidence:'ENCODER_FOOTPRINT'};
}
module.exports={footprint};
