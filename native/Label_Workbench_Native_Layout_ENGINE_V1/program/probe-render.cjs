const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {compare}=require('./compare-render.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function verdict(o,p){
  if(!o.actual||o.status!=='MEASURED')return 'UNRESOLVED';
  const {dx,dy,dw,dh}=o.delta;
  if(![dx,dy,dw,dh].every(Number.isFinite))return 'UNRESOLVED';
  // Normal text uses a left-aligned containment frame. Its ink need not fill it.
  // Barcode targets in this controlled fixture are symbol ink, caption disabled.
  const errors=p.type==='text'?[Math.abs(dx),-dy,dx+dw,dy+dh]:[dx,dy,dw,dh].map(Math.abs);
  return errors.some(e=>e>0.5)?'OUTSIDE_FRAME':'WITHIN_FIXTURE_TOLERANCE';
}
function anchorCertified(actual,p){
  if(actual.referencePoint===p.referencePoint)return true;
  // Every supported native request must explicitly ask BarTender for TopLeft.
  // BarTender 2022 R2 may omit that default when serializing GetXML. Omission
  // is accepted here only after compare-render already produced a unique
  // full-page BMP registration (verdict() otherwise returns UNRESOLVED).
  return p.referencePoint==='TopLeft'&&actual.referencePointPresent===false&&actual.referencePoint==null;
}
if(require.main===module){
 const [dir,file]=process.argv.slice(2),plan=read(file),ev=read(path.join(dir,'native-visual-evidence.json'));
 const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'native-output.btw'))).digest('hex').toUpperCase();
 if(ev.status!=='PASS'||ev.candidateSha256Before!==hash||ev.candidateSha256After!==hash)throw Error('Evidence identity mismatch');
 const rows=compare(dir,ev,plan);
 const {mask}=require('./compare-render.cjs');
 for(const o of plan.objects.filter(p=>p.type==='code128'&&p.humanReadable!=='none')){
   const row=rows.find(r=>r.id===o.id),record=ev.objects.find(r=>r.id===o.id);if(!row.actual)continue;
   const {split}=require('../../../renderer/hri-qa.cjs'),page=mask(path.join(dir,'native-format-preview.bmp')),pb=row.pixelBounds;
   const parts=split(page.slice(pb.y,pb.y+pb.height).map(r=>r.subarray(pb.x,pb.x+pb.width))),u=25.4/ev.requestedDpi;
   const convert=b=>({x:row.actual.x+b.x*u,y:row.actual.y+b.y*u,width:b.width*u,height:b.height*u});
   row.symbolActual=convert(parts.symbol);row.captionActual=convert(parts.caption);
   if(record.humanReadableValue!==o.value)throw Error('Native HRI effective value mismatch');
 }
 const primitive=[];
 const canonicalFile=path.join(dir,'canonical.json');
 if(fs.existsSync(canonicalFile)){
   const model=read(canonicalFile),{check}=require('../../../renderer/primitive-qa.cjs');
   for(const o of model.objects.filter(o=>o.printable&&['image','line','box'].includes(o.type)))primitive.push({id:o.id,...check(o,mask(path.join(dir,'visual-'+o.id+'.bmp')),ev.printerResolution?.x)});
 }
 fs.writeFileSync(path.join(dir,'primitive-render-qa.json'),JSON.stringify({status:primitive.every(o=>o.status==='PASS')?'PASS':'FAIL',objects:primitive},null,2));
 if(primitive.some(o=>o.status!=='PASS'))process.exitCode=2;
 let dual=null;
 if(fs.existsSync(path.join(dir,'preview.json'))){
   const {evaluate}=require('../../../renderer/visual-qa.cjs');
   const {preview}=require('../../../renderer/preview.cjs');
   const canonical=read(path.join(dir,'canonical.json'));
   const stored=read(path.join(dir,'preview.json')),fresh=preview(canonical);
   if(JSON.stringify(stored.objects)!==JSON.stringify(fresh.objects))throw Error('Preview provenance mismatch');
   const result=evaluate(stored,rows,ev.objects);dual=result;
   const {checkRotations}=require('../../../renderer/rotation-qa.cjs');
   const rotation=checkRotations(dir,plan);
   result.opticalRotation=rotation;
   if(rotation.status!=='PASS')result.status='FAIL';
   fs.writeFileSync(path.join(dir,'dual-render-qa.json'),JSON.stringify(result,null,2));
   if(result.status!=='PASS_PLACEMENT_AND_SIZE')process.exitCode=2;
 }

 if(rows.length!==plan.objects.length||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Object coverage mismatch');
 for(const o of rows){
   const p=plan.objects.find(x=>x.id===o.id), actual=ev.objects.find(x=>x.id===o.id);
   o.verdict=dual?(dual.objects.find(r=>r.id===o.id)?.status==='PASS'?'WITHIN_FIXTURE_TOLERANCE':'CANONICAL_VISUAL_GATE_FAILED'):verdict(o,p);
   if(!anchorCertified(actual,p)||Math.abs(((actual.rotationDeg-p.rotationDeg+540)%360+360)%360-180)>.05)o.verdict='ANCHOR_OR_ROTATION_UNPROVEN';
 }
 fs.writeFileSync(path.join(dir,'prototype-render.json'),JSON.stringify({sha256:hash,productAcceptance:'NOT_RUN',objects:rows},null,2));
 if(rows.some(r=>r.verdict!=='WITHIN_FIXTURE_TOLERANCE'))process.exitCode=2;
}
module.exports={verdict,anchorCertified};
