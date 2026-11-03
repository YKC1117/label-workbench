'use strict';
const {crop,distance}=require('./rotation-qa.cjs'),{png}=require('./image-raster.cjs');
function check(o,rows,printerDpi){
 const a=crop(rows),w=a[0].length,h=a.length,u=25.4/600;
 if(o.type==='image'){
  const p=png(o.dataUri),b=p.ink,source=p.rows.slice(b.y,b.y+b.height).map(r=>r.subarray(b.x,b.x+b.width));
  const expected=Array.from({length:h},(_,y)=>Buffer.from(Array.from({length:w},(_,x)=>source[Math.min(source.length-1,Math.floor((y+.5)*source.length/h))][Math.min(source[0].length-1,Math.floor((x+.5)*source[0].length/w))])));
  // No angle ambiguity check for images (a logo may be symmetric); source
  // identity is instead independently checked against its declared PNG pixels.
  if(printerDpi!==300)throw Error('CAPABILITY_UNSUPPORTED: measured 300dpi printer required for PNG image profile');
  const radius=600/printerDpi,direct=distance(expected,a,radius);return {status:direct.within?'PASS':'FAIL',policy:'DECLARED_PNG_PATTERN_ONE_MEASURED_PRINTER_DOT',printerDpi,tolerancePx:radius,toleranceMm:25.4/printerDpi,differingPixels:direct.differingPixels,unmatchedPixels:direct.unmatchedPixels};
 }
 if(o.type==='box'){
  const band=Math.ceil((o.strokeMm+.1)/u);let interior=0;for(let y=band;y<h-band;y++)for(let x=band;x<w-band;x++)interior+=a[y][x];
  const edges=[...Array(w).keys()].every(x=>a.slice(0,band).some(r=>r[x])&&a.slice(h-band).some(r=>r[x]))&&[...Array(h).keys()].every(y=>a[y].subarray(0,band).some(v=>v)&&a[y].subarray(w-band).some(v=>v));
  const x=Math.floor(w/2),y=Math.floor(h/2),thickness=[a.slice(0,band).reduce((n,r)=>n+r[x],0),a.slice(h-band).reduce((n,r)=>n+r[x],0),a[y].subarray(0,band).reduce((a,b)=>a+b,0),a[y].subarray(w-band).reduce((a,b)=>a+b,0)].map(n=>n*u);
  return {status:!interior&&edges&&thickness.every(t=>Math.abs(t-o.strokeMm)<=.1)?'PASS':'FAIL',policy:'HOLLOW_NATIVE_RECTANGLE',interiorInkPixels:interior,strokeMm:thickness};
 }
 const dx=o.widthMm,dy=o.heightMm,len=Math.hypot(dx,dy),cx=(w-1)/2,cy=(h-1)/2;let outside=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[y][x]){const xx=(x-cx)*u,yy=(y-cy)*u,perp=Math.abs(-xx*dy+yy*dx)/len,along=Math.abs(xx*dx+yy*dy)/len;if(perp>o.strokeMm/2+.1||along>len/2+.1)outside++;}
 const measured=a.reduce((n,r)=>n+r.reduce((n,v)=>n+v,0),0)*u*u/len;
 return {status:outside||Math.abs(measured-o.strokeMm)>.1?'FAIL':'PASS',policy:'NATIVE_STRAIGHT_STROKE_GEOMETRY',outsideStrokePixels:outside,strokeMm:measured};
}
module.exports={check};
