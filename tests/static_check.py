from pathlib import Path
import re

html = Path('index.html').read_text(encoding='utf-8')
js = Path('assets/app.js').read_text(encoding='utf-8')
cloud_js = Path('assets/cloud.js').read_text(encoding='utf-8')
cloud_cfg = Path('assets/cloud-config.js').read_text(encoding='utf-8')
attachments_js = Path('assets/cloud-attachments.js').read_text(encoding='utf-8')
parsers_js = Path('assets/file-parsers.js').read_text(encoding='utf-8')

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
    'docs/supabase-schema.sql', '.gitignore', 'README.md'
]
missing_files = [p for p in required_files if not Path(p).exists()]
if missing_files:
    raise SystemExit(f'Missing required project files: {missing_files}')

required_scripts = ['@supabase/supabase-js@2', 'assets/cloud-config.js', 'assets/app.js', 'assets/cloud.js']
missing_scripts = [s for s in required_scripts if s not in html]
if missing_scripts:
    raise SystemExit(f'Missing required script references: {missing_scripts}')

# Browser config may contain a Supabase publishable key. It must never contain privileged secrets.
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
if "label-attachments" not in attachments_js or '20*1024*1024' not in attachments_js.replace(' ', ''):
    raise SystemExit('Private attachment add-on must target the expected bucket and 20 MB limit')
if 'xlsx@0.18.5' not in parsers_js or 'mammoth@1.12.2' not in parsers_js or 'pdfjs-dist@6.3.289' not in parsers_js:
    raise SystemExit('Document parser CDN dependencies must remain version-pinned')

print(f'PASS: {len(ids)} HTML ids checked')
print(f'PASS: {len(refs)} JavaScript DOM references checked')
print(f'PASS: {len(handlers)} inline handler names checked')
print('PASS: cloud files and script order checked')
print('PASS: enabled Supabase browser config is publishable-key only')
print('PASS: private attachments and parser dependency pins checked')
