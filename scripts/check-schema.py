#!/usr/bin/env python3
"""فحص بنيوي لمخطط Prisma: العلاقات والأهداف والحقول المكررة."""
import re, sys, pathlib

path = sys.argv[1] if len(sys.argv) > 1 else "prisma/schema.prisma"
src = pathlib.Path(path).read_text(encoding="utf-8")
src = re.sub(r'//.*', '', src)
models = {}
for m in re.finditer(r'model\s+(\w+)\s*\{(.*?)\n\}', src, re.S):
    models[m.group(1)] = m.group(2)

errors, named = [], {}
for name, body in models.items():
    seen = set()
    for raw in body.split("\n"):
        raw = raw.strip()
        if not raw or raw.startswith("@@"):
            continue
        p = raw.split()
        if len(p) < 2:
            continue
        fname, ftype = p[0], p[1]
        if fname in seen:
            errors.append(f"{name}: حقل مكرر «{fname}»")
        seen.add(fname)
        is_list = ftype.endswith("[]")
        base = ftype.rstrip("?").rstrip("[]")
        if base not in models:
            continue
        if base == name and "@relation(" not in raw:
            errors.append(f"{name}.{fname}: علاقة ذاتية تحتاج @relation(\"name\")")
        rm = re.search(r'@relation\("([^"]+)"', raw)
        if rm:
            named.setdefault(rm.group(1), []).append((name, fname, base))

for rname, sides in named.items():
    if len(sides) != 2:
        errors.append(f"علاقة «{rname}» لها {len(sides)} طرف (المتوقع 2): {sides}")

# كل حقل علائ��ي يجب أن يقابله حقل يعود للمصدر داخل النموذج الهدف،
# وإلا رفض Prisma الملف. هذا ما ضاع من الفحص السابق.
relations = []  # (sourceModel, fieldName, targetModel)
for name, body in models.items():
    for raw in body.split("\n"):
        raw = raw.strip()
        if not raw or raw.startswith("@@"):
            continue
        parts = raw.split()
        if len(parts) < 2:
            continue
        ftype = parts[1]
        base = ftype.rstrip("?").rstrip("[]")
        if base in models:
            relations.append((name, parts[0], base))

for src, field, tgt in relations:
    if src == tgt:
        continue  # علاقة ذاتية: يكفي وجود طرف معاكس في نفس النموذج
    has_back = any(s == tgt and t == src for (s, _f, t) in relations)
    if not has_back:
        errors.append(
            f"{src}.{field} يشير إلى {tgt} لكن {tgt} لا يحتوي حقلًا يعود إلى {src} "
            f"(علاقة بلا طرف عكسي — Prisma سيرفض المخطط)"
        )

if src.count("{") != src.count("}"):
    errors.append(f"عدم توازن الأقواس {src.count('{')} / {src.count('}')}")

print(f"{path}: {len(models)} نموذجًا")
if errors:
    print("  مشاكل:")
    for e in sorted(set(errors)):
        print("   -", e)
    sys.exit(1)
print("  ✓ العلاقات مُزاوجة، لا حقول مكررة، الأقواس متوازنة")
