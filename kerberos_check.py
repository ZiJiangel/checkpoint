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
        'echo "===NNUSER==="; ps -eo user,cmd 2>/dev/null | grep "[N]ameNode" | head -1 | cut -d" " -f1; '
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
    nnuser = seg("NNUSER")
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

    # 13. hdfs/yarn 用户免密（装 Kerberos 后 start-dfs.sh/start-yarn.sh 要用专用用户跑 → 必须免密）
    need_users = ["hdfs", "yarn"]
    test_targets = [n for n in cluster.list_nodes("*") if n.get("role") in ("master", "worker")]
    if m and test_targets:
        bad = []
        detail_parts = []
        for u in need_users:
            # 该用户是否存在
            _, uo = _sh(m, "id %s >/dev/null 2>&1 && echo YES || echo NO" % u, t=8)
            if "YES" not in (uo or ""):
                bad.append("%s(无此用户)" % u)
                continue
            miss = []
            for w in test_targets:
                if cluster.node_vm_off(w):
                    continue
                _, o = _sh(m, "su - %s -c 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no %s echo OK' 2>&1 | tail -1" % (u, w.get("name")), t=10)
                if "OK" not in (o or ""):
                    miss.append(w.get("name"))
            if miss:
                bad.append("%s→%s" % (u, "、".join(miss)))
            else:
                detail_parts.append("%s 免密 OK" % u)
        if not bad:
            add("system", "hdfs/yarn 用户免密（start 脚本用）", "ok", "；".join(detail_parts))
        else:
            add("system", "hdfs/yarn 用户免密（start 脚本用）", "missing",
                "缺：" + "；".join(bad) + "（会导致 start-dfs.sh 起不来）")
    else:
        add("system", "hdfs/yarn 用户免密（start 脚本用）", "unknown", "无 master/worker 节点")

    # 14. HDFS 归属：守护进程身份决定 HDFS 根归谁
    #     kerberos 模式下"用 hdfs/yarn 跑"是正确做法 → 绿；
    #     切回 simple 后它成"残留"（root 写不了根）→ 黄提醒（切 simple 不改此项）。
    cur_mode = (_xml_val(core, "hadoop.security.authentication") or "").lower()
    if nnuser:
        u = nnuser.strip().splitlines()[-1].strip() if nnuser.strip() else ""
        if not u:
            add("effective", "HDFS 归属（守护进程身份）", "unknown", "未读到 NameNode 进程属主")
        elif u == "root":
            add("effective", "HDFS 归属（守护进程身份）", "ok", "NameNode 以 root 运行（HDFS 根归 root）")
        else:
            # 非 root
            if cur_mode == "kerberos":
                add("effective", "HDFS 归属（守护进程身份）", "ok",
                    "NameNode 以 %s 运行（Kerberos 模式下属正常做法）" % u)
            else:
                add("effective", "HDFS 归属（守护进程身份）", "partial",
                    "NameNode 以 %s 运行 → HDFS 根归 %s，root 写不了根（Kerberos 残留，切 simple 不会改）。往 HDFS 写请用 /tmp、/user/<用户>，或用 %s 身份" % (u, u, u))
    else:
        add("effective", "HDFS 归属（守护进程身份）", "unknown", "NameNode 未运行或未读到")

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


def diff_kerberos():
    """列出当前配置里所有 Kerberos 相关项（值），分【核心开关】和【附加项】。
    返回 {ok, mode, items:[{file,key,val,core}]}。"""
    m = cluster._master_node()
    if not m:
        return {"ok": False, "items": [], "msg": "未找到 master 节点"}
    if cluster.node_vm_off(m):
        return {"ok": False, "items": [], "msg": "master 节点关机，请先开机"}

    conf = _conf_dir(m) or "/root/app/hadoop/etc/hadoop"
    files = ["core-site.xml", "hdfs-site.xml", "yarn-site.xml", "mapred-site.xml"]
    cat = "; ".join('echo "===%s==="; cat "%s/%s" 2>/dev/null' % (f, conf, f) for f in files)
    ok, out = cluster._hdfs_master_run(cat, timeout=25, use_exit_code=False)
    txt = out or ""

    def seg(tag):
        if "===%s===" % tag not in txt:
            return ""
        return txt.split("===%s===" % tag, 1)[1].split("===", 1)[0]

    # 关键词：判断某键是否"跟 kerberos 有关"
    kw = ("kerberos", "security.authentication", "security.authorization",
          "block.access.token", "authentication.type", "keytab", "principal",
          "auth_to_local", "http.authentication")
    # 核心开关（切 simple/kerberos 真正动的）
    core_keys = {"hadoop.security.authentication", "hadoop.security.authorization",
                 "hadoop.http.authentication.type", "dfs.block.access.token.enable"}

    items = []
    for f in files:
        xml = seg(f)
        # 逐个 <property>...</property> 解析
        for pm in re.finditer(r'<property>(.*?)</property>', xml, re.S):
            block = pm.group(1)
            nm = re.search(r'<name>s*([^<]+?)s*</name>', block)
            vm = re.search(r'<value>([^<]*)</value>', block)
            if not nm:
                continue
            key = nm.group(1).strip()
            val = (vm.group(1).strip() if vm else "").strip()
            if any(k in key.lower() for k in kw):
                items.append({"file": f, "key": key, "val": val, "core": key in core_keys})

    # 当前模式
    mode = "unknown"
    for it in items:
        if it["key"] == "hadoop.security.authentication":
            mode = it["val"] or "unknown"
    return {"ok": True, "items": items, "mode": mode, "msg": ""}


def fix_ssh_keys(users=None):
    """一键补 hdfs/yarn 用户免密（声明式、命令可见）。
    用 root 通道帮各用户生成密钥并分发到 master/worker 节点。
    返回 {ok, steps:[{label, ok, out}], msg}。"""
    import os as _os
    users = users or ["hdfs", "yarn"]
    steps = []

    def run(label, cmd, t=40):
        ok, out = cluster._hdfs_master_run(cmd, timeout=t, use_exit_code=False)
        steps.append({"label": label, "ok": ok, "out": (out or "")[:400]})
        return ok, out

    m = cluster._master_node()
    if not m:
        return {"ok": False, "steps": [], "msg": "未找到 master 节点"}
    if cluster.node_vm_off(m):
        return {"ok": False, "steps": [], "msg": "master 节点关机，请先开机"}

    targets = [n for n in cluster.list_nodes("*") if n.get("role") in ("master", "worker")]
    online_targets = [n for n in targets if not cluster.node_vm_off(n)]

    for u in users:
        # 1) 该用户存在吗
        _, uo = cluster._hdfs_master_run("id %s >/dev/null 2>&1 && echo YES || echo NO" % u, timeout=10, use_exit_code=False)
        if "YES" not in (uo or ""):
            steps.append({"label": "%s 用户存在" % u, "ok": False, "out": "节点上没有 %s 用户（需先按文档创建）" % u})
            continue
        # 2) 生成密钥
        run("%s 生成密钥（master）" % u,
            "mkdir -p /home/{u}/.ssh; "
            "test -f /home/{u}/.ssh/id_rsa || ssh-keygen -q -t rsa -N '' -f /home/{u}/.ssh/id_rsa; "
            "chown -R {u}:hadoop /home/{u}/.ssh; chmod 700 /home/{u}/.ssh; "
            "chmod 600 /home/{u}/.ssh/id_rsa 2>/dev/null; echo DONE".format(u=u))
        # 取公钥
        _, pub = cluster._hdfs_master_run("cat /home/%s/.ssh/id_rsa.pub" % u, timeout=10, use_exit_code=False)
        pub = (pub or "").strip().splitlines()[-1].strip() if pub and pub.strip() else ""
        if not pub:
            steps.append({"label": "%s 读取公钥" % u, "ok": False, "out": "读不到公钥"})
            continue
        # 3) 分发到各节点
        for n in online_targets:
            cmd = (
                "mkdir -p /home/{u}/.ssh && "
                "grep -qF '{k}' /home/{u}/.ssh/authorized_keys 2>/dev/null || echo '{k}' >> /home/{u}/.ssh/authorized_keys; "
                "chown -R {u}:hadoop /home/{u}/.ssh; chmod 700 /home/{u}/.ssh; "
                "chmod 600 /home/{u}/.ssh/authorized_keys; echo OK"
            ).format(u=u, k=pub)
            ok, out = cluster.ssh_exec(n.get("host", ""), n.get("port", 22),
                                       n.get("user", ""), n.get("pass", ""), cmd, timeout=20)
            steps.append({"label": "%s → %s 分发公钥" % (u, n.get("name")),
                          "ok": ok and "OK" in (out or ""),
                          "out": "OK" if (ok and "OK" in (out or "")) else (out or "")[:200]})
        # 4) 验证
        miss = []
        for n in online_targets:
            _, o = cluster._hdfs_master_run(
                "su - {u} -c 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no {h} echo OK' 2>&1 | tail -1".format(u=u, h=n.get("name")),
                timeout=12, use_exit_code=False)
            if "OK" not in (o or ""):
                miss.append(n.get("name"))
        steps.append({"label": "%s 免密验证" % u, "ok": not miss,
                      "out": "全部 OK" if not miss else ("仍失败：" + "、".join(miss))})

    all_ok = all(s["ok"] for s in steps) if steps else False
    return {"ok": all_ok, "steps": steps, "msg": "" if all_ok else "部分步骤未成功（见明细）"}
