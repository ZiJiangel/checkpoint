# -*- coding: utf-8 -*-
"""集群节点管理 + SSH 连接 + 健康检查"""
import os
import re
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


# ============ 声明式集群配置（拓扑即数据，参考 Vagrant）============

def export_cluster_config(cluster_name=None):
    """把当前集群导出成声明式配置（dict）。不含密码（敏感）。
    可保存为文件、分享、或再导入。"""
    cluster_name = cluster_name or get_current_cluster()
    nodes = list_nodes(cluster_name)
    spec_nodes = []
    for n in nodes:
        spec_nodes.append({
            "name": n.get("name", ""),
            "role": n.get("role", "worker"),
            "host": n.get("host", ""),
            "port": n.get("port", 22),
            "user": n.get("user", "root"),
            "note": n.get("note", ""),
            "vmx": n.get("vmx", ""),
            "cfg_root": n.get("cfg_root", ""),
            # 不含 pass —— 导出配置不携带密码
        })
    return {
        "checkpoint_config": 1,
        "cluster": cluster_name,
        "nodes": spec_nodes,
    }


def import_cluster_config(config, cluster_name=None):
    """从声明式配置创建集群节点。
    config: dict（含 nodes 列表）；cluster_name: 归入哪个集群（默认用配置里的）。
    返回 {ok, created, skipped, msg}。"""
    if not isinstance(config, dict) or "nodes" not in config:
        return {"ok": False, "created": 0, "skipped": 0, "msg": "配置格式不对（缺 nodes）"}
    cluster_name = cluster_name or config.get("cluster") or get_current_cluster()
    created = 0
    skipped = 0
    for spec in config.get("nodes", []):
        if not isinstance(spec, dict) or not spec.get("name"):
            skipped += 1
            continue
        node = {
            "name": spec.get("name"),
            "host": spec.get("host", ""),
            "port": spec.get("port", 22),
            "user": spec.get("user", "root"),
            "pass": "",   # 密码不导入，需用户自己填
            "role": spec.get("role", "worker"),
            "note": spec.get("note", ""),
            "vmx": spec.get("vmx", ""),
            "cfg_root": spec.get("cfg_root", ""),
            "cluster": cluster_name,
            "tags": {}, "enabled": True,
        }
        add_node(node)
        created += 1
    return {"ok": True, "created": created, "skipped": skipped,
            "msg": "导入 %d 个节点（密码需手动填）" % created}


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
    label = "ssh " + str(user) + "@" + str(host) + " \"" + str(cmd) + "\""
    cid = core.start_cmd(label, target=str(host))
    try:
        si, so, se = cli.exec_command(cmd, timeout=timeout)
        out = so.read().decode("utf-8", "replace")
        err = se.read().decode("utf-8", "replace")
        code = so.channel.recv_exit_status()
        if err.strip():
            out = out + ("\n[STDERR] " + err if out else err)
        core.finish_cmd(cid, out, ok=(code == 0))
        if use_exit_code:
            return code == 0, out
        return True, out
    except Exception as e:
        core.log("SSH 执行失败：" + str(host) + " — " + str(e))
        core.finish_cmd(cid, str(e), ok=False)
        return False, "执行失败：" + str(e)
    finally:
        cli.close()


def node_exec(node, cmd, timeout=30):
    """在节点上执行一条命令（终端用）。返回 {ok, out}。"""
    if node_vm_off(node):
        return {"ok": False, "out": "虚拟机关机（未开机）"}
    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""), cmd,
                       timeout=timeout, use_exit_code=True)
    return {"ok": ok, "out": out}


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


def hbase_tables(timeout=60):
    """列 HBase 表。返回 {ok, tables, msg}。"""
    m = _master_node()
    if not m:
        return {"ok": False, "tables": [], "msg": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "tables": [], "msg": "master 节点关机"}
    ok, out = _hdfs_master_run('echo "list" | hbase shell -n 2>/dev/null', timeout=timeout)
    tables = []
    if ok:
        for line in (out or "").splitlines():
            line = line.strip()
            if not line or "TABLE" in line or line.startswith("ROW") or line.startswith("("):
                continue
            if re.match(r"^[A-Za-z_][\w.-]*$", line):
                tables.append(line)
    return {"ok": ok, "tables": tables, "msg": out if not ok else ""}


def detect_components():
    """检测集群装了哪些组件（按配置目录/命令探测）。
    返回 {ok, components: {hive:bool, hbase:bool, spark:bool, ...}, msg}。
    用于前端"组件动态显示"（没装 HBase 就不显示 HBase 浏览）。"""
    m = _master_node()
    if not m:
        return {"ok": False, "components": {}, "msg": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "components": {}, "msg": "master 节点关机"}
    # 探测命令：which/目录存在
    checks = {
        "hive": 'which hive >/dev/null 2>&1 || test -d /root/app/hive',
        "hbase": 'which hbase >/dev/null 2>&1 || test -d /root/app/hbase',
        "spark": 'which spark-submit >/dev/null 2>&1 || test -d /root/app/spark',
        "hdfs": 'which hdfs >/dev/null 2>&1',
        "yarn": 'which yarn >/dev/null 2>&1',
    }
    cmds = "; ".join('(%s) && echo "OK|%s"' % (c, k) for k, c in checks.items())
    ok, out = ssh_exec(m.get("host", ""), m.get("port", 22),
                       m.get("user", ""), m.get("pass", ""), cmds, timeout=20)
    comp = {}
    if ok:
        for line in out.splitlines():
            if line.startswith("OK|"):
                comp[line.split("|", 1)[1].strip()] = True
    return {"ok": True, "components": comp, "msg": ""}


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


def _map_target(node, src_dir, global_root):
    """算某节点的目标路径。
    规则（可预测）：把源路径里的 **应用根 /root/app** 替换成"根"（节点 cfg_root 优先，否则全局）。
    - 没配任何根 → 同路径
    - 源是系统路径（/etc /usr /var）→ 不动
    - 源在 /root/app 下（教程默认）→ 把 /root/app 换成根
    - 其他 → 同路径（安全兜底）
    """
    root = (node.get("cfg_root") or "").strip() or (global_root or "").strip()
    if not root:
        return src_dir
    if src_dir.startswith(("/etc", "/usr", "/var")):
        return src_dir
    if src_dir == "/root/app" or src_dir.startswith("/root/app/"):
        rel = src_dir[len("/root/app"):]
        return root.rstrip("/") + rel
    return src_dir


def distribute_config(src_dir, dst_dir, roles=None):
    """从 master 节点把配置目录分发到目标角色节点（需 SSH 免密）。
    src_dir/dst_dir：源/全局目标目录；roles：目标角色（默认 worker）。
    每个节点可用自己的 cfg_root 覆盖目标。"""
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
        # 每个节点可用自己的 cfg_root 覆盖目标路径
        dst = _map_target(t, src_dir, dst_dir)
        # 不用 --delete（避免目标路径出错时误删文件）；配置分发只覆盖更新
        cmd = "rsync -az %s/ %s@%s:%s/" % (src_dir, tu, th, dst)
        ok, out = ssh_exec(mh, master.get("port", 22), mu, mp, cmd, timeout=60)
        results.append({"node": t.get("name"), "ok": ok, "out": out, "dst": dst})
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


# ============ HDFS 操作（图形化浏览/上传/下载，复用 ssh_exec）============

def _master_node():
    nodes = list_nodes()
    return next((n for n in nodes if n.get("role") == "master"), None)


def _hdfs_master_run(cmd, timeout=30, use_exit_code=True):
    """在 master 上跑一条 hdfs 命令（带 VM 关机秒判 + 命令透明）。
    返回 (ok, out)。"""
    m = _master_node()
    if not m:
        return False, "未找到 master 节点"
    if node_vm_off(m):
        return False, "master 节点关机，请先开机"
    return ssh_exec(m.get("host", ""), m.get("port", 22),
                    m.get("user", ""), m.get("pass", ""), cmd,
                    timeout=timeout, use_exit_code=use_exit_code)


def hdfs_ls(path="/"):
    """列 HDFS 目录。返回 [{name, type, size, date, perm, owner}]。
    用 hdfs dfs -ls 输出解析（列：权限 副本 owner group size date time name）。"""
    path = path or "/"
    ok, out = _hdfs_master_run('hdfs dfs -ls "%s"' % path)
    if not ok:
        return {"ok": False, "items": [], "msg": out}
    items = []
    for line in out.splitlines():
        line = line.rstrip()
        if not line or line.startswith("Found ") or line.startswith("ls:") or line.lower().startswith("[stderr]"):
            continue
        parts = line.split()
        if len(parts) < 8:
            continue
        perm = parts[0]
        is_dir = perm.startswith("d")
        size = parts[4]
        date = parts[5] + " " + parts[6]
        name = " ".join(parts[7:])
        base = name.rstrip("/").split("/")[-1] or name
        items.append({"name": base, "full": name, "type": "dir" if is_dir else "file",
                      "size": size, "date": date, "perm": perm, "owner": parts[2]})
    return {"ok": True, "items": items, "msg": ""}


def hdfs_mkdir(path):
    return _hdfs_master_run('hdfs dfs -mkdir -p "%s"' % path)


def hdfs_rm(path, recursive=False):
    flag = "-r " if recursive else ""
    return _hdfs_master_run('hdfs dfs -rm %s"%s"' % (flag, path), timeout=60)


def hdfs_put(local_path, remote_path):
    """上传本地文件到 HDFS（本地文件需在 master 上；否则前端需先传）。"""
    return _hdfs_master_run('hdfs dfs -put -f "%s" "%s"' % (local_path, remote_path), timeout=120)


def hdfs_get(remote_path, local_path):
    return _hdfs_master_run('hdfs dfs -get -f "%s" "%s"' % (remote_path, local_path), timeout=120)


def hdfs_cat(remote_path):
    """读文件前 N 行（预览）。"""
    return _hdfs_master_run('hdfs dfs -cat "%s" | head -100' % remote_path, timeout=60)


def sftp_upload(host, port, user, password, local_path, remote_path, timeout=30):
    """用 SFTP 把本地文件传到远程（返回 (ok, msg)）。"""
    try:
        import paramiko
    except ImportError:
        return False, "缺少 paramiko"
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cli.connect(host, port=int(port or 22), username=user, password=password, timeout=timeout)
        sftp = cli.open_sftp()
        sftp.put(local_path, remote_path)
        sftp.close()
        return True, "上传成功"
    except Exception as e:
        core.log("SFTP 上传失败：" + str(e), exc=True)
        return False, str(e)
    finally:
        cli.close()


def hdfs_upload(local_path, remote_dir):
    """把本地文件上传到 HDFS。
    步骤：SFTP 传到 master 的 /tmp → 在 master 上 hdfs dfs -put。
    local_path: 宿主机本地文件；remote_dir: HDFS 目标目录。"""
    m = _master_node()
    if not m:
        return {"ok": False, "msg": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "msg": "master 节点关机，请先开机"}
    import os as _os
    base = _os.path.basename(local_path)
    tmp_remote = "/tmp/checkpoint_upload_" + base
    # 1) SFTP 传到 master
    ok, msg = sftp_upload(m.get("host", ""), m.get("port", 22),
                          m.get("user", ""), m.get("pass", ""), local_path, tmp_remote)
    if not ok:
        return {"ok": False, "msg": "传到 master 失败：" + msg}
    # 2) master 上 hdfs dfs -put
    dst = remote_dir.rstrip("/") + "/" + base
    cmd = 'hdfs dfs -put -f "%s" "%s" && rm -f "%s"' % (tmp_remote, dst, tmp_remote)
    ok2, out2 = _hdfs_master_run(cmd, timeout=180)
    return {"ok": ok2, "msg": out2, "dst": dst}


def sftp_download(host, port, user, password, remote_path, local_path, timeout=30):
    """SFTP 从远程下载文件到本地（返回 (ok, msg)）。"""
    try:
        import paramiko
    except ImportError:
        return False, "缺少 paramiko"
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cli.connect(host, port=int(port or 22), username=user, password=password, timeout=timeout)
        sftp = cli.open_sftp()
        sftp.get(remote_path, local_path)
        sftp.close()
        return True, "下载成功"
    except Exception as e:
        core.log("SFTP 下载失败：" + str(e), exc=True)
        return False, str(e)
    finally:
        cli.close()


def post_deploy_verify():
    """部署后验证：进程/端口在不在之外，查 HDFS 是否真的有 DataNode 注册。
    （体检只看进程，这里看 HDFS 内部状态——更硬）
    返回 {ok, items:[{label,ok,value}], detail}。"""
    m = _master_node()
    if not m:
        return {"ok": False, "items": [], "detail": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "items": [], "detail": "master 节点关机，请先开机"}
    items = []

    def probe(label, cmd, good, t=30):
        ok, out = _hdfs_master_run(cmd, timeout=t)
        val = (out or "").strip().splitlines()[-1] if out and out.strip() else ""
        is_ok = ok and good(out or "")
        items.append({"label": label, "ok": is_ok, "value": val[:120]})
        return is_ok, out

    # 1) HDFS 可访问
    probe("HDFS 可访问（hdfs dfsadmin -report）",
          "hdfs dfsadmin -report", lambda o: "Live datanodes" in o or "Name:" in o)
    # 2) DataNode 数量 > 0
    ok_dn, out_dn = _hdfs_master_run("hdfs dfsadmin -report | grep -c 'Name:'", timeout=30)
    dn_count = 0
    try:
        dn_count = int((out_dn or "0").strip().splitlines()[-1])
    except Exception:
        dn_count = 0
    items.append({"label": "DataNode 已注册", "ok": dn_count > 0, "value": "%d 个" % dn_count})
    # 3) 安全模式关闭（能写）
    ok_sm, out_sm = _hdfs_master_run("hdfs dfsadmin -safemode get", timeout=15)
    sm_off = "OFF" in (out_sm or "").upper()
    items.append({"label": "安全模式已关闭（可写）", "ok": sm_off,
                  "value": "关闭" if sm_off else "开启（只读）"})
    # 4) NameNode 进程（jps）
    ok_nn, out_nn = _hdfs_master_run("jps | grep -c NameNode", timeout=15)
    items.append({"label": "NameNode 进程", "ok": "1" in (out_nn or "") or "NameNode" in (out_nn or ""),
                  "value": (out_nn or "").strip()[:60]})
    all_ok = all(it["ok"] for it in items)
    return {"ok": all_ok, "items": items, "detail": ""}


def cluster_verify(timeout=300):
    """集群验证：跑一个 WordCount 冒烟测试，验证 MapReduce 全链路。
    步骤：准备样例数据 → 上传 HDFS → 跑 wordcount → 读结果。
    返回 {ok, steps:[{label, ok, out}], result}。"""
    m = _master_node()
    if not m:
        return {"ok": False, "steps": [], "msg": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "steps": [], "msg": "master 节点关机，请先开机"}
    steps = []

    def run(label, cmd, t=timeout):
        ok, out = _hdfs_master_run(cmd, timeout=t)
        steps.append({"label": label, "ok": ok, "out": out})
        return ok, out

    # 1) 准备样例数据
    run("准备样例数据", "echo \"hadoop yarn mapreduce\" > /tmp/cp_word.txt && "
        "echo \"hello hadoop\" >> /tmp/cp_word.txt", 30)
    # 2) 上传到 HDFS（用独立目录，避免污染用户数据）
    run("上传到 HDFS /tmp_cp_input", "hdfs dfs -mkdir -p /tmp_cp_input && "
        "hdfs dfs -put -f /tmp/cp_word.txt /tmp_cp_input/", 60)
    # 3) 找 examples jar（版本号不写死，通配）
    ok_jar, jar = run("定位 MapReduce 示例 jar",
                      "ls /root/app/hadoop/share/hadoop/mapreduce/hadoop-mapreduce-examples-*.jar 2>/dev/null | head -1", 15)
    jar_path = (jar or "").strip().splitlines()[-1].strip() if ok_jar and jar.strip() else ""
    if not jar_path:
        return {"ok": False, "steps": steps, "msg": "未找到 hadoop-mapreduce-examples jar（Hadoop 装了吗？）"}
    # 4) 清旧输出 + 跑 wordcount
    run("清理旧输出", "hdfs dfs -rm -r -f /tmp_cp_output", 30)
    ok_wc, out_wc = run("运行 WordCount", 'hadoop jar "%s" wordcount /tmp_cp_input /tmp_cp_output' % jar_path, timeout)
    if not ok_wc:
        return {"ok": False, "steps": steps, "msg": "WordCount 运行失败"}
    # 5) 读结果
    ok_res, res = run("读取结果", "hdfs dfs -cat /tmp_cp_output/part-r-00000", 30)
    # 6) 清理
    run("清理临时数据", "hdfs dfs -rm -r -f /tmp_cp_input /tmp_cp_output && rm -f /tmp/cp_word.txt", 30)
    return {"ok": ok_res, "steps": steps, "result": res if ok_res else "", "msg": ""}


def services_topology():
    """服务拓扑：每台节点上跑了哪些服务（jps 进程）。
    返回 {ok, nodes:[{name, role, host, procs:[...]}], msg}。"""
    nodes = list_nodes()
    if not nodes:
        return {"ok": False, "nodes": [], "msg": "无节点"}
    running_vmx = _running_vmx_set()
    results = []
    with ThreadPoolExecutor(max_workers=len(nodes)) as pool:
        fut = {pool.submit(_node_procs, n, running_vmx): n for n in nodes}
        for f in as_completed(fut):
            try:
                results.append(f.result())
            except Exception as e:
                n = fut[f]
                results.append({"name": n.get("name"), "role": n.get("role"),
                                "host": n.get("host"), "procs": [], "off": False, "err": str(e)})
    order = {n["id"]: i for i, n in enumerate(nodes)}
    results.sort(key=lambda r: order.get([n["id"] for n in nodes if n["name"] == r["name"]][0], 999))
    return {"ok": True, "nodes": results, "msg": ""}


def _node_procs(node, running_vmx):
    """取单节点 jps 进程列表。"""
    if node_vm_off(node, running_vmx):
        return {"name": node.get("name"), "role": node.get("role"), "host": node.get("host"),
                "procs": [], "off": True}
    ok, out = ssh_exec(node.get("host", ""), node.get("port", 22),
                       node.get("user", ""), node.get("pass", ""),
                       "jps | tail -n +2 | awk '{print $2}'", timeout=12)
    procs = []
    if ok:
        for line in out.splitlines():
            line = line.strip()
            if line and not line.startswith("[STDERR]") and line not in ("Jps",):
                procs.append(line)
    return {"name": node.get("name"), "role": node.get("role"), "host": node.get("host"),
            "procs": procs, "off": False}


def _parse_mb(s):
    """把 '1.2 GB' / '512 MB' / '100 KB' 统一转成 MB（数值）。"""
    if not s:
        return 0
    s = s.strip()
    num = 0.0
    for part in s.split():
        try:
            num = float(part)
            break
        except ValueError:
            continue
    low = s.lower()
    if "gb" in low:
        return num * 1024
    if "kb" in low:
        return num / 1024
    return num   # 当作 MB


def resource_metrics():
    """资源监控：采集 master 节点 CPU / 内存 / 磁盘 + HDFS 容量（聚合视图）。
    返回 {ok, master:{cpu, mem_used, mem_total, disk_used, disk_total}, hdfs:{used, capacity, used_raw, capacity_raw}}。"""
    m = _master_node()
    if not m:
        return {"ok": False, "msg": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "msg": "master 节点关机，请先开机"}
    cmd = (
        'echo "cpu=$(top -bn1 | grep -i Cpu | awk \'{print $2+$4}\')"; '
        'echo "mem=$(free -m | awk \'/Mem:/ {print $3" "$2}\')"; '
        'echo "disk=$(df -m / | awk \'NR==2 {print $3" "$2}\')"'
    )
    ok, out = ssh_exec(m.get("host", ""), m.get("port", 22),
                       m.get("user", ""), m.get("pass", ""), cmd, timeout=15)
    if not ok:
        return {"ok": False, "msg": out}
    kv = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            kv[k.strip()] = v.strip()
    mem = (kv.get("mem", "0 0")).split()
    disk = (kv.get("disk", "0 0")).split()
    master = {
        "cpu": kv.get("cpu", "0"),
        "mem_used": mem[0] if len(mem) > 0 else "0",
        "mem_total": mem[1] if len(mem) > 1 else "0",
        "disk_used": disk[0] if len(disk) > 0 else "0",
        "disk_total": disk[1] if len(disk) > 1 else "0",
    }
    # HDFS 容量
    hdfs = {}
    ok2, out2 = _hdfs_master_run("hdfs dfsadmin -report 2>/dev/null | grep -E 'DFS (Used|Remaining|Capacity)' | head -3", timeout=30)
    if ok2:
        for line in out2.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                hdfs[k.strip()] = v.strip()
    used = hdfs.get("DFS Used", "")
    cap = hdfs.get("DFS Capacity", hdfs.get("DFS Remaining", ""))
    hdfs_out = {
        "used": used or "?",
        "capacity": cap or "?",
        "used_raw": _parse_mb(used),
        "capacity_raw": _parse_mb(cap),
    }
    return {"ok": True, "master": master, "hdfs": hdfs_out, "msg": ""}


# 作业模板（声明式：id/名称/说明/命令模板）
JOB_TEMPLATES = [
    {"id": "wordcount", "name": "WordCount", "desc": "词频统计（MapReduce 入门）",
     "cmd": 'hadoop jar {examples} wordcount /input /output_wc'},
    {"id": "testdfsio_write", "name": "TestDFSIO 写", "desc": "HDFS 写入性能测试",
     "cmd": 'hadoop jar {examples} TestDFSIO -write -nrFiles 4 -size 16MB'},
    {"id": "testdfsio_read", "name": "TestDFSIO 读", "desc": "HDFS 读取性能测试",
     "cmd": 'hadoop jar {examples} TestDFSIO -read -nrFiles 4 -size 16MB'},
    {"id": "terasort", "name": "TeraSort", "desc": "大规模排序基准（需先生成数据）",
     "cmd": 'hadoop jar {examples} teragen 100000 /tera_in && hadoop jar {examples} terasort /tera_in /tera_out'},
]


def list_job_templates():
    return [{"id": t["id"], "name": t["name"], "desc": t["desc"]} for t in JOB_TEMPLATES]


def run_job_template(tid, timeout=600):
    """跑一个作业模板。自动定位 examples jar（版本通配）。"""
    tpl = next((t for t in JOB_TEMPLATES if t["id"] == tid), None)
    if not tpl:
        return {"ok": False, "out": "未知模板：" + str(tid)}
    m = _master_node()
    if not m:
        return {"ok": False, "out": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "out": "master 节点关机，请先开机"}
    # 定位 examples jar
    ok, jar = _hdfs_master_run(
        "ls /root/app/hadoop/share/hadoop/mapreduce/hadoop-mapreduce-examples-*.jar 2>/dev/null | head -1", timeout=15)
    jar_path = (jar or "").strip().splitlines()[-1].strip() if ok and jar.strip() else ""
    if not jar_path:
        return {"ok": False, "out": "未找到 hadoop-mapreduce-examples jar（Hadoop 装了吗？）"}
    cmd = "source /etc/profile; " + tpl["cmd"].format(examples=jar_path)
    ok2, out = _hdfs_master_run(cmd, timeout=timeout)
    return {"ok": ok2, "out": out, "cmd": cmd}


def yarn_apps(timeout=60):
    """查 YARN 作业列表。用 yarn application -list 解析。
    返回 {ok, apps:[{id, name, type, state, queue, start}], msg}。"""
    m = _master_node()
    if not m:
        return {"ok": False, "apps": [], "msg": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "apps": [], "msg": "master 节点关机，请先开机"}
    # -appStates ALL 拿全部（含已完成）；解析固定宽度表
    ok, out = _hdfs_master_run("yarn application -list -appStates ALL", timeout=timeout, use_exit_code=True)
    if not ok:
        return {"ok": False, "apps": [], "msg": out}
    apps = []
    lines = out.splitlines()
    header_idx = -1
    for i, l in enumerate(lines):
        if "Application-Id" in l and "Application-Name" in l:
            header_idx = i
            break
    if header_idx >= 0:
        # 简化：按连续空格切每行（列位置法留待真机校准）
        for l in lines[header_idx + 1:]:
            l = l.strip()
            if not l or l.startswith("Total number") or set(l) <= set("-"):
                continue
            parts = l.split()
            if len(parts) < 5:
                continue
            apps.append({"id": parts[0], "start": parts[1],
                         "name": parts[2] if len(parts) > 2 else "",
                         "type": parts[3] if len(parts) > 3 else "",
                         "queue": parts[5] if len(parts) > 5 else "",
                         "state": parts[6] if len(parts) > 6 else ""})
    return {"ok": True, "apps": apps, "msg": ""}


def yarn_app_logs(app_id, timeout=60):
    """取 YARN 作业日志（yarn logs -applicationId）。"""
    m = _master_node()
    if not m:
        return {"ok": False, "out": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "out": "master 节点关机，请先开机"}
    ok, out = _hdfs_master_run("yarn logs -applicationId %s" % app_id, timeout=timeout, use_exit_code=True)
    return {"ok": ok, "out": out}


def yarn_kill(app_id, timeout=30):
    """kill 一个 YARN 作业。"""
    m = _master_node()
    if not m:
        return {"ok": False, "out": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "out": "master 节点关机，请先开机"}
    ok, out = _hdfs_master_run("yarn application -kill %s" % app_id, timeout=timeout, use_exit_code=True)
    return {"ok": ok, "out": out}


def hive_preview(hdfs_path, timeout=60):
    """预览 HDFS 文件前几行（用于导入向导）。"""
    return _hdfs_master_run('hdfs dfs -cat "%s" 2>/dev/null | head -20' % hdfs_path, timeout=timeout)


def hive_import(hdfs_path, table, sep=",", cols=None, timeout=180):
    """建表并 LOAD 数据。cols: 列名列表（逗号分隔字符串）；不传则按 c1,c2... 生成。
    返回 {ok, out, msg, ddl}。"""
    m = _master_node()
    if not m:
        return {"ok": False, "out": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "out": "master 节点关机，请先开机"}
    sep_char = (sep or ",")[0]
    # 列定义：用户给了就用，否则按 c1,c2...（数量由前端按预览推算）
    if cols:
        col_def = ", ".join("%s string" % c.strip() for c in cols.split(",") if c.strip())
    else:
        col_def = "c1 string"
    ddl = ("create external table if not exists %s (%s) "
           "row format delimited fields terminated by '%s' "
           "stored as textfile "
           "location '%s'" % (table, col_def, sep_char,
                              hdfs_path.rstrip("/").rsplit("/", 1)[0]))
    ok, out = hive_exec(ddl, timeout=timeout)
    if not ok:
        return {"ok": False, "out": out, "msg": "建表失败", "ddl": ddl}
    load = "load data inpath '%s' into table %s" % (hdfs_path, table)
    ok2, out2 = hive_exec(load, timeout=timeout)
    return {"ok": True, "out": (out or "") + "\n" + (out2 or ""), "msg": "导入完成", "ddl": ddl}


def hive_tables(timeout=60):
    """列出 Hive 数据库和表。返回 {ok, tables:[...], msg}。"""
    ok, out = hive_exec("show tables", timeout=timeout)
    if not ok:
        return {"ok": False, "tables": [], "msg": out}
    tables = []
    for line in (out or "").splitlines():
        line = line.strip()
        if not line or line.lower().startswith(("tab_name", "ok", "time taken", "+", "|")):
            continue
        if line.startswith("Warning") or line.startswith("log4j") or "=" in line[:10]:
            continue
        # beeline 表格行：| tabname | 或无边框时纯表名
        if line.startswith("|"):
            parts = [c.strip() for c in line.split("|") if c.strip()]
            if parts and parts[0].lower() not in ("tab_name", "database_name"):
                tables.append(parts[0])
        elif re.match(r"^[A-Za-z_][\w]*$", line):
            tables.append(line)
    return {"ok": True, "tables": tables, "msg": ""}


def hive_describe(table, timeout=60):
    """查表结构（desc）。返回 {ok, out, msg}。"""
    return hive_exec("describe %s" % table, timeout=timeout)


def hive_exec(sql, timeout=120):
    """在 master 上执行 Hive SQL。
    优先 beeline -e；失败退回 hive -e（老版本）。
    返回 {ok, out, is_select}。"""
    m = _master_node()
    if not m:
        return {"ok": False, "out": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "out": "master 节点关机，请先开机"}
    # 用 -e 执行；输出带分隔符解析
    # 先试 beeline（HiveServer2，返回规整）；再退 hive -e
    sql_esc = sql.replace('"', '\\"')
    cmd_beeline = 'beeline -u "jdbc:hive2://localhost:10000" --silent=true -e "%s"' % sql_esc
    ok, out = _hdfs_master_run(cmd_beeline, timeout=timeout, use_exit_code=True)
    if not ok:
        cmd_hive = 'hive -e "%s"' % sql_esc
        ok2, out2 = _hdfs_master_run(cmd_hive, timeout=timeout, use_exit_code=True)
        return {"ok": ok2, "out": out2}
    return {"ok": ok, "out": out}


def hdfs_download(remote_path, local_dir):
    """把 HDFS 文件下载到本地目录。
    步骤：master 上 hdfs dfs -get 到 /tmp → SFTP 下载到本地。"""
    m = _master_node()
    if not m:
        return {"ok": False, "msg": "未找到 master 节点"}
    if node_vm_off(m):
        return {"ok": False, "msg": "master 节点关机，请先开机"}
    import os as _os
    base = _os.path.basename(remote_path.rstrip("/"))
    tmp_remote = "/tmp/checkpoint_dl_" + base
    # 1) master 上 hdfs dfs -get
    ok, out = _hdfs_master_run('hdfs dfs -get -f "%s" "%s"' % (remote_path, tmp_remote), timeout=180)
    if not ok:
        return {"ok": False, "msg": "从 HDFS 取文件失败：" + out}
    # 2) SFTP 下载到本地
    local_path = _os.path.join(local_dir, base)
    ok2, msg2 = sftp_download(m.get("host", ""), m.get("port", 22),
                              m.get("user", ""), m.get("pass", ""), tmp_remote, local_path)
    # 清理 master 临时文件
    _hdfs_master_run('rm -f "%s"' % tmp_remote, timeout=30)
    if not ok2:
        return {"ok": False, "msg": "下载到本地失败：" + msg2}
    return {"ok": True, "msg": "下载成功", "local": local_path}
