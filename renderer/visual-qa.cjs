'use strict';
const G=require('./geometry.cjs');
const TOLERANCE={centerMm:.5,sizeMm:.5,edgeMm:.5,rotationDeg:.1,overlapAreaMm2:.25};
function angleDelta(a,b){return ((a-b+540)%360+360)%360-180;}
function evaluate(preview,actual,readback){
  const ids=preview.objects.map(o=>o.id),seen=actual.map(o=>o.id);
  if(!ids.length||new Set(seen).size!==seen.length||seen.length!==ids.length||ids.some(id=>!seen.includes(id)))throw Error('Incomplete visual object coverage');
  const objects=preview.objects.map(p=>{
    const a=actual.find(x=>x.id===p.id),r=readback.find(x=>x.id===p.id),expected=p.symbolBounds??p.bounds;
    if(!a.actual||a.status!=='MEASURED')return {id:p.id,status:'UNRESOLVED',reason:'No unique full-page registration'};
    const b=a.actual;
    if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)throw Error('Invalid rendered bounds');
    const delta={centerX:b.x+b.width/2-expected.x-expected.width/2,centerY:b.y+b.height/2-expected.y-expected.height/2,width:b.width-expected.width,height:b.height-expected.height,rotation:r&&Number.isFinite(r.rotationDeg)?angleDelta(-r.rotationDeg,p.rotation):null};
    const policy=p.quality==='TEXT_FRAME_NOT_FONT_INK'?'TEXT_CONTAINMENT':'SYMBOL_INK';
    // Compare text in its unrotated local frame. An AABB is reversible for
    // the certified candidate's orthogonal angles; arbitrary angles fail closed.
    let local=null,alignmentError=null;
    if(policy==='TEXT_CONTAINMENT'&&p.frame){
      const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>G.rotatePoint(x-p.frame.xMm,y-p.frame.yMm,-p.rotation));
      const xs=points.map(q=>q.x),ys=points.map(q=>q.y);
      local={x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
      alignmentError=p.alignment==='center'?(local.x+local.right-p.frame.widthMm)/2:p.alignment==='right'?local.right-p.frame.widthMm:local.x;
    }
    const fail=policy==='SYMBOL_INK'
      ? Math.abs(delta.centerX)>TOLERANCE.centerMm||Math.abs(delta.centerY)>TOLERANCE.centerMm||Math.abs(delta.width)>TOLERANCE.sizeMm||Math.abs(delta.height)>TOLERANCE.sizeMm
      : local ? Math.abs(alignmentError)>TOLERANCE.edgeMm||local.x < -TOLERANCE.edgeMm||local.y < -TOLERANCE.edgeMm||local.right>p.frame.widthMm+TOLERANCE.edgeMm||local.bottom>p.frame.heightMm+TOLERANCE.edgeMm
      : Math.abs(b.x-expected.x)>TOLERANCE.edgeMm||b.y<expected.y-TOLERANCE.edgeMm||b.x+b.width>expected.x+expected.width+TOLERANCE.edgeMm||b.y+b.height>expected.y+expected.height+TOLERANCE.edgeMm;
    const outside=G.outOfBounds(b,preview.label,TOLERANCE.edgeMm);
    const explicitTopLeft=r?.referencePoint==='TopLeft';
    // Current native requests explicitly set TopLeft for every supported object.
    // BarTender 2022 R2 may serialize that default by omitting ReferencePoint.
    // Omission is never sufficient by itself: this branch is reached only after
    // a unique full-page BMP registration supplied a measured rendered bound.
    const omittedRequestedTopLeft=r?.referencePointPresent===false&&r?.referencePoint==null;
    const anchor=explicitTopLeft||omittedRequestedTopLeft;
    const anchorEvidence=explicitTopLeft?'EXPLICIT_XML_TOP_LEFT':omittedRequestedTopLeft?'TOPLEFT_REQUEST_OMITTED_PLUS_UNIQUE_VISUAL_GEOMETRY':'UNPROVEN';
    const supported=p.quality!=='DIAGNOSTIC_ONLY';
    return {id:p.id,status:!supported||delta.rotation===null||!anchor?'UNRESOLVED':fail||outside||Math.abs(delta.rotation)>TOLERANCE.rotationDeg?'FAIL':'PASS',policy,expected,actual:b,localInk:local,alignmentErrorMm:alignmentError,delta,outOfBounds:outside,referencePoint:r?.referencePoint??null,referencePointPresent:r?.referencePointPresent??null,anchorEvidence,rotationEvidence:'COM_READBACK_ONLY',renderedRotation:'NOT_INDEPENDENTLY_VERIFIED',barcodeFootprint:p.footprint};
  });
  const overlaps=[];
  for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
    const a=objects[i],b=objects[j];if(!a.actual||!b.actual)continue;
    const expected=G.intersection(a.expected,b.expected),actualArea=G.intersection(a.actual,b.actual);
    overlaps.push({ids:[a.id,b.id],expectedAreaMm2:expected,actualAreaMm2:actualArea,unexpected:actualArea>expected+TOLERANCE.overlapAreaMm2});
  }
  const quietZones=[];
  for(const p of preview.objects.filter(p=>p.type==='barcode1d')){
    const own=objects.find(o=>o.id===p.id);if(!own?.actual)continue;
    for(const other of objects.filter(o=>o.id!==p.id&&o.actual)){
      const intrusion=G.intersection(p.bounds,other.actual)-G.intersection(p.symbolBounds,other.actual);
      if(intrusion>TOLERANCE.overlapAreaMm2)quietZones.push({id:p.id,intruder:other.id,areaMm2:intrusion,status:'FAIL'});
    }
  }
  const status=objects.some(o=>o.status==='UNRESOLVED')?'UNRESOLVED':objects.some(o=>o.status==='FAIL')||overlaps.some(o=>o.unexpected)||quietZones.length?'FAIL':'PASS_PLACEMENT_AND_SIZE';
  return {schema:'lwb-dual-render-qa-v1',status,tolerance:TOLERANCE,productAcceptance:'NOT_RUN',scope:'orthogonal local-frame text alignment and containment, native pattern rotation gate consumed separately, placement, footprint, containment and API rotation; every native request explicitly asks for TopLeft; BarTender may omit that default in XML only when unique full-page visual geometry independently passes; no independent optical angle estimation',objects,overlaps,quietZones};
}
module.exports={evaluate,TOLERANCE};
