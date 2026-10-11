# -*- coding: utf-8 -*-
"""故障诊断：把报错/症状翻译成人话 + 给修复建议。
规则表可扩展——加一条就是加一个 dict。"""

# 严重度：error(红) / warn(黄) / info(蓝)
# detect 是"输出里包含什么"（可多个，任一命中）；也可以按 kind 主动检查
RULES = [
    # ===== Hadoop 启动相关 =====
    {
        "id": "cmd_not_found",
        "match": ["command not found", "未找到命令"],
        "title": "命令找不到",
        "meaning": "环境变量没加载，hadoop/hdfs 等命令不在 PATH 里",
        "fix": "执行  source /etc/profile  （或重新登录 shell）",
        "sev": "error",
    },
    {
        "id": "namenode_user",
        "match": ["HDFS_NAMENODE_USER", "there is no HDFS_"],
        "title": "Hadoop 用户变量缺失",
        "meaning": "hadoop-env.sh 里没配 *USER 变量，start-dfs.sh 起不来",
        "fix": "在 hadoop-env.sh 里加 export HDFS_NAMENODE_USER=root 等（详见启动指导）",
        "sev": "error",
    },
    {
        "id": "mrappmaster",
        "match": ["MRAppMaster", "Could not find or load main class"],
        "title": "MapReduce 找不到 MRAppMaster",
        "meaning": "mapred-site.xml 的 HADOOP_MAPRED_HOME 用了变量没展开",
        "fix": "把 mapred-site.xml 里该值改成绝对路径 HADOOP_MAPRED_HOME=/root/app/hadoop",
        "sev": "error",
    },
    {
        "id": "datanode_down",
        "match": ["DataNode.*not running", "datanode.*refused", "Starting datanodes.*fail"],
        "title": "从节点 DataNode 起不来",
        "meaning": "常见于：网络不通 / hosts 不一致 / data·logs 不干净",
        "fix": "检查：①从节点能 ping 通 master ②三台 /etc/hosts 一致 ③清 data/logs 后重新格式化",
        "sev": "error",
    },
    {
        "id": "cluster_id",
        "match": ["Cluster id", "clusterID", "Incompatible clusterIDs"],
        "title": "集群 ID 不一致",
        "meaning": "格式化后 DataNode 的 clusterID 和 NameNode 对不上",
        "fix": "停所有节点 → 删三台 data/logs → hdfs namenode -format -force",
        "sev": "error",
    },
    # ===== 网络 / 服务 =====
    {
        "id": "conn_refused",
        "match": ["Connection refused", "拒绝连接"],
        "title": "连接被拒绝",
        "meaning": "目标服务没启动，或端口没在监听",
        "fix": "确认对端服务起了没（systemctl status 服务名 / jps）",
        "sev": "error",
    },
    {
        "id": "ssh_timeout",
        "match": ["timed out", "超时", "No route to host"],
        "title": "连不上节点",
        "meaning": "节点没开机 / 网络不通 / IP 变了",
        "fix": "确认虚拟机动了没、IP 对不对、能否 ping 通",
        "sev": "error",
    },
    {
        "id": "perm_denied",
        "match": ["Permission denied", "认证失败", "Authentication failed"],
        "title": "认证/权限失败",
        "meaning": "密码不对，或 Kerberos 认证没过（时间不同步也会导致）",
        "fix": "检查密码；若是 Kerberos，先确认时间同步 + KDC 已启动",
        "sev": "error",
    },
    # ===== Kerberos =====
    {
        "id": "kdc_down",
        "match": ["krb5kdc", "KDC", "Cannot contact any KDC"],
        "title": "KDC 没启动",
        "meaning": "Kerberos 认证服务没起，依赖它的操作会失败",
        "fix": "在 kdc 节点：systemctl start krb5kdc kadmin",
        "sev": "error",
    },
    {
        "id": "time_skew",
        "match": ["Clock skew", "时间偏差", "KrbException.*skew"],
        "title": "时间不同步",
        "meaning": "Kerberos 对时间极敏感（差几分钟就认证失败）",
        "fix": "先对时：ntpdate <NTP服务器> 或 systemctl restart chronyd",
        "sev": "error",
    },
    # ===== 服务/端口 =====
    {
        "id": "port_used",
        "match": ["Address already in use", "端口被占用", "BindException"],
        "title": "端口被占用",
        "meaning": "该端口已被别的进程占着",
        "fix": "查出占用进程（ss -tlnp | grep 端口）后处理，或换端口",
        "sev": "warn",
    },
    {
        "id": "firewall",
        "match": ["firewalld", "SELinux", "No route.*firewall"],
        "title": "防火墙/SELinux 挡了",
        "meaning": "端口被防火墙或 SELinux 拦截",
        "fix": "检查 systemctl status firewalld 和 getenforce（实验环境一般关掉）",
        "sev": "warn",
    },
]


def diagnose(output):
    """输入一段报错/输出文本，返回命中的诊断列表 [{id,title,meaning,fix,sev}]"""
    if not output:
        return []
    text = str(output)
    hits = []
    for r in RULES:
        for kw in r["match"]:
            # 简单包含匹配（关键词）
            if kw.lower() in text.lower():
                hits.append({"id": r["id"], "title": r["title"],
                             "meaning": r["meaning"], "fix": r["fix"], "sev": r["sev"]})
                break
    return hits


def diagnose_many(outputs):
    """多个输出一起诊断，去重"""
    seen = set()
    result = []
    for o in outputs:
        for h in diagnose(o):
            if h["id"] not in seen:
                seen.add(h["id"])
                result.append(h)
    return result
