const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fingerprint,checkReport,required,sha}=require('../tools/btw-release-gate.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-gate-'));
try{
 const report={schema:1,fixture:'A',status:'passed',verification:'human-observed-designer',runtime:'BarTender 2022',edition:'Automation',operator:'Unit test fixture only',printer:'Mock',completedAt:new Date().toISOString(),sourceFingerprint:fingerprint(),fixtureSha256:sha(fs.readFileSync('tests/fixtures/btw/A.btjob.json')),checks:Object.fromEntries(required.map(k=>[k,true])),artifacts:[],attachments:[]};
 for(const file of ['original.btw','working.btw','edited-save-as.btw','about.png','objects.png','reopened.png','printed-label.jpg']){fs.writeFileSync(path.join(dir,file),file);report[file.endsWith('.btw')?'artifacts':'attachments'].push({file,sha256:sha(file)});}
 assert(checkReport(report,'A',dir)); // Tests the validator only, never ships as runtime evidence.
 for(const key of required){const r=structuredClone(report);r.checks[key]=false;assert.throws(()=>checkReport(r,'A',dir));}
 for(const mutate of [r=>r.sourceFingerprint='old',r=>r.fixtureSha256='old',r=>r.edition='Professional',r=>r.status='pending',r=>r.artifacts[0].sha256='fake',r=>r.attachments=[],r=>r.artifacts[0].file='../file.btw']){const r=structuredClone(report);mutate(r);assert.throws(()=>checkReport(r,'A',dir));}
 console.log('PASS: gate rejects absent, stale, incomplete, unsupported-license and tampered runtime evidence');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
