# 前端冒烟测试（手动/半自动）

> 前端（web/）改动后，用此清单快速回归。**后端部分用 mock**，不需真机。
> 工具：Cuckoo 的 openBrowserWindow + injectJS。

## 用法

1. 打开前端预览：`openBrowserWindow("file:///.../web/index.html")`
2. 注入 mock（见下）后跑各检查
3. 每条应"无 JS 报错、元素/数量符合预期"

## 通用 mock（后端全假数据）

```js
window.pywebview = { api: {
  get_settings: async()=>({lang:'zh',vmrun:'',auto_check:true}),
  get_meta: async()=>({version:'0.10.0',author:'x'}),
  get_vms: async()=>[], get_clusters: async()=>['默认集群'],
  get_current_cluster: async()=>'默认集群', get_nodes: async()=>[],
  load_health_cache: async()=>null, vmware_state: async()=>({state:'green'}),
  enable_resize: async()=>{}, drain_cmd_log: async()=>[], peek_cmd_log: async()=>[],
  get_services: async()=>[], hive_tables: async()=>({ok:true,tables:[],msg:''}),
  yarn_apps: async()=>({ok:true,apps:[],msg:''}), list_job_templates: async()=>([]),
  hdfs_ls: async()=>({ok:true,items:[],msg:''})
}};
bindActivityBar(); bindBottomPanel(); bindClusterTabs();
```

## 检查清单

| # | 检查 | 预期 |
|---|---|---|
| 1 | 遍历 5 域 switchDomain(env/data/job/tool/settings) | 无报错 |
| 2 | 遍历所有 pane 点击（hdfs/hive/tables/import/hbase/yarn/jobtpl/verify/deploycheck/diagpack/clustercfg/cfgtmpl） | 无报错 |
| 3 | 所有视图存在（view-cluster/node/vm/settings/hdfs/hive/tables/import/hbase/yarn/jobtpl/verify/deploycheck/diagpack/clustercfg/cfgtmpl） | 全存在 |
| 4 | 底部面板 3 tab（output/task/term）切换 | 无报错 |
| 5 | 集群视图 6 选项卡切换 | 无报错 |
| 6 | window.onerror 捕获 | 零错误 |

## 已知：真程序才能验的
- 文件对话框（上传/下载/导出/诊断包）
- 真 vmrun/SSH 操作
- 需 VM 开机的数据采集（拓扑/监控）
