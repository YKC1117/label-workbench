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
  if(actual.referencePoint==='TopLeft')return true;
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
 if(fs.existsSync(path.join(dir,'preview.json'))){
   const {evaluate}=require('../../../renderer/visual-qa.cjs');
   const {preview}=require('../../../renderer/preview.cjs');
   const canonical=read(path.join(dir,'canonical.json'));
   const stored=read(path.join(dir,'preview.json')),fresh=preview(canonical);
   if(JSON.stringify(stored.objects)!==JSON.stringify(fresh.objects))throw Error('Preview provenance mismatch');
   const result=evaluate(stored,rows,ev.objects);
   fs.writeFileSync(path.join(dir,'dual-render-qa.json'),JSON.stringify(result,null,2));
   if(result.status!=='PASS_PLACEMENT_AND_SIZE')process.exitCode=2;
 }

 if(rows.length!==plan.objects.length||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Object coverage mismatch');
 for(const o of rows){
   const p=plan.objects.find(x=>x.id===o.id), actual=ev.objects.find(x=>x.id===o.id);
   o.verdict=verdict(o,p);
   if(!anchorCertified(actual,p)||Math.abs(actual.rotationDeg-p.rotationDeg)>.05)o.verdict='ANCHOR_OR_ROTATION_UNPROVEN';
 }
 fs.writeFileSync(path.join(dir,'prototype-render.json'),JSON.stringify({sha256:hash,productAcceptance:'NOT_RUN',objects:rows},null,2));
 if(rows.some(r=>r.verdict!=='WITHIN_FIXTURE_TOLERANCE'))process.exitCode=2;
}
module.exports={verdict,anchorCertified};
