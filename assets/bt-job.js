/* Confirmed BT work is data, never a browser-authored proprietary BTW. */
(function () {
  'use strict';
  if (window.LabelWorkbenchBtJob) return;
  const KEY = 'labelworkbench.bt-job.v1', MAX = 2 * 1024 * 1024;
  const TTL = 30 * 24 * 60 * 60 * 1000;
  let current = null, storageError = '';
  const clone = value => JSON.parse(JSON.stringify(value));
  const media = f => /^image\//.test(f?.type || '') || f?.type === 'application/pdf' || /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(f?.name || '');
  function validate(job) {
    if (job?.schema !== 1 || !Array.isArray(job.result?.labels) || !job.result.labels.length || job.result.labels.length > 20 || !Array.isArray(job.files) || !job.files.some(media) || job.result.tableSource) throw new Error('BT 工作資料格式不相容');
    for (const label of job.result.labels) {
      if (!label || typeof label !== 'object' || !Array.isArray(label.fields) || !Array.isArray(label.barcodes) || label.fields.length > 200 || label.barcodes.length > 200 || ![...label.fields,...label.barcodes].every(row => row && typeof row === 'object')) throw new Error('BT 物件清單格式不相容');
      if (label.marks != null && !Array.isArray(label.marks)) throw new Error('BT 標記清單格式不相容');
    }
    if (!Number.isFinite(job.updatedAt) || Date.now() - job.updatedAt > TTL || job.updatedAt > Date.now() + 60000) throw new Error('BT 暫存已過期或時間無效，請重新分析');
    if (!['review', 'confirmed'].includes(job.status)) throw new Error('BT 工作狀態無效');
    return job;
  }
  function persist() {
    try {
      const raw = JSON.stringify(current);
      if (raw.length > MAX) throw new Error('工作超過 2 MB 暫存上限');
      localStorage.setItem(KEY, raw); storageError = '';
    } catch (err) {
      storageError = '無法保存 BT 工作：' + err.message + '。關閉頁面前請匯出工作備份。';
      // Never restore an older customer's job after a failed replacement.
      try { localStorage.removeItem(KEY); } catch (_) {}
    }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { if (raw.length > MAX) throw new Error('BT 暫存過大'); current = validate(JSON.parse(raw)); }
    } catch (err) { current = null; storageError = err.message; try { localStorage.removeItem(KEY); } catch (_) {} }
    return current;
  }
  function stage(result, files) {
    if (!result?.labels?.length || result.tableSource || !files?.some(media)) return null;
    if (result.labels.length > 20) throw new Error('BT 工作最多 20 張標籤；未截斷資料，請分批分析');
    current = validate({schema: 1, id: 'bt-' + Date.now() + '-' + Math.random().toString(36).slice(2), updatedAt: Date.now(), status: 'review', result: clone(result), files: files.map(f => ({name: f.name, type: f.type || ''}))});
    persist(); return clone(current);
  }
  function update(result) {
    if (!current) throw new Error('沒有 BT 工作');
    current = validate({...current, result: clone(result), status: 'review', updatedAt: Date.now()});
    persist(); return clone(current);
  }
  function barcodeType(value) {
    const f = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return ({code128: 'Code 128', c128: 'Code 128', datamatrix: 'Data Matrix'})[f] || null;
  }
  function productionJob(job = current) {
    validate(job);
    if (job.status !== 'confirmed') throw new Error('請先核對並確認全部文字、條碼、尺寸與位置');
    return {schema: 1, id: job.id, producer: 'label-workbench-template-job', labels: job.result.labels.map((label, li) => {
      const g = label.sourceGeometry || {}, widthMm = Number(g.widthMm), heightMm = Number(g.heightMm);
      if (!(widthMm >= 5 && widthMm <= 1000 && heightMm >= 5 && heightMm <= 1000)) throw new Error(`標籤 ${li + 1}：請填寫正確寬／高（5–1000 mm）`);
      if (!['portrait', 'landscape'].includes(g.orientation)) throw new Error(`標籤 ${li + 1}：請確認列印方向`);
      if (label.marks?.length) throw new Error(`標籤 ${li + 1}：unsupported 圖形／標記，需在 Designer 製作專用範本`);
      const objects = [];
      function add(row, type, value, id) {
        if (typeof value !== 'string' || !value.length) throw new Error(`${id}：內容不可為空`);
        const b = row.sourceBox;
        if (!b || ![b.x,b.y,b.w,b.h].every(v => typeof v === 'number' && Number.isFinite(v)) || b.x < 0 || b.y < 0 || b.w <= 0 || b.h <= 0 || b.x + b.w > 1.001 || b.y + b.h > 1.001) throw new Error(`${id}：缺少可靠位置／尺寸，請填寫物件位置`);
        objects.push({id, type, value, xMm: +(b.x * widthMm).toFixed(3), yMm: +(b.y * heightMm).toFixed(3), widthMm: +(b.w * widthMm).toFixed(3), heightMm: +(b.h * heightMm).toFixed(3)});
      }
      (label.fields || []).forEach((f, i) => add(f, 'Text', f.value, `TEXT_${i + 1}`));
      (label.barcodes || []).forEach((b, i) => {
        const type = barcodeType(b.format);
        if (!type) throw new Error(`unsupported：${b.format || '未知條碼'}（包含 QR Code；尚無已驗證範本）`);
        add(b, type, b.text ?? b.value ?? b.data, `BARCODE_${i + 1}`);
      });
      if (!objects.length) throw new Error(`標籤 ${li + 1}：沒有物件`);
      return {name: `Label_${li + 1}`, widthMm, heightMm, orientation: g.orientation, objects};
    })};
  }
  function confirm() {
    if (!current) throw new Error('沒有 BT 工作');
    const candidate = {...current, status: 'confirmed', updatedAt: Date.now()};
    productionJob(candidate); current = candidate; persist(); return clone(current);
  }
  function importJob(raw) {
    if (typeof raw !== 'string' || raw.length > MAX) throw new Error('BT 備份超過 2 MB 上限');
    const job = validate(JSON.parse(raw));
    current = {...job, status: 'review', updatedAt: Date.now()}; persist(); return clone(current);
  }
  function clear() { current = null; try { localStorage.removeItem(KEY); storageError = ''; } catch (e) { storageError = e.message; } }
  restore();
  window.LabelWorkbenchBtJob = {KEY, stage, update, confirm, clear, restore, importJob, productionJob, barcodeType, get current() {return current && clone(current);}, get storageError() {return storageError;}};
})();
