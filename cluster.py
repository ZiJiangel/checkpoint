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

# 各角色期望的 Hadoop 进程（可后续扩展）
EXPECTED_PROCS = {
    "master": ["NameNode", "DataNode", "ResourceManager", "NodeManager", "JobHistoryServer"],
    "worker": ["DataNode", "NodeManager"],
    "ntp": [],      # NTP/KDC 暂不查进程
    "kdc": [],
}


def _parse_jps(out):
    """解析 jps 输出，返回进程名列表"""
    procs = []
    for line in out.splitlines():
        parts = line.strip().split()
        if len(parts) >= 2 and parts[0].isdigit():
            procs.append(parts[1])
    return procs


def health_check(node):
    """检查单个节点：在线状态 + Hadoop 进程。
    返回 {id, online, procs, expected, missing, status}
    status: green(正常) / yellow(缺部分) / red(异常) / gray(未启用)"""
    nid = node.get("id")
    if not node.get("enabled", True):
        return {"id": nid, "online": False, "procs": [], "expected": [],
                "missing": [], "status": "gray", "detail": "已禁用"}

    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""),
                       "source /etc/profile 2>/dev/null; jps", timeout=12)
    if not ok:
        return {"id": nid, "online": False, "procs": [], "expected": [],
                "missing": [], "status": "red", "detail": out}

    procs = _parse_jps(out)
    expected = EXPECTED_PROCS.get(node.get("role", "worker"), [])
    missing = [p for p in expected if p not in procs]

    if not expected:
        status = "green"
    elif not missing:
        status = "green"
    elif len(missing) == len(expected):
        status = "red"
    else:
        status = "yellow"

    return {"id": nid, "online": True, "procs": procs, "expected": expected,
            "missing": missing, "status": status,
            "detail": "进程：" + (", ".join(procs) if procs else "无")}


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
                                "expected": [], "missing": [], "status": "red",
                                "detail": str(e)})
    order = {n["id"]: i for i, n in enumerate(nodes)}
    results.sort(key=lambda r: order.get(r["id"], 999))
    return results
