'use strict';
const {validate}=require('./canonical.cjs'),{anchor}=require('./geometry.cjs'),{footprint}=require('./barcode.cjs');
function nativeRequest(model){
  validate(model);
  const objects=model.objects.filter(o=>o.printable).map(o=>{
    if(o.rotation!==0)throw Error('CAPABILITY_UNSUPPORTED: rotated native anchor is not runtime-certified');
    if(!['text','barcode1d','barcode2d'].includes(o.type))throw Error('CAPABILITY_UNSUPPORTED: '+o.type);
    const pos=anchor(o,'TopLeft');
    const common={id:o.id,type:o.type==='barcode1d'?'code128':o.type==='barcode2d'?'datamatrix':'text',value:o.text??o.value,xMm:pos.xMm,yMm:pos.yMm,widthMm:o.widthMm,heightMm:o.heightMm,rotationDeg:pos.rotationCom,printable:o.printable};
    if(o.type==='text'){
      if(o.multiline||o.alignment!=='left'||o.frameMode==='fixed')throw Error('CAPABILITY_UNSUPPORTED: fixed/paragraph/rich text requires certified component');
      return {...common,fontName:o.fontFamily,fontSizePt:o.fontSizePt,alignment:o.alignment,bold:o.bold,italic:o.italic,anchorPolicy:'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE'};
    }
    if(o.moduleIndex===null)throw Error('CAPABILITY_UNSUPPORTED: explicit printer module profile required');
    if(o.type==='barcode1d'&&(o.humanReadable||o.quietZoneMm!==0))throw Error('CAPABILITY_UNSUPPORTED: caption/quiet-zone anchor requires runtime certification');
    if(o.type==='barcode2d'&&o.gs1)throw Error('CAPABILITY_UNSUPPORTED: GS1 Data Matrix component required');
    const fp=footprint(o);
    if(o.type==='barcode2d'&&fp.rows!==fp.columns)throw Error('CAPABILITY_UNSUPPORTED: rectangular Data Matrix component required');
    return {...common,referencePoint:'TopLeft',heightMm:o.type==='barcode1d'?o.barHeightMm:o.heightMm,moduleMm:o.moduleMm,moduleIndex:o.moduleIndex,humanReadable:'none',rows:fp.rows??null,columns:fp.columns??null};
  });
  if(!objects.length)throw Error('No printable objects');
  return {schema:'renderer-probe-v1',revision:'20261103-btc-core-v1',widthMm:model.label.widthMm,heightMm:model.label.heightMm,dpi:model.label.dpi,objects};
}
module.exports={nativeRequest};
