# -*- coding: utf-8 -*-
import subprocess, os
os.chdir(r"D:\03_学习\集群环境\集群快照管理器-pywebview")
cmd = [r"_packenv\Scripts\python.exe", "-m", "PyInstaller", "--noconfirm", "--onefile",
       "--windowed", "--uac-admin",
       "--name", "集群快照管理器", "--icon", "icon.ico",
       "--add-data", "web;web",
       "--collect-all", "webview", "--collect-all", "pythonnet",
       "--collect-all", "clr_loader", "--collect-all", "paramiko", "app.py"]
with open("build.log", "w", encoding="utf-8") as f:
    p = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT)
    f.write("\nEXITCODE=" + str(p.returncode) + "\nDONE\n")
