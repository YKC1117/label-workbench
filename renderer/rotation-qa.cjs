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
function comparePattern(upright,actual,angle){
  const expected=rotate(crop(upright),angle),got=crop(actual);
  const equal=expected.length===got.length&&expected[0].length===got[0].length&&expected.every((r,i)=>r.equals(got[i]));
  return {status:equal?'PASS':'FAIL',policy:'EXACT_DARK_MASK_ROTATION_NO_RESIZE',angle,expectedPx:[expected[0].length,expected.length],actualPx:[got[0].length,got.length]};
}
function checkRotations(dir,plan){
  const objects=plan.objects.filter(o=>o.rotationDeg!==0).map(o=>{
    const upright=path.join(dir,'hybrid-'+o.id+'-upright.bmp'),actual=path.join(dir,'visual-'+o.id+'.bmp');
    if(!fs.existsSync(upright)||!fs.existsSync(actual))return {id:o.id,status:'FAIL',reason:'MISSING_INDEPENDENT_UPRIGHT_PATTERN'};
    return {id:o.id,...comparePattern(mask(upright),mask(actual),(-o.rotationDeg%360+360)%360)};
  });
  return {status:objects.every(o=>o.status==='PASS')?'PASS':'FAIL',objects};
}
module.exports={crop,rotate,comparePattern,checkRotations};
