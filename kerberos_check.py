# -*- coding: utf-8 -*-
"""Kerberos 配置检测：静态检查（不用集群跑起来），逐项返回三态。

三态：ok(绿) / partial(黄) / missing(红) / unknown(灰，测不了)
设计：从实际配置读值再验证，不写死路径；测不了的项标 unknown，不假绿。
"""
import re
import cluster


def _xml_val(xml, key):
    """从 XML 文本里取 <name>key</name><value>val</value> 的 val。"""
    if not xml:
        return None
    m = re.search(r'<name>\s*%s\s*</name>\s*<value>\s*([^<]*)</value>' % re.escape(key), xml)
    return m.group(1).strip() if m else None


def _conf_dir(m):
    """探测 master 上的 hadoop conf 目录。"""
    script = ('for d in "$HADOOP_CONF_DIR" "$HADOOP_HOME/etc/hadoop" '
              '/root/app/hadoop/etc/hadoop /opt/hadoop/etc/hadoop /usr/local/hadoop/etc/hadoop; do '
              '[ -n "$d" ] && [ -f "$d/core-site.xml" ] && echo "$d" && break; done')
    ok, out = cluster._hdfs_master_run(script, timeout=15, use_exit_code=False)
    return (out or "").strip().splitlines()[0].strip() if ok and out and out.strip() else ""


def _sh(node, cmd, t=12):
    return cluster.ssh_exec(node.get("host", ""), node.get("port", 22),
                            node.get("user", ""), node.get("pass", ""), cmd, timeout=t)


def run_checks():
    """跑全部检查，返回 {ok, items:[{layer,name,state,detail}], summary:{total,ok,partial,missing,unknown}}。"""
    items = []

    def add(layer, name, state, detail=""):
        items.append({"layer": layer, "name": name, "state": state, "detail": detail})

    m = cluster._master_node()
    if not m:
        return {"ok": False, "items": [], "summary": {}, "msg": "未找到 master 节点"}
    if cluster.node_vm_off(m):
        return {"ok": False, "items": [], "summary": {}, "msg": "master 节点关机，请先开机"}

    kdc = next((n for n in cluster.list_nodes("*") if n.get("role") == "kdc"), None)

    # ---- 一次 SSH 从 master 取回所有需要的文本 ----
    conf = _conf_dir(m) or "/root/app/hadoop/etc/hadoop"
    big = (
        'echo "===CORE==="; cat "%s/core-site.xml" 2>/dev/null; '
        'echo "===HDFS==="; cat "%s/hdfs-site.xml" 2>/dev/null; '
        'echo "===KRB5==="; cat /etc/krb5.conf 2>/dev/null; '
        'echo "===KLIST==="; klist 2>&1 | head -6; '
        'echo "===KT==="; ls -1 /etc/security/keytab/*.keytab /etc/security/keytabs/*.keytab 2>/dev/null | xargs -n1 basename 2>/dev/null || echo NONE; '
        'echo "===KTPERM==="; for f in /etc/security/keytab/*.keytab /etc/security/keytabs/*.keytab; do [ -f "$f" ] && stat -c "%%a %%n" "$f"; done 2>/dev/null; '
        'echo "===NNSTART==="; ps -eo lstart,cmd 2>/dev/null | grep "[N]ameNode" | head -1; '
        'echo "===MTIME==="; stat -c "%%Y" "%s/core-site.xml" "%s/hdfs-site.xml" 2>/dev/null'
    ) % (conf, conf, conf, conf)
    ok, out = cluster._hdfs_master_run(big, timeout=25, use_exit_code=False)
    txt = out or ""

    def seg(tag):
        if "===%s===" % tag not in txt:
            return ""
        return txt.split("===%s===" % tag, 1)[1].split("===", 1)[0].strip()

    core = seg("CORE")
    hdfs = seg("HDFS")
    krb5 = seg("KRB5")
    klist = seg("KLIST")
    kt = seg("KT")
    ktperm = seg("KTPERM")
    nnstart = seg("NNSTART")
    mtime = seg("MTIME")

    # ===== 系统层 =====
    # 1. KDC 服务
    if kdc and not cluster.node_vm_off(kdc):
        _, o = _sh(kdc, "systemctl is-active krb5kdc")
        s = (o or "").strip().splitlines()[-1].strip() if o else ""
        add("system", "KDC 服务（krb5kdc）", "ok" if s == "active" else "missing", s or "未知")
    else:
        add("system", "KDC 服务（krb5kdc）", "unknown", "未配 kdc 节点或已关机")

    # 2. krb5.conf realm
    realm = ""
    mm = re.search(r'default_realm\s*=\s*(\S+)', krb5 or "")
    if mm:
        realm = mm.group(1)
        add("system", "krb5.conf 已配 realm", "ok", realm)
    else:
        add("system", "krb5.conf 已配 realm", "missing", "未读到 default_realm")

    # 3. keytab 文件存在
    kt_files = [x.strip() for x in (kt or "").splitlines() if x.strip() and x.strip() != "NONE"]
    if kt_files:
        add("system", "keytab 文件存在", "ok", "、".join(kt_files[:4]) + ("…" if len(kt_files) > 4 else ""))
    else:
        add("system", "keytab 文件存在", "missing", "未找到 *.keytab")

    # 4. keytab 权限（other 位必须为 0；owner/group 可读均可，Hadoop 惯例 root:hadoop 660）
    if ktperm:
        bad = []
        perms = {}
        for ln in ktperm.splitlines():
            parts = ln.strip().split()
            if len(parts) >= 2 and len(parts[0]) == 3:
                perms[parts[1].split("/")[-1]] = parts[0]
                if parts[0][2] != "0":     # other 位
                    bad.append(ln.strip())
        perm_str = "、".join("%s=%s" % (k, v) for k, v in list(perms.items())[:6])
        if bad:
            add("system", "keytab 权限安全", "partial",
                "对 others 可读（不安全）：" + "; ".join(bad[:3]) + "｜" + perm_str)
        else:
            add("system", "keytab 权限安全", "ok", perm_str or ("others 不可读（%d 个）" % len(kt_files)))
    else:
        add("system", "keytab 权限安全", "unknown", "未读到 keytab 权限")

    # ===== 配置层 =====
    def cfg_check(name, xml, key, expect):
        v = _xml_val(xml, key)
        if v is None:
            add("config", name, "missing", "缺 " + key)
        elif str(v).lower() == str(expect).lower():
            add("config", name, "ok", "%s = %s" % (key, v))
        else:
            add("config", name, "partial", "%s = %s（应为 %s）" % (key, v, expect))

    cfg_check("认证方式 = kerberos", core, "hadoop.security.authentication", "kerberos")
    cfg_check("授权已开启", core, "hadoop.security.authorization", "true")
    cfg_check("HDFS block token", hdfs, "dfs.block.access.token.enable", "true")

    # 8/9. NN/DN principal
    for label, key in (("NameNode principal", "dfs.namenode.kerberos.principal"),
                       ("DataNode principal", "dfs.datanode.kerberos.principal")):
        v = _xml_val(hdfs, key)
        if v:
            add("config", label + " 已配", "ok", v)
        else:
            add("config", label + " 已配", "missing", "缺 " + key)

    # ===== 生效层 =====
    # 10. HDFS 重启（NN 启动时间 > 配置修改时间）
    if nnstart and mtime:
        try:
            import time
            # ps lstart 形如 "Wed Oct 14 18:00:00 2026"（5 段含年份）
            nn_ts = time.mktime(time.strptime(" ".join(nnstart.split()[:5]), "%a %b %d %H:%M:%S %Y"))
            cfg_ts = max([int(x) for x in mtime.split() if x.strip().isdigit()] or [0])
            if cfg_ts and nn_ts >= cfg_ts:
                add("effective", "配置已生效（HDFS 已重启）", "ok", "NameNode 启动晚于配置修改")
            elif cfg_ts:
                add("effective", "配置已生效（HDFS 已重启）", "partial", "配置修改晚于 NameNode 启动，需重启")
            else:
                add("effective", "配置已生效（HDFS 已重启）", "unknown", "未读到配置修改时间")
        except Exception:
            add("effective", "配置已生效（HDFS 已重启）", "unknown", "时间解析失败")
    else:
        add("effective", "配置已生效（HDFS 已重启）", "unknown", "未读到 NameNode 进程或配置时间")

    # 11. 票据有效（运行态：没票据属正常，不算配置错误 → 用 unknown 灰，不吓人）
    if "krbtgt" in (klist or "") or "Principal" in (klist or "") or "默认主体" in (klist or ""):
        add("effective", "票据有效（klist）", "ok", "已有 krbtgt")
    else:
        add("effective", "票据有效（klist）", "unknown", "当前无票据（正常；需要时点「Kerberos 认证」kinit）")

    # 12. keytab 分发到 worker
    workers = [n for n in cluster.list_nodes("*") if n.get("role") == "worker"]
    if workers and kt_files:
        missing_w = []
        checked = 0
        for w in workers:
            if cluster.node_vm_off(w):
                continue
            checked += 1
            _, o = _sh(w, 'ls /etc/security/keytab/*.keytab 2>/dev/null | head -1 || echo NONE', t=8)
            if "NONE" in (o or "") or ".keytab" not in (o or ""):
                missing_w.append(w.get("name"))
        if checked == 0:
            add("system", "keytab 分发到 worker", "unknown", "worker 未开机")
        elif not missing_w:
            add("system", "keytab 分发到 worker", "ok", "%d 台都有" % checked)
        else:
            add("system", "keytab 分发到 worker", "partial", "缺：" + "、".join(missing_w))
    else:
        add("system", "keytab 分发到 worker", "unknown", "无 worker 或无 keytab")

    # 汇总
    total = len(items)
    ok_n = sum(1 for i in items if i["state"] == "ok")
    partial_n = sum(1 for i in items if i["state"] == "partial")
    missing_n = sum(1 for i in items if i["state"] == "missing")
    unknown_n = sum(1 for i in items if i["state"] == "unknown")
    return {"ok": True, "items": items,
            "summary": {"total": total, "ok": ok_n, "partial": partial_n,
                        "missing": missing_n, "unknown": unknown_n},
            "msg": ""}
