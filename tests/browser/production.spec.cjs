const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');
const crypto=require('node:crypto');

// No substituted OCR, decoder, analysis result, seed, generator, Blob or download.
// A: structural checks below. B: real Chromium download. C: NOT BarTender acceptance.
for(const extension of ['pdf','png','jpg']){
 test(`File -> analysis -> actual .btw download (${extension})`,async({page},testInfo)=>{
  const warnings=[],errors=[];
  page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
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
  const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Buffer,atob:s=>Buffer.from(s,'base64').toString('binary')};c.window=c;c.globalThis=c;vm.createContext(c);
  for(const f of ['btw-format','btw-object-map'])vm.runInContext(fs.readFileSync(`assets/${f}.js`,'utf8'),c);
  const parsed=c.LabelWorkbenchBtwFormat.parseStructure(bytes);
  const container=zlib.inflateSync(parsed.compressedContainer);
  const decoded=c.LabelWorkbenchBtwObjectMap.mapContainer(container).objects;
  expect(decoded.filter(o=>o.kind==='text').map(t=>t.value).join('\n')).toMatch(/Made in Taiwan/i);
  expect(decoded.some(o=>o.kind==='barcode'&&o.barcodeType==='Code 128'&&o.resolvedPreview==='ABC123')).toBe(true);
  const evidence={acceptance:{internalStructure:'passed',browserDownload:'passed',barTender2022:'NOT_RUN'},filename:download.suggestedFilename(),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),header:parsed.header,model,decoded,warnings,errors};
  await testInfo.attach('evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
  await expect(button).toBeEnabled();
 });
}

test('production seed response and visible failure recovery',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'⚡ 快速分析',exact:true}).click();
 await page.locator('#analysisFiles').setInputFiles(path.resolve('tests/fixtures/generic-qr.pdf'));
 const button=page.locator('#analysisBtNative');
 await expect(button).toBeVisible({timeout:150000});
 // Failure injection is confined to this negative test, never the success E2Es.
 await page.route('**/functions/v1/btw-seed**',r=>r.fulfill({status:502,body:'upstream unavailable'}));
 let downloads=0;page.on('download',()=>downloads++);
 await button.click();
 await expect(page.locator('#btwDownloadStatus')).toContainText('502',{timeout:30000});
 expect(downloads).toBe(0);
 await expect(button).toBeEnabled();
 await page.unroute('**/functions/v1/btw-seed**');
 const seedPromise=page.waitForResponse(r=>r.url().includes('/functions/v1/btw-seed')&&r.status()===200,{timeout:45000});
 const downloadPromise=page.waitForEvent('download',{timeout:45000});
 await button.click();
 const seed=await seedPromise;
 expect(seed.headers()['content-type']).toContain('application/octet-stream');
 expect(seed.headers()['x-label-workbench-seed']).toBeTruthy();
 expect((await seed.body()).subarray(0,900).toString('latin1').replace(/\0/g,'')).toMatch(/Bar Tender Format File/);
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toMatch(/\.btw$/i);
 expect(await download.failure()).toBeNull();
});
