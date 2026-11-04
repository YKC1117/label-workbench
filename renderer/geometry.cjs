'use strict';
// mm/dots conversion and measured-footprint separation inspired by ZPLab (MIT).
// See third_party/zplab/NOTICE.md. Coordinates remain fractional mm internally.
const mmToDots=(mm,dpi)=>Math.round(mm*dpi/25.4);
const dotsToMm=(dots,dpi)=>dots*25.4/dpi;
function rotatePoint(x,y,deg){
  const t=deg*Math.PI/180;
  return {x:x*Math.cos(t)-y*Math.sin(t),y:x*Math.sin(t)+y*Math.cos(t)};
}
function bounds(o){
  const corners=[[0,0],[o.widthMm,0],[0,o.heightMm],[o.widthMm,o.heightMm]]
    .map(([x,y])=>rotatePoint(x,y,o.rotation));
  const xs=corners.map(p=>p.x+o.xMm),ys=corners.map(p=>p.y+o.yMm);
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
function anchor(o,referencePoint){
  const positions={TopLeft:[0,0],TopCenter:[.5,0],TopRight:[1,0],CenterLeft:[0,.5],Center:[.5,.5],CenterRight:[1,.5],BottomLeft:[0,1],BottomCenter:[.5,1],BottomRight:[1,1]};
  if(!positions[referencePoint])throw Error('Unknown anchor '+referencePoint);
  const [fx,fy]=positions[referencePoint],p=rotatePoint(o.widthMm*fx,o.heightMm*fy,o.rotation);
  return {xMm:o.xMm+p.x,yMm:o.yMm+p.y,rotationCom:o.rotation===0?0:-o.rotation};
}
function intersection(a,b){return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));}
function outOfBounds(b,label,tolerance=0){return b.x < -tolerance||b.y < -tolerance||b.x+b.width>label.widthMm+tolerance||b.y+b.height>label.heightMm+tolerance;}
module.exports={mmToDots,dotsToMm,rotatePoint,bounds,anchor,intersection,outOfBounds};
