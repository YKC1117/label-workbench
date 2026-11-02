const fs=require('node:fs');
function canonical(label,styles){
  const g=label.sourceGeometry||{}, W=g.widthMm,H=g.heightMm;
  if(![W,H].every(v=>Number.isFinite(v)&&v>0))throw Error('Physical label size required');
  const rows=[...(label.textObjects||[]).map(r=>['text',r]),...(label.barcodes||[]).map(r=>[({'Code 128':'code128','Data Matrix':'datamatrix'})[r.format],r])];
  if(rows.length!==styles.length||!rows.length)throw Error('Style coverage mismatch');
  return {schema:'renderer-probe-v1',widthMm:W,heightMm:H,objects:rows.map(([type,r],i)=>{
    const b=r.sourceBox,s=styles[i],value=r.text??r.value;
    if(!type||s.type!==type||typeof value!=='string'||!value||!b||![b.x,b.y,b.w,b.h].every(Number.isFinite)||b.x<0||b.y<0||b.w<=0||b.h<=0||b.x+b.w>1||b.y+b.h>1)throw Error('Invalid object '+i);
    if(s.rotationDeg!==0||s.referencePoint!=='TopLeft')throw Error('Prototype supports upright top-left frames only');
    const o={id:'OBJECT_'+(i+1),type,value,xMm:b.x*W,yMm:b.y*H,widthMm:b.w*W,heightMm:b.h*H,rotationDeg:s.rotationDeg,referencePoint:s.referencePoint};
    if(type==='text'){
      if(!s.fontName||!(s.fontSizePt>0)||s.alignment!=='left')throw Error('Explicit text style required');
      Object.assign(o,{fontName:s.fontName,fontSizePt:s.fontSizePt,alignment:s.alignment});
    }else{
      if(!Number.isInteger(s.moduleIndex)||s.moduleIndex<0||s.moduleIndex>255||!(s.moduleMm>0)||s.humanReadable!=='none')throw Error('Explicit module profile required');
      Object.assign(o,{moduleIndex:s.moduleIndex,moduleMm:s.moduleMm,humanReadable:s.humanReadable});
    }
    return o;
  })};
}
module.exports={canonical};
if(require.main===module){const data=JSON.parse(fs.readFileSync(process.argv[2]));console.log(JSON.stringify(canonical(data.label,data.styles),null,2));}
