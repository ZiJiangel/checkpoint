# -*- coding: utf-8 -*-
"""集群节点管理 + SSH 连接 + 健康检查"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import core

NODES_FILE = os.path.join(core.BASE, "nodes.json")
HEALTH_CACHE_FILE = os.path.join(core.BASE, "health_cache.json")
DEFAULT_CLUSTER = "默认集群"


# ============ 数据层：节点读写 ============

def get_current_cluster():
    """当前选中的集群名"""
    return core.load_json(core.SETTINGS_FILE, {}).get("current_cluster", DEFAULT_CLUSTER)


def set_current_cluster(name):
    s = core.load_json(core.SETTINGS_FILE, {})
    s["current_cluster"] = name
    core.save_json(core.SETTINGS_FILE, s)


def _all_nodes():
    """全部节点（不按集群过滤），并兼容旧数据（补 cluster 字段）"""
    data = core.load_json(NODES_FILE, {"nodes": []})
    nodes = data.get("nodes", [])
    for n in nodes:
        n.setdefault("cluster", DEFAULT_CLUSTER)
    return nodes


def list_nodes(cluster=None):
    """返回节点列表。
    cluster=None → 当前集群；cluster='*' → 全部"""
    nodes = _all_nodes()
    if cluster == "*":
        return nodes
    target = cluster if cluster is not None else get_current_cluster()
    return [n for n in nodes if n.get("cluster") == target]


def known_vm_config(vmx):
    """查所有集群里，关联该 vmx 的节点已知的 host/user/pass/port。
    用于新建节点时自动带出配置。找不到返回 {}"""
    if not vmx:
        return {}
    key = os.path.normcase(os.path.abspath(vmx))
    for n in _all_nodes():
        if n.get("vmx") and os.path.normcase(os.path.abspath(n["vmx"])) == key:
            if n.get("host"):   # 只返回"填过 IP"的
                return {"host": n.get("host", ""), "user": n.get("user", ""),
                        "pass": n.get("pass", ""), "port": n.get("port", 22)}
    return {}


# 内置集群模板：标准节点配置（角色 + 提示）
CLUSTER_TEMPLATES = {
    "hadoop3": {
        "name": "Hadoop 3 节点",
        "nodes": [
            {"role": "master", "note": "主节点 · NameNode/RM"},
            {"role": "worker", "note": "从节点1 · DataNode/NM"},
            {"role": "worker", "note": "从节点2 · DataNode/NM/2NN"},
        ],
    },
    "hadoop5": {
        "name": "Hadoop + Kerberos 5 节点",
        "nodes": [
            {"role": "master", "note": "主节点"},
            {"role": "worker", "note": "从节点1"},
            {"role": "worker", "note": "从节点2"},
            {"role": "ntp", "note": "NTP 时间服务器"},
            {"role": "kdc", "note": "Kerberos KDC"},
        ],
    },
}


def list_templates():
    return [{"id": k, "name": v["name"], "count": len(v["nodes"])} for k, v in CLUSTER_TEMPLATES.items()]


def create_from_template(tid, cluster_name):
    """按模板创建节点骨架（归入指定集群）。返回新节点列表。"""
    tpl = CLUSTER_TEMPLATES.get(tid)
    if not tpl:
        return []
    created = []
    for i, spec in enumerate(tpl["nodes"], 1):
        node = {
            "name": spec["role"] + str(i) if spec["role"] in ("worker",) else spec["role"],
            "host": "", "user": "root", "pass": "",
            "role": spec["role"], "note": spec["note"],
            "cluster": cluster_name, "port": 22, "vmx": "", "tags": {}, "enabled": True,
        }
        created.append(add_node(node))
    return created


def list_clusters():
    """返回所有集群名（去重；含当前集群）"""
    names = []
    for n in _all_nodes():
        c = n.get("cluster", DEFAULT_CLUSTER)
        if c not in names:
            names.append(c)
    cur = get_current_cluster()
    if cur not in names:
        names.insert(0, cur)
    return names


# 存密码文件开头的"调侃"（明文存密码是刻意设计：给学生用，防忘密码）
PASSWORD_NOTE = "📝 密码明文存这儿，纯属怕你忘 —— 忘了就来这儿看一眼，别慌。下次记得自己记牢，别老麻烦我给你兜底 😏"

def save_nodes(nodes):
    core.save_json(NODES_FILE, {"_note": PASSWORD_NOTE, "nodes": nodes})


def add_node(node):
    """新增节点，自动补 id 与默认字段（默认归入当前集群）"""
    nodes = list_nodes("*")   # 全量，避免覆盖其他集群
    if not node.get("id"):
        node["id"] = "n_" + uuid.uuid4().hex[:8]
    node.setdefault("port", 22)
    node.setdefault("role", "worker")
    node.setdefault("tags", {})
    node.setdefault("enabled", True)
    node.setdefault("cluster", get_current_cluster())
    nodes.append(node)
    save_nodes(nodes)
    return node


def update_node(node):
    """按 id 更新节点"""
    nodes = list_nodes("*")   # 全量
    for i, n in enumerate(nodes):
        if n.get("id") == node.get("id"):
            nodes[i] = node
            break
    save_nodes(nodes)
    return node


def delete_node(nid):
    """按 id 删除节点"""
    nodes = [n for n in list_nodes("*") if n.get("id") != nid]   # 全量
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
    """测试节点连接：跑 hostname 验证（关机节点秒判，不白等超时）"""
    if node_vm_off(node):
        return False, "虚拟机关机（未开机）"
    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""),
                       "hostname; whoami", timeout=10)
    if ok:
        return True, "连接成功：" + out.strip().replace("\n", " / ")
    return False, out


# 部署前自检：检查节点基础环境（部署 Hadoop 前的先决条件）
def pre_deploy_check(node, running_vmx=None):
    """检查单个节点是否具备部署条件。
    返回 {id, online, items: [{key,label,value,ok}], status}"""
    nid = node.get("id")
    # 配了 vmx 且 VM 未运行 → 直接判为关机，跳过 SSH（不白等超时）
    vmx = node.get("vmx", "")
    if vmx and running_vmx is not None:
        key = os.path.normcase(os.path.abspath(vmx))
        if key not in running_vmx:
            return {"id": nid, "online": False, "items": [], "status": "off",
                    "detail": "虚拟机关机（未开机）"}
    cmd = ("echo \"java=$(java -version 2>&1 | head -1 | grep -oE 'version [^ ]+' || echo 无)\"; "
           "echo \"hosts=$(getent hosts master >/dev/null 2>&1 && echo OK || echo 缺)\"; "
           "echo \"sshd=$(systemctl is-active sshd 2>/dev/null || echo 未知)\"; "
           "echo \"time=$(timedatectl 2>/dev/null | grep -qi 'synchronized: yes' && echo OK || echo 未同步)\"; "
           "echo \"selinux=$(getenforce 2>/dev/null || echo 未知)\"; "
           "echo \"firewall=$(systemctl is-active firewalld 2>/dev/null || echo 未运行)\"")
    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""), cmd, timeout=15)
    if not ok:
        return {"id": nid, "online": False, "items": [], "status": "red", "detail": out}

    kv = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            kv[k.strip()] = v.strip()

    def item(key, label, good):
        val = kv.get(key, "?")
        is_ok = good(val)
        return {"key": key, "label": label, "value": val, "ok": is_ok}

    items = [
        item("java", "Java 环境", lambda v: v != "无" and v != ""),
        item("hosts", "hosts 解析", lambda v: v == "OK"),
        item("sshd", "SSH 服务", lambda v: v == "active"),
        item("time", "时间同步", lambda v: v == "OK"),
        item("selinux", "SELinux", lambda v: v.lower() in ("disabled", "permissive")),
        item("firewall", "防火墙", lambda v: v in ("inactive", "未运行", "unknown")),
    ]
    bad = [it for it in items if not it["ok"]]
    status = "green" if not bad else ("red" if len(bad) == len(items) else "yellow")
    return {"id": nid, "online": True, "items": items, "status": status, "detail": ""}


def pre_deploy_check_all():
    """并发检查所有节点（关机的节点跳过，不白等超时）"""
    nodes = list_nodes()
    if not nodes:
        return []
    running_vmx = set()
    try:
        for r in core.list_running():
            running_vmx.add(os.path.normcase(os.path.abspath(r)))
    except Exception:
        running_vmx = None
    results = []
    with ThreadPoolExecutor(max_workers=len(nodes)) as pool:
        fut = {pool.submit(pre_deploy_check, n, running_vmx): n for n in nodes}
        for f in as_completed(fut):
            try:
                results.append(f.result())
            except Exception as e:
                n = fut[f]
                results.append({"id": n.get("id"), "online": False, "items": [],
                                "status": "red", "detail": str(e)})
    order = {n["id"]: i for i, n in enumerate(nodes)}
    results.sort(key=lambda r: order.get(r["id"], 999))
    return results


# 常见软件的配置目录候选（软件名 → [候选路径]）。不写死，扫描确认存在才算。
CONFIG_CANDIDATES = {
    "Hadoop": ["/root/app/hadoop/etc/hadoop", "/usr/local/hadoop/etc/hadoop",
               "/opt/hadoop/etc/hadoop", "/root/app/hadoop/conf"],
    "Hive": ["/root/app/hive/conf", "/root/app/hive-2.3.9/conf",
             "/opt/hive/conf", "/usr/local/hive/conf"],
    "Spark": ["/root/app/spark/conf", "/opt/spark/conf", "/usr/local/spark/conf"],
    "Flume": ["/opt/flume/conf", "/opt/flume-1.11.0/conf", "/root/app/flume/conf"],
    "HBase": ["/root/app/hbase/conf", "/opt/hbase/conf", "/usr/local/hbase/conf"],
    "Kafka": ["/root/app/kafka/config", "/opt/kafka/config"],
    "Kerberos": ["/etc/krb5.conf", "/var/kerberos/krb5kdc"],
    "ZooKeeper": ["/root/app/zookeeper/conf", "/opt/zookeeper/conf"],
    "系统 hosts": ["/etc/hosts"],
    "环境变量": ["/etc/profile.d"],
}


def scan_config_dirs():
    """在 master 节点扫描存在的配置目录（不写死，以实际为准）。
    返回 [{software, path, exists}]"""
    nodes = list_nodes()
    master = next((n for n in nodes if n.get("role") == "master"), None)
    if not master:
        return {"ok": False, "dirs": [], "msg": "未找到 master 节点"}
    # 拼探测命令：对每个候选路径 test -e
    paths = []
    for sw, plist in CONFIG_CANDIDATES.items():
        for p in plist:
            paths.append((sw, p))
    # master 关机 → 秒判，不白等超时
    if node_vm_off(master):
        return {"ok": False, "dirs": [], "msg": "master 节点关机，请先开机"}
    cmds = "; ".join('test -e "%s" && echo "OK|%s|%s"' % (p, sw, p) for sw, p in paths)
    ok, out = ssh_exec(master.get("host", ""), master.get("port", 22),
                       master.get("user", ""), master.get("pass", ""), cmds, timeout=30)
    if not ok:
        return {"ok": False, "dirs": [], "msg": out}
    found = []
    for line in out.splitlines():
        if line.startswith("OK|"):
            parts = line.split("|", 2)
            if len(parts) == 3:
                found.append({"software": parts[1], "path": parts[2]})
    return {"ok": True, "dirs": found, "msg": ""}


def distribute_config(src_dir, dst_dir, roles=None):
    """从 master 节点把配置目录分发到目标角色节点（需 SSH 免密）。
    src_dir/dst_dir：源/目标目录；roles：目标角色（默认 worker）。
    返回 {ok, results: [{node, ok, out}]}"""
    from concurrent.futures import ThreadPoolExecutor
    nodes = list_nodes()
    master = next((n for n in nodes if n.get("role") == "master"), None)
    if not master:
        return {"ok": False, "results": [], "msg": "未找到 master 节点"}
    roles = roles or ["worker"]
    targets = [n for n in nodes if n.get("role") in roles and n.get("id") != master.get("id")]
    if not targets:
        return {"ok": True, "results": [], "skipped": True, "msg": "无目标节点"}
    mh = master.get("host", ""); mu = master.get("user", ""); mp = master.get("pass", "")
    running = _running_vmx_set()
    # master 关机 → 直接失败（要它执行 rsync）
    if node_vm_off(master, running):
        return {"ok": False, "results": [], "msg": "master 节点关机，无法分发"}
    results = []
    for t in targets:
        # 目标从节点关机 → 跳过（不白等超时）
        if node_vm_off(t, running):
            results.append({"node": t.get("name"), "ok": True, "out": "虚拟机关机，跳过", "off": True})
            continue
        th = t.get("host", ""); tu = t.get("user", "")
        # 不用 --delete（避免目标路径出错时误删文件）；配置分发只覆盖更新
        cmd = "rsync -az %s/ %s@%s:%s/" % (src_dir, tu, th, dst_dir)
        ok, out = ssh_exec(mh, master.get("port", 22), mu, mp, cmd, timeout=60)
        results.append({"node": t.get("name"), "ok": ok, "out": out})
    all_ok = all(r["ok"] for r in results) if results else True
    return {"ok": all_ok, "results": results}


def _running_vmx_set():
    """取当前运行中的 VM 集合（normcase 路径）"""
    s = set()
    try:
        for r in core.list_running():
            s.add(os.path.normcase(os.path.abspath(r)))
    except Exception:
        return None
    return s


def node_vm_off(node, running=None):
    """判断节点对应的 VM 是否关机（配了 vmx 且不在运行列表）。
    running=None 时会自己取一次。返回 True=关机"""
    vmx = node.get("vmx", "")
    if not vmx:
        return False   # 没配 vmx，判断不了，当作可用
    if running is None:
        running = _running_vmx_set()
    if running is None:
        return False
    return os.path.normcase(os.path.abspath(vmx)) not in running


def node_reachable(node, timeout=8):
    """探测单个节点 SSH 是否可达（完整 SSH 校验）"""
    ok, _ = ssh_exec(node.get("host", ""), node.get("port", 22),
                     node.get("user", ""), node.get("pass", ""),
                     "hostname", timeout=timeout)
    return ok


def tcp_reachable(node, timeout=2):
    """轻量探测：节点 SSH 端口是否打开（比完整 SSH 快几百倍）"""
    import socket
    host = node.get("host", "")
    port = int(node.get("port", 22) or 22)
    if not host:
        return False
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        return True
    except Exception:
        return False
    finally:
        s.close()


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
    """检查所有启用节点的 SSH 可达性（并发，供前端轮询）。
    返回 {ready: bool, nodes: [{name, ok}]}"""
    from concurrent.futures import ThreadPoolExecutor
    targets = [n for n in list_nodes() if n.get("enabled", True)]
    if not targets:
        return {"ready": True, "nodes": []}
    results = {}
    with ThreadPoolExecutor(max_workers=len(targets)) as pool:
        fut = {pool.submit(tcp_reachable, n): n for n in targets}
        for f in as_completed(fut):
            n = fut[f]
            try:
                results[n.get("id")] = f.result()
            except Exception:
                results[n.get("id")] = False
    nodes = [{"name": n.get("name"), "ok": results.get(n.get("id"), False)} for n in targets]
    all_ok = all(x["ok"] for x in nodes)
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


def health_check(node, running_vmx=None):
    """检查单个节点：在线 + 进程 + 端口。
    返回 {id, online, procs, expected, missing, ports_ok, ports_missing, status, detail}
    status: green(正常) / yellow(部分异常) / red(异常) / gray(未启用) / off(关机)"""
    nid = node.get("id")
    if not node.get("enabled", True):
        return {"id": nid, "online": False, "procs": [], "expected": [],
                "missing": [], "ports_ok": [], "ports_missing": [], "services": {},
                "svcs_missing": [], "status": "gray", "detail": "已禁用"}

    # 配了 vmx 且 VM 未运行 → 直接判为关机，跳过 SSH 探测（不白等超时）
    vmx = node.get("vmx", "")
    if vmx and running_vmx is not None:
        key = os.path.normcase(os.path.abspath(vmx))
        if key not in running_vmx:
            return {"id": nid, "online": False, "procs": [], "expected": [],
                    "missing": [], "ports_ok": [], "ports_missing": [], "services": {},
                    "svcs_missing": [], "status": "off", "detail": "虚拟机关机（未开机）"}

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
    # 先取一次运行中的 VM（避免逐台重复调用 vmrun）
    running_vmx = set()
    try:
        for r in core.list_running():
            running_vmx.add(os.path.normcase(os.path.abspath(r)))
    except Exception:
        running_vmx = None
    results = []
    with ThreadPoolExecutor(max_workers=len(nodes)) as pool:
        fut = {pool.submit(health_check, n, running_vmx): n for n in nodes}
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
    save_health_cache(results)
    return results


def save_health_cache(results):
    """把体检结果存盘（带时间戳）"""
    try:
        import time
        core.save_json(HEALTH_CACHE_FILE, {"time": int(time.time()), "results": results})
    except Exception as e:
        core.log("保存体检缓存失败：" + str(e), exc=True)


def load_health_cache():
    """读体检缓存。返回 {time, results} 或 None"""
    data = core.load_json(HEALTH_CACHE_FILE, None)
    if data and isinstance(data, dict) and "results" in data:
        return data
    return None
