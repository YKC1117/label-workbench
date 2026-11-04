'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validate}=require('./canonical.cjs'),{preview}=require('./preview.cjs'),{nativeRequest}=require('./adapter.cjs');
if(require.main===module){
  const [file,dir]=process.argv.slice(2),model=validate(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));
  const drawing=preview(model),request=nativeRequest(model);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'canonical.json'),JSON.stringify(model,null,2));
  fs.writeFileSync(path.join(dir,'renderer-request.json'),JSON.stringify(request,null,2));
  fs.writeFileSync(path.join(dir,'preview.json'),JSON.stringify({...drawing,svg:undefined},null,2));
  fs.writeFileSync(path.join(dir,'preview.svg'),drawing.svg);
}
