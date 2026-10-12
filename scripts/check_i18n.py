# -*- coding: utf-8 -*-
"""i18n 词条完整性自检。

检查三件事：
  1. 前端用了但字典没定义的 key（会显示成 key 本身）
  2. 中文有、英文缺
  3. 英文有、中文缺

用法：python scripts/check_i18n.py
退出码：0 = 全部正常；1 = 发现问题（可用于 CI / 提交前检查）
"""
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_JS = os.path.join(BASE, "web", "app.js")
I18N_JS = os.path.join(BASE, "web", "i18n.js")

# t('key') —— 词边界 \bt 避免误匹配 createElement('div') 末尾的 t(
RE_USED = re.compile(r"\bt\('([a-zA-Z0-9_.]+)'\)")
# "key": —— 字典条目
RE_DEF = re.compile(r'^\s*"([a-zA-Z0-9_.]+)"\s*:', re.M)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def split_langs(text):
    """把 i18n.js 按 zh / en 块切开"""
    zh_start = text.find("zh:")
    en_start = text.find("en:")
    if zh_start < 0 or en_start < 0:
        return None, None
    return text[zh_start:en_start], text[en_start:]


def main():
    app = read(APP_JS)
    i18n = read(I18N_JS)

    used = set(RE_USED.findall(app))
    zh_block, en_block = split_langs(i18n)
    zh = set(RE_DEF.findall(zh_block or ""))
    en = set(RE_DEF.findall(en_block or ""))

    problems = []

    missing_def = sorted(used - (zh | en))
    if missing_def:
        problems.append(("用了但没定义", missing_def))

    zh_only = sorted(zh - en)
    if zh_only:
        problems.append(("中文有、英文缺", zh_only))

    en_only = sorted(en - zh)
    if en_only:
        problems.append(("英文有、中文缺", en_only))

    unused = sorted((zh | en) - used)

    print("使用 key 数: %d" % len(used))
    print("中文定义: %d    英文定义: %d" % (len(zh), len(en)))
    if unused:
        print("未使用（定义了但代码没引用，仅供参考）: %d" % len(unused))

    if not problems:
        print("\n[OK] i18n 词条完整")
        return 0

    print("")
    for name, keys in problems:
        print("[问题] %s（%d）:" % (name, len(keys)))
        for k in keys:
            print("    " + k)
    return 1


if __name__ == "__main__":
    sys.exit(main())
