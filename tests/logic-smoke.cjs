const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('assets/app.js', 'utf8');
const store = {};
const dummyEl = () => ({
  value: '', textContent: '', innerHTML: '',
  classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, reset() {}, scrollIntoView() {}, focus() {}
});
const context = {
  console,
  Blob: function () {},
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  navigator: {},
  FileReader: function () {},
  Image: function () {},
  document: {
    addEventListener() {},
    getElementById() { return dummyEl(); },
    querySelectorAll() { return []; },
    createElement() { return dummyEl(); },
    body: { appendChild() {} }
  },
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    clear() { for (const k of Object.keys(store)) delete store[k]; }
  },
  setTimeout,
  clearTimeout,
  structuredClone: global.structuredClone
};
context.window = context;
vm.createContext(context);
vm.runInContext(code, context);

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

assert('legacy quick analysis is not owned by app.js', typeof context.analyzeSelected === 'undefined');
assert('legacy scratch helper is removed', typeof context.updateScratch === 'undefined');

const completeCase = {
  customer: 'Test', labelName: 'Carton', width: '100', height: '80',
  printerModel: 'ZT610', dpi: '300', dataSource: 'Excel',
  files: [{ name: 'sample.pdf' }], request: '需要 Code 39 條碼', notes: '',
  barcodes: [{ type: 'Code 39', source: 'Excel 欄位', encoded: 'VendorPN' }]
};
assert('case completeness reaches 100', context.completeness(completeCase).score === 100);
assert('complete customer message', context.customerMessage(completeCase).includes('主要製作資訊大致齊全'));

const incompleteCase = {
  customer: 'Test', labelName: 'QR Label', files: [], request: '需要 QR 條碼', notes: '', barcodes: []
};
const msg = context.customerMessage(incompleteCase);
assert('missing dimension is detected', msg.includes('標籤實際尺寸'));
assert('missing barcode rule is detected', msg.includes('條碼種類'));

const pack = context.workPackHtml(completeCase);
assert('BarTender work pack is generated', pack.includes('BarTender 製作包'));
assert('work pack contains barcode field', pack.includes('VendorPN'));
assert('work pack contains real barcode object warning', pack.includes('真正條碼物件'));
assert('work pack contains scan verification', pack.includes('實際掃描'));

console.log('ALL LOGIC SMOKE TESTS PASSED');