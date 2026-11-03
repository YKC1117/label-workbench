'use strict';
const fs=require('node:fs'),path=require('node:path');
const {mask}=require('../native/Label_Workbench_Native_Layout_ENGINE_V1/program/compare-render.cjs');
function crop(rows){
  const ys=rows.flatMap((r,y)=>r.some(v=>v)?[y]:[]);if(!ys.length)throw Error('Empty rotation evidence');
  const left=Math.min(...rows.map(r=>r.indexOf(1)).filter(x=>x>=0));
  const right=Math.max(...rows.map(r=>r.lastIndexOf(1)));
  return rows.slice(ys[0],ys.at(-1)+1).map(r=>r.subarray(left,right+1));
}
function rotate(rows,angle){
  if(![0,90,180,270].includes(angle))throw Error('Uncertified optical rotation');
  let out=rows.map(r=>Buffer.from(r));
  for(let i=0;i<angle/90;i++)out=Array.from({length:out[0].length},(_,y)=>Buffer.from(out.map(r=>r[y]).reverse()));
  return out;
}
function distance(a,b,radius){
  if(a.length!==b.length||a[0].length!==b[0].length)return {within:false,differingPixels:null,unmatchedPixels:null};
  let differing=0,unmatched=0;
  for(let y=0;y<a.length;y++)for(let x=0;x<a[0].length;x++)if(a[y][x]!==b[y][x]){
    differing++;let found=false;
    // Symmetric distance: every ink pixel in either mask must have an ink
    // counterpart within the physical rasterization radius in the other mask.
    const target=a[y][x]?b:a;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(target[y+dy]?.[x+dx])found=true;
    if(!found)unmatched++;
  }
  return {within:unmatched===0,differingPixels:differing,unmatchedPixels:unmatched};
}
function comparePattern(upright,actual,angle,text=false){
  const source=crop(upright),expected=rotate(source,angle),got=crop(actual),radius=text?1:0;
  const result=distance(expected,got,radius);
  const alternatives=[0,90,180,270].filter(a=>a!==angle&&distance(rotate(source,a),got,radius).within);
  return {status:result.within&&!alternatives.length?'PASS':'FAIL',policy:text?'BIDIRECTIONAL_INK_DISTANCE_1PX_IDENTICAL_EXTENT_UNIQUE_ANGLE':'EXACT_DARK_MASK_ROTATION_UNIQUE_ANGLE',angle,tolerancePx:radius,toleranceMmAt600Dpi:radius*25.4/600,exactMaskEqual:result.differingPixels===0,ambiguousAngles:alternatives,...result,expectedPx:[expected[0].length,expected.length],actualPx:[got[0].length,got.length]};
}
function checkRotations(dir,plan){
  const objects=plan.objects.filter(o=>o.rotationDeg!==0).map(o=>{
    const upright=path.join(dir,'hybrid-'+o.id+'-upright.bmp'),actual=path.join(dir,'visual-'+o.id+'.bmp');
    if(!fs.existsSync(upright)||!fs.existsSync(actual))return {id:o.id,status:'FAIL',reason:'MISSING_INDEPENDENT_UPRIGHT_PATTERN'};
    return {id:o.id,...comparePattern(mask(upright),mask(actual),(-o.rotationDeg%360+360)%360,o.type==='text')};
  });
  return {status:objects.every(o=>o.status==='PASS')?'PASS':'FAIL',objects};
}
module.exports={crop,rotate,comparePattern,checkRotations};
