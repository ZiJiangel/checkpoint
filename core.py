# -*- coding: utf-8 -*-
"""集群快照管理器 - 核心逻辑"""
import subprocess
import json
import os
import re
import glob
import sys
import urllib.request
import traceback
from datetime import datetime

# 版本信息（更新时改这里 + setup.iss 的 MyAppVersion）
VERSION = "0.9.4"
AUTHOR = "ZiJiangel"
GITHUB_REPO = "ZiJiangel/checkpoint"

if getattr(sys, "frozen", False):
    # 打包后：配置文件放在 exe 旁边
    BASE = os.path.dirname(sys.executable)
else:
    BASE = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(BASE, "settings.json")
ALIAS_FILE = os.path.join(BASE, "aliases.json")
LOG_FILE = os.path.join(BASE, "error.log")


def log(msg, exc=False):
    """写错误日志（带时间戳）。exc=True 时附带调用栈。"""
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write("[" + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "] " + str(msg) + "\n")
            if exc:
                f.write(traceback.format_exc() + "\n")
    except Exception:
        pass


# ============ 命令透明：全局命令日志（记录实际执行的命令+输出）============
import threading
import itertools
_CMD_LOG = []
_CMD_LOCK = threading.Lock()
_CMD_MAX = 500
_CMD_ID = itertools.count(1)

def start_cmd(cmd, target=""):
    """命令"开始执行"时记录（状态 running），返回条目 id 用于更新。"""
    try:
        with _CMD_LOCK:
            cid = next(_CMD_ID)
            _CMD_LOG.append({"id": cid, "cmd": str(cmd), "out": "", "ok": True,
                             "running": True, "target": str(target)})
            if len(_CMD_LOG) > _CMD_MAX:
                del _CMD_LOG[:-_CMD_MAX]
            return cid
    except Exception:
        return None

def finish_cmd(cid, out="", ok=True):
    """命令"执行结束"时更新状态。"""
    if cid is None:
        return
    try:
        with _CMD_LOCK:
            for it in _CMD_LOG:
                if it.get("id") == cid:
                    it["out"] = str(out)[:2000]
                    it["ok"] = bool(ok)
                    it["running"] = False
                    return
    except Exception:
        pass

def record_cmd(cmd, out="", ok=True, target=""):
    """一次性记录一条已完成的命令（无 running 阶段时用）。"""
    try:
        with _CMD_LOCK:
            _CMD_LOG.append({"id": next(_CMD_ID), "cmd": str(cmd), "out": str(out)[:2000],
                             "ok": bool(ok), "running": False, "target": str(target)})
            if len(_CMD_LOG) > _CMD_MAX:
                del _CMD_LOG[:-_CMD_MAX]
    except Exception:
        pass

def peek_cmd_log():
    """看一眼命令日志（不清空），供执行中实时显示。"""
    try:
        with _CMD_LOCK:
            return [dict(x) for x in _CMD_LOG]
    except Exception:
        return []

def drain_cmd_log():
    """取出并清空命令日志（每次操作后调用，返回本次操作产生的命令）。"""
    try:
        with _CMD_LOCK:
            items = [dict(x) for x in _CMD_LOG]
            _CMD_LOG.clear()
            return items
    except Exception:
        return []

# 依次尝试查找 vmrun：通用路径优先，最后是"保底路径"（可自行增删）
VMRUN_CANDIDATES = [
    r"C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe",
    r"C:\Program Files\VMware\VMware Workstation\vmrun.exe",
    r"C:\Program Files (x86)\VMware\VMware Player\vmrun.exe",
    r"D:\VM\VM170603\vmrun.exe",  # 保底：本机 VMware 安装位置
]

SCAN_DIRS = [
    r"D:\VM\VMs",
    os.path.join(os.path.expanduser("~"), "Documents", "Virtual Machines"),
    os.path.join(os.path.expanduser("~"), "vm"),
]


def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            log("读取 JSON 失败：" + path, exc=True)
            return default
    return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def detect_vmrun():
    for p in VMRUN_CANDIDATES:
        if os.path.exists(p):
            return p
    return ""


def get_vmrun():
    s = load_json(SETTINGS_FILE, {})
    v = s.get("vmrun", "")
    if v and os.path.exists(v):
        return v
    return detect_vmrun()


def run_vmrun(args, timeout=60):
    vmrun = get_vmrun()
    if not vmrun or not os.path.exists(vmrun):
        return False, "未找到 vmrun，请在设置中指定 VMware 的 vmrun 路径"
    track = bool(args) and args[0] != "list"   # 只读的 list 不记录（避免状态轮询污染）
    cid = start_cmd("vmrun " + " ".join(args)) if track else None
    try:
        CREATE_NO_WINDOW = 0x08000000
        p = subprocess.run([vmrun] + args, capture_output=True, text=True,
                           timeout=timeout, encoding="utf-8", errors="replace",
                           creationflags=CREATE_NO_WINDOW)
        out = ((p.stdout or "") + (p.stderr or "")).strip()
        if track:
            finish_cmd(cid, out, ok=(p.returncode == 0))
        return p.returncode == 0, out
    except Exception as e:
        log("执行 vmrun 失败：" + " ".join(args) + " — " + str(e), exc=True)
        if track:
            finish_cmd(cid, str(e), ok=False)
        return False, str(e)


def read_inventory():
    results = []
    inv = os.path.join(os.environ.get("APPDATA", ""), "VMware", "inventory.vmls")
    if not os.path.exists(inv):
        return results
    try:
        with open(inv, "r", encoding="gbk", errors="replace") as f:
            text = f.read()
    except Exception:
        log("读取 VMware 清单失败：" + inv, exc=True)
        return results
    paths, names = {}, {}
    for line in text.splitlines():
        m = re.match(r'(vmlist\d+)\.config\s*=\s*"(.+)"', line.strip())
        if m:
            paths[m.group(1)] = m.group(2)
        m2 = re.match(r'(vmlist\d+)\.DisplayName\s*=\s*"(.+)"', line.strip())
        if m2:
            names[m2.group(1)] = m2.group(2)
    for k, p in paths.items():
        results.append((p, names.get(k, os.path.basename(p))))
    return results


def scan_dirs():
    results = []
    for d in SCAN_DIRS:
        if os.path.isdir(d):
            for p in glob.glob(os.path.join(d, "**", "*.vmx"), recursive=True):
                results.append((p, os.path.splitext(os.path.basename(p))[0]))
    return results


CACHE_FILE = os.path.join(BASE, "vms_cache.json")


def scan_vms(force=False):
    """扫描虚拟机（带文件缓存）"""
    # 有缓存且不强制刷新 → 用缓存
    if not force and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, encoding="utf-8") as f:
                cached = json.load(f)
            # 过滤掉已不存在的
            valid = [c for c in cached if os.path.exists(c["vmx"])]
            if valid:
                return valid
        except Exception:
            log("读取扫描缓存失败，将重新扫描", exc=True)

    # 重新扫描
    found = {}
    for p, name in read_inventory():
        if p and os.path.exists(p):
            found[os.path.normcase(p)] = {"vmx": p, "display": name}
    for p, name in scan_dirs():
        key = os.path.normcase(p)
        if key not in found:
            found[key] = {"vmx": p, "display": name}
    result = list(found.values())

    # 写缓存
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception:
        log("写入扫描缓存失败", exc=True)
    return result


def list_vms(force=False):
    aliases = load_json(ALIAS_FILE, {})
    result = []
    for vm in scan_vms(force=force):
        vmx = vm["vmx"]
        meta = aliases.get(vmx, {})
        display = vm["display"] or os.path.splitext(os.path.basename(vmx))[0]
        show_name = (meta.get("name") or "").strip() or display
        note = meta.get("note", "")
        result.append({
            "name": display,
            "label": show_name,
            "note": note,
            "vmx": vmx,
        })
    result.sort(key=lambda x: x["label"])
    return result


def list_snapshots(vmx):
    if not vmx or not os.path.exists(vmx):
        return []
    ok, out = run_vmrun(["listSnapshots", vmx])
    if not ok:
        return []
    return [l.strip() for l in out.splitlines()
            if l.strip() and not l.lower().startswith("total snapshots")]


def list_snapshots_tree(vmx):
    """返回树状快照 [{name, depth}]。
    首选读 .vmsd（权威，含 parent 字段），vmrun -showtree 的缩进不可靠。
    读不到 .vmsd 时退回 vmrun 平铺（depth 全 0）。"""
    if not vmx or not os.path.exists(vmx):
        return []
    vmsd = os.path.splitext(vmx)[0] + ".vmsd"
    tree = _parse_vmsd_tree(vmsd)
    if tree:
        return tree
    # 退回：vmrun 平铺
    ok, out = run_vmrun(["listSnapshots", vmx])
    if not ok:
        return []
    return [{"name": l.strip(), "depth": 0} for l in out.splitlines()
            if l.strip() and not l.lower().startswith("total")]


def _parse_vmsd_tree(vmsd):
    """解析 .vmsd 里的快照层级。返回按树序排列的 [{name, depth}]。
    .vmsd 每行形如 snapshotN.uid/displayName/parent。"""
    if not os.path.exists(vmsd):
        return []
    try:
        raw = open(vmsd, "rb").read()
        # 第一行 .encoding 声明文件编码（常见 GBK / UTF-8）
        enc = "utf-8"
        first = raw.split(b"\n", 1)[0].decode("ascii", "ignore")
        if "encoding" in first and "=" in first:
            enc = first.split("=", 1)[1].strip().strip('"') or "utf-8"
        text = raw.decode(enc, "replace")
    except Exception as e:
        log("读 .vmsd 失败：" + str(vmsd) + " — " + str(e))
        return []
    import re as _re
    uid_name, uid_parent, order = {}, {}, []
    for line in text.splitlines():
        m = _re.match(r"snapshot(\d+)\.(uid|displayName|parent)\s*=\s*\"?([^\"]*)\"?", line)
        if not m:
            continue
        idx, key, val = m.group(1), m.group(2), m.group(3).strip()
        if key == "uid":
            uid_name[val] = uid_name.get(val, "")
            order.append(val)
        elif key == "displayName":
            # 该 displayName 属于哪个 uid？用 snapshot<idx>.uid 找
            mu = _re.search(r"snapshot%s\.uid\s*=\s*\"([^\"]*)\"" % idx, text)
            if mu:
                uid_name[mu.group(1)] = val
        elif key == "parent":
            mu = _re.search(r"snapshot%s\.uid\s*=\s*\"([^\"]*)\"" % idx, text)
            if mu and val:
                uid_parent[mu.group(1)] = val
    # 按 uid 顺序算深度（parent 链）
    def depth_of(uid, seen=None):
        seen = seen or set()
        if uid in seen or uid not in uid_parent:
            return 0
        seen.add(uid)
        return 1 + depth_of(uid_parent[uid], seen)
    result = []
    for uid in order:
        nm = uid_name.get(uid, "")
        if not nm:
            continue
        result.append({"name": nm, "depth": depth_of(uid)})
    return result


def list_running():
    ok, out = run_vmrun(["list"])
    if not ok:
        return []
    return [l.strip() for l in out.splitlines()
            if l.strip() and not l.lower().startswith("total")]


def take_snapshot(vmx, name):
    return run_vmrun(["snapshot", vmx, name])


def revert_snapshot(vmx, name):
    return run_vmrun(["revertToSnapshot", vmx, name])


def delete_snapshot(vmx, name):
    return run_vmrun(["deleteSnapshot", vmx, name])


def clone_vm(src_vmx, dst_vmx, snapshot=None, mode="full"):
    """克隆虚拟机。mode: full(完整) / linked(链接克隆，省空间)。
    snapshot: 基于哪个快照克隆（可选）。"""
    args = ["clone", src_vmx, dst_vmx, mode]
    if snapshot:
        args += ["-snapshot=" + snapshot]
    return run_vmrun(args, timeout=300)


def start_vm(vmx):
    return run_vmrun(["start", vmx, "nogui"])


def stop_vm(vmx):
    """关机：先软关机（优雅退出），超时或失败则回退硬关机。"""
    ok, out = run_vmrun(["stop", vmx, "soft"], timeout=60)
    if ok:
        return ok, out
    # 软关机失败（如超时，多为未装 VMware Tools）→ 回退硬关机
    log("软关机失败，改用硬关机：" + str(vmx) + " — " + str(out))
    return run_vmrun(["stop", vmx, "hard"], timeout=60)


def save_alias(vmx, name, note):
    aliases = load_json(ALIAS_FILE, {})
    aliases[vmx] = {"name": name, "note": note}
    save_json(ALIAS_FILE, aliases)


def set_vmrun(path):
    s = load_json(SETTINGS_FILE, {})
    s["vmrun"] = path
    save_json(SETTINGS_FILE, s)


def get_lang():
    return load_json(SETTINGS_FILE, {}).get("lang", "zh")


def set_lang(lang):
    s = load_json(SETTINGS_FILE, {})
    s["lang"] = lang
    save_json(SETTINGS_FILE, s)


def get_auto_check():
    """打开集群页时是否自动体检（默认开）"""
    return load_json(SETTINGS_FILE, {}).get("auto_check", True)


def set_auto_check(enabled):
    s = load_json(SETTINGS_FILE, {})
    s["auto_check"] = bool(enabled)
    save_json(SETTINGS_FILE, s)


def _ver_tuple(v):
    """把 "0.1.0" 转成 (0,1,0) 便于比较"""
    try:
        return tuple(int(x) for x in v.strip().lstrip("v").split("."))
    except Exception:
        log("版本号解析失败：" + str(v), exc=True)
        return (0,)


def check_update():
    """检查 GitHub 上是否有新版本。
    返回: {"has": bool, "latest": str, "url": str, "current": str}"""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "checkpoint",
        })
        data = json.loads(urllib.request.urlopen(req, timeout=6).read())
        latest = data.get("tag_name", "").lstrip("v")
        if latest and _ver_tuple(latest) > _ver_tuple(VERSION):
            return {"has": True, "latest": latest,
                    "url": data.get("html_url", ""), "current": VERSION}
    except Exception as e:
        log("检查更新失败：" + str(e), exc=True)
    return {"has": False, "current": VERSION}
