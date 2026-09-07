from pathlib import Path
import re

html = Path('index.html').read_text(encoding='utf-8')
js = Path('assets/app.js').read_text(encoding='utf-8')

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

required_files = ['index.html', 'assets/app.css', 'assets/app.js', '.gitignore', 'README.md']
missing_files = [p for p in required_files if not Path(p).exists()]
if missing_files:
    raise SystemExit(f'Missing required project files: {missing_files}')

print(f'PASS: {len(ids)} HTML ids checked')
print(f'PASS: {len(refs)} JavaScript DOM references checked')
print(f'PASS: {len(handlers)} inline handler names checked')
