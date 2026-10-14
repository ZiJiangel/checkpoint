# -*- coding: utf-8 -*-
"""配置备份 / 恢复（"小保命"，补快照够不到的粒度）。

只存取**用户自己的**配置文件：打包 master 上的关键配置 → SFTP 拉到本地；
恢复时按备份清单原样写回。不生成、不修改内容。

复用：cluster._master_node / node_vm_off / _hdfs_master_run / sftp_upload / sftp_download
"""
import os
import time

import core
import cluster

BACKUP_DIR = os.path.join(core.BASE, "backups")
INDEX_FILE = os.path.join(BACKUP_DIR, "index.json")


def _ensure_dir():
    if not os.path.isdir(BACKUP_DIR):
        os.makedirs(BACKUP_DIR, exist_ok=True)


def _probe_master(timeout=5):
    """快速探测 master 是否可达（5s 超时）。返回 (ok, msg)。"""
    m = cluster._master_node()
    if not m:
        return False, "未找到 master 节点"
    if cluster.node_vm_off(m):
        return False, "master 节点关机，请先开机"
    ok, out = cluster.ssh_exec(m.get("host", ""), m.get("port", 22),
                               m.get("user", ""), m.get("pass", ""),
                               "echo READY", timeout=timeout)
    if ok and "READY" in (out or ""):
        return True, ""
    return False, "master 未就绪（SSH 不通，若正在启动请稍候再试）"


def _load_index():
    return core.load_json(INDEX_FILE, []) or []


def _save_index(items):
    _ensure_dir()
    core.save_json(INDEX_FILE, items)


# ============ 扫描：找到要备的配置（三层：问系统 → 探测存在 → 用户确认）============

def scan_configs():
    """在 master 上扫描存在的配置文件。返回 {ok, files:[path], msg}。
    只返回**实际存在**的文件；用户可在前端增删。"""
    okp, msgp = _probe_master()
    if not okp:
        return {"ok": False, "files": [], "msg": msgp}
    m = cluster._master_node()

    # 一次 SSH 搞定：探测目录 + 列文件 + 系统文件，减少往返
    script = (
        # 候选目录（环境变量 + which 反推 + 常见路径；涵盖多组件）
        'for d in "$HADOOP_CONF_DIR" "$HADOOP_HOME/etc/hadoop" '
        '/root/app/hadoop/etc/hadoop /opt/hadoop/etc/hadoop /usr/local/hadoop/etc/hadoop '
        '/root/app/hive/conf /opt/hive/conf /usr/local/hive/conf '
        '/root/app/spark/conf /opt/spark/conf /usr/local/spark/conf '
        '/root/app/hbase/conf /opt/hbase/conf /usr/local/hbase/conf '
        '/root/app/zookeeper/conf /opt/zookeeper/conf; do '
        '[ -n "$d" ] && [ -d "$d" ] && echo "D|$d"; done; '
        # which hadoop 反推
        'HB="$(command -v hadoop 2>/dev/null)"; if [ -n "$HB" ]; then '
        'HD="$(dirname "$(dirname "$(readlink -f "$HB")")")/etc/hadoop"; '
        '[ -d "$HD" ] && echo "D|$HD"; fi; '
        # 系统文件
        'for f in /etc/krb5.conf /etc/hosts; do [ -f "$f" ] && echo "F|$f"; done; '
        # /etc/profile.d 组件环境变量
        'for f in /etc/profile.d/hadoop.sh /etc/profile.d/hive.sh /etc/profile.d/spark.sh '
        '/etc/profile.d/flume.sh /etc/profile.d/hbase.sh /etc/profile.d/zookeeper.sh; do '
        '[ -f "$f" ] && echo "F|$f"; done'
    )
    ok, out = cluster._hdfs_master_run(script, timeout=20, use_exit_code=False)
    if not ok:
        return {"ok": False, "files": [], "msg": out}

    dirs = []
    files = []
    for line in (out or "").splitlines():
        line = line.strip()
        if line.startswith("D|"):
            d = line[2:].strip()
            if d and d not in dirs:
                dirs.append(d)
        elif line.startswith("F|"):
            p = line[2:].strip()
            if p and p not in files:
                files.append(p)

    # 列各目录下的配置文件（*.xml/conf/cfg/sh + workers），排除备份/模板/示例
    if dirs:
        parts = []
        for d in dirs:
            parts.append(
                'for f in "%s"/*.xml "%s"/*.conf "%s"/*.cfg "%s"/*.sh "%s"/workers; do '
                '[ -f "$f" ] || continue; '
                'case "$f" in *.bak*|*.template|*.example|*.cmd|*.xsl) continue ;; esac; '
                'echo "F|$f"; done' % (d, d, d, d, d))
        ok2, out2 = cluster._hdfs_master_run("; ".join(parts), timeout=25, use_exit_code=False)
        if ok2:
            for line in (out2 or "").splitlines():
                line = line.strip()
                if line.startswith("F|"):
                    p = line[2:].strip()
                    if p and p not in files:
                        files.append(p)

    return {"ok": True, "files": files, "msg": ""}


# ============ 备份 ============

def backup_configs(paths, label=""):
    """把 master 上的指定文件打包 → 下载到本地。
    paths: 文件路径列表；label: 标记（如 simple/kerberos）。
    返回 {ok, id, count, msg}。"""
    okp, msgp = _probe_master()
    if not okp:
        return {"ok": False, "msg": msgp}
    m = cluster._master_node()
    if not paths:
        return {"ok": False, "msg": "没有要备份的文件"}

    ts = time.strftime("%Y%m%d_%H%M%S")
    bid = "ck-" + ts
    remote_tgz = "/tmp/%s.tgz" % bid

    # 1) 在 master 上打包（-C / 用绝对路径，忽略不存在的）
    quoted = " ".join('"%s"' % p for p in paths)
    tar_cmd = 'tar czf "%s" %s 2>&1 && echo TAR_OK' % (remote_tgz, quoted)
    ok, out = cluster._hdfs_master_run(tar_cmd, timeout=60, use_exit_code=False)
    if not ok or "TAR_OK" not in (out or ""):
        return {"ok": False, "msg": "打包失败：" + (out or "")}

    # 2) 下载到本地
    _ensure_dir()
    local_tgz = os.path.join(BACKUP_DIR, bid + ".tgz")
    ok2, msg2 = cluster.sftp_download(m.get("host", ""), m.get("port", 22),
                                      m.get("user", ""), m.get("pass", ""),
                                      remote_tgz, local_tgz)
    # 3) 清理远程临时包
    cluster._hdfs_master_run('rm -f "%s"' % remote_tgz, timeout=15, use_exit_code=False)
    if not ok2:
        return {"ok": False, "msg": "下载失败：" + msg2}

    # 3.5) 记录每个文件的 sha1（供变更检测）
    hashes = {}
    for p in paths:
        okh, outh = cluster._hdfs_master_run(
            'sha1sum "%s" 2>/dev/null | cut -d" " -f1' % p,
            timeout=10, use_exit_code=False)
        h = (outh or "").strip().splitlines()[-1].strip() if okh and outh else ""
        hashes[p] = h

    # 4) 记索引
    item = {
        "id": bid,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "label": label or "",
        "count": len(paths),
        "files": list(paths),
        "hashes": hashes,
        "file": bid + ".tgz",
    }
    items = _load_index()
    items.insert(0, item)
    _save_index(items)
    return {"ok": True, "id": bid, "count": len(paths), "msg": "备份成功"}


# ============ 列表 / 还原 / 删除 ============

def list_backups():
    """列出本地备份（最新在前）。"""
    items = _load_index()
    out = []
    for it in items:
        p = os.path.join(BACKUP_DIR, it.get("file", ""))
        it2 = dict(it)
        it2["exists"] = os.path.isfile(p)
        out.append(it2)
    return {"ok": True, "items": out}


def restore_backup(bid):
    """把某个备份写回 master（按备份清单原样还原）。返回 {ok, msg}。"""
    items = _load_index()
    it = next((x for x in items if x.get("id") == bid), None)
    if not it:
        return {"ok": False, "msg": "找不到备份 " + str(bid)}
    local_tgz = os.path.join(BACKUP_DIR, it.get("file", ""))
    if not os.path.isfile(local_tgz):
        return {"ok": False, "msg": "备份文件缺失：" + local_tgz}

    okp, msgp = _probe_master()
    if not okp:
        return {"ok": False, "msg": msgp}
    m = cluster._master_node()

    remote_tgz = "/tmp/%s.tgz" % bid
    # 1) 上传
    ok, msg = cluster.sftp_upload(m.get("host", ""), m.get("port", 22),
                                  m.get("user", ""), m.get("pass", ""),
                                  local_tgz, remote_tgz)
    if not ok:
        return {"ok": False, "msg": "上传失败：" + msg}
    # 2) 解包到根（tar 里存的是绝对路径，-C / 直接还原）
    ok2, out2 = cluster._hdfs_master_run('tar xzf "%s" -C / 2>&1 && echo UNTAR_OK; rm -f "%s"' % (remote_tgz, remote_tgz),
                                         timeout=60, use_exit_code=False)
    if not ok2 or "UNTAR_OK" not in (out2 or ""):
        return {"ok": False, "msg": "还原失败：" + (out2 or "")}
    return {"ok": True, "msg": "还原成功。如改的是 Hadoop 配置，需重启 HDFS/YARN 才生效。"}


def delete_backup(bid):
    """删除本地备份（文件 + 索引）。"""
    items = _load_index()
    it = next((x for x in items if x.get("id") == bid), None)
    if not it:
        return {"ok": False, "msg": "找不到备份 " + str(bid)}
    p = os.path.join(BACKUP_DIR, it.get("file", ""))
    try:
        if os.path.isfile(p):
            os.remove(p)
    except Exception as e:
        core.log("删除备份文件失败：" + str(e), exc=True)
    items = [x for x in items if x.get("id") != bid]
    _save_index(items)
    return {"ok": True, "msg": "已删除"}


def detect_changes():
    """对比"最近一次备份"与当前 master 上的配置，返回被改动的文件。
    用于"事后察觉"提醒。返回 {ok, changed:[path], msg}。"""
    items = _load_index()
    if not items:
        return {"ok": True, "changed": [], "msg": "还没有任何备份"}
    last = items[0]
    m = cluster._master_node()
    if not m:
        return {"ok": False, "changed": [], "msg": "未找到 master 节点"}
    if cluster.node_vm_off(m):
        return {"ok": False, "changed": [], "msg": "master 节点关机"}

    old_hashes = last.get("hashes", {}) or {}
    changed = []
    for path in last.get("files", []):
        ok, out = cluster._hdfs_master_run(
            'if [ -f "%s" ]; then sha1sum "%s" 2>/dev/null | cut -d" " -f1; else echo MISSING; fi' % (path, path),
            timeout=10, use_exit_code=False)
        if not ok:
            continue
        cur = (out or "").strip().splitlines()[-1].strip() if out else ""
        old = old_hashes.get(path, "")
        if cur == "MISSING":
            changed.append({"path": path, "why": "文件已不存在"})
        elif old and cur and cur != old:
            changed.append({"path": path, "why": "内容已修改"})
    return {"ok": True, "changed": changed, "msg": ""}
