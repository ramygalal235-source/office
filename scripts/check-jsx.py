#!/usr/bin/env python3
"""فحص توازن وسوم JSX في ملفات tsx.
- يميّز JSX عن TypeScript (جينريكات <T>، تحويلات <Type>x، مقارنات a < b):
  وسم JSX اسمه إما عنصر HTML معروف أو مكوَّن مستورد/معرّف في الملف.
- يقاوم السلاسل والأقواس {} داخل خصائص الوسوم والتعليقات.
- يكتشف الوسوم المفتوحة بلا إغلاق وأقواس { } المعلقة في نهاية الملف."""
import re, sys, pathlib

HTML_ELEMENTS = {
    "div", "span", "p", "a", "b", "i", "u", "s", "small", "strong", "em", "sub", "sup",
    "label", "input", "button", "select", "option", "optgroup", "textarea", "form",
    "fieldset", "legend", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
    "section", "header", "footer", "main", "nav", "article", "aside", "details", "summary",
    "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "img", "hr", "br", "code", "pre",
    "blockquote", "dl", "dt", "dd", "figure", "figcaption", "time", "progress", "dialog",
    "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "text", "defs",
    "clipPath", "use", "title", "desc", "linearGradient", "radialGradient", "stop",
    "html", "body", "head", "meta", "link", "script", "noscript", "template",
}


def known_components(text):
    comps = set()
    for m in re.finditer(r"import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from", text):
        comps.add(m.group(1))
    for m in re.finditer(r"import\s+\*\s+as\s+([A-Za-z_$][\w$]*)", text):
        comps.add(m.group(1))
    for m in re.finditer(r"import\s*\{([^}]*)\}", text):
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            if " as " in part:
                part = part.split(" as ", 1)[1].strip()
            if re.fullmatch(r"[A-Za-z_$][\w$]*", part):
                comps.add(part)
    for m in re.finditer(r"\b(?:function|class)\s+([A-Za-z_$][\w$]*)", text):
        comps.add(m.group(1))
    for m in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", text):
        comps.add(m.group(1))
    for m in re.finditer(r"\b(?:type|interface)\s+([A-Za-z_$][\w$]*)", text):
        comps.add(m.group(1))
    return comps


def scan(text):
    errors = []
    stack = []  # (name, line, is_fragment)
    known = known_components(text)
    i, n = 0, len(text)

    def line_of(pos):
        return text.count("\n", 0, pos) + 1

    def is_jsx_name(name):
        root = name.split(".")[0]
        if name[0].islower():
            return name in HTML_ELEMENTS
        return root in known

    def scan_tag_end(start):
        """من بعد اسم الوسم حتى '>' الختام، مع احترام السلاسل و{} — يعيد (end, self_closing)"""
        j, d = start, 0
        while j < n:
            cj = text[j]
            if cj in "\"'`":
                q = cj
                j += 1
                while j < n:
                    if text[j] == "\\":
                        j += 2
                        continue
                    if text[j] == q:
                        break
                    j += 1
                j += 1
                continue
            if cj == "{":
                d += 1
            elif cj == "}":
                d -= 1
            elif cj == ">" and d == 0:
                return j, (j > start and text[j - 1] == "/")
            j += 1
        return n, False

    while i < n:
        c = text[i]
        if c == "\n":
            i += 1
            continue
        if c in "\"'`":
            q = c
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == q:
                    break
                i += 1
            i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            i = n if j == -1 else j
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        if c == "<" and i + 1 < n:
            # وسم إغلاق (أو fragment) — لا ينطبق عليه فحص prev:
            # IBAN</Label> و 0.9</b> نص عادي داخل JSX
            if text[i + 1] == "/":
                m = re.match(r"</\s*([A-Za-z][\w.]*)?\s*>", text[i:])
                if not m:
                    i += 1
                    continue
                name = m.group(1) or "#"
                if not stack or stack[-1][0] != name:
                    found = None
                    for k in range(len(stack) - 1, -1, -1):
                        if stack[k][0] == name:
                            found = k
                            break
                    if found is None:
                        errors.append(f"</{name}> بلا وسم مفتوح (سطر {line_of(i)})")
                    else:
                        for u in range(len(stack) - 1, found, -1):
                            t, ln, frag = stack[u]
                            errors.append(f"{'<' if frag else t} فُتح في سطر {ln} ولم يُغلق")
                        del stack[found:]
                else:
                    stack.pop()
                i += m.end()
                continue
            # fragment افتتاحي <>
            if text[i + 1] == ">":
                nxt = text[i + 2:i + 3]
                if nxt != "(":  # <>() = جينريك فارغ، ليس fragment
                    stack.append(("#", line_of(i), True))
                    i += 2
                    continue
                i += 1
                continue
            # وسم افتتاح: prev حرف معرّف ASCII = جينريك TypeScript أو مقارنة
            # (forwardRef<, useState<, a<b) — نصوص عربية ونقاط لا تُحسب
            prev = text[i - 1] if i > 0 else ""
            if (prev.isascii() and prev.isalnum()) or prev in "_$":
                i += 1
                continue
            m = re.match(r"<([A-Za-z][\w.]*)", text[i:])
            if m and is_jsx_name(m.group(1)):
                end, self_closing = scan_tag_end(i + m.end())
                if end >= n:
                    errors.append(f"{m.group(1)} فُتح في سطر {line_of(i)} ولم يُغلق (نهاية الملف)")
                    break
                if not self_closing:
                    stack.append((m.group(1), line_of(i), False))
                i = end + 1
                continue
        i += 1

    for name, ln, frag in stack:
        errors.append(f"{'<>' if frag else name} فُتح في سطر {ln} ولم يُغلق")
    return errors


if __name__ == "__main__":
    bad = 0
    for path in sys.argv[1:] or ["."]:
        p = pathlib.Path(path)
        files = [p] if p.is_file() else sorted(p.rglob("*.tsx"))
        for f in files:
            if "node_modules" in f.parts or ".next" in f.parts:
                continue
            errs = scan(f.read_text(encoding="utf-8"))
            if errs:
                bad += 1
                print(f"✗ {f}")
                for e in errs[:8]:
                    print("   -", e)
    if not bad:
        print("✓ كل ملفات tsx متوازنة (وسوم JSX)")
    sys.exit(1 if bad else 0)
