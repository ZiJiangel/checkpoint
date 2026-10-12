# -*- coding: utf-8 -*-
"""Hadoop 配置模板：预置标准配置文件（含占位符，供参照/修改）。
注意：只生成，不自动写入集群（避免覆盖学生配置）。"""
import core

# 占位符：MASTER_HOST / HADOOP_HOME / REPLICATION

TEMPLATES = {
    "core-site.xml": """<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="configuration.xsl"?>
<configuration>
  <property>
    <name>fs.defaultFS</name>
    <value>hdfs://${MASTER_HOST}:9000</value>
  </property>
  <property>
    <name>hadoop.tmp.dir</name>
    <value>${HADOOP_HOME}/tmp</value>
  </property>
  <property>
    <name>hadoop.proxyuser.root.hosts</name>
    <value>*</value>
  </property>
  <property>
    <name>hadoop.proxyuser.root.groups</name>
    <value>*</value>
  </property>
</configuration>
""",
    "hdfs-site.xml": """<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="configuration.xsl"?>
<configuration>
  <property>
    <name>dfs.replication</name>
    <value>${REPLICATION}</value>
  </property>
  <property>
    <name>dfs.namenode.name.dir</name>
    <value>file://${HADOOP_HOME}/data/nn</value>
  </property>
  <property>
    <name>dfs.datanode.data.dir</name>
    <value>file://${HADOOP_HOME}/data/dn</value>
  </property>
  <property>
    <name>dfs.namenode.secondary.http-address</name>
    <value>${MASTER_HOST}:9868</value>
  </property>
  <property>
    <name>dfs.namenode.http-address</name>
    <value>${MASTER_HOST}:9870</value>
  </property>
</configuration>
""",
    "yarn-site.xml": """<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="configuration.xsl"?>
<configuration>
  <property>
    <name>yarn.resourcemanager.hostname</name>
    <value>${MASTER_HOST}</value>
  </property>
  <property>
    <name>yarn.nodemanager.aux-services</name>
    <value>mapreduce_shuffle</value>
  </property>
  <property>
    <name>yarn.nodemanager.local-dirs</name>
    <value>${HADOOP_HOME}/data/nm-local</value>
  </property>
  <property>
    <name>yarn.nodemanager.log-dirs</name>
    <value>${HADOOP_HOME}/logs/userlogs</value>
  </property>
</configuration>
""",
    "mapred-site.xml": """<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="configuration.xsl"?>
<configuration>
  <property>
    <name>mapreduce.framework.name</name>
    <value>yarn</value>
  </property>
  <property>
    <name>mapreduce.application.classpath</name>
    <value>${HADOOP_HOME}/share/hadoop/mapreduce/*:${HADOOP_HOME}/share/hadoop/mapreduce/lib/*</value>
  </property>
  <property>
    <name>yarn.app.mapreduce.am.env</name>
    <value>HADOOP_MAPRED_HOME=${HADOOP_HOME}</value>
  </property>
  <property>
    <name>mapreduce.map.env</name>
    <value>HADOOP_MAPRED_HOME=${HADOOP_HOME}</value>
  </property>
  <property>
    <name>mapreduce.reduce.env</name>
    <value>HADOOP_MAPRED_HOME=${HADOOP_HOME}</value>
  </property>
</configuration>
""",
}


def list_templates():
    return list(TEMPLATES.keys())


def get_template(name, master="master", hadoop_home="/root/app/hadoop", replication="2"):
    """取模板内容，替换占位符。未知模板返回 None。"""
    tpl = TEMPLATES.get(name)
    if tpl is None:
        return None
    vals = {"MASTER_HOST": master, "HADOOP_HOME": hadoop_home, "REPLICATION": replication}
    out = tpl
    for k, v in vals.items():
        out = out.replace("${" + k + "}", v)
    return out
