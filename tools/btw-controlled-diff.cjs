const fs = require('fs');
const path = require('path');
const vm = require('vm');

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function writeCsv(file, rows, columns) {
  const out = [columns.join(',')];
  for (const row of rows) out.push(columns.map(c => csvCell(row[c])).join(','));
  fs.writeFileSync(file, out.join('\n') + '\n');
}
function round(v, n = 6) {
  if (!Number.isFinite(v)) return null;
  const p = 10 ** n;
  return Math.round(v * p) / p;
}
function readNum(data, off, type) {
  if (off < 0 || off >= data.length) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  try {
    if (type === 'i16le' && off + 2 <= data.length) return dv.getInt16(off, true);
    if (type === 'u16le' && off + 2 <= data.length) return dv.getUint16(off, true);
    if (type === 'i32le' && off + 4 <= data.length) return dv.getInt32(off, true);
    if (type === 'u32le' && off + 4 <= data.length) return dv.getUint32(off, true);
    if (type === 'f32le' && off + 4 <= data.length) return round(dv.getFloat32(off, true));
    if (type === 'f64le' && off + 8 <= data.length) return round(dv.getFloat64(off, true));
  } catch {}
  return null;
}
function changedRanges(a, b) {
  const n = Math.min(a.length, b.length);
  const ranges = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      ranges.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) ranges.push([start, n - 1]);
  if (a.length !== b.length) ranges.push([n, Math.max(a.length, b.length) - 1]);
  return ranges;
}
function hex(data, start, len) {
  return [...data.slice(start, Math.min(data.length, start + len))]
    .map(x => x.toString(16).padStart(2, '0')).join(' ');
}
function keyFor(o) {
  return [o.kind || '', o.barcodeType || '', o.name || '', o.rootPath || ''].join('|');
}
function buildContext() {
  const c = {
    console, Uint8Array, ArrayBuffer, DataView, TextDecoder, TextEncoder, Blob, Response,
    DecompressionStream, CompressionStream, atob, btoa,
    window: null, globalThis: null,
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } }
  };
  c.window = c;
  c.globalThis = c;
  vm.createContext(c);
  for (const f of ['assets/btw-format.js', 'assets/btw-object-map.js']) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), c, { filename: f });
  }
  return c;
}
async function decodeFile(c, file) {
  const F = c.LabelWorkbenchBtwFormat;
  const M = c.LabelWorkbenchBtwObjectMap;
  const bytes = new Uint8Array(fs.readFileSync(file));
  const parsed = F.parseStructure(bytes);
  const container = await F.inflateContainer(parsed);
  const map = M.mapContainer(container);
  return { file, bytes, parsed, container, map };
}
function chooseBaseline(files, explicit) {
  if (explicit) {
    const hit = files.find(f => path.basename(f).toLowerCase() === explicit.toLowerCase());
    if (!hit) throw new Error('找不到指定 baseline：' + explicit);
    return hit;
  }
  return files.find(f => /(?:^|[_-])(?:base|baseline|t0|c0|d0)(?:[_-]|\.)/i.test(path.basename(f))) || files[0];
}
function matchObjects(base, sample) {
  const byKey = new Map(sample.map.objects.map(o => [keyFor(o), o]));
  const used = new Set();
  const pairs = [];
  for (const bo of base.map.objects) {
    let so = byKey.get(keyFor(bo));
    if (!so) {
      so = sample.map.objects.find(o => !used.has(o.index) && o.index === bo.index && o.kind === bo.kind);
    }
    if (!so) {
      so = sample.map.objects.find(o => !used.has(o.index) && o.kind === bo.kind && (o.barcodeType || '') === (bo.barcodeType || ''));
    }
    if (so) {
      used.add(so.index);
      pairs.push([bo, so]);
    }
  }
  return pairs;
}
function recordSlice(decoded, obj) {
  return decoded.container.slice(obj.recordStart, obj.recordEnd);
}
function collectNoiseMap(noiseA, noiseB) {
  const set = new Map();
  if (!noiseA || !noiseB) return set;
  for (const [a, b] of matchObjects(noiseA, noiseB)) {
    const ak = keyFor(a);
    const ar = recordSlice(noiseA, a);
    const br = recordSlice(noiseB, b);
    const bytes = new Set();
    for (const [s, e] of changedRanges(ar, br)) for (let i = s; i <= e; i++) bytes.add(i);
    set.set(ak, bytes);
  }
  return set;
}
function overlapsNoise(noiseSet, start, size) {
  if (!noiseSet) return false;
  for (let i = start; i < start + size; i++) if (noiseSet.has(i)) return true;
  return false;
}
function parseArgs(argv) {
  const out = { dir: null, baseline: null, out: 'artifacts/btw-controlled-diff' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') out.baseline = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (!out.dir) out.dir = a;
    else throw new Error('未知參數：' + a);
  }
  out.dir ||= 'artifacts/btw-controlled-samples';
  return out;
}

(async () => {
  const args = parseArgs(process.argv);
  const dir = path.resolve(args.dir);
  if (!fs.existsSync(dir)) throw new Error('找不到樣本資料夾：' + dir);
  const files = fs.readdirSync(dir)
    .filter(x => /\.btw$/i.test(x))
    .sort((a, b) => a.localeCompare(b))
    .map(x => path.join(dir, x));
  if (files.length < 2) throw new Error('至少需要 2 份 .btw 樣本才能做 controlled diff');

  const c = buildContext();
  const decoded = [];
  for (const f of files) decoded.push(await decodeFile(c, f));

  const baselineFile = chooseBaseline(files, args.baseline);
  const baseline = decoded.find(x => x.file === baselineFile);
  const noiseA = decoded.find(x => /noise[_-]?a/i.test(path.basename(x.file)));
  const noiseB = decoded.find(x => /noise[_-]?b/i.test(path.basename(x.file)));
  const noiseMap = collectNoiseMap(noiseA, noiseB);

  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const objectRows = [];
  for (const d of decoded) {
    for (const o of d.map.objects) {
      objectRows.push({
        file: path.basename(d.file), index: o.index, kind: o.kind, barcodeType: o.barcodeType || '',
        name: o.name || '', rootPath: o.rootPath || '', owner: o.owner || '',
        recordStart: o.recordStart, recordEnd: o.recordEnd, recordLength: o.recordEnd - o.recordStart,
        xMil: o.xMil, yMil: o.yMil, fontSize: o.fontSize
      });
    }
  }
  writeCsv(path.join(outDir, 'object-map.csv'), objectRows,
    ['file','index','kind','barcodeType','name','rootPath','owner','recordStart','recordEnd','recordLength','xMil','yMil','fontSize']);

  const rangeRows = [];
  const typedRows = [];
  const pairSummary = [];

  for (const sample of decoded) {
    if (sample === baseline) continue;
    let changedObjects = 0;
    for (const [bo, so] of matchObjects(baseline, sample)) {
      const br = recordSlice(baseline, bo);
      const sr = recordSlice(sample, so);
      const ranges = changedRanges(br, sr);
      if (!ranges.length) continue;
      changedObjects++;
      const noiseSet = noiseMap.get(keyFor(bo));
      for (const [start, end] of ranges) {
        rangeRows.push({
          baseline: path.basename(baseline.file), sample: path.basename(sample.file),
          objectIndex: bo.index, kind: bo.kind, barcodeType: bo.barcodeType || '', name: bo.name || '',
          relStart: start, relEnd: end, length: end - start + 1,
          noiseOverlap: overlapsNoise(noiseSet, start, end - start + 1) ? 'YES' : 'NO',
          baselineHex: hex(br, start, Math.min(24, end - start + 1)),
          sampleHex: hex(sr, start, Math.min(24, end - start + 1))
        });
      }

      const candidateStarts = new Set();
      for (const [start, end] of ranges) {
        for (let byte = start; byte <= end; byte++) {
          for (let back = 0; back <= 7; back++) {
            const rel = byte - back;
            if (rel >= 0 && rel + 2 <= Math.min(br.length, sr.length)) candidateStarts.add(rel);
          }
        }
      }
      for (const rel of [...candidateStarts].sort((a,b)=>a-b)) {
        for (const [type, size] of [['i16le',2],['u16le',2],['i32le',4],['u32le',4],['f32le',4],['f64le',8]]) {
          if (rel + size > br.length || rel + size > sr.length) continue;
          const bv = readNum(br, rel, type);
          const sv = readNum(sr, rel, type);
          if (Object.is(bv, sv)) continue;
          typedRows.push({
            baseline: path.basename(baseline.file), sample: path.basename(sample.file),
            objectIndex: bo.index, kind: bo.kind, barcodeType: bo.barcodeType || '', name: bo.name || '',
            rel, type, baselineValue: bv, sampleValue: sv,
            noiseOverlap: overlapsNoise(noiseSet, rel, size) ? 'YES' : 'NO',
            baselineHex: hex(br, rel, size), sampleHex: hex(sr, rel, size)
          });
        }
      }
    }
    pairSummary.push({
      sample: path.basename(sample.file),
      objectCount: sample.map.objects.length,
      matchedObjects: matchObjects(baseline, sample).length,
      changedObjects
    });
  }

  writeCsv(path.join(outDir, 'changed-ranges.csv'), rangeRows,
    ['baseline','sample','objectIndex','kind','barcodeType','name','relStart','relEnd','length','noiseOverlap','baselineHex','sampleHex']);
  writeCsv(path.join(outDir, 'typed-candidates.csv'), typedRows,
    ['baseline','sample','objectIndex','kind','barcodeType','name','rel','type','baselineValue','sampleValue','noiseOverlap','baselineHex','sampleHex']);

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceDir: dir,
    baseline: path.basename(baseline.file),
    files: decoded.map(d => ({
      file: path.basename(d.file),
      byteLength: d.bytes.length,
      containerLength: d.container.length,
      objectCount: d.map.objects.length
    })),
    noisePair: noiseA && noiseB ? [path.basename(noiseA.file), path.basename(noiseB.file)] : null,
    pairSummary,
    outputs: ['object-map.csv','changed-ranges.csv','typed-candidates.csv']
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('PASS: BTW controlled diff complete');
  console.log('Baseline:', summary.baseline);
  console.log('Samples:', decoded.length);
  console.log('Noise map:', summary.noisePair ? summary.noisePair.join(' vs ') : 'not provided');
  console.log('Output:', outDir);
  console.log('Changed ranges:', rangeRows.length);
  console.log('Typed candidates:', typedRows.length);
})().catch(err => {
  console.error('[FAIL]', err && err.stack ? err.stack : err);
  process.exit(1);
});
