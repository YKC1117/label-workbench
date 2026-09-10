from pathlib import Path
import re

html = Path('index.html').read_text(encoding='utf-8')
js = Path('assets/app.js').read_text(encoding='utf-8')
cloud_js = Path('assets/cloud.js').read_text(encoding='utf-8')
cloud_cfg = Path('assets/cloud-config.js').read_text(encoding='utf-8')
attachments_js = Path('assets/cloud-attachments.js').read_text(encoding='utf-8')
parsers_js = Path('assets/file-parsers.js').read_text(encoding='utf-8')
barcode_loader = Path('assets/barcode-reader.js').read_text(encoding='utf-8')
barcode_core = Path('assets/barcode-reader-core.js').read_text(encoding='utf-8')
barcode_ui = Path('assets/barcode-reader-ui.js').read_text(encoding='utf-8')
barcode_generator = Path('assets/barcode-generator.js').read_text(encoding='utf-8')
interpreter_js = Path('assets/label-interpreter.js').read_text(encoding='utf-8')
priority_js = Path('assets/workbench-priority.js').read_text(encoding='utf-8')

ids = set(re.findall(r'id="([^"]+)"', html))
refs = set(re.findall(r"getElementById\('([^']+)'\)", js))
missing_ids = sorted(refs - ids)
if missing_ids:
    raise SystemExit(f'Missing HTML ids referenced by JavaScript: {missing_ids}')

handlers = set(re.findall(r'on(?:click|input|change)="([A-Za-z_$][\w$]*)\(', html))
functions = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', js))
missing_handlers = sorted(handlers - functions)
if missing_handlers:
    raise SystemExit(f'Inline handlers without JavaScript functions: {missing_handlers}')

required_files = [
    'index.html', 'assets/app.css', 'assets/app.js',
    'assets/cloud.css', 'assets/cloud.js', 'assets/cloud-config.js',
    'assets/cloud-attachments.js', 'assets/file-parsers.js',
    'assets/barcode-reader.js', 'assets/barcode-reader-core.js', 'assets/barcode-reader-ui.js',
    'assets/barcode-generator.js', 'assets/label-interpreter.js', 'assets/workbench-priority.js',
    'docs/supabase-schema.sql', '.gitignore', 'README.md'
]
missing_files = [p for p in required_files if not Path(p).exists()]
if missing_files:
    raise SystemExit(f'Missing required project files: {missing_files}')

required_scripts = ['@supabase/supabase-js@2', 'assets/cloud-config.js', 'assets/app.js', 'assets/cloud.js']
missing_scripts = [s for s in required_scripts if s not in html]
if missing_scripts:
    raise SystemExit(f'Missing required script references: {missing_scripts}')

for forbidden in ['SUPABASE_SERVICE_ROLE', 'sb_secret_']:
    if forbidden.lower() in cloud_cfg.lower():
        raise SystemExit(f'Privileged secret marker found in browser config: {forbidden}')

service_role_value = re.search(r"(?:key|service_role|secret)\s*[:=]\s*['\"]([^'\"]+)['\"]", cloud_cfg, re.I)
if service_role_value and ('service_role' in service_role_value.group(1).lower() or service_role_value.group(1).startswith('sb_secret_')):
    raise SystemExit('Privileged Supabase key found in browser config')

is_enabled = bool(re.search(r'enabled\s*:\s*true', cloud_cfg, re.I))
if is_enabled:
    url_match = re.search(r"url\s*:\s*['\"](https://[^'\"]+\.supabase\.co)['\"]", cloud_cfg, re.I)
    key_match = re.search(r"key\s*:\s*['\"]([^'\"]+)['\"]", cloud_cfg, re.I)
    if not url_match:
        raise SystemExit('Enabled cloud config must use an https://*.supabase.co project URL')
    if not key_match or not key_match.group(1).startswith('sb_publishable_'):
        raise SystemExit('Enabled cloud config must use a Supabase publishable key')
else:
    if not re.search(r'enabled\s*:\s*false', cloud_cfg, re.I):
        raise SystemExit('Cloud config must explicitly declare enabled true or false')

if 'Local-first' not in cloud_js and '本機優先' not in cloud_js:
    raise SystemExit('Cloud layer must explicitly preserve local-first behavior')
for module in ['assets/cloud-attachments.js','assets/file-parsers.js','assets/barcode-reader.js']:
    if module not in cloud_js:
        raise SystemExit(f'Feature module is not wired by cloud loader: {module}')
if '20260910-v150' not in cloud_js:
    raise SystemExit('Cloud optional-module cache key must be v1.5')
if "label-attachments" not in attachments_js or '20*1024*1024' not in attachments_js.replace(' ', ''):
    raise SystemExit('Private attachment add-on must target the expected bucket and 20 MB limit')
if 'xlsx@0.18.5' not in parsers_js or 'mammoth@1.12.2' not in parsers_js or 'pdfjs-dist@6.3.289' not in parsers_js:
    raise SystemExit('Document parser CDN dependencies must remain version-pinned')
for marker in ['tesseract.js@7.0.0', 'createOcrWorker', 'renderPdfPage', "['eng','chi_tra']", 'OCR_MAX_PAGES=3', 'scanPdfCanvas']:
    if marker not in parsers_js:
        raise SystemExit(f'Scanned PDF OCR flow is missing marker: {marker}')

for module in ['barcode-reader-core.js','barcode-reader-ui.js','barcode-generator.js','label-interpreter.js','workbench-priority.js']:
    if module not in barcode_loader:
        raise SystemExit(f'Barcode/workbench loader is missing {module}')
if "const ZX='3.1.3'" not in barcode_core or 'zxing-wasm@${ZX}' not in barcode_core:
    raise SystemExit('Barcode core must pin zxing-wasm 3.1.3')
if '@undecaf/zbar-wasm@0.11.0' not in barcode_core:
    raise SystemExit('Barcode core must pin ZBar WASM 0.11.0')
if 'BarcodeDetector' not in barcode_core or 'ZXingWASM' not in barcode_core or 'readBarcodes' not in barcode_core:
    raise SystemExit('Barcode core must retain native detector plus ZXing-C++ WASM decoder')
for marker in ['scanImageData', 'decodeZBar', 'tryRotate:true', 'minLineCount:1', 'threshold(', 'deepScan', 'options.deep', 'scanCanvas']:
    if marker not in barcode_core:
        raise SystemExit(f'Barcode core is missing fast/fallback marker: {marker}')
for marker in ['加強讀取', 'retryDeep', '快速掃描中']:
    if marker not in barcode_ui:
        raise SystemExit(f'Barcode UI is missing simple on-demand scan marker: {marker}')
for legacy_marker in ['精準框選讀碼', 'barcodePreview', 'barcodeEngineStatus']:
    if legacy_marker in barcode_ui:
        raise SystemExit(f'Barcode UI still contains legacy heavy workflow marker: {legacy_marker}')

for marker in ['bwip-js@4.6.0','Code 128','QR Code','Data Matrix','GS1-128','GS1 DataMatrix','downloadPng','copyImage','verifyGenerated','立即產生']:
    if marker not in barcode_generator:
        raise SystemExit(f'Barcode generator is missing marker: {marker}')

for marker in ['20260910-v150','chooseOrientation','detectLabelBands','parseFields','scanRegionDeep','fieldVerified','interpretImage','interpretFiles','複製製作資料','複製給客戶確認','正在辨識文字']:
    if marker not in interpreter_js:
        raise SystemExit(f'Label interpreter is missing v1.5 workflow marker: {marker}')
for forbidden in ['查看 OCR 原文','OCR 值','OCR 待確認']:
    if forbidden in interpreter_js:
        raise SystemExit(f'Action-focused analysis still exposes technical OCR output: {forbidden}')

if '20260910-v150' not in barcode_loader:
    raise SystemExit('Barcode/workbench loader cache key was not bumped for v1.5')
for marker in ["['barcode','analysis','dashboard','cases','bartender']", 'runQuickAnalysis', 'stopImmediatePropagation', 'LabelWorkbenchParsers', 'LabelWorkbenchInterpreter', 'v1.5']:
    if marker not in priority_js:
        raise SystemExit(f'Priority controller is missing workflow marker: {marker}')

print(f'PASS: {len(ids)} HTML ids checked')
print(f'PASS: {len(refs)} JavaScript DOM references checked')
print(f'PASS: {len(handlers)} inline handler names checked')
print('PASS: cloud files, script order and v1.5 cache key checked')
print('PASS: enabled Supabase browser config is publishable-key only')
print('PASS: private attachments and document parser dependency pins checked')
print('PASS: barcode reader fast path checked')
print('PASS: barcode generator supports direct 1D/2D creation')
print('PASS: quick analysis hides OCR internals and returns production actions')
print('PASS: priority navigation and stable quick-analysis entry checked')
