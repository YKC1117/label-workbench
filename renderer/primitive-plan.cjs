'use strict';
const G=require('./geometry.cjs'),{png}=require('./image-raster.cjs');
const norm=a=>(a%360+360)%360;
function plan(o){
 if(!['line','box','image'].includes(o.type)||o.rotation!==0)throw Error('CAPABILITY_UNSUPPORTED: upright primitive required');
 let ink,extra={},referencePoint='TopLeft',nativeType={line:2,box:3,image:6}[o.type],rotationDeg=0;
 if(o.type==='line'){
  const length=Math.hypot(o.widthMm,o.heightMm),nx=-o.heightMm/length*o.strokeMm/2,ny=o.widthMm/length*o.strokeMm/2;
  const points=[[nx,ny],[-nx,-ny],[o.widthMm+nx,o.heightMm+ny],[o.widthMm-nx,o.heightMm-ny]],xs=points.map(p=>p[0]+o.xMm),ys=points.map(p=>p[1]+o.yMm);
  ink={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
  referencePoint='Center';rotationDeg=norm(-Math.atan2(o.heightMm,o.widthMm)*180/Math.PI);
  extra={startX:o.xMm,startY:o.yMm,endX:o.xMm+o.widthMm,endY:o.yMm+o.heightMm,strokeMm:o.strokeMm};
 }else if(o.type==='box'){
  if(o.widthMm<=2*o.strokeMm||o.heightMm<=2*o.strokeMm)throw Error('Box interior too small for hollow stroke contract');
  ink={x:o.xMm-o.strokeMm/2,y:o.yMm-o.strokeMm/2,width:o.widthMm+o.strokeMm,height:o.heightMm+o.strokeMm};extra={strokeMm:o.strokeMm};
 }else{
  const p=png(o.dataUri),b=p.ink;if(!p.binary)throw Error('CAPABILITY_UNSUPPORTED: monochrome PNG image profile required');ink={x:o.xMm+b.x/p.width*o.widthMm,y:o.yMm+b.y/p.height*o.heightMm,width:b.width/p.width*o.widthMm,height:b.height/p.height*o.heightMm};extra={dataUri:o.dataUri,assetSha256:p.sha256};
 }
 return {nativeType,referencePoint,rotationDeg,ink,...extra};
}
module.exports={plan};
