# -*- coding: utf-8 -*-
"""脱敏诊断包：一键生成含环境信息的 zip，供求助（不含密码/完整 IP）。"""
import os
import io
import re
import json
import time
import platform
import zipfile

import core
import cluster


def _mask_ip(ip):
    """IP 脱敏：保留前两段，后两段打码。192.168.196.101 → 192.168.*.*"""
    if not ip:
        return ""
    parts = str(ip).split(".")
    if len(parts) == 4:
        return parts[0] + "." + parts[1] + ".*.*"
    return "***"


def _mask_text(text):
    """文本脱敏：把 IP 全部打码。"""
    if not text:
        return ""
    return re.sub(r"\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b",
                  lambda m: m.group(1) + "." + m.group(2) + ".*.*", str(text))


def _system_info():
    return {
        "checkpoint_version": core.VERSION,
        "os": platform.platform(),
        "python": platform.python_version(),
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


def _nodes_info():
    """节点信息（脱敏：无密码，IP 打码）。"""
    out = []
    for n in cluster.list_nodes():
        out.append({
            "name": n.get("name", ""),
            "role": n.get("role", ""),
            "host": _mask_ip(n.get("host", "")),
            "port": n.get("port", 22),
            "cluster": n.get("cluster", ""),
            "vmx_set": bool(n.get("vmx")),
        })
    return out


def _health_info():
    data = cluster.load_health_cache()
    if not data:
        return {"cached": False}
    # 保留状态，脱敏 detail
    results = []
    for r in data.get("results", []):
        results.append({
            "id": r.get("id"), "status": r.get("status"),
            "online": r.get("online"),
            "missing": r.get("missing", []),
            "svcs_missing": r.get("svcs_missing", []),
            "detail": _mask_text(r.get("detail", ""))[:200],
        })
    return {"cached": True, "time": data.get("time"), "results": results}


def _log_tail(max_lines=200):
    """错误日志尾部（脱敏）。"""
    if not os.path.exists(core.LOG_FILE):
        return "(无日志)"
    try:
        with open(core.LOG_FILE, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return _mask_text("".join(lines[-max_lines:]))
    except Exception as e:
        return "(读日志失败：" + str(e) + ")"


def build_pack():
    """生成诊断包到内存，返回 (ok, bytes 或 错误信息)。"""
    try:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("system.json", json.dumps(_system_info(), ensure_ascii=False, indent=2))
            z.writestr("nodes.json", json.dumps(_nodes_info(), ensure_ascii=False, indent=2))
            z.writestr("health.json", json.dumps(_health_info(), ensure_ascii=False, indent=2))
            z.writestr("error.log", _log_tail())
            z.writestr("README.txt",
                       "Checkpoint 脱敏诊断包\n"
                       "已去除密码，IP 已打码。\n"
                       "含：系统信息 / 节点信息 / 体检结果 / 错误日志尾部。\n"
                       "可直接发给开发者排查问题。\n")
        return True, buf.getvalue()
    except Exception as e:
        core.log("生成诊断包失败：" + str(e), exc=True)
        return False, str(e)


def save_pack(path):
    """生成并保存诊断包到指定路径。返回 (ok, msg)。"""
    ok, data = build_pack()
    if not ok:
        return False, data
    try:
        with open(path, "wb") as f:
            f.write(data)
        return True, "已生成：" + path
    except Exception as e:
        return False, str(e)
