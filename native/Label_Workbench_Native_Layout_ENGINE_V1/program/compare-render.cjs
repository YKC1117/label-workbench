// Exact, translation-only registration of object ink within a full-page export.
const fs = require('fs');
const path = require('path');

function mask(file) {
  const b = fs.readFileSync(file);
  const offset = b.readUInt32LE(10), dib = b.readUInt32LE(14);
  const w = b.readInt32LE(18), sh = b.readInt32LE(22), h = Math.abs(sh);
  const bits = b.readUInt16LE(28), stride = Math.ceil(w * bits / 32) * 4;
  if (b.toString('ascii',0,2)!=='BM' || dib<40 || ![1,24,32].includes(bits) ||
      b.readUInt32LE(30)!==0 || w<=0 || h<=0 || w*h>48e6 || offset+stride*h>b.length)
    throw Error('Unsupported full-page/object raster');
  const dark = i => b[i]+b[i+1]+b[i+2]<384;
  const rows=[];
  for(let y=0;y<h;y++){
    const start=offset+stride*(sh>0?h-1-y:y), row=Buffer.alloc(w);
    for(let x=0;x<w;x++) row[x]=bits===1
      ? +dark(14+dib+4*((b[start+(x>>3)]>>(7-(x&7)))&1))
      : +dark(start+x*(bits/8));
    rows.push(row);
  }
  return rows;
}
function locate(page, tile) {
  // Pick the row with the most transitions to avoid searching on blank padding.
  let best=0, score=-1;
  tile.forEach((r,i)=>{
    let n=0; for(let x=1;x<r.length;x++) if(r[x]!==r[x-1]) n++;
    if(n>score){score=n;best=i;}
  });
  let found=null;
  for(let y=0;y<=page.length-tile.length;y++){
    const row=page[y+best];
    for(let x=row.indexOf(tile[best]);x>=0;x=row.indexOf(tile[best],x+1)){
      if(tile.every((r,i)=>page[y+i].subarray(x,x+r.length).equals(r))){
        if(found)return null;
        found={x,y};
      }
    }
  }
  return found;
}
function compare(dir, ev, input) {
  const plan=input.layout??input;
  const page=mask(path.join(dir,'native-format-preview.bmp')), u=25.4/ev.requestedDpi;
  const mapped=Math.abs(page[0].length-plan.widthMm/u)<=2 && Math.abs(page.length-plan.heightMm/u)<=2;
  return ev.objects.map(o=>{
    const p=plan.objects.find(v=>v.id===o.id), r=o.raster;
    const b=p.sourceBox;
    const source=b?{x:b.x*plan.widthMm,y:b.y*plan.heightMm,width:b.w*plan.widthMm,height:b.h*plan.heightMm,rotation:null}:null;
    const expected=source??input.expected?.[o.id]??{x:p.xMm,y:p.yMm,width:p.widthMm??p.sizeMm??null,height:p.heightMm??p.sizeMm??null,rotation:p.rotationDeg??0};
    const tile=mask(path.join(dir,'visual-'+o.id+'.bmp')).slice(r.inkTopPx,r.inkTopPx+r.inkHeightPx)
      .map(row=>row.subarray(r.inkLeftPx,r.inkLeftPx+r.inkWidthPx));
    const pos=mapped?locate(page,tile):null;
    const actual=pos?{x:pos.x*u,y:pos.y*u,width:r.inkWidthPx*u,height:r.inkHeightPx*u}:null;
    const delta=actual?{dx:actual.x-expected.x,dy:actual.y-expected.y,
      dw:expected.width===null?null:actual.width-expected.width,
      dh:expected.height===null?null:actual.height-expected.height}:null;
    // Both centers lie in page space. Account for the full size difference:
    // left-, center- and right-aligned nested intervals all have zero excess.
    function excess(d,sizeDelta){
      return sizeDelta===null?null:Math.sign(d+sizeDelta/2)*Math.max(0,Math.abs(d+sizeDelta/2)-Math.abs(sizeDelta)/2);
    }
    const metrics={};
    for(const k of ['dx','dy','dw','dh']){
      metrics[k]={policy:delta?.[k]==null?'NOT_COMPARABLE':'DIAGNOSTIC_ONLY',value:delta?.[k]??null};
    }
    for(const [axis,key,size] of [['X','dx','dw'],['Y','dy','dh']]){
      const v=source&&delta?excess(delta[key],delta[size]):null;
      metrics['placement'+axis]={policy:!Number.isFinite(v)?'NOT_COMPARABLE':'COMPARABLE',value:v};
    }
    metrics.renderedRotation={policy:'NOT_COMPARABLE',value:null};
    return {id:o.id,metrics,status:pos?'MEASURED':'UNRESOLVED',expected,actual,delta,
      rotationDeltaRendered:null,rotationDeltaCom:expected.rotation===null?null:((o.rotationDeg-expected.rotation+540)%360+360)%360-180};
  });
}
function assess(objects){
  if(!objects.length||objects.some(o=>o.status!=='MEASURED'))return 'UNRESOLVED';
  if(objects.some(o=>Object.values(o.metrics).some(m=>m.policy==='COMPARABLE'&&Math.abs(m.value)>1)))return 'OUTSIDE_TOLERANCE';
  if(objects.some(o=>['placementX','placementY'].some(k=>o.metrics[k].policy!=='COMPARABLE')))return 'PLACEMENT_NOT_COMPARABLE';
  return 'WITHIN_PLACEMENT_ENVELOPES';
}
if(require.main===module){
  const [dir,layout]=process.argv.slice(2), read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
  const ev=read(path.join(dir,'native-visual-evidence.json'));
  if(ev.status!=='PASS'||ev.candidateSha256Before!==ev.candidateSha256After)throw Error('Incomplete raster capture');
  const input=read(layout);
  const production=input.schema==='lwb-production-review-v2';
  if(production){
    if(input.revision!=='20261102-layout-rc2'||ev.revision!==input.revision||
       ev.candidateSha256Before.toLowerCase()!==input.sha256)throw Error('Artifact identity mismatch');
    const ids=input.layout.objects.map(o=>o.id), captured=new Set(ev.objects.map(o=>o.id));
    if(!ids.length||captured.size!==ids.length||ev.objects.length!==ids.length||ids.some(id=>!captured.has(id)))throw Error('Incomplete object coverage');
  }
  const objects=compare(dir,ev,input);
  const status=production?assess(objects):(objects.every(o=>o.status==='MEASURED')?'LEGACY_DIAGNOSTIC_ONLY':'UNRESOLVED');
  fs.writeFileSync(path.join(dir,'render-comparison.json'),JSON.stringify({status,toleranceMm:1,productAcceptance:'NOT_RUN',units:'mm',revision:'20261102-layout-rc2',basis:'source bounding box vs unique page ink; placement compares intervals, size is diagnostic',objects},null,2));
  if(!['WITHIN_PLACEMENT_ENVELOPES','LEGACY_DIAGNOSTIC_ONLY'].includes(status))process.exitCode=2;
}
module.exports={mask,locate,compare,assess};
