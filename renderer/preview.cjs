'use strict';
const {validate}=require('./canonical.cjs'),G=require('./geometry.cjs'),{footprint}=require('./barcode.cjs');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function preview(model){
  validate(model);model=require('./text-layout.cjs').expand(model);const objects=[],elements=[];
  for(const o of model.objects.filter(o=>o.printable)){
    let body='',local={...o},quality='MODEL_FRAME',fp=null;
    if(o.type.startsWith('barcode')){
      fp=footprint(o);local.widthMm=fp.widthMm;local.heightMm=fp.heightMm;quality=fp.confidence;
      if(o.type==='barcode1d'){
        let x=o.quietZoneMm;
        fp.raw.sbs.forEach((n,i)=>{const w=n*o.moduleMm;if(i%2===0)body+='<rect x="'+x+'" y="0" width="'+w+'" height="'+o.barHeightMm+'"/>';x+=w;});
        if(o.humanReadable&&o.caption)body+='<text x="'+(o.quietZoneMm+fp.symbolWidthMm/2)+'" y="'+(o.barHeightMm+o.caption.gapMm)+'" dominant-baseline="text-before-edge" text-anchor="middle" font-family="Arial" font-size="'+12*25.4/72+'">'+escape(o.value)+'</text>';
      }else for(let y=0;y<fp.rows;y++)for(let x=0;x<fp.columns;x++)if(fp.raw.pixs[y*fp.columns+x])body+='<rect x="'+x*o.moduleMm+'" y="'+y*o.moduleMm+'" width="'+o.moduleMm+'" height="'+o.moduleMm+'"/>';
    }else if(o.type==='text'){
      quality='TEXT_FRAME_NOT_FONT_INK';
      const x=o.alignment==='center'?o.widthMm/2:o.alignment==='right'?o.widthMm:0;
      body='<text x="'+x+'" y="0" dominant-baseline="text-before-edge" text-anchor="'+({left:'start',center:'middle',right:'end'})[o.alignment]+'" font-family="'+escape(o.fontFamily)+'" font-size="'+o.fontSizePt*25.4/72+'" font-weight="'+(o.bold?'bold':'normal')+'" font-style="'+(o.italic?'italic':'normal')+'">'+escape(o.text)+'</text>';
    }else if(o.type==='box')body='<rect width="'+o.widthMm+'" height="'+o.heightMm+'" fill="none" stroke="black" stroke-width="'+o.strokeMm+'"/>';
    else if(o.type==='line')body='<line x2="'+o.widthMm+'" y2="'+o.heightMm+'" stroke="black" stroke-width="'+o.strokeMm+'"/>';
    else body='<image width="'+o.widthMm+'" height="'+o.heightMm+'" href="'+escape(o.dataUri)+'"/>';
    const primitive=model.runtimeProfile==='candidate-primitives-v1'&&['line','box','image'].includes(o.type)?require('./primitive-plan.cjs').plan(o):null;
    if(primitive)quality='PRIMITIVE_INK';
    const caption=o.type==='barcode1d'&&o.humanReadable&&o.caption?{x:o.xMm+o.quietZoneMm,y:o.yMm+o.barHeightMm+o.caption.gapMm,width:fp.symbolWidthMm,height:o.caption.heightMm}:null;
    if(caption){local.heightMm=o.barHeightMm+o.caption.gapMm+o.caption.heightMm;quality='NATIVE_HRI_SEGMENTED';}
    const bounds=primitive?primitive.ink:G.bounds(local),offset=G.rotatePoint(fp?.quietZoneMm??0,0,o.rotation),symbol=fp?G.bounds({...o,xMm:o.xMm+offset.x,yMm:o.yMm+offset.y,widthMm:fp.symbolWidthMm,heightMm:fp.symbolHeightMm}):null;
    objects.push({id:o.id,type:o.type,strokeMm:o.strokeMm??null,captionFrame:caption,nativeReferencePoint:primitive?.referencePoint??'TopLeft',expectedComRotationDeg:primitive?.rotationDeg??G.anchor(o,'TopLeft').rotationCom,textOriginPolicy:o.type==='text'&&['candidate-general-v1','candidate-primitives-v1'].includes(model.runtimeProfile)?'NATIVE_INK_TOP_LEFT':null,frame:o.type==='text'?{xMm:o.xMm,yMm:o.yMm,widthMm:o.widthMm,heightMm:o.heightMm}:null,alignment:o.alignment??null,parentId:o.parentId??null,bounds,symbolBounds:symbol,rotation:o.rotation,quality,footprint:fp?{widthMm:fp.widthMm,heightMm:fp.heightMm,rows:fp.rows??null,columns:fp.columns??null}:null});
    elements.push('<g data-id="'+o.id+'" transform="translate('+o.xMm+' '+o.yMm+') rotate('+o.rotation+')">'+body+'</g>');
  }
  return {schema:'lwb-preview-v1',label:model.label,objects,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="'+model.label.widthMm+'mm" height="'+model.label.heightMm+'mm" viewBox="0 0 '+model.label.widthMm+' '+model.label.heightMm+'">'+elements.join('')+'</svg>'};
}
module.exports={preview};
