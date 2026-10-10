# -*- coding: utf-8 -*-
"""集群服务目录 + 一键启停编排"""
import os

import core
import cluster

STATE_FILE = os.path.join(core.BASE, "services_state.json")


# ============ 服务目录（声明式，含阶段/目标角色/命令）============
# stage：依赖顺序（1 最早）；target：在哪些角色的节点上执行
DEFAULT_SERVICES = [
    {
        "id": "ntp", "name": "时间同步 (NTP)", "stage": 1,
        "target": ["master", "worker", "ntp", "kdc"],
        "start": "systemctl start chronyd",
        "stop": "systemctl stop chronyd",
        "check": "systemctl is-active chronyd",
        "why": "先对时——Kerberos 对时间极敏感，差几分钟就认证失败",
    },
    {
        "id": "kdc", "name": "Kerberos KDC", "stage": 2,
        "target": ["kdc"],
        "start": "systemctl start krb5kdc; systemctl start kadmin",
        "stop": "systemctl stop krb5kdc; systemctl stop kadmin",
        "check": "systemctl is-active krb5kdc",
        "why": "认证服务——若启用了 Kerberos 才需要",
    },
    {
        "id": "hdfs", "name": "HDFS", "stage": 3,
        "target": ["master"],
        "start": "source /etc/profile; start-dfs.sh",
        "stop": "source /etc/profile; stop-dfs.sh",
        "check": "jps | grep -q NameNode",
        "why": "数据层——在 master 执行，会自动 SSH 拉起从节点",
    },
    {
        "id": "yarn", "name": "YARN", "stage": 4,
        "target": ["master"],
        "start": "source /etc/profile; start-yarn.sh",
        "stop": "source /etc/profile; stop-yarn.sh",
        "check": "jps | grep -q ResourceManager",
        "why": "计算层——依赖 HDFS，必须在其之后启动",
    },
    {
        "id": "history", "name": "JobHistoryServer", "stage": 5,
        "target": ["master"],
        "start": "source /etc/profile; mapred --daemon start historyserver",
        "stop": "source /etc/profile; mapred --daemon stop historyserver",
        "check": "jps | grep -q JobHistoryServer",
        "why": "历史服务器——最后启动",
    },
]


def get_services():
    """返回服务目录（合并用户的开关状态）"""
    state = core.load_json(STATE_FILE, {})
    result = []
    for s in DEFAULT_SERVICES:
        item = dict(s)
        item["enabled"] = state.get(s["id"], True)
        result.append(item)
    return result


def set_service_enabled(sid, enabled):
    state = core.load_json(STATE_FILE, {})
    state[sid] = bool(enabled)
    core.save_json(STATE_FILE, state)


def _nodes_for_role(roles):
    """按角色找节点"""
    return [n for n in cluster.list_nodes() if n.get("role") in roles]


def run_service(sid, action="start"):
    """在目标角色节点上执行某服务的启动/停止。
    返回 {ok, results: [{node, ok, out}]}"""
    action = "start" if action != "stop" else "stop"
    svc = None
    for s in get_services():
        if s["id"] == sid:
            svc = s
            break
    if not svc:
        return {"ok": False, "results": [], "msg": "未知服务：" + str(sid)}
    if not svc.get("enabled", True):
        return {"ok": True, "results": [], "msg": "服务已禁用，跳过"}

    cmd = svc.get(action, "")
    check = svc.get("check", "")
    targets = _nodes_for_role(svc.get("target", []))
    results = []
    for n in targets:
        ok, out = cluster.ssh_exec(n.get("host", ""), n.get("port", 22),
                                   n.get("user", ""), n.get("pass", ""), cmd, timeout=60)
        item = {"node": n.get("name"), "ok": ok, "out": out}
        # 启动后自检：仅启动动作时验证（停止不需要）
        if ok and check and action == "start":
            cok, _ = cluster.ssh_exec(n.get("host", ""), n.get("port", 22),
                                      n.get("user", ""), n.get("pass", ""),
                                      "source /etc/profile 2>/dev/null; " + check,
                                      timeout=30, use_exit_code=True)
            item["verified"] = cok
            if not cok:
                item["ok"] = False   # 自检没过，标记失败
        results.append(item)
    all_ok = all(r["ok"] for r in results) if results else False
    return {"ok": all_ok, "results": results}


def start_vms():
    """启动配了 vmx 的节点对应的虚拟机（可选步骤）"""
    results = []
    for n in cluster.list_nodes():
        vmx = n.get("vmx", "")
        if not vmx:
            continue
        ok, out = core.start_vm(vmx)
        results.append({"node": n.get("name"), "ok": ok, "out": out})
    return {"ok": True, "results": results}


def stop_vms():
    """关闭配了 vmx 的节点对应的虚拟机（只关虚拟机，不动 VMware 软件）"""
    results = []
    for n in cluster.list_nodes():
        vmx = n.get("vmx", "")
        if not vmx:
            continue
        ok, out = core.stop_vm(vmx)
        results.append({"node": n.get("name"), "ok": ok, "out": out})
    return {"ok": True, "results": results}
