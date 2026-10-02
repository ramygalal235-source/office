#!/usr/bin/env python3
"""فحص صياغة (syntax) لملفات ts/tsx بدون مترجم خارجي:
- توازن ( ) { } [ ] في الكود (خارج السلاسل والتعليقات ونصوص JSX)
- اكتمال سلاسل ' " على نفس السطر، وقوالب ` مغلقة بتعبيرات ${ } متوازنة
- ملفات tsx: وسوم JSX متوازنة مع تمييز السياقات:
  code (كود) | text (نص JSX بين الوسوم) — التعبير { } يفتح سياق code
- التعرف على RegExp literals (مثل /\\//g و /```(?:json)?/gi)
الإخراج: مشاكل فقط، أو ✓"""
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

REGEX_PREV = set("([,=:;![&|?+-*%<>~^")
REGEX_KEYWORDS = {"return", "typeof", "case", "in", "of", "new", "delete", "void", "do", "else", "instanceof", "throw", "yield", "await"}


def known_components(text):
    comps = set()
    for m in re.finditer(r"import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from", text):
        comps.add(m.group(1))
    for m in re.finditer(r"import\s+\*\s+as\s+([A-Za-z_$][\w$]*)", text):
        comps.add(m.group(1))
    for m in re.finditer(r"import\s*\{([^}]*)\}", text):
        for part in m.group(1).split(","):
            part = part.strip()
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


def scan(text, is_tsx):
    errors = []
    known = known_components(text)
    n = len(text)

    def line_of(pos):
        return text.count("\n", 0, pos) + 1

    def is_jsx_name(name):
        if name[0].islower():
            return name in HTML_ELEMENTS
        return name.split(".")[0] in known

    jsx_stack = []   # (name|'#', line, pushed_ctx)
    code_stack = []  # (char, line, expr_from_text)
    ctx_stack = ["code"]

    i = 0
    last_sig = ""
    last_word = ""

    def scan_string(j, q):
        while j < n:
            if text[j] == "\n":
                return j, False
            if text[j] == "\\":
                j += 2
                continue
            if text[j] == q:
                return j + 1, True
            j += 1
        return n, False

    def scan_template(i0):
        j = i0 + 1
        while j < n:
            cj = text[j]
            if cj == "\\":
                j += 2
                continue
            if cj == "`":
                return j + 1, True
            if cj == "$" and j + 1 < n and text[j + 1] == "{":
                d = 1
                j += 2
                while j < n and d > 0:
                    c2 = text[j]
                    if c2 in "\"'":
                        j, _ = scan_string(j + 1, c2)
                        continue
                    if c2 == "`":
                        j, _ = scan_template(j)
                        continue
                    if c2 == "{":
                        d += 1
                    elif c2 == "}":
                        d -= 1
                    j += 1
                if d != 0:
                    errors.append(f"${{...}} غير متوازن داخل قالب (سطر {line_of(i0)})")
                    return j, False
                continue
            j += 1
        return j, False

    def scan_tag_attrs(start):
        j, d = start, 0
        while j < n:
            cj = text[j]
            if cj in "\"'":
                q = cj
                j += 1
                while j < n and text[j] != "\n":
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

    def close_jsx(name, i):
        """معالجة </name> — تعيد موضع ما بعد الوسم"""
        m = re.match(r"</\s*([A-Za-z][\w.]*)?\s*>", text[i:])
        if not m:
            return i + 1
        if not jsx_stack or jsx_stack[-1][0] != name:
            found = None
            for k in range(len(jsx_stack) - 1, -1, -1):
                if jsx_stack[k][0] == name:
                    found = k
                    break
            if found is None:
                errors.append(f"</{name}> بلا وسم مفتوح (سطر {line_of(i)})")
                return i + m.end()
            popped_ctx = 0
            for u in range(found, len(jsx_stack)):
                tname, tln, pushed = jsx_stack[u]
                if u > found:
                    errors.append(f"{tname} فُتح سطر {tln} ولم يُغلق")
                if pushed:
                    popped_ctx += 1
            del jsx_stack[found:]
            for _ in range(popped_ctx):
                if len(ctx_stack) > 1 and ctx_stack[-1] == "text":
                    ctx_stack.pop()
        else:
            _name, _ln, pushed = jsx_stack.pop()
            if pushed and len(ctx_stack) > 1 and ctx_stack[-1] == "text":
                ctx_stack.pop()
        return i + m.end()

    while i < n:
        c = text[i]
        in_code = ctx_stack[-1] == "code"

        if c == "\n":
            i += 1
            last_sig, last_word = "\n", ""
            continue
        if c in " \t\r":
            i += 1
            continue
        if c.isascii() and (c.isalnum() or c in "_$"):
            if last_sig and not (last_sig.isascii() and (last_sig.isalnum() or last_sig in "_$")):
                last_word = c
            else:
                last_word += c
            last_sig = c
            i += 1
            continue

        # تعليقات (كود فقط)
        if in_code and c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            i = n if j == -1 else j
            last_sig, last_word = "\n", ""
            continue
        if in_code and c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            if j == -1:
                errors.append(f"تعليق كتلة غير مغلَق (سطر {line_of(i)})")
                break
            i = j + 2
            last_sig, last_word = "/", ""
            continue
        # RegExp (كود فقط): بعد رمز بداية تعبير أو كلمة مفتاحية
        if in_code and c == "/" and (last_sig in REGEX_PREV or last_word in REGEX_KEYWORDS):
            j = i + 1
            closed = False
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == "\n":
                    break
                if text[j] == "/":
                    closed = True
                    break
                j += 1
            if closed:
                j += 1
                while j < n and text[j] in "dgimsuvy":
                    j += 1
                i = j
                last_sig, last_word = "/", ""
                continue
        # سلاسل (كود فقط — في نص JSX السلاسل أحرف عادية)
        if in_code and c in "\"'":
            i, closed = scan_string(i + 1, c)
            if not closed:
                errors.append(f"سلسلة {c} غير مغلقة على سطر {line_of(i)}")
            last_sig, last_word = c, ""
            continue
        # قوالب (كود فقط)
        if in_code and c == "`":
            i, ok = scan_template(i)
            if not ok:
                errors.append(f"قالب ` غير مغلَق (سطر {line_of(i)})")
                break
            last_sig, last_word = "`", ""
            continue

        # ---- JSX (tsx) ----
        if is_tsx and c == "<" and i + 1 < n:
            if text[i + 1] == "/":
                nm = re.match(r"</\s*([A-Za-z][\w.]*)?\s*>", text[i:])
                if nm:
                    i = close_jsx(nm.group(1) or "#", i)
                    last_sig, last_word = ">", ""
                    continue
                i += 1
                last_sig = "<"
                continue
            if text[i + 1] == ">":
                if text[i + 2:i + 3] != "(":
                    pushed = ctx_stack[-1] == "code"
                    jsx_stack.append(("#", line_of(i), pushed))
                    if pushed:
                        ctx_stack.append("text")
                    i += 2
                    last_sig, last_word = ">", ""
                    continue
                i += 1
                last_sig = "<"
                continue
            prev = text[i - 1] if i > 0 else ""
            if not ((prev.isascii() and prev.isalnum()) or prev in "_$"):
                m = re.match(r"<([A-Za-z][\w.]*)", text[i:])
                if m and is_jsx_name(m.group(1)):
                    end, self_closing = scan_tag_attrs(i + m.end())
                    if end >= n:
                        errors.append(f"{m.group(1)} فُتح سطر {line_of(i)} ولم يُغلق")
                        break
                    if not self_closing:
                        pushed = ctx_stack[-1] == "code"
                        jsx_stack.append((m.group(1), line_of(i), pushed))
                        if pushed:
                            ctx_stack.append("text")
                    i = end + 1
                    last_sig, last_word = ">", ""
                    continue
            i += 1
            last_sig = "<"
            continue

        # ---- أقواس ----
        if c == "{":
            if in_code:
                code_stack.append((c, line_of(i), False))
            else:
                # حاوية تعبير داخل نص JSX
                code_stack.append((c, line_of(i), True))
                ctx_stack.append("code")
            i += 1
            last_sig, last_word = c, ""
            continue
        if c == "(":
            if in_code:
                code_stack.append((c, line_of(i), False))
            i += 1
            last_sig, last_word = c, ""
            continue
        if c == "[":
            if in_code:
                code_stack.append((c, line_of(i), False))
            i += 1
            last_sig, last_word = c, ""
            continue
        if c in ")}]":
            if in_code:
                want = {")": "(", "}": "{", "]": "["}[c]
                if not code_stack or code_stack[-1][0] != want:
                    errors.append(f"{c} بلا مقابل (سطر {line_of(i)})")
                    for k in range(len(code_stack) - 1, -1, -1):
                        if code_stack[k][0] == want:
                            errors.append(f"{want} فُتح سطر {code_stack[k][1]} ولم يُغلق")
                            popped_ctx = 0
                            for u in range(k, len(code_stack)):
                                if code_stack[u][2]:
                                    popped_ctx += 1
                            del code_stack[k:]
                            for _ in range(popped_ctx):
                                if len(ctx_stack) > 1 and ctx_stack[-1] == "code":
                                    ctx_stack.pop()
                            break
                else:
                    _ch, _ln, from_text = code_stack.pop()
                    if from_text and len(ctx_stack) > 1 and ctx_stack[-1] == "code":
                        ctx_stack.pop()
            i += 1
            last_sig, last_word = c, ""
            continue

        i += 1
        last_sig, last_word = c, ""

    for ch, ln, _ft in code_stack:
        errors.append(f"{ch} فُتح سطر {ln} ولم يُغلق")
    for name, ln, _p in jsx_stack:
        errors.append(f"{'<>' if name == '#' else name} فُتح سطر {ln} ولم يُغلق")
    return errors


if __name__ == "__main__":
    bad = 0
    targets = sys.argv[1:] or ["src"]
    for t in targets:
        p = pathlib.Path(t)
        files = [p] if p.is_file() else sorted(list(p.rglob("*.ts")) + list(p.rglob("*.tsx")))
        for f in files:
            if "node_modules" in f.parts or ".next" in f.parts:
                continue
            if f.suffix == ".d.ts":
                continue
            errs = scan(f.read_text(encoding="utf-8"), is_tsx=(f.suffix == ".tsx"))
            if errs:
                bad += 1
                print(f"✗ {f}")
                for e in errs[:10]:
                    print("   -", e)
    if not bad:
        print("✓ كل ملفات ts/tsx سليمة (أقواس وسلاسل ووسوم وRegExp)")
    sys.exit(1 if bad else 0)
