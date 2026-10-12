# -*- coding: utf-8 -*-
"""统一自检：一次跑全部检查。

1. JS 语法（app.js / i18n.js）—— 防"手误导致整个前端崩"
2. Python 导入
3. i18n 词条完整性
4. 前后端 API 一致性
5. 后端解析逻辑自测

用法：_packenv/Scripts/python.exe scripts/check_all.py
退出码：0 全通过；非 0 有失败
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable


def run(label, cmd, cwd=BASE):
    print("\n=== %s ===" % label)
    try:
        r = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str))
        ok = (r.returncode == 0)
    except FileNotFoundError as e:
        print("  [跳过] 找不到命令：%s" % e)
        return True
    print("  -> %s" % ("通过" if ok else "失败"))
    return ok


def main():
    results = []
    # 1. JS 语法
    if os.name == "nt":
        js = "node --check web/app.js && node --check web/i18n.js"
    else:
        js = "node --check web/app.js && node --check web/i18n.js"
    results.append(("JS 语法", run("JS 语法", js)))
    # 2. Python 导入
    py = [PY, "-c", "import core, cluster, app, services, vmware_env, diagnose, diagpack, cfgtmpl; print(\"OK\")"]
    results.append(("Python 导入", run("Python 导入", py)))
    # 3. i18n
    results.append(("i18n", run("i18n 词条", [PY, "scripts/check_i18n.py"])))
    # 4. API 一致性
    results.append(("API 一致性", run("前后端 API", [PY, "scripts/check_api.py"])))
    # 5. 自测
    results.append(("解析自测", run("解析逻辑自测", [PY, "scripts/selftest.py"])))
    # 汇总
    print("\n" + "=" * 40)
    failed = [n for n, ok in results if not ok]
    if failed:
        print("失败项：" + ", ".join(failed))
        return 1
    print("[OK] 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
