const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const storage=new Map();
function boot(fail=false){
  const c={window:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota exceeded');storage.set(k,v);},removeItem:k=>storage.delete(k)}};
  vm.createContext(c);vm.runInContext(fs.readFileSync('assets/bt-job.js','utf8'),c);return c.window.LabelWorkbenchBtJob;
}
const files=[{name:'customer.pdf',type:'application/pdf'}];
const result={labels:[{sourceName:'customer.pdf',sourceGeometry:{widthMm:80,heightMm:50,orientation:'landscape'},fields:[{name:'Part',value:'原始值',sourceBox:{x:.1,y:.1,w:.5,h:.1}}],barcodes:[{format:'Code 128',text:'001',sourceBox:{x:.1,y:.4,w:.5,h:.2}}]}]};
let j=boot();j.stage(result,files);
assert.equal(j.current.status,'review');assert.throws(()=>j.productionJob(),/請先核對/);
j=boot();assert.equal(j.current.files[0].name,'customer.pdf');assert.equal(j.current.result.labels[0].fields[0].value,'原始值');
j.confirm();assert.equal(j.productionJob().labels[0].objects.length,2);
j=boot();assert.equal(j.current.status,'confirmed');assert.equal(j.productionJob().labels[0].objects[1].value,'001');
const edit=j.current.result;edit.labels[0].fields[0].value='Edited';j.update(edit);assert.equal(j.current.status,'review');assert.equal(result.labels[0].fields[0].value,'原始值');
j.confirm();assert.equal(boot().productionJob().labels[0].objects[0].value,'Edited');
for(const mutate of [r=>r.labels[0].barcodes[0].format='QR Code',r=>r.labels[0].sourceGeometry.widthMm=0,r=>r.labels[0].fields[0].sourceBox=null,r=>r.labels[0].fields[0].value='',r=>r.labels[0].marks=['logo']]){
  const r=structuredClone(result);mutate(r);j.stage(r,files);assert.throws(()=>j.confirm());assert.equal(j.current.status,'review');
}
j.stage(result,files);j=boot(true);j.stage({...result,labels:[{...result.labels[0],sourceName:'new.pdf'}]},files);assert.match(j.storageError,/quota/);assert.equal(boot().current,null,'quota failure must not revive old customer data');
j=boot();j.stage(result,files);const saved=j.current;saved.updatedAt=0;storage.set(j.KEY,JSON.stringify(saved));assert.equal(boot().current,null);
storage.set(j.KEY,'broken json');assert.equal(boot().current,null);
assert.throws(()=>j.stage({labels:Array(21).fill(result.labels[0])},files),/最多 20/);
for(const file of ['assets/barcode-reader.js','assets/layout-shortcuts.js']){
 const src=fs.readFileSync(file,'utf8');assert(src.includes('assets/bt-job.js'));assert(src.indexOf('assets/bt-job.js')<src.indexOf('assets/bt-bridge.js'));
 assert(!/['"]assets\/(?:btw-native|btw-rich-native|btw-rich-bridge|bt-direct-import)\.js['"]/.test(src),'retired writer in loader');
}
const primary=fs.readFileSync('assets/bt-native-primary.js','utf8');assert(primary.includes('下載 BarTender .BTW'));assert(primary.includes('BTW_RUNTIME_NOT_VERIFIED'));assert(!primary.includes('downloadFromAnalysis'));
console.log('PASS: restore, confirmed edits, no silent truncation, unsupported objects, quota/stale isolation, fail-closed production wiring');
