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
bt_quick = Path('assets/bt-quick.js').read_text(encoding='utf-8')
bt_bridge = Path('assets/bt-bridge.js').read_text(encoding='utf-8')
priority_js = Path('assets/workbench-priority.js').read_text(encoding='utf-8')
ui_css = Path('assets/ui-refresh.css').read_text(encoding='utf-8')
nav_css = Path('assets/nav-groups.css').read_text(encoding='utf-8')
schema_sql = Path('docs/supabase-schema.sql').read_text(encoding='utf-8')

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
    'index.html', 'assets/app.css', 'assets/ui-refresh.css', 'assets/nav-groups.css', 'assets/app.js',
    'assets/cloud.css', 'assets/cloud.js', 'assets/cloud-config.js',
    'assets/cloud-attachments.js', 'assets/file-parsers.js',
    'assets/barcode-reader.js', 'assets/barcode-reader-core.js', 'assets/barcode-reader-ui.js',
    'assets/barcode-generator.js', 'assets/label-interpreter.js', 'assets/bt-quick.js', 'assets/bt-bridge.js',
    'assets/workbench-priority.js', 'docs/supabase-schema.sql', '.gitignore', 'README.md'
]
missing_files = [p for p in required_files if not Path(p).exists()]
if missing_files:
    raise SystemExit(f'Missing required project files: {missing_files}')

required_scripts = ['@supabase/supabase-js@2', 'assets/cloud-config.js', 'assets/app.js', 'assets/cloud.js']
missing_scripts = [s for s in required_scripts if s not in html]
if missing_scripts:
    raise SystemExit(f'Missing required script references: {missing_scripts}')
if 'assets/ui-refresh.css?v=20260910-v190' not in html or 'data-lw-ui-refresh="true"' not in html:
    raise SystemExit('refreshed UI stylesheet must load once with the v1.9 cache key')
if 'assets/nav-groups.css?v=20260910-v110' not in html:
    raise SystemExit('BT-first navigation stylesheet must use the v1.1 cache key')
if 'assets/app.js?v=20260910-v181' not in html or 'assets/cloud.js?v=20260910-v189' not in html:
    raise SystemExit('latest app/cloud cache keys are not linked')

legacy_scratch = ['scratchType','scratchPrefix','scratchSuffix','scratchEncoded','scratchHuman','scratchResult','updateScratch']
for marker in legacy_scratch:
    if marker in html or marker in js:
        raise SystemExit(f'Legacy scratch-pad marker still exists: {marker}')

if 'analysisFiles' in js or 'function analyzeSelected' in js:
    raise SystemExit('Core app must not own or reintroduce a legacy quick-analysis listener')
if "el('analysisFiles')" not in priority_js or "addEventListener('change'" not in priority_js:
    raise SystemExit('Priority controller must own the single quick-analysis change listener')
if 'stopImmediatePropagation' in priority_js:
    raise SystemExit('Quick analysis must not rely on event-propagation suppression')

if "['barcode','analysis','bartender','dashboard','cases']" not in priority_js:
    raise SystemExit('Navigation must prioritize Barcode, Analysis, then BT quick production')
for marker in ['BT 快速製作','案件紀錄','20260910-v182','headerCopy','syncHeaderCopy']:
    if marker not in priority_js:
        raise SystemExit(f'Priority controller is missing BT-first workflow marker: {marker}')
for marker in ['BT 製作','data-view="cases"','font-size:12px','#topNewCase{display:none!important}']:
    if marker not in nav_css:
        raise SystemExit(f'Navigation styling is missing optional-case marker: {marker}')
if 'data-view="bartender">🖨️ BT 快速製作' not in html:
    raise SystemExit('Static desktop navigation must expose BT quick production')
mobile_nav = re.search(r'<nav class="mobile-nav">(.*?)</nav>', html, re.S)
if not mobile_nav or 'data-view="bartender"' not in mobile_nav.group(1) or 'data-view="cases"' in mobile_nav.group(1):
    raise SystemExit('Mobile navigation must prioritize BT and keep Cases out of the main tab bar')

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

for duplicated_module in ['assets/cloud-attachments.js', 'assets/file-parsers.js', 'assets/barcode-reader.js']:
    if duplicated_module in cloud_cfg:
        raise SystemExit(f'cloud-config.js must not load optional module directly: {duplicated_module}')
if 'Local-first' not in cloud_js and '本機優先' not in cloud_js:
    raise SystemExit('Cloud layer must explicitly preserve local-first behavior')
for module in ['assets/cloud-attachments.js','assets/file-parsers.js','assets/barcode-reader.js']:
    if module not in cloud_js:
        raise SystemExit(f'Feature module is not wired by cloud loader: {module}')
if '20260910-v189' not in cloud_js:
    raise SystemExit('Cloud optional-module cache key must be v1.8.9')

if "label-attachments" not in attachments_js or '20*1024*1024' not in attachments_js.replace(' ', ''):
    raise SystemExit('Private attachment add-on must target the expected bucket and 20 MB limit')
if "label-attachments" not in schema_sql or "label-case-files" in schema_sql:
    raise SystemExit('Supabase schema must match the live label-attachments bucket')
if '<user_id>/<case_id>/<attachment_id>-<filename>' not in schema_sql:
    raise SystemExit('Supabase schema must document the attachment path shape used by the client')

if 'xlsx@0.18.5' not in parsers_js or 'mammoth@1.12.2' not in parsers_js or 'pdfjs-dist@6.3.289' not in parsers_js:
    raise SystemExit('Document parser CDN dependencies must remain version-pinned')
for marker in ['tesseract.js@7.0.0', 'createOcrWorker', 'renderPdfPage', "['eng','chi_tra']", 'OCR_MAX_PAGES=3', 'scanPdfCanvas']:
    if marker not in parsers_js:
        raise SystemExit(f'Scanned PDF fallback parser is missing marker: {marker}')

for module in ['barcode-reader-core.js','barcode-reader-ui.js','barcode-generator.js','label-interpreter.js','bt-quick.js','bt-bridge.js','workbench-priority.js']:
    if module not in barcode_loader:
        raise SystemExit(f'Barcode/workbench loader is missing {module}')
if '20260910-v189' not in barcode_loader:
    raise SystemExit('Barcode/workbench loader cache key must be v1.8.9')

if "const ZX='3.1.3'" not in barcode_core or 'zxing-wasm@${ZX}' not in barcode_core:
    raise SystemExit('Barcode core must pin zxing-wasm 3.1.3')
if '@undecaf/zbar-wasm@0.11.0' not in barcode_core:
    raise SystemExit('Barcode core must pin ZBar WASM 0.11.0')
if 'BarcodeDetector' not in barcode_core or 'ZXingWASM' not in barcode_core or 'readBarcodes' not in barcode_core:
    raise SystemExit('Barcode core must retain native detector plus ZXing-C++ WASM decoder')
for marker in ['scanImageData', 'decodeZBar', 'tryRotate:true', 'minLineCount:1', 'threshold(', 'deepScan', 'options.deep', 'scanCanvas', "fillStyle='#fff'", '標準化全圖', 'longSide<1600']:
    if marker not in barcode_core:
        raise SystemExit(f'Barcode core is missing fast/clipboard normalization marker: {marker}')
for marker in ['加強讀取', 'retryDeep', '快速掃描中', 'clipboardFiles', 'filesFromClipboardData', 'imageSourcesFromStrings', 'pasteFromClipboard', "window.addEventListener('paste',handlePaste,true)", 'barcodePasteZone', 'navigator.clipboard?.read', "run(files,{deep:true,mode:'paste'})"]:
    if marker not in barcode_ui:
        raise SystemExit(f'Barcode UI is missing robust read/paste marker: {marker}')
if 'id="barcodePasteBtn"' in barcode_ui:
    raise SystemExit('Redundant clipboard paste button must stay removed')
if 'patchAnalysis' in barcode_ui or 'analyzeSelected' in barcode_ui:
    raise SystemExit('Barcode reader UI must not patch the retired quick-analysis path')

for marker in ['20260910-v200','bwip-js@4.6.0','Code 128','QR Code','Data Matrix','GS1-128','GS1 DataMatrix','downloadPng','copyImage','verifyGenerated','＋ 加入排版','gen2DSize','twoDScale','min="2"','step="0.5"','generator-toggle-track','generator-controls','layoutBoard','layoutPlan','pointerdown','touch-action:none','整齊排列','複製整張','下載整張','copyLayoutImage','downloadLayoutPng','renderComposite','imageSmoothingEnabled=false']:
    if marker not in barcode_generator:
        raise SystemExit(f'Barcode generator is missing draggable-layout marker: {marker}')
if '<span class="pill">v1.8</span>' in barcode_generator:
    raise SystemExit('Barcode generator must not show a redundant version pill')

for marker in ['20260910-v180','chooseOrientation','contentBounds','enhanceCanvas','detectLabelBands','flattenLines','blocks:true','spatialFields','detectAnchor','parseCodeChunks','parseKnownNames','aggregateFields','makeTiles','scanRegionDeep','fieldVerified','interpretImage','interpretFiles','複製製作資料','複製給客戶確認','正在補讀細小區域','高可信','建議核對']:
    if marker not in interpreter_js:
        raise SystemExit(f'Label interpreter is missing v1.8 layout-aware marker: {marker}')
for forbidden in ['查看 OCR 原文','OCR 值','OCR 待確認']:
    if forbidden in interpreter_js:
        raise SystemExit(f'Action-focused analysis still exposes technical OCR output: {forbidden}')

for marker in ['20260910-bt100','jszip@3.10.1','labelWorkbench.btDraft.v1','BT_Data.csv','BT_Field_Map.csv','BT_Barcode_Map.csv','BT_WorkPack.json','buildDraft','inferFieldUsage','mapBarcodes','recommendTemplate','下載 BT 製作包 ZIP','本批有變動','本批固定']:
    if marker not in bt_quick:
        raise SystemExit(f'BT quick production is missing marker: {marker}')
for marker in ['20260910-btb110','analysisSendBt','__btQuickBridgeWrapped','receiveAnalysis','送到 BT 快速製作','wireInterpreter','wireParsers','parseTableFiles','tableResult',"['csv','xls','xlsx']"]:
    if marker not in bt_bridge:
        raise SystemExit(f'Quick Analysis -> BT bridge is missing marker: {marker}')
if '.btw' not in bt_quick or '不會偽造' not in bt_quick:
    raise SystemExit('BT quick production must not pretend to generate native BTW files')

for marker in ['analysis-summary','analysis-label-card','analysis-metrics','generator-options','@media(max-width:820px)','barcode-mode-tabs','mobile-nav']:
    if marker not in ui_css:
        raise SystemExit(f'UI refresh stylesheet is missing marker: {marker}')

print(f'PASS: {len(ids)} HTML ids checked')
print(f'PASS: {len(refs)} JavaScript DOM references checked')
print(f'PASS: {len(handlers)} inline handler names checked')
print('PASS: refreshed UI stylesheet is single-loaded with v1.9 cache key')
print('PASS: navigation prioritizes shared tools and BT quick production; Cases are optional')
print('PASS: quick analysis has one listener and no legacy scratch-pad path')
print('PASS: enabled Supabase browser config is publishable-key only')
print('PASS: optional modules have one loader and v1.8.9 cache-key chain')
print('PASS: private attachment bucket and schema path are aligned')
print('PASS: private attachments and document parser dependency pins checked')
print('PASS: barcode reader normalizes transparent clipboard images and auto deep-scans pasted images')
print('PASS: redundant clipboard paste button is removed')
print('PASS: barcode generator supports draggable multi-barcode layout and clean whole-board export')
print('PASS: quick analysis uses orientation + enhancement + layout blocks + spatial field matching')
print('PASS: quick analysis hides OCR internals and returns action-focused results')
print('PASS: PDF/image and Excel/CSV analysis bridge directly into local BT production data and ZIP export')