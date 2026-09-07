const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/cloud.js', 'utf8');
const context = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: {
    LABEL_WORKBENCH_CLOUD: { enabled: false, url: '', key: '' },
    saveCases: () => {},
    loadCases: () => []
  },
  document: {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ dataset: {}, classList: { add() {}, remove() {} } }),
    head: { appendChild() {} }
  },
  location: { origin: 'https://example.com', pathname: '/label-workbench/' }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'assets/cloud.js' });

const cloud = context.window.LabelWorkbenchCloud;
if (!cloud || typeof cloud.mergeCases !== 'function') {
  throw new Error('Cloud merge helper was not exposed');
}

const local = [
  { id: 'A', labelName: 'local-new', updatedAt: '2026-09-07T10:00:00Z' },
  { id: 'B', labelName: 'local-only', updatedAt: '2026-09-07T09:00:00Z' }
];
const remote = [
  { case_id: 'A', payload: { id: 'A', labelName: 'remote-old', updatedAt: '2026-09-07T08:00:00Z' }, updated_at: '2026-09-07T08:00:00Z' },
  { case_id: 'C', payload: { id: 'C', labelName: 'remote-only', updatedAt: '2026-09-07T11:00:00Z' }, updated_at: '2026-09-07T11:00:00Z' }
];

const merged = cloud.mergeCases(local, remote);
if (merged.length !== 3) throw new Error(`Expected 3 merged cases, got ${merged.length}`);
if (merged.find(x => x.id === 'A').labelName !== 'local-new') throw new Error('Newer local case should win conflict');
if (!merged.find(x => x.id === 'B')) throw new Error('Local-only case was lost');
if (!merged.find(x => x.id === 'C')) throw new Error('Remote-only case was lost');
if (merged[0].id !== 'C') throw new Error('Merged cases should be sorted by newest update first');

const remoteNewer = cloud.mergeCases(
  [{ id: 'D', labelName: 'local-old', updatedAt: '2026-09-07T08:00:00Z' }],
  [{ case_id: 'D', payload: { id: 'D', labelName: 'remote-new', updatedAt: '2026-09-07T12:00:00Z' }, updated_at: '2026-09-07T12:00:00Z' }]
);
if (remoteNewer[0].labelName !== 'remote-new') throw new Error('Newer remote case should win conflict');

console.log('PASS: cloud merge conflict strategy');
console.log('PASS: local-only and remote-only preservation');
console.log('PASS: cloud layer loads while disabled');
