const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/file-parsers.js', 'utf8');
const context = {
  console,
  window: {},
  document: {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({}),
    head: { appendChild() {} }
  },
  globalThis: null,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  Image: function(){},
  setInterval: () => 0,
  clearInterval: () => {},
  Promise,
  Uint8Array,
  Date,
  Math
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'assets/file-parsers.js' });

const api = context.window.LabelWorkbenchParsers;
if (!api) throw new Error('Parser helper API was not exposed');

const csv = api.parseCsvLine('A,"B,C","D""E"');
if (JSON.stringify(csv) !== JSON.stringify(['A','B,C','D"E'])) throw new Error('CSV quoted field parser failed');

const groups = api.classify([
  { name: 'a.pdf' }, { name: 'b.xlsx' }, { name: 'c.docx' },
  { name: 'd.csv' }, { name: 'e.btw' }, { name: 'f.png' }
]);
if (groups.pdf !== 1 || groups.excel !== 1 || groups.word !== 1 || groups.csv !== 1 || groups.btw !== 1 || groups.image !== 1) {
  throw new Error('File classification failed');
}

const keys = api.labelKeywords('Vendor PN ABC QTY 5 Date Code 2609 LOT X1');
for (const expected of ['Vendor','Vendor PN','QTY','Date Code','LOT']) {
  if (!keys.includes(expected)) throw new Error(`Keyword detection missed ${expected}`);
}

console.log('PASS: CSV quoted field parsing');
console.log('PASS: document type classification');
console.log('PASS: label keyword detection');
