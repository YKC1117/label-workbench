'use strict';
const fs=require('node:fs'),{rotatePoint}=require('./geometry.cjs');
// Renderer adapter conversion, not a second layout estimator. The canonical
// frame is authoritative; the native raster supplies only its anchor-to-ink offset.
function textPlacement(request,raster){
  if(request.type!=='text'||request.referencePoint!=='TopLeft'||request.textOriginPolicy!=='NATIVE_INK_TOP_LEFT')throw Error('Unsupported text placement contract');
  if(![raster.headerDpiX,raster.headerDpiY].every(d=>Number.isFinite(d)&&Math.abs(d-600)<=6))throw Error('Native Text header DPI mismatch');
  if(raster.physicalMmTrust!=='TRUSTED'||raster.requestedDpi!==600)throw Error('Untrusted native Text raster');
  for(const k of ['inkLeftPx','inkTopPx','inkWidthPx','inkHeightPx','canvasWidthPx','canvasHeightPx'])if(!Number.isInteger(raster[k])||raster[k]<0)throw Error('Invalid native ink pixel bounds');
  if(!raster.inkWidthPx||!raster.inkHeightPx||raster.inkLeftPx+raster.inkWidthPx>raster.canvasWidthPx||raster.inkTopPx+raster.inkHeightPx>raster.canvasHeightPx)throw Error('Ink outside native raster');
  for(const k of ['xMm','yMm','widthMm','heightMm','rotationDeg'])if(!Number.isFinite(request[k]))throw Error('Invalid canonical Text geometry');
  if(![0,90,180,270].includes(request.rotationDeg)||!['left','center','right'].includes(request.alignment))throw Error('Unsupported native Text angle/alignment');
  const u=25.4/raster.requestedDpi,width=raster.inkWidthPx*u,height=raster.inkHeightPx*u;
  if(width>request.widthMm+.02||height>request.heightMm+.02)throw Error('Native Text ink exceeds canonical frame');
  const shift=request.alignment==='center'?(request.widthMm-width)/2:request.alignment==='right'?request.widthMm-width:0;
  const inkOffset={xMm:raster.inkLeftPx*u,yMm:raster.inkTopPx*u};
  const local={xMm:shift-inkOffset.xMm,yMm:-inkOffset.yMm};
  const d=rotatePoint(local.xMm,local.yMm,(-request.rotationDeg%360+360)%360);
  return {schema:'lwb-native-text-placement-v1',policy:'MEASURED_INK_ORIGIN_TO_CANONICAL_FRAME',xMm:request.xMm+d.x,yMm:request.yMm+d.y,frame:{xMm:request.xMm,yMm:request.yMm,widthMm:request.widthMm,heightMm:request.heightMm},alignment:request.alignment,alignmentShiftMm:shift,inkOffset,localOffset:local,inkWidthMm:width,inkHeightMm:height,rotationCom:request.rotationDeg};
}
if(require.main===module){
 const [input,output]=process.argv.slice(2),read=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
 fs.writeFileSync(output,JSON.stringify(textPlacement(read.request,read.measurement),null,2));
}
module.exports={textPlacement};
