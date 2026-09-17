/* Validates collected human evidence, never claims Linux ran BarTender. */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(rel){return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${rel}/${e.name}`):[`${rel}/${e.name}`]);}
function fingerprint(){
  const files=[...walk('assets'),...walk('tools'),...walk('tests/fixtures/btw'),'index.html','.github/workflows/qa.yml','.gitattributes'].sort();
  return sha(files.map(f=>`${f}\0${sha(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n'))}\n`).join(''));
}
const required=['runtime2022','license','open','noCorruption','exactObjects','dimensions','noSeedResidue','select','editText','editBarcode','move','save','saveAs','reopen','editsPersist','print'];
function checkReport(report,fixture,dir,fp=fingerprint()){
  function assert(ok,why){if(!ok)throw Error(`${fixture}: ${why}`);}
  assert(report.schema===1 && report.fixture===fixture && report.status==='passed','missing/pending runtime evidence');
  assert(report.verification==='human-observed-designer' && report.runtime==='BarTender 2022','wrong verification/runtime');
  assert(['Automation','Enterprise'].includes(report.edition),'unsupported/unconfirmed license');
  assert(typeof report.operator==='string' && report.operator.trim() && typeof report.printer==='string' && report.printer.trim(),'operator/printer missing');
  assert(Number.isFinite(Date.parse(report.completedAt)) && Date.parse(report.completedAt)<=Date.now()+60000,'invalid observation date');
  assert(report.sourceFingerprint===fp,'stale source fingerprint; rerun Windows regression');
  assert(report.fixtureSha256===sha(fs.readFileSync(path.join(root,`tests/fixtures/btw/${fixture}.btjob.json`))),'fixture changed');
  for(const key of required)assert(report.checks?.[key]===true,`not observed: ${key}`);
  assert(Array.isArray(report.artifacts)&&report.artifacts.length===3,'three BTW artifacts required');
  assert(Array.isArray(report.attachments)&&report.attachments.length===4,'About, objects, reopened and print evidence required');
  assert(['original.btw','working.btw','edited-save-as.btw'].every(n=>report.artifacts.filter(x=>x.file===n).length===1),'wrong artifact names');
  assert(['about','objects','reopened','printed-label'].every(n=>report.attachments.filter(x=>new RegExp(`^${n}\\.(png|jpe?g)$`).test(x.file)).length===1),'wrong evidence images');
  for(const item of [...report.artifacts,...report.attachments]){
    assert(typeof item.file==='string' && path.basename(item.file)===item.file && !item.file.includes('\\'),'unsafe artifact path');
    const p=path.join(dir,item.file); assert(fs.existsSync(p)&&!fs.lstatSync(p).isSymbolicLink(),`artifact missing: ${item.file}`);
    assert(item.sha256===sha(fs.readFileSync(p)),`artifact hash mismatch: ${item.file}`);
  }
  assert(report.artifacts.find(x=>x.file==='original.btw').sha256!==report.artifacts.find(x=>x.file==='working.btw').sha256,'unchanged Save');
  assert(report.artifacts.find(x=>x.file==='original.btw').sha256!==report.artifacts.find(x=>x.file==='edited-save-as.btw').sha256,'unchanged Save As');
  return true;
}
if(require.main===module){
  if(process.argv.includes('--fingerprint'))console.log(fingerprint());
  else try{
    for(const fixture of ['A','B','C']){
      const dir=path.join(root,'runtime-evidence',fixture),p=path.join(dir,'report.json');
      if(!fs.existsSync(p))throw Error(`${fixture}: Windows BarTender 2022 evidence missing. BTW RELEASE BLOCKED.`);
      checkReport(JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),fixture,dir);
    }
    console.log('PASS: A/B/C human-observed evidence matches this source tree. Independent review required; this is not a CI Designer execution.');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={fingerprint,checkReport,required,sha};
