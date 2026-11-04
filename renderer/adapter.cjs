'use strict';
const {validate}=require('./canonical.cjs'),{anchor,rotatePoint}=require('./geometry.cjs'),{footprint}=require('./barcode.cjs');
function nativeRequest(model){
  validate(model);
  const primitives=model.runtimeProfile==='candidate-primitives-v1',candidate=primitives||model.runtimeProfile==='candidate-general-v1';
  model=require('./text-layout.cjs').expand(model);
  const objects=model.objects.filter(o=>o.printable).map(o=>{
    if(o.rotation!==0&&(!candidate||![90,180,270].includes(o.rotation)))throw Error('CAPABILITY_UNSUPPORTED: rotated native anchor is not runtime-certified');
    if(primitives&&['image','line','box'].includes(o.type)){const p=require('./primitive-plan.cjs').plan(o);return {id:o.id,type:o.type,value:'',xMm:o.xMm,yMm:o.yMm,widthMm:o.widthMm,heightMm:o.heightMm,printable:true,...p};}
    if(!['text','barcode1d','barcode2d'].includes(o.type))throw Error('CAPABILITY_UNSUPPORTED: '+o.type);
    const pos=anchor(o,'TopLeft');
    const common={id:o.id,type:o.type==='barcode1d'?'code128':o.type==='barcode2d'?'datamatrix':'text',value:o.text??o.value,xMm:pos.xMm,yMm:pos.yMm,widthMm:o.widthMm,heightMm:o.heightMm,rotationDeg:candidate?(pos.rotationCom%360+360)%360:pos.rotationCom,printable:o.printable};
    if(o.type==='text'){
      if(o.frameMode==='fixed'||(!candidate&&(o.parentId||o.alignment!=='left')))throw Error('CAPABILITY_UNSUPPORTED: fixed/paragraph/rich text requires certified component');
      if((o.bold||o.italic)&&!candidate)throw Error('CAPABILITY_UNSUPPORTED: bold/italic Text pool variants are not runtime-certified');
      return {...common,referencePoint:'TopLeft',fontName:o.fontFamily,fontSizePt:o.fontSizePt,...(candidate?{bold:o.bold,italic:o.italic,parentId:o.parentId??null,coordinateQuantumMm:.0254,textOriginPolicy:'NATIVE_INK_TOP_LEFT'}:{}),alignment:o.alignment,anchorPolicy:'BARTENDER_DOCUMENTED_DEFAULT_TOP_LEFT_VISUAL_GATE',fontMutationPolicy:'DESIGNER_TEXT_POOL_AUTOMATION'};
    }
    if(o.moduleIndex===null)throw Error('CAPABILITY_UNSUPPORTED: explicit printer module profile required');
    if(o.type==='barcode1d'&&((o.humanReadable&&!primitives)||(!candidate&&o.quietZoneMm!==0)))throw Error('CAPABILITY_UNSUPPORTED: caption/quiet-zone anchor requires runtime certification');
    if(o.type==='barcode2d'&&o.gs1)throw Error('CAPABILITY_UNSUPPORTED: GS1 Data Matrix component required');
    if(o.type==='barcode1d'&&o.humanReadable){const c=o.caption;if(!c||Math.abs(o.heightMm-o.barHeightMm-c.gapMm-c.heightMm)>.001||o.rotation!==0||c.fontFamily!=='Arial'||c.fontSizePt!==12||c.alignment!=='center'||c.gapMm!==1.1||!Number.isFinite(c.heightMm)||c.heightMm<3||c.heightMm>10)throw Error('CAPABILITY_UNSUPPORTED: explicit native Arial12 centered HRI contract required');}
    const fp=footprint(o);
    if(o.type==='barcode2d'&&fp.rows!==fp.columns)throw Error('CAPABILITY_UNSUPPORTED: rectangular Data Matrix component required');
    const offset=rotatePoint(o.type==='barcode1d'?o.quietZoneMm:0,0,o.rotation);
    return {...common,xMm:common.xMm+offset.x,yMm:common.yMm+offset.y,quietZoneMm:o.quietZoneMm??0,...(candidate?{widthMm:fp.symbolWidthMm}:{}),referencePoint:'TopLeft',heightMm:o.type==='barcode1d'?o.barHeightMm:candidate?fp.symbolHeightMm:o.heightMm,moduleMm:o.moduleMm,moduleIndex:o.moduleIndex,humanReadable:o.type==='barcode1d'&&o.humanReadable?'native-arial12-center':'none',...(o.humanReadable?{caption:o.caption}:{}),rows:fp.rows??null,columns:fp.columns??null};
  });
  if(!objects.length)throw Error('No printable objects');
  return {schema:'renderer-probe-v1',revision:primitives?'20261103-native-primitives-v1':candidate?'20261103-native-ink-origin-v2':'20261103-hybrid-text-pool-btc-v1',widthMm:model.label.widthMm,heightMm:model.label.heightMm,dpi:model.label.dpi,runtimeProfile:model.runtimeProfile??'upright-v1',objects};
}
module.exports={nativeRequest};
