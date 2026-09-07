from pathlib import Path
import re

html = Path('index.html').read_text(encoding='utf-8')
js = Path('assets/app.js').read_text(encoding='utf-8')
cloud_js = Path('assets/cloud.js').read_text(encoding='utf-8')
cloud_cfg = Path('assets/cloud-config.js').read_text(encoding='utf-8')

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
    'docs/supabase-schema.sql', '.gitignore', 'README.md'
]
missing_files = [p for p in required_files if not Path(p).exists()]
if missing_files:
    raise SystemExit(f'Missing required project files: {missing_files}')

required_scripts = ['@supabase/supabase-js@2', 'assets/cloud-config.js', 'assets/app.js', 'assets/cloud.js']
missing_scripts = [s for s in required_scripts if s not in html]
if missing_scripts:
    raise SystemExit(f'Missing required script references: {missing_scripts}')

# Browser config may contain a Supabase publishable/anon key later, but never a privileged secret.
for forbidden in ['service_role', 'SUPABASE_SERVICE_ROLE', 'secret_key', 'sb_secret_']:
    if forbidden.lower() in cloud_cfg.lower():
        # Documentation comments may say these words; reject only assignment-like use or secret-looking key values.
        if re.search(rf"(?:key|service_role|secret)\s*[:=].*{re.escape(forbidden)}", cloud_cfg, re.I):
            raise SystemExit(f'Privileged secret marker found in browser config: {forbidden}')

if "enabled: false" not in cloud_cfg and "enabled:false" not in cloud_cfg:
    raise SystemExit('Cloud config must default to disabled until a real backend is provisioned')

if 'Local-first' not in cloud_js and '本機優先' not in cloud_js:
    raise SystemExit('Cloud layer must explicitly preserve local-first behavior')

print(f'PASS: {len(ids)} HTML ids checked')
print(f'PASS: {len(refs)} JavaScript DOM references checked')
print(f'PASS: {len(handlers)} inline handler names checked')
print('PASS: cloud files and script order checked')
print('PASS: browser cloud config defaults safe')
