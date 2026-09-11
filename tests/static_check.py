from pathlib import Path
import re

FILES = [
    'index.html','assets/app.css','assets/ui-refresh.css','assets/nav-groups.css','assets/app.js',
    'assets/cloud.css','assets/cloud.js','assets/cloud-config.js','assets/cloud-attachments.js','assets/file-parsers.js',
    'assets/barcode-reader.js','assets/barcode-reader-core.js','assets/barcode-reader-ui.js','assets/barcode-generator.js',
    'assets/label-interpreter.js','assets/bt-quick.js','assets/btw-format.js','assets/btw-native.js','assets/btw-seed-2022r2.js',
    'assets/bt-bridge.js','assets/bt-native-primary.js','assets/layout-shortcuts.js','assets/workbench-priority.js',
    'docs/supabase-schema.sql','.gitignore','README.md','tests/bt-launch-smoke.cjs','tests/btw-native-smoke.cjs'
]
missing=[p for p in FILES if not Path(p).exists()]
if missing: raise SystemExit(f'Missing required project files: {missing}')

read=lambda p:Path(p).read_text(encoding='utf-8')
html=read('index.html'); app=read('assets/app.js'); cloud=read('assets/cloud.js'); cfg=read('assets/cloud-config.js')
attachments=read('assets/cloud-attachments.js'); parsers=read('assets/file-parsers.js'); loader=read('assets/barcode-reader.js')
core=read('assets/barcode-reader-core.js'); reader_ui=read('assets/barcode-reader-ui.js'); generator=read('assets/barcode-generator.js')
interpreter=read('assets/label-interpreter.js'); bt=read('assets/bt-quick.js'); btw=read('assets/btw-format.js'); native=read('assets/btw-native.js'); seed=read('assets/btw-seed-2022r2.js')
bridge=read('assets/bt-bridge.js'); native_primary=read('assets/bt-native-primary.js'); priority=read('assets/workbench-priority.js')
ui=read('assets/ui-refresh.css'); nav=read('assets/nav-groups.css'); schema=read('docs/supabase-schema.sql')

ids=set(re.findall(r'id="([^"]+)"',html)); refs=set(re.findall(r"getElementById\('([^']+)'\)",app))
if refs-ids: raise SystemExit(f'Missing HTML ids referenced by app.js: {sorted(refs-ids)}')
handlers=set(re.findall(r'on(?:click|input|change)="([A-Za-z_$][\w$]*)\(',html)); funcs=set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(',app))
if handlers-funcs: raise SystemExit(f'Inline handlers without app.js functions: {sorted(handlers-funcs)}')
if 'analysisFiles' in app or 'function analyzeSelected' in app: raise SystemExit('app.js must not own legacy quick analysis')
if 'stopImmediatePropagation' in priority: raise SystemExit('Quick analysis must not use event suppression')
if "el('analysisFiles')" not in priority or "addEventListener('change'" not in priority: raise SystemExit('Priority controller must own quick analysis input')

for marker in ['assets/ui-refresh.css?v=20260910-v190','assets/nav-groups.css?v=20260911-v140','assets/app.js?v=20260910-v181','assets/cloud.js?v=20260911-v270','assets/barcode-reader.js?v=20260911-v270','標籤製作工作台 · v1.9.11']:
    if marker not in html: raise SystemExit(f'index.html missing current cache marker: {marker}')
for marker in ['assets/cloud-attachments.js','assets/file-parsers.js','assets/barcode-reader.js']:
    if marker not in cloud: raise SystemExit(f'cloud loader missing: {marker}')
for marker in ['barcode-reader-core.js','barcode-reader-ui.js','barcode-generator.js','label-interpreter.js','btw-format.js','btw-native.js','bt-bridge.js','workbench-priority.js','bt-native-primary.js','20260911-v270-editable-btw']:
    if marker not in loader: raise SystemExit(f'workbench loader missing: {marker}')
for forbidden in ['assets/bt-direct-import.js','assets/bt-quick.js']:
    if forbidden in loader: raise SystemExit(f'PDF/image primary loader must not preload legacy output module: {forbidden}')
if re.search(r'<script[^>]+src="assets/bt-native-primary\.js',html,re.I): raise SystemExit('bt-native-primary must be loaded only by the workbench loader')

if "['barcode','analysis','bartender','dashboard','cases']" not in priority: raise SystemExit('navigation order missing')
for marker in ['BT 快速製作','案件紀錄','20260911-v211-editable-btw','headerCopy','syncHeaderCopy','可編輯 BarTender 2022 .BTW']:
    if marker not in priority: raise SystemExit(f'Priority marker missing: {marker}')
for marker in ['常用工具','製作 / 工作','data-view="cases"','#topNewCase{display:none!important}']:
    if marker not in nav: raise SystemExit(f'Navigation styling marker missing: {marker}')
mobile=re.search(r'<nav class="mobile-nav">(.*?)</nav>',html,re.S)
if not mobile or 'data-view="bartender"' not in mobile.group(1) or 'data-view="cases"' in mobile.group(1): raise SystemExit('Mobile tabs must include BT and omit Cases')

for forbidden in ['SUPABASE_SERVICE_ROLE','sb_secret_']:
    if forbidden.lower() in cfg.lower(): raise SystemExit(f'Privileged secret marker found: {forbidden}')
if 'Local-first' not in cloud and '本機優先' not in cloud: raise SystemExit('Cloud layer must preserve local-first behavior')
if 'label-attachments' not in attachments or '20*1024*1024' not in attachments.replace(' ',''): raise SystemExit('Attachment bucket/limit mismatch')
if 'label-attachments' not in schema: raise SystemExit('Supabase attachment schema mismatch')

for marker in ['xlsx@0.18.5','mammoth@1.12.2','pdfjs-dist@6.3.289','tesseract.js@7.0.0','createOcrWorker','scanPdfCanvas']:
    if marker not in parsers: raise SystemExit(f'Parser capability missing: {marker}')
for marker in ["const ZX='3.1.3'",'@undecaf/zbar-wasm@0.11.0','BarcodeDetector','scanCanvas','deepScan']:
    if marker not in core: raise SystemExit(f'Barcode core marker missing: {marker}')
for marker in ['clipboardFiles','filesFromClipboardData','pasteFromClipboard']:
    if marker not in reader_ui: raise SystemExit(f'Barcode paste marker missing: {marker}')
for marker in ['bwip-js@4.6.0','Code 128','QR Code','Data Matrix','GS1-128','layoutBoard','renderComposite']:
    if marker not in generator: raise SystemExit(f'Barcode generator marker missing: {marker}')
for marker in ['chooseOrientation','enhanceCanvas','detectLabelBands','aggregateFields','scanRegionDeep','interpretFiles']:
    if marker not in interpreter: raise SystemExit(f'Interpreter marker missing: {marker}')

for marker in ['labelWorkbench.btDraft.v1','BT_Data.csv','BT_Field_Map.csv','BT_Barcode_Map.csv','BT_Open.cmd','buildOpenCmd','window.LabelWorkbenchBtQuick=API']:
    if marker not in bt: raise SystemExit(f'BT quick table-pack marker missing: {marker}')

for marker in ['parseStructure','inflateContainer','rebuild','scanUtf16Strings','replaceStringAt']:
    if marker not in btw: raise SystemExit(f'BTW format marker missing: {marker}')
for marker in ['LW-2022R2-100x65-SANITIZED','20260911-local-seed-001','BASE64','SHA256']:
    if marker not in seed: raise SystemExit(f'Local BTW seed marker missing: {marker}')
for marker in ['20260911-btwn320-safe-no-demo','LW-2022R2-100x65-SANITIZED','btw-seed-2022r2.js','BcC128Data','BcDatamatrixData','patchSeed','fetchSeed','generateOne','downloadFromAnalysis','BT_Editable_']:
    if marker not in native: raise SystemExit(f'Native BTW generator marker missing: {marker}')
for forbidden in ['VALUE-1','ABC-123456','LOT-20260911','DM-ABC-123456-LOT-20260911']:
    if forbidden in native: raise SystemExit(f'Demo value leaked into native generator: {forbidden}')
for marker in ['20260911-btnp200-editable-btw-primary','下載可編輯 BTW (.btw)','不是 PNG/JPG 圖片','downloadEditable','analysisBtNative','btNativeDownload']:
    if marker not in native_primary: raise SystemExit(f'Native BTW primary UI marker missing: {marker}')
for marker in ['20260911-btb200-editable-btw-primary','isMediaResult','labelworkbench:bt-stage','latestFiles=[...(files||[])]']:
    if marker not in bridge: raise SystemExit(f'BT bridge marker missing: {marker}')
if 'ensureDirectImport' in bridge or 'sendDirectToBt' in bridge: raise SystemExit('PDF/image bridge must not expose PNG direct-import as primary workflow')

for marker in ['可編輯 BarTender .BTW','BarTender 2022 可編輯 .BTW','建立可編輯 .BTW','不是 PNG/JPG 圖片']:
    if marker not in html: raise SystemExit(f'Editable BTW visible copy missing: {marker}')
if '下載 BT 可直接匯入圖檔' in html: raise SystemExit('Legacy image-import copy still visible in index.html')

for marker in ['analysis-summary','analysis-label-card','analysis-metrics','@media(max-width:820px)','barcode-mode-tabs','mobile-nav']:
    if marker not in ui: raise SystemExit(f'UI marker missing: {marker}')

print(f'PASS: {len(ids)} HTML ids and {len(refs)} app DOM references checked')
print('PASS: navigation groups and v1.9.11 cache chain checked')
print('PASS: PDF/image workflow outputs editable BarTender .BTW, not image import')
print('PASS: local BarTender 2022 R2 seed/native generator wiring checked')
