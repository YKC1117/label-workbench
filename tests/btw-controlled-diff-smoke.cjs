const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawnSync } = require('child_process');

const c = {
  console, Uint8Array, ArrayBuffer, DataView, TextDecoder, TextEncoder, Blob, Response,
  DecompressionStream, CompressionStream, atob, btoa,
  window: null, globalThis: null,
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } }
};
c.window = c;
c.globalThis = c;
vm.createContext(c);
for (const f of ['assets/btw-format.js', 'assets/btw-object-map.js', 'assets/btw-second-donor.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), c, { filename: f });
}

(async () => {
  const D = c.LabelWorkbenchBtwSecondDonor;
  const M = c.LabelWorkbenchBtwObjectMap;
  const baseBytes = new Uint8Array(await D.bytes());
  const decoded = await M.decodeBtw(baseBytes);
  const obj = decoded.map.objects.find(o => o.kind === 'text' && Number.isInteger(o.xMil));
  if (!obj) throw new Error('找不到可用 Text donor object');

  const nextX = obj.xMil + 200;
  const edited = await M.rebuildBtw(baseBytes, [{ index: obj.index, xMil: nextX }]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-btw-diff-'));
  const out = path.join(dir, 'out');
  fs.writeFileSync(path.join(dir, 'T0_BASE.btw'), Buffer.from(baseBytes));
  fs.writeFileSync(path.join(dir, 'T5_X_613.btw'), Buffer.from(edited.bytes));

  const run = spawnSync(process.execPath, ['tools/btw-controlled-diff.cjs', dir, '--out', out], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  if (run.status !== 0) {
    process.stdout.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    throw new Error('controlled diff tool 執行失敗');
  }

  for (const f of ['summary.json', 'object-map.csv', 'changed-ranges.csv', 'typed-candidates.csv']) {
    if (!fs.existsSync(path.join(out, f))) throw new Error('缺少輸出：' + f);
  }

  const csv = fs.readFileSync(path.join(out, 'typed-candidates.csv'), 'utf8');
  const expected = [
    String(obj.index),
    'text',
    ',0,i32le,',
    String(obj.xMil),
    String(nextX)
  ];
  if (!expected.every(x => csv.includes(x))) {
    throw new Error('未在 typed candidates 中抓到 Text X int32 relative offset 0');
  }

  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  if (summary.baseline !== 'T0_BASE.btw') throw new Error('baseline 選擇錯誤');
  if (!summary.pairSummary.some(x => x.sample === 'T5_X_613.btw' && x.changedObjects >= 1)) {
    throw new Error('沒有偵測到修改後物件');
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('PASS: controlled BTW diff runtime smoke');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
