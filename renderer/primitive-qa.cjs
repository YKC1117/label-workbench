'use strict';
const {crop,distance}=require('./rotation-qa.cjs'),{png}=require('./image-raster.cjs');
function check(o,rows,printerDpi){
 const a=crop(rows),w=a[0].length,h=a.length,u=25.4/600;
 if(o.type==='image'){
  const p=png(o.dataUri),b=p.ink,source=p.rows.slice(b.y,b.y+b.height).map(r=>r.subarray(b.x,b.x+b.width));
  if(printerDpi!==300)throw Error('CAPABILITY_UNSUPPORTED: measured 300dpi printer required for PNG image profile');
  // A resampled/dithered output pixel is not a source PNG pixel. Recover the
  // declared binary source lattice by exact area coverage, without offsets or
  // warping. Every original source cell must survive; dense/unrecoverable
  // images fail closed. Physical extent is independently gated in page space.
  if(w/source[0].length<2||h/source.length<2)throw Error('CAPABILITY_UNSUPPORTED: source image resolution exceeds certified native reconstruction');
  const core=source.map((r,y)=>Buffer.from([...r].map((v,x)=>{
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(source[Math.max(0,Math.min(source.length-1,y+dy))][Math.max(0,Math.min(r.length-1,x+dx))]!==v)return 0;
    return 1;
  })));
  for(let y=0;y<source.length;y++)for(let x=0;x<source[0].length;x++){
    let supported=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(core[y+dy]?.[x+dx]&&source[y+dy][x+dx]===source[y][x])supported=true;
    if(!supported)throw Error('CAPABILITY_UNSUPPORTED: PNG contains sub-filter-support features');
  }
  let mismatched=0,boundaryMismatches=0,comparable=0;
  for(let sy=0;sy<source.length;sy++)for(let sx=0;sx<source[0].length;sx++){
   const x0=sx*w/source[0].length,x1=(sx+1)*w/source[0].length,y0=sy*h/source.length,y1=(sy+1)*h/source.length;let ink=0;
   for(let y=Math.floor(y0);y<Math.ceil(y1);y++)for(let x=Math.floor(x0);x<Math.ceil(x1);x++)ink+=a[y][x]*Math.max(0,Math.min(x+1,x1)-Math.max(x,x0))*Math.max(0,Math.min(y+1,y1)-Math.max(y,y0));
   if(core[sy][sx]){comparable++;if(+(ink/((x1-x0)*(y1-y0))>=.5)!==source[sy][sx])mismatched++;}else if(+(ink/((x1-x0)*(y1-y0))>=.5)!==source[sy][sx])boundaryMismatches++;
  }
  return {status:mismatched?'FAIL':'PASS',policy:'EXACT_COMPARABLE_BINARY_SOURCE_INTERIOR',boundaryPolicy:'DIAGNOSTIC_ONLY_RESAMPLING_SUPPORT',comparableSourceCells:comparable,boundaryMismatches,sourceWidth:source[0].length,sourceHeight:source.length,mismatchedSourceCells:mismatched};
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
