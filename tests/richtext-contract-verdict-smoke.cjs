'use strict';
// Offline regression for the RichText9 contract classifier/verdict.
// No BarTender runtime. Synthetic inputs only exercise the decision rules.
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {classify,verdict,numericJudgement}=require('../review/renderer-prototype/richtext-contract-verdict.cjs');

const plainInput=over=>({origin:'CREATE_DEFAULT',value:{ok:true,text:'Sample'},xmlText:'<RichText/>',
  dataSources:[{localName:'EmbeddedDataSource',valueText:'Sample'}],transformCount:0,
  export:{rowCount:1,subStringCount:1,valueCount:1,literalOk:true,literal:'Sample'},valueAfterSetters:[],...over});
let n=0;const t=(name,fn)=>{fn();n++;};

// A: empty / missing source / default content are never PLAIN.
t('unreadable',()=>assert.strictEqual(classify(plainInput({value:{ok:false,error:'0x8000FFFF'}})).model,'UNREADABLE'));
t('empty',()=>{const c=classify(plainInput({value:{ok:true,text:'  '}}));assert.strictEqual(c.model,'EMPTY');assert.strictEqual(c.payloadPermitted,false);});
t('missing source',()=>{const c=classify(plainInput({dataSources:[]}));assert.strictEqual(c.model,'UNKNOWN');assert(c.reasons.includes('DATA_SOURCE_MISSING'));});
t('default content only',()=>{const c=classify(plainInput());assert.strictEqual(c.model,'UNKNOWN');assert.strictEqual(c.payloadPermitted,false);assert(c.reasons.includes('DEFAULT_CONTENT_ONLY_MODEL_UNCONFIRMED'));});
// B: prefix of Value alone is not enough; cross-check export and XML.
t('rtf only in export literal',()=>{const c=classify(plainInput({export:{rowCount:1,subStringCount:1,valueCount:1,literalOk:true,literal:'{\\rtf1\\ansi x}'}}));assert.strictEqual(c.model,'RTF');assert.strictEqual(c.payloadPermitted,false);});
t('rtf only in object xml',()=>assert.strictEqual(classify(plainInput({xmlText:'<RichText><Value>{\\rtf1 x}</Value></RichText>'})).model,'RTF'));
t('export literal disagrees',()=>{const c=classify(plainInput({export:{rowCount:1,subStringCount:1,valueCount:1,literalOk:true,literal:'Other'}}));assert.strictEqual(c.model,'UNKNOWN');assert(c.reasons.includes('EXPORT_LITERAL_DIFFERS_FROM_VALUE'));});
t('two sources',()=>assert.strictEqual(classify(plainInput({dataSources:[{localName:'EmbeddedDataSource',valueText:'Sample'},{localName:'EmbeddedDataSource',valueText:''}]})).model,'UNKNOWN'));
t('transforms',()=>assert.strictEqual(classify(plainInput({transformCount:1})).model,'UNKNOWN'));
t('value mutated by setter',()=>{const c=classify(plainInput({valueAfterSetters:[{label:'FontBold-true',mutated:true}]}));assert.strictEqual(c.model,'UNKNOWN');assert.strictEqual(c.payloadPermitted,false);});
// C: markup is preserved and skipped.
t('markup',()=>{const c=classify(plainInput({value:{ok:true,text:'<b>x</b>'}}));assert.strictEqual(c.model,'MARKUP');assert.strictEqual(c.payloadPermitted,false);});
t('verified plain only after verified readback origin',()=>{const c=classify(plainInput({origin:'VERIFIED_PAYLOAD_READBACK'}));assert.strictEqual(c.model,'PLAIN');assert.strictEqual(c.payloadPermitted,true);});
// G: tolerance basis and raw delta are retained.
t('mil quantum',()=>{const j=numericJudgement({status:'WROTE',property:'Width',requested:40,actual:40.0052});assert.strictEqual(j.judgement,'READBACK_WITHIN_DOCUMENTED_QUANTUM');assert.strictEqual(j.delta,0.0052);});
t('beyond quantum is mismatch not hidden',()=>assert.strictEqual(numericJudgement({status:'WROTE',property:'Width',requested:40,actual:40.06}).judgement,'READBACK_MISMATCH'));
t('refused',()=>assert.strictEqual(numericJudgement({status:'WRITE_REFUSED',property:'Height'}).judgement,'WRITE_REFUSED'));

// Verdict-level rules with synthetic BMPs.
function bmp(file,w,h,inkRows){
  const stride=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+stride*h,0xff);
  b.write('BM',0);b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);
  b.writeInt32LE(w,18);b.writeInt32LE(-h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(0,30);
  for(const y of inkRows)for(let x=2;x<w-2;x++)b.fill(0,54+y*stride+x*3,54+y*stride+x*3+3);
  fs.writeFileSync(file,b);
}
function fixture(mut){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rtv-'));
  bmp(path.join(dir,'base.bmp'),40,30,[3,4,5]);
  bmp(path.join(dir,'wide.bmp'),40,30,[2,3,10,11,20,21]);
  const r={status:'DISCOVERY_COMPLETE_NOT_RENDERER_ACCEPTANCE',hardFailures:[],
    enum:{richTextMatches:[{Name:'btObjectRichText',Value:9}]},designerBase:{shaOk:true},ownership:{allOwned:true},
    rich:{type:9,rootLocalName:'RichText',baselineBmp:'base.bmp'},
    setters:[{label:'Width',property:'Width',requested:40.64,actual:40.64,status:'WROTE',bmp:'wide.bmp'},
             {label:'Height',property:'Height',requested:15.24,actual:null,status:'WRITE_REFUSED',error:'0x8000FFFF'}],
    valueModel:{model:'UNKNOWN'},payload:{status:'NOT_RUN'},fontBoldRestore:{status:'DONE',exact:true},
    cold:{status:'DONE',distinctPid:true,richXmlEqual:true,richValueEqual:true,richBmpEqual:true,formatBmpEqual:true,peerXmlEqual:true,shaBefore:'AA',shaAfter:'AA'},
    peerAudits:[{tag:'x',name:'Box',status:'EXACT'}]};
  mut(r);fs.writeFileSync(path.join(dir,'richtext-contract-report.json'),JSON.stringify(r));
  return verdict(dir);
}
t('baseline discovery complete, capabilities never certified',()=>{const v=fixture(()=>{});
  assert.strictEqual(v.overall,'DISCOVERY_COMPLETE');
  assert.deepStrictEqual(v.capability,{fixedFrame:'NOT_CERTIFIED',nativeJustification:'NOT_CERTIFIED',wrap:'NOT_CERTIFIED'});
  assert.strictEqual(v.axes.A2_width,'READBACK_ONLY_NOT_FIXED_FRAME');assert.strictEqual(v.axes.A3_height,'WRITE_REFUSED');
  assert.strictEqual(v.axes.A9_alignment,'UNKNOWN_NOT_ATTEMPTED');});
// E: three ink bands never become WRAP PASS.
t('bands are not wrap pass',()=>{const v=fixture(()=>{});const w=v.setters.find(s=>s.label==='Width');
  assert.strictEqual(w.ink.horizontalInkBands,3);assert.notStrictEqual(v.axes.A6_wrap,'PASS');assert.strictEqual(v.capability.wrap,'NOT_CERTIFIED');});
t('peer contamination fails closed',()=>assert.strictEqual(fixture(r=>{r.peerAudits.push({tag:'y',name:'Bar',status:'CHANGED'});}).overall,'FAIL_CLOSED'));
t('sha change fails closed',()=>assert.strictEqual(fixture(r=>{r.cold.shaAfter='BB';}).overall,'FAIL_CLOSED'));
t('same pid cold fails closed',()=>assert.strictEqual(fixture(r=>{r.cold.distinctPid=false;}).overall,'FAIL_CLOSED'));
t('bmp mismatch fails closed',()=>assert.strictEqual(fixture(r=>{r.cold.richBmpEqual=false;}).overall,'FAIL_CLOSED'));
t('bold restore inexact fails closed',()=>assert.strictEqual(fixture(r=>{r.fontBoldRestore.exact=false;}).overall,'FAIL_CLOSED'));
t('payload restore inexact fails closed',()=>assert.strictEqual(fixture(r=>{r.payload={status:'DONE',restoreExact:false,steps:[]};}).overall,'FAIL_CLOSED'));
t('non-owned process fails closed',()=>assert.strictEqual(fixture(r=>{r.ownership.allOwned=false;}).overall,'FAIL_CLOSED'));
t('no peer audits fails closed',()=>{const v=fixture(r=>{r.peerAudits=[];});assert.strictEqual(v.axes.peerIsolation,'NOT_RUN');assert.strictEqual(v.overall,'FAIL_CLOSED');});
t('probe-level failure propagates',()=>assert.strictEqual(fixture(r=>{r.status='DISCOVERY_FAILED_CLOSED';}).overall,'FAIL_CLOSED'));
console.log('RichText9 contract verdict regression: '+n+'/'+n+' PASS');
