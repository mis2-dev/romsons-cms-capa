#!/usr/bin/env python3
import re, sys, csv, pathlib
files = [pathlib.Path(p) for p in sys.argv[1:]]
funcs = {}
for f in files:
    txt = f.read_text(encoding='utf-8', errors='ignore')
    for m in re.finditer(r'function\s+([A-Za-z_$][\w$]*)\s*\(', txt):
        name = m.group(1)
        line = txt[:m.start()].count('
') + 1
        funcs.setdefault(name, []).append((str(f), line))
    for m in re.finditer(r'window\.([A-Za-z_$][\w$]*)\s*=\s*function\s*\(', txt):
        name = 'window.' + m.group(1)
        line = txt[:m.start()].count('
') + 1
        funcs.setdefault(name, []).append((str(f), line))
for name, locs in sorted(funcs.items(), key=lambda x: (-len(x[1]), x[0])):
    if len(locs) > 1:
        print(f'{name}: {len(locs)}')
        for f, line in locs:
            print(f'  - {f}:{line}')
