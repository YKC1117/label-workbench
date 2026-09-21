const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');
const crypto=require('node:crypto');

test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus){console.log('FAILED PAGE',await page.locator('#analysisResult').innerText().catch(()=>''));}});
const APP_PATH=process.env.E2E_APP_PATH||'/';

// No substituted OCR, decoder, analysis result, seed, generator, Blob or download.
// A: structural checks below. B: real Chromium download. C: NOT BarTender acceptance.
for(const extension of ['pdf','png','jpg']){
 test(`File -> analysis -> actual .btw download (${extension})`,async({page},testInfo)=>{
  const warnings=[],errors=[];
  page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
  page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text())});
  page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url(),r.failure()?.errorText));
  await page.goto(APP_PATH);
  await page.getByRole('button',{name:'⚡ 快速分析',exact:true}).click();
  await page.locator('#analysisFiles').setInputFiles(path.resolve(`tests/fixtures/generic-label.${extension}`));
  await expect(page.locator('#analysisResult')).not.toHaveText('等待檔案');
  const button=page.locator('#analysisBtNative');
  await expect(button).toBeVisible({timeout:150000});
  await expect(button).toBeEnabled();
  const model=await page.evaluate(()=>({
   result:window.LabelWorkbenchAnalysisCoreV2?.latestResult,
   files:window.LabelWorkbenchAnalysisCoreV2?.latestFiles.map(f=>f.name),
   bridge:window.LabelWorkbenchBtBridge?.latestResult,
   ready:!!window.LabelWorkbenchBtwProductionCore
  }));
  expect(model.ready).toBe(true);
  expect(model.files).toEqual([`generic-label.${extension}`]);
  expect(model.result.labels).toHaveLength(1);
  expect(model.bridge).toEqual(model.result);
  const label=model.result.labels[0];
  expect(label.textObjects.map(o=>o.text).join('\n')).toMatch(/Made in Taiwan/i);
  expect(label.textObjects.some(o=>o.sourceBox)).toBe(true);
  expect(label.barcodes.some(b=>/code.?128/i.test(b.format)&&b.text==='ABC123')).toBe(true);
  expect(label.sourceGeometry.widthPx).toBeGreaterThan(0);
  expect(warnings.filter(w=>/readiness timed out|fallback route/.test(w))).toEqual([]);
  if(extension!=='pdf')page.once('dialog',async d=>{expect(d.message()).toMatch(/寬×高 mm|寬 × 高 mm/);await d.accept('100×65')});
  const downloadPromise=page.waitForEvent('download',{timeout:45000});
  await button.click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.btw$/i);
  expect(await download.failure()).toBeNull();
  const target=testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(target);
  const bytes=fs.readFileSync(target);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(0,900).toString('latin1').replace(/\0/g,'')).toMatch(/Bar Tender Format File/);
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Buffer,atob:s=>Buffer.from(s,'base64').toString('binary'),document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of ['btw-format','btw-object-map'])vm.runInContext(fs.readFileSync(`assets/${f}.js`,'utf8'),c);
  const parsed=c.LabelWorkbenchBtwFormat.parseStructure(bytes);
  expect(parsed.zlibTagged).toBe(true);
  expect(parsed.header.applicationVersion).toMatch(/^2022\b/);
  expect(parsed.header.compatibleVersion).toMatch(/^2022\b/);
  const sizeMatch=/<TemplateSize>\s*([\d.]+)\s*x\s*([\d.]+)\s*mm<\/TemplateSize>/i.exec(parsed.header.text||'');
  expect(sizeMatch).not.toBeNull();
  const templateSize={widthMm:Number(sizeMatch[1]),heightMm:Number(sizeMatch[2])};
  expect(templateSize.widthMm).toBeGreaterThan(0);
  expect(templateSize.heightMm).toBeGreaterThan(0);
  const container=zlib.inflateSync(parsed.compressedContainer);
  expect(container.length).toBeGreaterThan(1000);
  const decoded=c.LabelWorkbenchBtwObjectMap.mapContainer(container).objects;
  expect(decoded.length).toBeGreaterThan(0);
  const textObjects=decoded.filter(o=>o.kind==='text'&&String(o.value||'').trim());
  expect(textObjects.map(t=>t.value).join('\n')).toMatch(/Made in Taiwan/i);
  const c128=decoded.find(o=>o.kind==='barcode'&&o.barcodeType==='Code 128'&&o.resolvedPreview==='ABC123');
  expect(c128).toBeTruthy();
  expect(c128.componentEntries.length).toBeGreaterThan(0);
  expect(c128.resolvedComponents.length).toBeGreaterThan(0);
  expect(Number.isFinite(c128.xMm)&&Number.isFinite(c128.yMm)).toBe(true);
  const evidence={acceptance:{internalStructure:'passed',browserDownload:'passed',barTender2022:'NOT_RUN'},filename:download.suggestedFilename(),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),header:parsed.header,templateSize,containerBytes:container.length,objectCount:decoded.length,textObjectCount:textObjects.length,model,decoded,warnings,errors};
  await testInfo.attach('evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
  await expect(button).toBeEnabled();
 });
}

test('production seed endpoint contract and visible failure recovery',async({page})=>{
 await page.goto(APP_PATH);
 await page.getByRole('button',{name:'⚡ 快速分析',exact:true}).click();
 await page.locator('#analysisFiles').setInputFiles(path.resolve('tests/fixtures/generic-label.pdf'));
 const button=page.locator('#analysisBtNative');
 await expect(button).toBeVisible({timeout:150000});
 await expect(button).toBeEnabled();

 // Call the real production btw-seed endpoint directly. This checks the endpoint contract
 // without depending on which normal production generator is selected for this fixture.
 const liveSeed=await page.evaluate(async()=>{
  const N=window.LabelWorkbenchBtwNative;
  if(!N?.seedEndpoint)throw new Error('BTW native seed API missing');
  const ep=N.seedEndpoint();
  const r=await fetch(ep.url,{cache:'no-store',headers:{apikey:ep.key}});
  const bytes=new Uint8Array(await r.arrayBuffer());
  return{status:r.status,contentType:r.headers.get('content-type')||'',seedId:r.headers.get('x-label-workbench-seed')||'',head:Array.from(bytes.slice(0,900))};
 });
 expect(liveSeed.status).toBe(200);
 expect(liveSeed.contentType).toContain('application/octet-stream');
 expect(liveSeed.seedId).toBe('CEA-2022-R5');
 const liveHead=Buffer.from(liveSeed.head).toString('latin1').replace(/\0/g,'');
 expect(liveHead).toMatch(/Bar Tender Format File/);
 expect(liveHead).toMatch(/Application:\s*Version=2022 R5/);
 expect(liveHead).toMatch(/Document:\s*CompatibleVersion=2022/);

 // Failure injection is confined to this negative test. It routes the real native
 // fetchSeed() through the same download button error UI; normal PDF/PNG/JPG tests above
 // do not mock analysis, seed, generator, Blob or download.
 await page.route('**/functions/v1/btw-seed**',r=>r.fulfill({status:502,headers:{'access-control-allow-origin':'*'},body:'upstream unavailable'}));
 await page.evaluate(()=>{
  const core=window.LabelWorkbenchBtwProductionCore,native=window.LabelWorkbenchBtwNative;
  window.__lwOriginalProductionGenerate=core.generate;
  core.generate=async()=>{await native.fetchSeed();throw new Error('seed failure injection unexpectedly succeeded')};
 });
 let downloads=0;page.on('download',()=>downloads++);
 await button.click();
 await expect(page.locator('#btwDownloadStatus')).toContainText('502',{timeout:30000});
 expect(downloads).toBe(0);
 await expect(button).toBeEnabled();

 await page.unroute('**/functions/v1/btw-seed**');
 await page.evaluate(()=>{
  window.LabelWorkbenchBtwProductionCore.generate=window.__lwOriginalProductionGenerate;
  delete window.__lwOriginalProductionGenerate;
 });
 const downloadPromise=page.waitForEvent('download',{timeout:45000});
 await button.click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toMatch(/\.btw$/i);
 expect(await download.failure()).toBeNull();
 await expect(button).toBeEnabled();
});
