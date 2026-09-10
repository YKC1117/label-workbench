from pathlib import Path
import re

FILES = [
    'index.html','assets/app.css','assets/ui-refresh.css','assets/nav-groups.css','assets/app.js',
    'assets/cloud.css','assets/cloud.js','assets/cloud-config.js','assets/cloud-attachments.js','assets/file-parsers.js',
    'assets/barcode-reader.js','assets/barcode-reader-core.js','assets/barcode-reader-ui.js','assets/barcode-generator.js',
    'assets/label-interpreter.js','assets/bt-quick.js','assets/btw-format.js','assets/btw-native.js','assets/bt-direct-import.js','assets/bt-bridge.js','assets/bt-native-primary.js','assets/layout-shortcuts.js','assets/workbench-priority.js',
    'docs/supabase-schema.sql','.gitignore','README.md','tests/bt-launch-smoke.cjs','tests/bt-direct-import-smoke.cjs','tests/btw-native-smoke.cjs'
]
missing=[p for p in FILES if not Path(p).exists()]
if missing: raise SystemExit(f'Missing required project files: {missing}')

read=lambda p:Path(p).read_text(encoding='utf-8')
html=read('index.html'); app=read('assets/app.js'); cloud=read('assets/cloud.js'); cfg=read('assets/cloud-config.js')
attachments=read('assets/cloud-attachments.js'); parsers=read('assets/file-parsers.js'); loader=read('assets/barcode-reader.js')
core=read('assets/barcode-reader-core.js'); reader_ui=read('assets/barcode-reader-ui.js'); generator=read('assets/barcode-generator.js')
interpreter=read('assets/label-interpreter.js'); bt=read('assets/bt-quick.js'); btw=read('assets/btw-format.js'); native=read('assets/btw-native.js'); direct=read('assets/bt-direct-import.js'); bridge=read('assets/bt-bridge.js'); native_primary=read('assets/bt-native-primary.js')
priority=read('assets/workbench-priority.js'); ui=read('assets/ui-refresh.css'); nav=read('assets/nav-groups.css'); schema=read('docs/supabase-schema.sql')

# Static app wiring / legacy cleanup
ids=set(re.findall(r'id="([^"]+)"',html)); refs=set(re.findall(r"getElementById\('([^']+)'\)",app))
if refs-ids: raise SystemExit(f'Missing HTML ids referenced by app.js: {sorted(refs-ids)}')
handlers=set(re.findall(r'on(?:click|input|change)="([A-Za-z_$][\w$]*)\(',html)); funcs=set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(',app))
if handlers-funcs: raise SystemExit(f'Inline handlers without app.js functions: {sorted(handlers-funcs)}')
for marker in ['scratchType','scratchPrefix','scratchSuffix','scratchEncoded','scratchHuman','scratchResult','updateScratch']:
    if marker in html or marker in app: raise SystemExit(f'Legacy scratch-pad marker exists: {marker}')
if 'analysisFiles' in app or 'function analyzeSelected' in app: raise SystemExit('app.js must not own legacy quick analysis')
if 'stopImmediatePropagation' in priority: raise SystemExit('Quick analysis must not use event suppression')
if "el('analysisFiles')" not in priority or "addEventListener('change'" not in priority: raise SystemExit('Priority controller must own quick analysis input')

# Current cache/load chain
for marker in ['assets/ui-refresh.css?v=20260910-v190','assets/nav-groups.css?v=20260910-v110','assets/app.js?v=20260910-v181','assets/cloud.js?v=20260910-v194']:
    if marker not in html: raise SystemExit(f'index.html missing current cache marker: {marker}')
for marker in ['assets/cloud-attachments.js','assets/file-parsers.js','assets/barcode-reader.js','20260910-v194']:
    if marker not in cloud: raise SystemExit(f'cloud loader missing: {marker}')
for marker in ['barcode-reader-core.js','barcode-reader-ui.js','barcode-generator.js','label-interpreter.js','bt-quick.js','bt-direct-import.js','btw-format.js','btw-native.js','bt-bridge.js','workbench-priority.js','bt-native-primary.js','20260910-v195']:
    if marker not in loader: raise SystemExit(f'workbench loader missing: {marker}')
for duplicated in ['assets/cloud-attachments.js','assets/file-parsers.js','assets/barcode-reader.js']:
    if duplicated in cfg: raise SystemExit(f'cloud-config must not load {duplicated}')

# Navigation: shared tools -> BT production -> optional case records
if "['barcode','analysis','bartender','dashboard','cases']" not in priority: raise SystemExit('BT-first navigation order missing')
for marker in ['BT 快速製作','案件紀錄','20260910-v182','headerCopy','syncHeaderCopy','直接匯入 PNG']:
    if marker not in priority: raise SystemExit(f'Priority marker missing: {marker}')
for marker in ['BT 製作','data-view="cases"','#topNewCase{display:none!important}']:
    if marker not in nav: raise SystemExit(f'Navigation styling marker missing: {marker}')
mobile=re.search(r'<nav class="mobile-nav">(.*?)</nav>',html,re.S)
if not mobile or 'data-view="bartender"' not in mobile.group(1) or 'data-view="cases"' in mobile.group(1): raise SystemExit('Mobile tabs must include BT and omit Cases')

# Browser cloud config must not expose privileged keys
for forbidden in ['SUPABASE_SERVICE_ROLE','sb_secret_']:
    if forbidden.lower() in cfg.lower(): raise SystemExit(f'Privileged secret marker found: {forbidden}')
if re.search(r'enabled\s*:\s*true',cfg,re.I):
    if not re.search(r"url\s*:\s*['\"]https://[^'\"]+\.supabase\.co['\"]",cfg,re.I): raise SystemExit('Enabled cloud config needs supabase.co URL')
    key=re.search(r"key\s*:\s*['\"]([^'\"]+)['\"]",cfg,re.I)
    if not key or not key.group(1).startswith('sb_publishable_'): raise SystemExit('Enabled cloud config must use publishable key')
elif not re.search(r'enabled\s*:\s*false',cfg,re.I): raise SystemExit('Cloud config must explicitly set enabled')
if 'Local-first' not in cloud and '本機優先' not in cloud: raise SystemExit('Cloud layer must preserve local-first behavior')
if 'label-attachments' not in attachments or '20*1024*1024' not in attachments.replace(' ',''): raise SystemExit('Attachment bucket/limit mismatch')
if 'label-attachments' not in schema or 'label-case-files' in schema or '<user_id>/<case_id>/<attachment_id>-<filename>' not in schema: raise SystemExit('Supabase attachment schema mismatch')

# Parser / reader capability pins
for marker in ['xlsx@0.18.5','mammoth@1.12.2','pdfjs-dist@6.3.289','tesseract.js@7.0.0','createOcrWorker','scanPdfCanvas']:
    if marker not in parsers: raise SystemExit(f'Parser capability missing: {marker}')
for marker in ["const ZX='3.1.3'",'@undecaf/zbar-wasm@0.11.0','BarcodeDetector','ZXingWASM','scanCanvas',"fillStyle='#fff'",'標準化全圖','deepScan']:
    if marker not in core: raise SystemExit(f'Barcode core marker missing: {marker}')
for marker in ['clipboardFiles','filesFromClipboardData','pasteFromClipboard',"window.addEventListener('paste',handlePaste,true)","run(files,{deep:true,mode:'paste'})"]:
    if marker not in reader_ui: raise SystemExit(f'Barcode paste marker missing: {marker}')
if 'id="barcodePasteBtn"' in reader_ui: raise SystemExit('Redundant paste button returned')

# Barcode generation/layout
for marker in ['20260910-v200','bwip-js@4.6.0','Code 128','QR Code','Data Matrix','GS1-128','＋ 加入排版','layoutBoard','layoutPlan','pointerdown','整齊排列','複製整張','下載整張','renderComposite']:
    if marker not in generator: raise SystemExit(f'Barcode generator marker missing: {marker}')

# Action-focused Quick Analysis
for marker in ['20260910-v180','chooseOrientation','enhanceCanvas','detectLabelBands','spatialFields','aggregateFields','scanRegionDeep','fieldVerified','interpretImage','interpretFiles','複製製作資料','複製給客戶確認']:
    if marker not in interpreter: raise SystemExit(f'Interpreter marker missing: {marker}')
for forbidden in ['查看 OCR 原文','OCR 值','OCR 待確認']:
    if forbidden in interpreter: raise SystemExit(f'OCR internals exposed: {forbidden}')

# BT Quick Production advanced data pack + resilient ASCII-safe launcher
for marker in ['20260910-bt140','jszip@3.10.1','labelWorkbench.btDraft.v1','BT_Data.csv','BT_Field_Map.csv','BT_Barcode_Map.csv','BT_WorkPack.json','BT_Open.cmd','buildOpenCmd','templateBaseName','inferFieldUsage','mapBarcodes','normalizeDraft','safeRender','window.LabelWorkbenchBtQuick=API','本批有變動','本批固定','/DbTextHeader=1','No .btw template was found','Opening BarTender without a template']:
    if marker not in bt: raise SystemExit(f'BT quick production marker missing: {marker}')
if bt.find('window.LabelWorkbenchBtQuick=API') > bt.find("if(document.readyState==='loading')"):
    raise SystemExit('BT Quick API must be registered before UI initialization')
if '/P /' in bt or ' /P ' in bt: raise SystemExit('BT launch helper must not contain automatic print switch')

# Editable native BTW primary path
for marker in ['20260910-btw011','parseStructure','inflateContainer','rebuild','scanUtf16Strings','replaceStringAt']:
    if marker not in btw: raise SystemExit(f'BTW format marker missing: {marker}')
for marker in ['20260910-btwn100','Sample_Doc1.btw','BcC128Data','BcDatamatrixData','patchCode128','patchDataMatrix','generateOne','downloadFromAnalysis','BT_Editable_']:
    if marker not in native: raise SystemExit(f'Native BTW generator marker missing: {marker}')
for marker in ['20260910-btnp100','下載可編輯 BTW','downloadEditable','ensureNative','analysisBtNative','btNativeDownload','備用：下載 BT 匯入圖','第一次給客戶前請確認尺寸與版面']:
    if marker not in native_primary: raise SystemExit(f'Native BTW primary UI marker missing: {marker}')

# UltraLite fallback path remains available
for marker in ['20260910-btdi100','pdfjs-dist@6.3.289','jszip@3.10.1','BT_Import_Label_','BT_可直接匯入_','detectLabelBands','rotateCanvas','downloadFromAnalysis','圖片物件']:
    if marker not in direct: raise SystemExit(f'BT direct import marker missing: {marker}')
for marker in ['20260910-btb150','analysisBtDirect','下載 BT 可直接匯入圖檔','進階：下載 BT 資料包','sendDirectToBt','ensureDirectImport','LabelWorkbenchBtDirectImport','bt140-retry','btdi100-retry','BT_製作包_','BT_Data.csv']:
    if marker not in bridge: raise SystemExit(f'BT bridge direct/advanced marker missing: {marker}')
if 'latestFiles=[...(files||[])]' not in bridge: raise SystemExit('BT bridge must retain browser File objects for native/direct reconstruction')

for marker in ['analysis-summary','analysis-label-card','analysis-metrics','@media(max-width:820px)','barcode-mode-tabs','mobile-nav']:
    if marker not in ui: raise SystemExit(f'UI marker missing: {marker}')

print(f'PASS: {len(ids)} HTML ids and {len(refs)} app DOM references checked')
print('PASS: one Quick Analysis entry point; legacy scratch path removed')
print('PASS: v1.9.5 workbench loader includes native editable BTW path')
print('PASS: publishable-key-only cloud security and private attachment schema checked')
print('PASS: barcode reader/generator and action-focused analysis markers checked')
print('PASS: native editable BTW is primary; PNG/data pack remain fallbacks')
