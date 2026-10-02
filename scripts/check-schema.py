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
SCALARS = {"String", "Int", "Float", "Boolean", "DateTime"}
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
        # نوع الحقل: قياسي أو نموذج (علاقة)
        is_list = ftype.endswith("[]")
        base = ftype.rstrip("?").rstrip("[]")
        if base not in SCALARS and base not in models:
            errors.append(f"{name}.{fname}: النوع «{base}» ليس قياسيًّا ولا نموذجًا معروفًا")
        # SQLite: autoincrement() لا يُقبل إلا على حقل Int @id (PRIMARY KEY)
        if "autoincrement()" in raw and not (ftype == "Int" and "@id" in raw):
            errors.append(f"{name}.{fname}: autoincrement() على حقل غير id — Prisma سيرفضه في SQLite")
        # توافق @default مع نوع الحقل
        dm = re.search(r"@default\((.*)\)\s*$", raw)
        if dm:
            dv = dm.group(1).strip()
            if base == "String" and dv not in ("cuid()", "uuid()", "auto()", "now()") and not (dv.startswith('"') or dv.startswith("'")) and dv not in SCALARS and not re.match(r"^[A-Z_]+$", dv) and not dv.startswith("dbgenerated"):
                if dv in ("cuid()", "uuid()", "auto()"):
                    pass
                # نص/قائمة/رقم بلا اقتباس على String غير مقبول
                elif not dv.startswith(("\"", "'")) and dv not in ("auto()",):
                    errors.append(f"{name}.{fname}: @default({dv}) غير صالح لحقل String")
            if base == "DateTime" and dv not in ("now()", "auto()"):
                errors.append(f"{name}.{fname}: @default({dv}) غير صالح لحقل DateTime")
            if base == "Boolean" and dv not in ("true", "false", "auto()"):
                errors.append(f"{name}.{fname}: @default({dv}) غير صالح لحقل Boolean")
            if base in ("Int", "Float") and dv not in ("auto()", "autoincrement()") and not re.match(r"^-?\d+(\.\d+)?$", dv):
                errors.append(f"{name}.{fname}: @default({dv}) غير صالح لحقل {base}")
            if base == "String" and dv in ("now()",) :
                errors.append(f"{name}.{fname}: @default({dv}) غير صالح لحقل String")
        # @relation: حقول fields/references يجب أن موجودة في النموذج
        relm = re.search(r"@relation\(\s*fields:\s*\[([^\]]*)\]\s*,\s*references:\s*\[([^\]]*)\]", raw)
        if relm:
            for f in relm.group(1).split(","):
                if f.strip() and f.strip() not in seen:
                    errors.append(f"{name}.{fname}: @relation fields يشير إلى حقل غير موجود «{f.strip()}»")
            for f in relm.group(2).split(","):
                if f.strip():
                    tgt_model = base
                    if tgt_model in models:
                        tgt_fields = set()
                        for traw in models[tgt_model].split("\n"):
                            traw = traw.strip()
                            if traw and not traw.startswith("@@"):
                                tp = traw.split()
                                if len(tp) >= 1:
                                    tgt_fields.add(tp[0])
                        if f.strip() not in tgt_fields:
                            errors.append(f"{name}.{fname}: @relation references يشير إلى «{f.strip()}» غير الموجود في {tgt_model}")
        if base == name and "@relation(" not in raw:
            errors.append(f"{name}.{fname}: علاقة ذاتية تحتاج @relation(\"name\")")
        rm = re.search(r'@relation\("([^"]+)"', raw)
        if rm:
            named.setdefault(rm.group(1), []).append((name, fname, base))
        # @@index / @@unique / @@id: الحقول المذكورة يجب أن توجد
        for bm in re.finditer(r"@@(?:index|unique|id)\(\s*\[([^\]]*)\]\s*\)", raw):
            for f in bm.group(1).split(","):
                f = f.strip()
                if f and f not in seen:
                    errors.append(f"{name}: فهرس/فريد يشير إلى حقل غير موجود «{f}»")

# فحص سطور @@ على مستوى النموذج (فهارس مفردة لا تُرى في حلقة الحقول)
for name, body in models.items():
    fields = set()
    for raw in body.split("\n"):
        raw = raw.strip()
        if raw and not raw.startswith("@@"):
            p = raw.split()
            if len(p) >= 1:
                fields.add(p[0])
    for bm in re.finditer(r"@@(?:index|unique|id)\(\s*\[([^\]]*)\]\s*\)", body):
        for f in bm.group(1).split(","):
            f = f.strip()
            if f and f not in fields:
                errors.append(f"{name}: فهرس/فريد @@ يشير إلى حقل غير موجود «{f}»")

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
