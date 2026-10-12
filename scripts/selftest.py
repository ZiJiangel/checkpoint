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
