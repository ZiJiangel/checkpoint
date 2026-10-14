# -*- coding: utf-8 -*-
"""Kerberos ↔ simple 一键切换（声明式：改 XML + 重启 HDFS/YARN + kinit/kdestroy）。

守的线：改动内容预先声明（不现生成）、命令可见、用户确认、切换前自动备份。
"""
import json

import cluster
import config_backup

# 声明式：每个模式的配置项 {file, key, value}
CONF_DIR_DEFAULT = "/root/app/hadoop/etc/hadoop"

SIMPLE_EDITS = [
    {"file": "core-site.xml", "key": "hadoop.security.authentication", "val": "simple"},
    {"file": "core-site.xml", "key": "hadoop.security.authorization", "val": "false"},
    {"file": "core-site.xml", "key": "hadoop.http.authentication.type", "val": "simple"},
    {"file": "hdfs-site.xml", "key": "dfs.block.access.token.enable", "val": "false"},
    # Kerberos 化一并引入的：HTTPS + 安全容器执行器 → 切回默认
    {"file": "hdfs-site.xml", "key": "dfs.http.policy", "val": "HTTP_ONLY"},
    {"file": "yarn-site.xml", "key": "yarn.nodemanager.container-executor.class",
     "val": "org.apache.hadoop.yarn.server.nodemanager.DefaultContainerExecutor"},
]

KERBEROS_EDITS = [
    {"file": "core-site.xml", "key": "hadoop.security.authentication", "val": "kerberos"},
    {"file": "core-site.xml", "key": "hadoop.security.authorization", "val": "true"},
    {"file": "core-site.xml", "key": "hadoop.http.authentication.type", "val": "kerberos"},
    {"file": "hdfs-site.xml", "key": "dfs.block.access.token.enable", "val": "true"},
    # 反向：HTTPS + 安全容器执行器
    {"file": "hdfs-site.xml", "key": "dfs.http.policy", "val": "HTTPS_ONLY"},
    {"file": "yarn-site.xml", "key": "yarn.nodemanager.container-executor.class",
     "val": "org.apache.hadoop.yarn.server.nodemanager.LinuxContainerExecutor"},
]

# 远端 python 编辑器（2.7/3 兼容）：用正则替换 <name>key</name>...<value>val</value>
_EDITOR = r'''
import re, json, sys
with open("/tmp/ck_edits.json") as f:
    edits = json.load(f)
for e in edits:
    path = e["file"]; key = e["key"]; val = e["val"]
    try:
        with open(path) as f:
            s = f.read()
    except Exception as ex:
        print("ERR open %s: %s" % (path, ex)); continue
    pat = r"(<name>\s*" + re.escape(key) + r"\s*</name>\s*<value>)([^<]*)(</value>)"
    new_s, n = re.subn(pat, lambda m: m.group(1) + val + m.group(3), s)
    if n == 0:
        # key not found: insert before </configuration>
        prop = "  <property><name>%s</name><value>%s</value></property>\n</configuration>" % (key, val)
        if "</configuration>" in s:
            new_s = s.replace("</configuration>", prop, 1)
            with open(path, "w") as f:
                f.write(new_s)
            print("ADD " + key + " = " + val)
        else:
            print("MISS " + key)
    else:
        with open(path, "w") as f:
            f.write(new_s)
        print("OK " + key + " = " + val)
'''


def _conf_dir():
    script = ('for d in "$HADOOP_CONF_DIR" "$HADOOP_HOME/etc/hadoop" '
              '/root/app/hadoop/etc/hadoop /opt/hadoop/etc/hadoop /usr/local/hadoop/etc/hadoop; do '
              '[ -n "$d" ] && [ -f "$d/core-site.xml" ] && echo "$d" && break; done')
    ok, out = cluster._hdfs_master_run(script, timeout=15, use_exit_code=False)
    return (out or "").strip().splitlines()[0].strip() if ok and out and out.strip() else CONF_DIR_DEFAULT


def switch_mode(mode):
    """mode: 'simple' 或 'kerberos'。返回 {ok, steps:[{label, ok, out}], msg}。"""
    if mode not in ("simple", "kerberos"):
        return {"ok": False, "steps": [], "msg": "未知模式"}
    steps = []

    def step(label, ok, out=""):
        steps.append({"label": label, "ok": bool(ok), "out": (out or "")[:400]})

    m = cluster._master_node()
    if not m:
        return {"ok": False, "steps": [], "msg": "未找到 master 节点"}
    if cluster.node_vm_off(m):
        return {"ok": False, "steps": [], "msg": "master 节点关机，请先开机"}

    conf = _conf_dir()
    edits = SIMPLE_EDITS if mode == "simple" else KERBEROS_EDITS
    full_edits = [{"file": conf + "/" + e["file"], "key": e["key"], "val": e["val"]} for e in edits]

    # 1) 备份当前配置（可回滚）
    try:
        bfiles = sorted(set(e["file"] for e in full_edits))
        br = config_backup.backup_configs(bfiles, label="pre-switch-" + mode)
        step("备份当前配置", br.get("ok"), br.get("id") or br.get("msg") or "")
    except Exception as e:
        step("备份当前配置", False, str(e))

    # 2) 写编辑器 + 待改项到 master
    try:
        import base64
        b64 = base64.b64encode(_EDITOR.encode("utf-8")).decode("ascii")
        edits_json = json.dumps(full_edits, ensure_ascii=False)
        # 用 base64 落地脚本，避免引号问题
        cmd = (
            'echo %s | base64 -d > /tmp/ck_edit.py; '
            'cat > /tmp/ck_edits.json << "CKEOF"\n%s\nCKEOF\n'
            'python /tmp/ck_edit.py; rm -f /tmp/ck_edit.py /tmp/ck_edits.json'
        ) % (b64, edits_json)
        ok, out = cluster._hdfs_master_run(cmd, timeout=40, use_exit_code=False)
        step("修改配置（%s）" % mode, ok and "OK" in (out or ""), out)
    except Exception as e:
        step("修改配置", False, str(e))

    # 3) 重启 HDFS + YARN（用 hdfs / yarn 用户）
    ok_h, out_h = cluster._hdfs_master_run(
        "source /etc/profile; sudo -u hdfs bash -lc 'stop-dfs.sh; start-dfs.sh' 2>&1 | tail -8",
        timeout=120, use_exit_code=False)
    step("重启 HDFS", ok_h, out_h)

    ok_y, out_y = cluster._hdfs_master_run(
        "source /etc/profile; sudo -u yarn bash -lc 'stop-yarn.sh; start-yarn.sh' 2>&1 | tail -8",
        timeout=120, use_exit_code=False)
    step("重启 YARN", ok_y, out_y)

    # 4) 切 simple → 清票据；切 kerberos → 拿票据（若配了 principal）
    if mode == "simple":
        _, out_k = cluster._hdfs_master_run("kdestroy 2>&1 || true; echo done", timeout=10, use_exit_code=False)
        step("清理票据（kdestroy）", True, out_k)
    else:
        try:
            import core
            cfg = core.get_kerberos()
            principal = (cfg.get("principal") or "").strip()
            keytab = (cfg.get("keytab") or "").strip()
            password = cfg.get("password") or ""
            if principal and keytab:
                _, o = cluster._hdfs_master_run("kinit -kt %s %s && echo OK" % (keytab, principal), timeout=20, use_exit_code=False)
                step("获取票据（kinit）", "OK" in (o or ""), o)
            elif principal and password:
                from cluster import _shq
                _, o = cluster._hdfs_master_run("echo %s | kinit %s && echo OK" % (_shq(password), principal), timeout=20, use_exit_code=False)
                step("获取票据（kinit）", "OK" in (o or ""), o)
            else:
                step("获取票据（kinit）", False, "未配置 principal/keytab（去设置页填）")
        except Exception as e:
            step("获取票据（kinit）", False, str(e))

    ok_all = all(s["ok"] for s in steps if "备份" not in s["label"])  # 备份失败不致命
    return {"ok": ok_all, "steps": steps, "msg": "" if ok_all else "部分步骤未成功（见明细）；如需回滚，用配置备份还原"}