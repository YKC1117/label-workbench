const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/cloud-attachments.js', 'utf8');
const context = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  confirm: () => true,
  window: {},
  document: {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({})
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  Date,
  Math
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'assets/cloud-attachments.js' });

const api = context.window.LabelWorkbenchAttachments;
if (!api) throw new Error('Attachment helper API was not exposed');
if (api.safeSegment('A B/中文?.pdf') !== 'A_B____.pdf') throw new Error('Storage path sanitizer changed unexpectedly');

const meta = api.ensureMeta({ name: 'sample.pdf', size: 123, lastModified: 456 });
if (!meta.attachmentId) throw new Error('Attachment metadata should receive an id');
if (meta.cloudStatus !== 'local') throw new Error('New attachment metadata should be local');

const uploaded = api.ensureMeta({ attachmentId: 'x', cloudPath: 'u/c/x.pdf' });
if (uploaded.cloudStatus !== 'uploaded') throw new Error('Cloud attachment status should be uploaded');

const fp = api.fingerprint({ name: 'a.csv', size: 10, lastModified: 20 });
if (fp !== 'a.csv|10|20') throw new Error('Attachment fingerprint is unstable');

console.log('PASS: attachment metadata id/status');
console.log('PASS: private storage path sanitizer');
console.log('PASS: attachment fingerprint stability');
