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


# ============ 逻辑层：健康检查 ============

# 各角色的检查项（声明式，可后续扩展）
# procs：期望运行的进程；ports：期望监听的端口（端口→人话说明）
ROLE_CHECKS = {
    "master": {
        "procs": ["NameNode", "DataNode", "ResourceManager", "NodeManager", "JobHistoryServer"],
        "ports": {9000: "HDFS NameNode", 8088: "YARN ResourceManager", 19888: "JobHistoryServer"},
    },
    "worker": {
        "procs": ["DataNode", "NodeManager"],
        "ports": {},
    },
    "ntp": {"procs": [], "ports": {}},
    "kdc": {"procs": [], "ports": {}},
}


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

    # 一条命令同时取 jps 和端口
    cmd = "source /etc/profile 2>/dev/null; echo __JPS__; jps; echo __PORTS__; " \
          "(ss -tln 2>/dev/null || netstat -tln 2>/dev/null)"
    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""), cmd, timeout=15)
    if not ok:
        return {"id": nid, "online": False, "procs": [], "expected": [],
                "missing": [], "ports_ok": [], "ports_missing": [],
                "status": "red", "detail": out}

    # 拆 JPS 段和 PORTS 段
    jps_out, ports_out = out, ""
    if "__JPS__" in out and "__PORTS__" in out:
        jps_out = out.split("__JPS__", 1)[1].split("__PORTS__", 1)[0]
        ports_out = out.split("__PORTS__", 1)[1]

    procs = _parse_jps(jps_out)
    listening = _parse_ports(ports_out)

    checks = ROLE_CHECKS.get(node.get("role", "worker"), {"procs": [], "ports": {}})
    expected = checks.get("procs", [])
    expected_ports = checks.get("ports", {})

    missing = [p for p in expected if p not in procs]
    ports_ok = [p for p in expected_ports if p in listening]
    ports_missing = [p for p in expected_ports if p not in listening]

    # 状态判定
    if not expected and not expected_ports:
        status = "green"
    else:
        problems = len(missing) + len(ports_missing)
        total = len(expected) + len(expected_ports)
        if problems == 0:
            status = "green"
        elif problems == total:
            status = "red"
        else:
            status = "yellow"

    detail = "进程：" + (", ".join(procs) if procs else "无")
    if expected_ports:
        detail += "；端口：" + (", ".join(str(p) for p in sorted(ports_ok)) if ports_ok else "无")

    return {"id": nid, "online": True, "procs": procs, "expected": expected,
            "missing": missing, "ports_ok": ports_ok, "ports_missing": ports_missing,
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
                                "ports_missing": [], "status": "red",
                                "detail": str(e)})
    order = {n["id"]: i for i, n in enumerate(nodes)}
    results.sort(key=lambda r: order.get(r["id"], 999))
    return results
