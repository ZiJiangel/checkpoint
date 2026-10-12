# -*- coding: utf-8 -*-
"""前后端 API 一致性自检。

检查 app.js / index.html 里调用的 pywebview.api.xxx，是否都在 app.py 的 Api 类里定义。
防"前端调了后端不存在的接口"这类运行时 bug。

用法：python scripts/check_api.py
退出码：0 = 一致；1 = 有缺失
"""
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_JS = os.path.join(BASE, "web", "app.js")
INDEX_HTML = os.path.join(BASE, "web", "index.html")
APP_PY = os.path.join(BASE, "app.py")


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def main():
    front = read(APP_JS) + read(INDEX_HTML)
    back = read(APP_PY)
    calls = set(re.findall(r"pywebview\.api\.([a-zA-Z_][\w]*)", front))
    m = re.search(r"class Api[\s\S]*", back)
    defined = set(re.findall(r"^    def ([a-zA-Z_][\w]*)\(", m.group(0), re.M)) if m else set()
    missing = sorted(calls - defined)
    print("前端调用 API 数: %d" % len(calls))
    print("后端定义方法数: %d" % len(defined))
    if missing:
        print("")
        print("[问题] 前端调用了但后端没定义（%d）:" % len(missing))
        for k in missing:
            print("    " + k)
        return 1
    print("")
    print("[OK] 前端调用的 API 后端全都有")
    return 0


if __name__ == "__main__":
    sys.exit(main())
