# -*- coding: utf-8 -*-
"""一键打包：调 PyInstaller + 打包后自动清理敏感/运行时文件。

用法：python scripts/build.py
产物：dist/Checkpoint.exe

为什么要清理：exe 旁边的 nodes.json 含明文密码，绿色版分发时
若直接拷 dist 目录会泄露。打包后自动删除这些运行时文件。
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = os.path.join(BASE, "_packenv", "Scripts", "python.exe")
DIST = os.path.join(BASE, "dist")

# 打包后从 dist 删除的运行时文件（含敏感信息 / 无需分发）
CLEAN = ["nodes.json", "settings.json", "aliases.json", "vms_cache.json",
         "health_cache.json", "services_state.json", "error.log"]

# PyInstaller 参数（与《开发交接文档》一致）
ARGS = [
    "--noconfirm", "--onefile", "--windowed", "--uac-admin",
    "--name", "Checkpoint", "--icon", "icon.ico",
    "--add-data", "web;web",
    "--collect-all", "webview", "--collect-all", "pythonnet",
    "--collect-all", "clr_loader", "--collect-all", "paramiko",
    "app.py",
]


def main():
    if not os.path.exists(PY):
        print("[错误] 找不到打包环境：%s" % PY)
        print("       请先建 _packenv（见《开发交接文档》/《Python应用精简打包经验.md》）")
        return 1

    print("打包中（约 1-2 分钟）…")
    r = subprocess.run([PY, "-m", "PyInstaller"] + ARGS, cwd=BASE)
    if r.returncode != 0:
        print("[错误] PyInstaller 失败，退出码 %d" % r.returncode)
        return r.returncode

    exe = os.path.join(DIST, "Checkpoint.exe")
    if not os.path.exists(exe):
        print("[错误] 打包产物不存在：%s" % exe)
        return 1

    # 清理 dist 里的敏感/运行时文件
    removed = []
    for name in CLEAN:
        p = os.path.join(DIST, name)
        if os.path.exists(p):
            try:
                os.remove(p)
                removed.append(name)
            except Exception as e:
                print("[警告] 删除失败 %s：%s" % (name, e))

    print("\n[OK] 产物：dist/Checkpoint.exe")
    if removed:
        print("     已清理敏感文件：%s" % ", ".join(removed))
    else:
        print("     （dist 无敏感文件需清理）")
    print("\n下一步：打安装包 ISCC setup.iss，或按发布流程走。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
