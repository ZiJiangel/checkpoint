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
    """启动配了 vmx 的节点对应的虚拟机（跳过已在运行的）"""
    running = set()
    try:
        for r in core.list_running():
            running.add(os.path.normcase(os.path.abspath(r)))
    except Exception:
        pass
    results = []
    for n in cluster.list_nodes():
        vmx = n.get("vmx", "")
        if not vmx:
            continue
        if os.path.normcase(os.path.abspath(vmx)) in running:
            results.append({"node": n.get("name"), "ok": True, "out": "已在运行，跳过", "skipped": True})
            continue
        ok, out = core.start_vm(vmx)
        results.append({"node": n.get("name"), "ok": ok, "out": out})
    return {"ok": True, "results": results}


def start_vm_node(nid):
    """启动单个节点的虚拟机（供前端并发 + 进度显示）。
    返回 {ok, mode: 'started'|'skipped'|'failed', detail}"""
    n = None
    for x in cluster.list_nodes():
        if x.get("id") == nid:
            n = x
            break
    if not n:
        return {"ok": False, "mode": "failed", "detail": "节点不存在"}
    vmx = n.get("vmx", "")
    if not vmx:
        return {"ok": False, "mode": "failed", "detail": "未配置虚拟机路径"}
    # 已在运行则跳过
    try:
        running = set(os.path.normcase(os.path.abspath(r)) for r in core.list_running())
    except Exception:
        running = set()
    if os.path.normcase(os.path.abspath(vmx)) in running:
        return {"ok": True, "mode": "skipped", "detail": ""}
    ok, out = core.start_vm(vmx)
    if ok:
        return {"ok": True, "mode": "started", "detail": ""}
    # 偶发冲突（如 VM 状态未恢复）→ 稍等重试一次
    import time
    time.sleep(2)
    # 重试前再确认一次是否已起（可能首次其实成功了）
    try:
        running2 = set(os.path.normcase(os.path.abspath(r)) for r in core.list_running())
        if os.path.normcase(os.path.abspath(vmx)) in running2:
            return {"ok": True, "mode": "started", "detail": ""}
    except Exception:
        pass
    ok2, out2 = core.start_vm(vmx)
    if ok2:
        return {"ok": True, "mode": "started", "detail": ""}
    return {"ok": False, "mode": "failed", "detail": out2 or out}


def stop_vms():
    """关闭配了 vmx 的节点对应的虚拟机（并行，只关虚拟机，不动 VMware 软件）"""
    from concurrent.futures import ThreadPoolExecutor
    targets = [n for n in cluster.list_nodes() if n.get("vmx", "")]
    if not targets:
        return {"ok": True, "results": []}
    results = []
    with ThreadPoolExecutor(max_workers=len(targets)) as pool:
        futs = {pool.submit(core.stop_vm, n["vmx"]): n for n in targets}
        for f in futs:
            n = futs[f]
            try:
                ok, out = f.result()
            except Exception as e:
                ok, out = False, str(e)
            results.append({"node": n.get("name"), "ok": ok, "out": out})
    return {"ok": True, "results": results}


def stop_vm_node(nid):
    """关闭单个节点的虚拟机（供前端并发调用 + 显示进度）。
    返回 {ok, mode: 'soft'|'hard', detail}"""
    n = None
    for x in cluster.list_nodes():
        if x.get("id") == nid:
            n = x
            break
    if not n:
        return {"ok": False, "mode": "", "detail": "节点不存在"}
    vmx = n.get("vmx", "")
    if not vmx:
        return {"ok": False, "mode": "", "detail": "未配置虚拟机路径"}
    # 1. 先软关机（优雅），超时 25 秒
    ok, out = core.run_vmrun(["stop", vmx, "soft"], timeout=25)
    if ok:
        return {"ok": True, "mode": "soft", "detail": ""}
    # 2. 软关超时/失败 → 硬关机
    core.log("软关机失败，改硬关机：" + vmx + " — " + str(out))
    ok2, out2 = core.run_vmrun(["stop", vmx, "hard"], timeout=60)
    if ok2:
        return {"ok": True, "mode": "hard", "detail": ""}
    return {"ok": False, "mode": "hard", "detail": str(out2 or out)}
