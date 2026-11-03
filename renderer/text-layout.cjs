'use strict';
// One expansion for preview and native requests. A multiline canonical object
// becomes independently editable native lines with an explicit physical pitch.
function expand(model){
  const objects=[];
  for(const o of model.objects){
    if(o.type!=='text'||!o.multiline){objects.push(o);continue;}
    if(!Number.isFinite(o.lineHeightMm)||o.lineHeightMm<=0)throw Error('CAPABILITY_UNSUPPORTED: explicit multiline lineHeightMm required');
    const lines=o.text.replace(/\r\n?/g,'\n').split('\n');
    if(lines.some(line=>!line.length))throw Error('CAPABILITY_UNSUPPORTED: blank native text lines');
    if(lines.length*o.lineHeightMm>o.heightMm+1e-8)throw Error('Multiline frame is too short for explicit line pitch');
    const rad=o.rotation*Math.PI/180;
    lines.forEach((text,i)=>{
      const id=o.id+'_L'+(i+1);
      if(id.length>64)throw Error('Expanded line ID exceeds 64 characters');
      objects.push({...o,id,parentId:o.id,text,multiline:false,heightMm:o.lineHeightMm,xMm:o.xMm-i*o.lineHeightMm*Math.sin(rad),yMm:o.yMm+i*o.lineHeightMm*Math.cos(rad)});
    });
  }
  if(objects.length>200||new Set(objects.map(o=>o.id)).size!==objects.length)throw Error('Expanded object identity/capacity conflict');
  return {...model,objects};
}
module.exports={expand};
