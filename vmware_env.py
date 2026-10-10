# -*- coding: utf-8 -*-
"""VMware 宿主机环境：服务状态检查 / 启动 / 软件启动"""
import os
import base64
import subprocess

import core

CREATE_NO_WINDOW = 0x08000000
VMWARE_EXE = r"D:\VM\VM170603\vmware.exe"

# VMware 服务：critical=vmrun/联网必需
VMWARE_SERVICES = [
    {"name": "VMAuthdService", "label": "授权服务", "critical": True,
     "why": "vmrun 必需——启停/快照/体检全靠它"},
    {"name": "VMware NAT Service", "label": "NAT 网络", "critical": True,
     "why": "虚拟机联网（不启动 SSH 连不上）"},
    {"name": "VMnetDHCP", "label": "DHCP 网络", "critical": True,
     "why": "虚拟机联网"},
    {"name": "VMUSBArbService", "label": "USB 服务", "critical": False,
     "why": "USB 设备直通（可选）"},
    {"name": "VmwareAutostartService", "label": "自动启动", "critical": False,
     "why": "开机自启虚拟机（可选）"},
]


def _ps(cmd, timeout=30):
    """运行 PowerShell 命令，返回输出文本"""
    try:
        p = subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                           capture_output=True, text=True, timeout=timeout,
                           encoding="utf-8", errors="replace",
                           creationflags=CREATE_NO_WINDOW)
        return ((p.stdout or "") + (p.stderr or "")).strip()
    except Exception as e:
        core.log("PowerShell 执行失败：" + str(e), exc=True)
        return ""


def _run_elevated_ps(script, timeout=90):
    """提权运行 PowerShell 脚本（隐藏控制台窗口，只弹 UAC）。
    用 base64 避免引号/中文问题。"""
    encoded = base64.b64encode(script.encode("utf-16-le")).decode()
    # -WindowStyle Hidden 隐藏提权后的 PowerShell 控制台窗口
    outer = ("Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList "
             "'-NoProfile','-WindowStyle','Hidden','-EncodedCommand','%s' -Wait") % encoded
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", outer],
                       timeout=timeout, creationflags=CREATE_NO_WINDOW)
        return True
    except Exception as e:
        core.log("提权执行失败：" + str(e), exc=True)
        return False


def services_status():
    """返回 [{name, label, critical, why, running, status}]"""
    names = ",".join("'%s'" % s["name"] for s in VMWARE_SERVICES)
    cmd = ("$names=@(%s); "
           "Get-Service | Where-Object { $names -contains $_.Name } | "
           "ForEach-Object { \"$($_.Name)|$($_.Status)\" }") % names
    out = _ps(cmd)
    smap = {}
    for line in out.splitlines():
        if "|" in line:
            k, v = line.split("|", 1)
            smap[k.strip()] = v.strip()
    result = []
    for s in VMWARE_SERVICES:
        st = smap.get(s["name"], "NotFound")
        result.append({
            "name": s["name"], "label": s["label"],
            "critical": s["critical"], "why": s["why"],
            "running": st == "Running", "status": st,
        })
    return result


def app_running():
    """VMware 图形界面是否在运行"""
    out = _ps("(Get-Process vmware -ErrorAction SilentlyContinue | Measure-Object).Count")
    try:
        return int(out.strip()) > 0
    except Exception:
        return False


def overall_state():
    """聚合状态：green(全就绪) / yellow(部分) / red(授权未起)"""
    svcs = services_status()
    authd = next((s for s in svcs if s["name"] == "VMAuthdService"), None)
    stopped = [s for s in svcs if not s["running"]]
    if not authd or not authd["running"]:
        state = "red"
    elif stopped:
        state = "yellow"
    else:
        state = "green"
    return {
        "state": state,
        "app_running": app_running(),
        "services": svcs,
        "running_count": len([s for s in svcs if s["running"]]),
        "total_count": len(svcs),
    }


def start_services():
    """启动所有停止的 VMware 服务（提权，会弹 UAC）"""
    script = "$ErrorActionPreference='SilentlyContinue'\n"
    script += "$names=@(%s)\n" % ",".join("'%s'" % s["name"] for s in VMWARE_SERVICES)
    script += ("Get-Service | Where-Object { $names -contains $_.Name -and "
               "$_.Status -ne 'Running' } | ForEach-Object { Start-Service $_.Name }\n")
    return _run_elevated_ps(script)


def stop_services():
    """停止所有正在运行的 VMware 服务（提权，会弹 UAC）。
    警告：停止授权服务后 vmrun 将不可用。"""
    script = "$ErrorActionPreference='SilentlyContinue'\n"
    script += "$names=@(%s)\n" % ",".join("'%s'" % s["name"] for s in VMWARE_SERVICES)
    script += ("Get-Service | Where-Object { $names -contains $_.Name -and "
               "$_.Status -eq 'Running' } | ForEach-Object { Stop-Service $_.Name -Force }\n")
    return _run_elevated_ps(script)


def start_one(name):
    """启动单个 VMware 服务（提权）"""
    if name not in [s["name"] for s in VMWARE_SERVICES]:
        return False
    script = ("$ErrorActionPreference='SilentlyContinue'\n"
              "Start-Service '%s'\n") % name
    return _run_elevated_ps(script)


def stop_one(name):
    """停止单个 VMware 服务（提权）。停止授权服务后 vmrun 将不可用。"""
    if name not in [s["name"] for s in VMWARE_SERVICES]:
        return False
    script = ("$ErrorActionPreference='SilentlyContinue'\n"
              "Stop-Service '%s' -Force\n") % name
    return _run_elevated_ps(script)


def launch_app():
    """启动 VMware Workstation 图形界面"""
    if not os.path.exists(VMWARE_EXE):
        return False, "未找到 vmware.exe：" + VMWARE_EXE
    try:
        subprocess.Popen([VMWARE_EXE], creationflags=CREATE_NO_WINDOW)
        return True, ""
    except Exception as e:
        core.log("启动 VMware 失败：" + str(e), exc=True)
        return False, str(e)
