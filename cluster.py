# -*- coding: utf-8 -*-
"""集群节点管理 + SSH 连接 + 健康检查"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import core

NODES_FILE = os.path.join(core.BASE, "nodes.json")


# ============ 数据层：节点读写 ============

def list_nodes():
    """返回节点列表"""
    data = core.load_json(NODES_FILE, {"nodes": []})
    return data.get("nodes", [])


def save_nodes(nodes):
    core.save_json(NODES_FILE, {"nodes": nodes})


def add_node(node):
    """新增节点，自动补 id 与默认字段"""
    nodes = list_nodes()
    if not node.get("id"):
        node["id"] = "n_" + uuid.uuid4().hex[:8]
    node.setdefault("port", 22)
    node.setdefault("role", "worker")
    node.setdefault("tags", {})
    node.setdefault("enabled", True)
    nodes.append(node)
    save_nodes(nodes)
    return node


def update_node(node):
    """按 id 更新节点"""
    nodes = list_nodes()
    for i, n in enumerate(nodes):
        if n.get("id") == node.get("id"):
            nodes[i] = node
            break
    save_nodes(nodes)
    return node


def delete_node(nid):
    """按 id 删除节点"""
    nodes = [n for n in list_nodes() if n.get("id") != nid]
    save_nodes(nodes)


# ============ 连接层：SSH 唯一出口 ============

def ssh_exec(host, port, user, password, cmd, timeout=15, use_exit_code=False):
    """在远程节点执行一条命令。
    use_exit_code=False（默认）：ok = 是否成功执行（SSH 连上并跑完）
    use_exit_code=True：ok = 命令退出码是否为 0（用于自检/条件判断）
    返回 (ok, 输出文本)。"""
    try:
        import paramiko
    except ImportError:
        return False, "缺少 paramiko，请先安装"
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cli.connect(host, port=int(port or 22), username=user, password=password,
                    timeout=timeout, banner_timeout=timeout, auth_timeout=timeout)
    except Exception as e:
        core.log("SSH 连接失败：" + str(host) + " — " + str(e))
        return False, "连接失败：" + str(e)
    try:
        si, so, se = cli.exec_command(cmd, timeout=timeout)
        out = so.read().decode("utf-8", "replace")
        err = se.read().decode("utf-8", "replace")
        code = so.channel.recv_exit_status()
        if err.strip():
            out = out + ("\n[STDERR] " + err if out else err)
        if use_exit_code:
            return code == 0, out
        return True, out
    except Exception as e:
        core.log("SSH 执行失败：" + str(host) + " — " + str(e))
        return False, "执行失败：" + str(e)
    finally:
        cli.close()


def test_node(node):
    """测试节点连接：跑 hostname 验证"""
    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""),
                       "hostname; whoami", timeout=10)
    if ok:
        return True, "连接成功：" + out.strip().replace("\n", " / ")
    return False, out


def node_reachable(node, timeout=8):
    """探测单个节点 SSH 是否可达（快速）"""
    ok, _ = ssh_exec(node.get("host", ""), node.get("port", 22),
                     node.get("user", ""), node.get("pass", ""),
                     "hostname", timeout=timeout)
    return ok


def nodes_vm_status():
    """返回 {节点id: {'running': bool, 'has_vmx': bool}}"""
    running = set()
    for r in core.list_running():
        running.add(os.path.normcase(os.path.abspath(r)))
    result = {}
    for n in list_nodes():
        vmx = n.get("vmx", "")
        if not vmx:
            result[n.get("id")] = {"running": False, "has_vmx": False}
        else:
            key = os.path.normcase(os.path.abspath(vmx))
            result[n.get("id")] = {"running": key in running, "has_vmx": True}
    return result


def check_nodes_ready():
    """检查所有启用节点的 SSH 可达性（单次，供前端轮询）。
    返回 {ready: bool, nodes: [{name, ok}]}"""
    targets = [n for n in list_nodes() if n.get("enabled", True)]
    nodes = []
    all_ok = True
    for n in targets:
        ok = node_reachable(n)
        nodes.append({"name": n.get("name"), "ok": ok})
        if not ok:
            all_ok = False
    return {"ready": all_ok, "nodes": nodes}


# ============ 逻辑层：健康检查 ============

# 各角色的检查项（声明式，可后续扩展）
# procs：期望运行的进程；ports：期望监听的端口；services：期望运行的系统服务(systemd)
ROLE_CHECKS = {
    "master": {
        "procs": ["NameNode", "DataNode", "ResourceManager", "NodeManager", "JobHistoryServer"],
        "ports": {9000: "HDFS NameNode", 8088: "YARN ResourceManager", 19888: "JobHistoryServer"},
        "services": {},
    },
    "worker": {
        "procs": ["DataNode", "NodeManager"],
        "ports": {},
        "services": {},
    },
    "ntp": {
        "procs": [], "ports": {},
        "services": {"chronyd": "NTP 时间同步"},
    },
    "kdc": {
        "procs": [],
        "ports": {88: "Kerberos KDC", 749: "Kerberos admin"},
        "services": {"krb5kdc": "Kerberos KDC", "kadmin": "Kerberos 管理"},
    },
}


def _parse_services(out):
    """解析 'name=state' 行，返回 {服务名: 是否active}"""
    result = {}
    for line in out.splitlines():
        line = line.strip()
        if "=" in line:
            k, v = line.split("=", 1)
            result[k.strip()] = (v.strip() == "active")
    return result


def _parse_jps(out):
    """解析 jps 输出，返回进程名列表"""
    procs = []
    for line in out.splitlines():
        parts = line.strip().split()
        if len(parts) >= 2 and parts[0].isdigit():
            procs.append(parts[1])
    return procs


def _parse_ports(out):
    """解析 ss/netstat 输出，返回监听端口集合（忽略表头）"""
    ports = set()
    for line in out.splitlines():
        line = line.strip()
        if not line or line.lower().startswith(("netid", "state", "proto")):
            continue
        parts = line.split()
        for token in parts:
            # 形如 0.0.0.0:9000 / *:8088 / :::9000
            if ":" in token:
                p = token.rsplit(":", 1)[-1]
                if p.isdigit():
                    ports.add(int(p))
    return ports


def health_check(node):
    """检查单个节点：在线 + 进程 + 端口。
    返回 {id, online, procs, expected, missing, ports_ok, ports_missing, status, detail}
    status: green(正常) / yellow(部分异常) / red(异常) / gray(未启用)"""
    nid = node.get("id")
    if not node.get("enabled", True):
        return {"id": nid, "online": False, "procs": [], "expected": [],
                "missing": [], "ports_ok": [], "ports_missing": [],
                "status": "gray", "detail": "已禁用"}

    checks = ROLE_CHECKS.get(node.get("role", "worker"),
                             {"procs": [], "ports": {}, "services": {}})
    expected = checks.get("procs", [])
    expected_ports = checks.get("ports", {})
    expected_svcs = checks.get("services", {})

    # 一条命令取 jps + 端口 + 服务状态
    svc_probe = "; ".join(
        'echo -n "%s="; systemctl is-active %s' % (s, s) for s in expected_svcs
    )
    cmd = "source /etc/profile 2>/dev/null; echo __JPS__; jps; echo __PORTS__; " \
          "(ss -tln 2>/dev/null || netstat -tln 2>/dev/null); echo __SVCS__; " + (svc_probe or "true")
    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""), cmd, timeout=15)
    if not ok:
        return {"id": nid, "online": False, "procs": [], "expected": [],
                "missing": [], "ports_ok": [], "ports_missing": [], "services": {},
                "svcs_missing": [], "status": "red", "detail": out}

    # 拆段
    jps_out = out.split("__JPS__", 1)[1].split("__PORTS__", 1)[0] if "__JPS__" in out else ""
    ports_out = out.split("__PORTS__", 1)[1].split("__SVCS__", 1)[0] if "__PORTS__" in out else ""
    svcs_out = out.split("__SVCS__", 1)[1] if "__SVCS__" in out else ""

    procs = _parse_jps(jps_out)
    listening = _parse_ports(ports_out)
    svc_states = _parse_services(svcs_out)

    missing = [p for p in expected if p not in procs]
    ports_ok = [p for p in expected_ports if p in listening]
    ports_missing = [p for p in expected_ports if p not in listening]
    svcs_missing = [s for s in expected_svcs if not svc_states.get(s, False)]

    # 状态判定
    total = len(expected) + len(expected_ports) + len(expected_svcs)
    if total == 0:
        status = "green"
    else:
        problems = len(missing) + len(ports_missing) + len(svcs_missing)
        if problems == 0:
            status = "green"
        elif problems == total:
            status = "red"
        else:
            status = "yellow"

    detail = "进程：" + (", ".join(procs) if procs else "无")
    if expected_ports:
        detail += "；端口：" + (", ".join(str(p) for p in sorted(ports_ok)) if ports_ok else "无")
    if expected_svcs:
        ok_svcs = [s for s in expected_svcs if svc_states.get(s)]
        detail += "；服务：" + (", ".join(ok_svcs) if ok_svcs else "无")

    return {"id": nid, "online": True, "procs": procs, "expected": expected,
            "missing": missing, "ports_ok": ports_ok, "ports_missing": ports_missing,
            "services": svc_states, "svcs_missing": svcs_missing,
            "status": status, "detail": detail}


def health_check_all():
    """并发检查所有节点，返回列表"""
    nodes = list_nodes()
    if not nodes:
        return []
    results = []
    with ThreadPoolExecutor(max_workers=len(nodes)) as pool:
        fut = {pool.submit(health_check, n): n for n in nodes}
        for f in as_completed(fut):
            try:
                results.append(f.result())
            except Exception as e:
                n = fut[f]
                core.log("健康检查异常：" + str(n.get("name")) + " — " + str(e))
                results.append({"id": n.get("id"), "online": False, "procs": [],
                                "expected": [], "missing": [], "ports_ok": [],
                                "ports_missing": [], "services": {}, "svcs_missing": [],
                                "status": "red", "detail": str(e)})
    order = {n["id"]: i for i, n in enumerate(nodes)}
    results.sort(key=lambda r: order.get(r["id"], 999))
    return results
