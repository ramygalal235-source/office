#!/usr/bin/env python3
"""مقارنة نسختي المخطط prisma/schema.prisma و schema.prisma — يجب أن تبقى متطابقتين."""
import sys

a = open("prisma/schema.prisma", encoding="utf-8").read()
b = open("schema.prisma", encoding="utf-8").read()
if a == b:
    print("✓ النسختان متطابقتان (IDENTICAL)")
else:
    import difflib
    for line in list(difflib.unified_diff(a.splitlines(), b.splitlines(), "prisma/schema.prisma", "schema.prisma", lineterm=""))[:40]:
        print(line)
    print("✗ النسختان غير متطابقتين!")
    sys.exit(1)
