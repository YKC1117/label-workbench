'use strict';
const types=new Set(['text','barcode1d','barcode2d','image','line','box']);
function number(v,name,min=0,max=1000){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+name);return v;}
function string(v,name){if(typeof v!=='string'||!v.length||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw Error('Invalid '+name);}
function flag(v,name){if(typeof v!=='boolean')throw Error('Invalid '+name);}
function validate(model){
  if(model?.schema!=='lwb-canonical-v1'||!Array.isArray(model.objects)||model.objects.length<1||model.objects.length>200)throw Error('Invalid canonical schema or object count');
  if(model.runtimeProfile!==undefined&&!['upright-v1','candidate-general-v1'].includes(model.runtimeProfile))throw Error('Invalid runtime profile');
  for(const k of ['widthMm','heightMm'])number(model.label?.[k],k,5);
  number(model.label.dpi,'dpi',72,2400);
  const ids=new Set();
  for(const o of model.objects){
    if(!/^[A-Z0-9_-]{1,64}$/.test(o.id)||ids.has(o.id)||!types.has(o.type))throw Error('Invalid object identity or type');ids.add(o.id);
    number(o.xMm,'xMm',-1000);number(o.yMm,'yMm',-1000);
    number(o.widthMm,'widthMm',.001);number(o.heightMm,'heightMm',.001);number(o.rotation,'rotation',-359,359);flag(o.printable,'printable');
    if(o.type==='text'){
      string(o.text,'text');string(o.fontFamily,'fontFamily');number(o.fontSizePt,'fontSizePt',.5,3600);
      for(const k of ['bold','italic','multiline'])flag(o[k],k);
      if(!['left','center','right'].includes(o.alignment)||!['containment','fixed'].includes(o.frameMode))throw Error('Invalid text layout');
      if(o.multiline&&o.lineHeightMm===undefined)throw Error('CAPABILITY_UNSUPPORTED: explicit multiline lineHeightMm required');
      if(o.multiline)number(o.lineHeightMm,'lineHeightMm',.1,1000);
      if(!o.multiline&&/[\r\n]/.test(o.text))throw Error('Multiline disabled');
    }else if(o.type.startsWith('barcode')){
      string(o.value,'barcode value');number(o.moduleMm,'moduleMm',.001,10);
      if(o.type==='barcode1d'){
        if(o.symbology!=='Code128')throw Error('Unsupported 1D symbology');
        number(o.barHeightMm,'barHeightMm',.1);number(o.quietZoneMm,'quietZoneMm',0,100);flag(o.humanReadable,'humanReadable');
      }else{
        if(o.symbology!=='DataMatrix')throw Error('Unsupported 2D symbology');flag(o.gs1,'gs1');
        if((o.rows===null)!==(o.columns===null))throw Error('Matrix dimensions require both rows and columns');
        for(const k of ['rows','columns'])if(o[k]!==null&&(!Number.isInteger(o[k])||o[k]<8||o[k]>144))throw Error('Invalid '+k);
      }
      if(o.moduleIndex!==null&&(!Number.isInteger(o.moduleIndex)||o.moduleIndex<0||o.moduleIndex>255))throw Error('Invalid printer module index');
    }else if(o.type==='image')string(o.dataUri,'image dataUri');
    else number(o.strokeMm,'strokeMm',.001,100);
  }
  return model;
}
function fromAnalysis(label,styles,dpi){
  const g=label.sourceGeometry||{},rows=[...(label.textObjects||[]).map(r=>['text',r]),...(label.barcodes||[]).map(r=>[r.format==='Code 128'?'barcode1d':r.format==='Data Matrix'?'barcode2d':null,r])];
  if(rows.length!==styles.length)throw Error('Style coverage mismatch');
  const model={schema:'lwb-canonical-v1',label:{widthMm:g.widthMm,heightMm:g.heightMm,dpi},objects:rows.map(([type,r],i)=>{
    const b=r.sourceBox,s=styles[i];
    if(!b||![b.x,b.y,b.w,b.h].every(Number.isFinite)||b.x<0||b.y<0||b.w<=0||b.h<=0||b.x+b.w>1.000001||b.y+b.h>1.000001)throw Error('Invalid sourceBox');
    const base={id:'OBJECT_'+(i+1),type,xMm:b.x*g.widthMm,yMm:b.y*g.heightMm,widthMm:b.w*g.widthMm,heightMm:b.h*g.heightMm,rotation:s.rotationDeg,printable:s.printable??true};
    if(type==='text')return {...base,text:r.text??r.value,fontFamily:s.fontName,fontSizePt:s.fontSizePt,bold:s.bold??false,italic:s.italic??false,alignment:s.alignment,multiline:s.multiline??false,...(s.multiline?{lineHeightMm:s.lineHeightMm}:{}),frameMode:s.frameMode??'containment'};
    return {...base,symbology:r.format==='Code 128'?'Code128':'DataMatrix',value:r.text??r.value,moduleMm:s.moduleMm,moduleIndex:s.moduleIndex??null,...(type==='barcode1d'?{barHeightMm:s.barHeightMm??base.heightMm,humanReadable:s.humanReadable!=='none',quietZoneMm:s.quietZoneMm??0}:{rows:s.rows??null,columns:s.columns??null,gs1:s.gs1??false})};
  })};
  return validate(model);
}
module.exports={validate,fromAnalysis};
