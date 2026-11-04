'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
function validatePool(manifest,file,request){
  if(manifest.schema!=='lwb-object-pool-v1'||manifest.createdBy!=='BarTender Designer'||!Array.isArray(manifest.slots))throw Error('Uncertified pool manifest');
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==manifest.sha256.toLowerCase())throw Error('Pool hash mismatch');
  const names=new Set(),sources=new Set();
  for(const s of manifest.slots){
    if(!s.name||!s.namedSubString||names.has(s.name)||sources.has(s.namedSubString)||s.referencePoint!=='TopLeft'||!['text','code128','datamatrix'].includes(s.type))throw Error('Invalid pool identity');
    names.add(s.name);sources.add(s.namedSubString);
  }
  const remaining=[...manifest.slots];
  const assignments=request.objects.map(o=>{
    const i=remaining.findIndex(s=>s.type===o.type);
    if(i<0)throw Error('Pool capacity insufficient for '+o.id);
    return {id:o.id,...remaining.splice(i,1)[0]};
  });
  return {schema:'lwb-pool-selection-v1',path:path.resolve(file),sha256:manifest.sha256,assignments,unused:remaining.map(s=>s.name),slots:manifest.slots};
}
if(require.main===module){
  const [manifestPath,requestPath,output]=process.argv.slice(2),m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const poolPath=path.resolve(path.dirname(manifestPath),m.file);
  fs.writeFileSync(output,JSON.stringify(validatePool(m,poolPath,JSON.parse(fs.readFileSync(requestPath,'utf8'))),null,2));
}
module.exports={validatePool};
