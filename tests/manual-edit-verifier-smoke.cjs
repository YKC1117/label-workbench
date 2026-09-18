const fs=require('fs');
const os=require('os');
const path=require('path');
const {createFixture,loadRuntime}=require('../tools/create-btw-runtime-fixture.cjs');
const {manualExpectedLabel,verifyManualEdit}=require('../tools/verify-btw-manual-edit.cjs');

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lw-btw-manual-edit-'));
  const original=path.join(dir,'LabelWorkbench_Runtime_Acceptance.btw');
  const edited=path.join(dir,'LabelWorkbench_Runtime_Acceptance_EDITED.btw');

  await createFixture(original);
  let rejected=false;
  try{await verifyManualEdit(original)}catch{rejected=true}
  if(!rejected)throw new Error('manual edit verifier accepted the untouched fixture');

  const root=path.resolve(__dirname,'..'),c=loadRuntime(root),S=c.LabelWorkbenchBtwSecondNative;
  const label=manualExpectedLabel();
  if(!S?.generateOne||!S.canGenerate(label))throw new Error('manual edit expected fixture cannot be generated');
  const out=await S.generateOne(label,0);
  fs.writeFileSync(edited,Buffer.from(out.bytes));
  const report=await verifyManualEdit(edited);
  if(report.visibleCode128!==5||report.visibleDataMatrix!==1)throw new Error(`unexpected manual barcode counts: ${JSON.stringify(report)}`);
  if(!report.visibleText.includes('TEXT_MANUAL_OK_001'))throw new Error('manual Text replacement missing');
  for(const value of['C128_OK_ONE_111','C128_OK_TWO_222','C128_OK_THREE_333','C128_OK_FOUR_444','C128_OK_FIVE_555','DM_OK_ONE_666']){
    if(!report.barcodes.includes(value))throw new Error(`manual expected value missing: ${value}`);
  }

  fs.rmSync(dir,{recursive:true,force:true});
  console.log('PASS: manual-edit verifier rejects untouched BTW and accepts independently edited 1 Text + 5 Code128 + 1 DataMatrix');
})().catch(err=>{console.error(err);process.exit(1)});
