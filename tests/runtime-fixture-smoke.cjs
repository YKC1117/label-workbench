const fs=require('fs');
const os=require('os');
const path=require('path');
const {createFixture}=require('../tools/create-btw-runtime-fixture.cjs');
const {verifyFixture}=require('../tools/verify-btw-runtime-fixture.cjs');

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lw-btw-runtime-fixture-'));
  const file=path.join(dir,'LabelWorkbench_Runtime_Acceptance.btw');
  const created=await createFixture(file);
  if(created.seed!=='LW-SECOND-SANITIZED-2022-R2')throw new Error(`unexpected seed ${created.seed}`);
  const report=await verifyFixture(file);
  if(report.visibleCode128!==5||report.visibleDataMatrix!==1)throw new Error(`unexpected barcode pool ${JSON.stringify(report)}`);
  if(report.visibleText!==6)throw new Error(`unexpected visible fixture text count ${report.visibleText}`);
  for(const value of['C128_ONE_111','C128_TWO_222','C128_THREE_333','C128_FOUR_444','C128_FIVE_555','DM_ONE_666']){
    if(!report.barcodes.includes(value))throw new Error(`missing fixture acceptance value ${value}`);
  }
  fs.rmSync(dir,{recursive:true,force:true});
  console.log('PASS: deterministic runtime fixture generates and reparses with 5 independent Code128 + 1 DataMatrix + editable Text objects');
})().catch(err=>{console.error(err);process.exit(1)});
