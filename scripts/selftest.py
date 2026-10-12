# -*- coding: utf-8 -*-
"""解析逻辑自测：猴补丁替换 SSH/vmrun 层，用样例数据验证各解析函数。
不需真机，可随时跑：_packenv/Scripts/python.exe scripts/selftest.py
"""
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

import cluster  # noqa

PASS = []
FAIL = []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  [OK] " if cond else "  [FAIL] ") + name + ((" — " + str(detail)) if (detail and not cond) else ""))


_ORIG = {"node_vm_off": cluster.node_vm_off}


def patch(fake_ssh=None, fake_hdfs=None):
    """替换 SSH 层为假实现。"""
    cluster._master_node = lambda: {"name": "master", "host": "1.1.1.1", "port": 22, "user": "root", "pass": "x", "role": "master"}
    cluster.node_vm_off = lambda *a, **k: False
    cluster.list_nodes = lambda *a, **k: [{"id": "n1", "name": "master", "role": "master", "host": "1.1.1.1"}]
    if fake_ssh:
        cluster.ssh_exec = fake_ssh
    if fake_hdfs:
        cluster._hdfs_master_run = fake_hdfs


# ---- 测 hdfs_ls 解析 ----
print("[hdfs_ls]")
HDFS_LS = """Found 3 items
drwxr-xr-x   - root supergroup          0 2026-10-12 10:30 /user
-rw-r--r--   1 root supergroup       1024 2026-10-12 10:31 /user/word.txt
drwxr-xr-x   - root supergroup          0 2026-10-12 10:32 /tmp"""
patch(fake_hdfs=lambda cmd, timeout=30, use_exit_code=True: (True, HDFS_LS))
r = cluster.hdfs_ls("/user")
check("hdfs_ls ok", r["ok"])
check("hdfs_ls 3 项", len(r["items"]) == 3, len(r["items"]))
check("hdfs_ls 目录识别", r["items"][0]["type"] == "dir" and r["items"][1]["type"] == "file")
check("hdfs_ls 名称", r["items"][1]["name"] == "word.txt", r["items"][1]["name"])

# ---- 测 yarn_apps 解析 ----
print("[yarn_apps]")
YARN = """Total number of applications (application-types: [] and states: [ALL]): 2
                Application-Id	    Application-Name	  Application-Type	  User	     Queue	             State	   Final-State	Progress
application_1700000000001_0001	          wordcount	         MAPREDUCE	 root	    default	          FINISHED	       SUCCEEDED	      100%
application_1700000000001_0002	         hive_query	               TEZ	 root	    default	          RUNNING	       UNDEFINED	       45%"""
patch(fake_hdfs=lambda cmd, timeout=60, use_exit_code=True: (True, YARN))
r = cluster.yarn_apps()
check("yarn ok", r["ok"])
check("yarn 2 作业", len(r["apps"]) == 2, len(r["apps"]))
if r["apps"]:
    check("yarn id", r["apps"][0]["id"] == "application_1700000000001_0001", r["apps"][0]["id"])

# ---- 测 hive_tables 解析（beeline 表格）----
print("[hive_tables]")
HIVE = """+-----------+
| tab_name  |
+-----------+
| student   |
| scores    |
+-----------+
2 rows selected"""
patch(fake_hdfs=lambda cmd, timeout=120, use_exit_code=True: (True, HIVE))
# hive_tables 走 hive_exec → _hdfs_master_run，patch 已就位
r = cluster.hive_tables()
check("hive ok", r["ok"])
check("hive 2 表", len(r["tables"]) == 2, r["tables"])

# ---- 测 hbase_tables 解析 ----
print("[hbase_tables]")
HBASE = """TABLE
student
scores
2 row(s)"""
patch(fake_hdfs=lambda cmd, timeout=60: (True, HBASE))
r = cluster.hbase_tables()
check("hbase ok", r["ok"])
check("hbase 2 表", len(r["tables"]) == 2, r["tables"])

# ---- 测 detect_components ----
print("[detect_components]")
DETECT = "OK|hive\nOK|hdfs\nOK|yarn"
patch(fake_ssh=lambda *a, **k: (True, DETECT))
r = cluster.detect_components()
check("detect ok", r["ok"])
check("detect hive", r["components"].get("hive") is True)
check("detect hbase 未装", "hbase" not in r["components"])

# ---- 测 hive_import（防止 dict/tuple 解包 bug 回归）----
print("[hive_import]")
patch(fake_hdfs=lambda cmd, timeout=180, use_exit_code=True: (True, "OK"))
r = cluster.hive_import("/input/data.csv", "t1", ",", "c1,c2")
check("hive_import ok", r.get("ok") is True, r)
check("hive_import 有 ddl", "create external table" in (r.get("ddl") or ""))
check("hive_import 列名", "c1 string" in (r.get("ddl") or "") and "c2 string" in (r.get("ddl") or ""))

# ---- 测 _parse_services / _parse_jps / _parse_ports ----
print("[解析三兄弟]")
svc = cluster._parse_services("sshd=active\nfirewalld=inactive\nchronyd=active")
check("services active", svc.get("sshd") is True and svc.get("firewalld") is False)
jps = cluster._parse_jps("1234 NameNode\n5678 DataNode\n9999 Jps")
check("jps 进程", jps == ["NameNode", "DataNode", "Jps"], jps)
ports = cluster._parse_ports("Netid State\ntcp LISTEN 0.0.0.0:9000\ntcp LISTEN *:8088\nudp :::88")
check("ports 解析", {9000, 8088, 88} <= ports, ports)

# ---- 测 hdfs_rename / hdfs_search ----
print("[hdfs_rename/search]")
patch(fake_hdfs=lambda cmd, timeout=60, use_exit_code=True: (True, "OK"))
_rok, _rout = cluster.hdfs_rename("/a", "/b")
check("rename ok", _rok is True)
SEARCH_OUT = "Found 2 items\n-rw-r--r-- 1 root root 100 2026-10-12 10:00 /data/a.txt\n-rw-r--r-- 1 root root 200 2026-10-12 10:01 /data/b.txt"
patch(fake_hdfs=lambda cmd, timeout=60, use_exit_code=True: (True, SEARCH_OUT))
sr = cluster.hdfs_search("/data", "txt")
check("search ok", sr["ok"] is True)
check("search 2 项", len(sr["items"]) == 2, sr["items"])

# ---- 测 node_vm_off（关机秒判，省时间的关键逻辑）----
print("[node_vm_off]")
import os as _os
_nvo = _ORIG["node_vm_off"]   # 用原始函数（patch 改过它）
check("无vmx不判关机", _nvo({"vmx": ""}) is False)
vmx = r"D:\VM\test.vmx"
key = _os.path.normcase(_os.path.abspath(vmx))
check("vmx在运行", _nvo({"vmx": vmx}, running={key}) is False)
check("vmx不在运行", _nvo({"vmx": vmx}, running=set()) is True)

# ---- 测 _parse_vmsd_tree（快照树解析，真机修过）----
print("[_parse_vmsd_tree]")
import core  # noqa
import tempfile
VMSD = """.encoding = "UTF-8"
snapshot.lastUID = "2"
snapshot0.uid = "1"
snapshot0.displayName = "base"
snapshot.numSnapshots = "2"
snapshot1.uid = "2"
snapshot1.displayName = "child"
snapshot1.parent = "1"
"""
tf = tempfile.NamedTemporaryFile("wb", suffix=".vmsd", delete=False)
tf.write(VMSD.encode("utf-8")); tf.close()
tree = core._parse_vmsd_tree(tf.name)
os.unlink(tf.name)
check("vmsd 2 节点", len(tree) == 2, tree)
check("vmsd 父 depth0", tree[0]["name"] == "base" and tree[0]["depth"] == 0, tree[0] if tree else None)
check("vmsd 子 depth1", len(tree) > 1 and tree[1]["name"] == "child" and tree[1]["depth"] == 1, tree[1] if len(tree) > 1 else None)
check("vmsd 不存在返回空", core._parse_vmsd_tree("/no/such/file.vmsd") == [])

# ---- 测脱敏（diagpack）----
print("[脱敏]")
import diagpack  # noqa
check("mask_ip", diagpack._mask_ip("192.168.196.101") == "192.168.*.*", diagpack._mask_ip("192.168.196.101"))
check("mask_ip 非法", diagpack._mask_ip("abc") == "***")
check("mask_text", "192.168.*.*" in diagpack._mask_text("连 192.168.1.5 失败"), diagpack._mask_text("连 192.168.1.5 失败"))
check("mask_text 多IP", diagpack._mask_text("1.2.3.4 和 5.6.7.8").count("*.*") == 2, diagpack._mask_text("1.2.3.4 和 5.6.7.8"))

# ---- 测 _map_target（配置分发路径映射）----
print("[_map_target]")
# 无根 → 同路径
check("同路径", cluster._map_target({}, "/root/app/hadoop/etc", "") == "/root/app/hadoop/etc")
# 全局根替换 /root/app
check("全局根替换", cluster._map_target({}, "/root/app/hadoop/etc", "/opt") == "/opt/hadoop/etc",
      cluster._map_target({}, "/root/app/hadoop/etc", "/opt"))
# 节点自己的根优先
check("节点根优先", cluster._map_target({"cfg_root": "/data"}, "/root/app/x", "/opt") == "/data/x")
# 系统路径不动
check("系统路径不动", cluster._map_target({}, "/etc/hosts", "/opt") == "/etc/hosts")

# ---- 测 _parse_mb ----
print("[_parse_mb]")
check("parse 1.5 GB", abs(cluster._parse_mb("1.5 GB") - 1536) < 1, cluster._parse_mb("1.5 GB"))
check("parse 512 MB", abs(cluster._parse_mb("512 MB") - 512) < 1)
check("parse 空", cluster._parse_mb("") == 0)

# ---- 汇总 ----
print("")
print("通过 %d，失败 %d" % (len(PASS), len(FAIL)))
if FAIL:
    print("失败项：" + ", ".join(FAIL))
    sys.exit(1)
print("[OK] 全部通过")
