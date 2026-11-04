'use strict';
// Source PDF vs BarTender native whole-format raster, per canonical object.
// Usage: node tools/compare-source-native.cjs <source.pdf> <canonical.json> <native-600dpi.bmp> <out.json>
// Ink boxes are measured inside each object's window in both rasters (gray<128).
// Tolerances are existing ones: per-edge 0.5 mm (renderer/visual-qa.cjs edgeMm);
// one global page translation of at most one 300 dpi printer dot (2 px at
// 600 dpi, Run49 registration policy). Raw deltas are always reported.
const fs=require('node:fs');
const {extract}=require('./pdf-to-canonical.cjs');
const {mask}=require('../native/Label_Workbench_Native_Layout_ENGINE_V1/program/compare-render.cjs');
const {TOLERANCE}=require('../renderer/visual-qa.cjs');
const DPI=600,PX=DPI/25.4,MAX_SHIFT_PX=2,MARGIN_MM=1.0;

function inkBox(get,w,h,box){
  const X0=Math.max(0,Math.floor((box.x-MARGIN_MM)*PX)),X1=Math.min(w-1,Math.ceil((box.x+box.w+MARGIN_MM)*PX));
  const Y0=Math.max(0,Math.floor((box.y-MARGIN_MM)*PX)),Y1=Math.min(h-1,Math.ceil((box.y+box.h+MARGIN_MM)*PX));
  let x0=Infinity,y0=Infinity,x1=-1,y1=-1;
  for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++)if(get(x,y)){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return x1<0?null:{x:x0/PX,y:y0/PX,w:(x1-x0+1)/PX,h:(y1-y0+1)/PX};
}
function windowOf(o){
  if(o.type==='barcode1d')return {x:o.xMm+o.quietZoneMm,y:o.yMm,w:o.widthMm-2*o.quietZoneMm,h:o.heightMm};
  return {x:o.xMm,y:o.yMm,w:o.widthMm,h:o.heightMm};
}
async function compare(pdf,canonicalFile,bmp){
  const canonical=JSON.parse(fs.readFileSync(canonicalFile,'utf8').replace(/^\uFEFF/,''));
  const src=(await extract(pdf)).input.raster;
  const nat=mask(bmp),nh=nat.length,nw=nh?nat[0].length:0;
  const sGet=(x,y)=>src.gray[y*src.width+x]<128,nGet=(x,y)=>!!nat[y]?.[x];
  const rows=canonical.objects.map(o=>{
    const win=windowOf(o),s=inkBox(sGet,src.width,src.height,win),n=inkBox(nGet,nw,nh,win);
    return {id:o.id,type:o.type,source:s,native:n,raw:s&&n?{dx:n.x-s.x,dy:n.y-s.y,dw:n.w-s.w,dh:n.h-s.h}:null};
  });
  const failures=[];
  if(Math.abs(nw-src.width)>MAX_SHIFT_PX||Math.abs(nh-src.height)>MAX_SHIFT_PX)failures.push('PAGE_RASTER_SIZE_MISMATCH '+nw+'x'+nh+' vs '+src.width+'x'+src.height);
  for(const r of rows)if(!r.raw)failures.push('INK_NOT_FOUND '+r.id);
  // Global translation: median of barcode dx/dy (vector-exact objects), bounded.
  const bars=rows.filter(r=>r.raw&&r.type!=='text'),med=a=>{const s=a.slice().sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
  const shift={dx:med(bars.map(r=>r.raw.dx)),dy:med(bars.map(r=>r.raw.dy))};
  if(Math.abs(shift.dx)*PX>MAX_SHIFT_PX+1e-6||Math.abs(shift.dy)*PX>MAX_SHIFT_PX+1e-6)failures.push('PAGE_REGISTRATION_EXCEEDS_ONE_PRINTER_DOT');
  const tol=TOLERANCE.edgeMm,r4=v=>Math.round(v*1e4)/1e4;
  for(const r of rows){
    if(!r.raw)continue;
    r.corrected={dx:r4(r.raw.dx-shift.dx),dy:r4(r.raw.dy-shift.dy),dw:r4(r.raw.dw),dh:r4(r.raw.dh)};
    for(const k of ['dx','dy'])r.raw[k]=r4(r.raw[k]);for(const k of ['dw','dh'])r.raw[k]=r4(r.raw[k]);
    r.pass=Object.values(r.corrected).every(v=>Math.abs(v)<=tol+1e-9);
    if(!r.pass)failures.push('OBJECT_DEVIATION '+r.id+' '+JSON.stringify(r.corrected));
  }
  return {schema:'lwb-source-native-comparison-v1',status:failures.length?'FAIL':'PASS',toleranceMm:tol,toleranceBasis:'renderer/visual-qa.cjs TOLERANCE.edgeMm',
    maxGlobalShiftPx:MAX_SHIFT_PX,globalShiftMm:{dx:r4(shift.dx),dy:r4(shift.dy)},sourceRasterPx:[src.width,src.height],nativeRasterPx:[nw,nh],objects:rows,failures};
}
module.exports={compare,inkBox,windowOf};
if(require.main===module){
  const [pdf,can,bmp,out]=process.argv.slice(2);
  compare(pdf,can,bmp).then(r=>{fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log('source comparison: '+r.status+(r.failures.length?' '+r.failures.join(' | '):''));process.exit(r.status==='PASS'?0:2);})
    .catch(e=>{fs.writeFileSync(out,JSON.stringify({schema:'lwb-source-native-comparison-v1',status:'NOT_RUN',error:String(e&&e.stack||e)},null,2));console.error(e);process.exit(1);});
}
