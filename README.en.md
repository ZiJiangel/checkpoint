# Snapshot Manager

A desktop tool for managing a **local VM cluster** — snapshots, health check, one-click start/stop, and diagnosis. Built for students running Hadoop / big-data cluster experiments on local virtual machines.

> Current version: **v0.9.1**

---

## Features

### VMs & Snapshots
- **Auto-discovery**: reads VMware records to find local VMs (cached, instant)
- **Snapshot management**: create / revert / delete, **tree view**, **clone to a new VM**
- **Cluster snapshots**: batch snapshot / revert for the whole cluster, with per-node selection
- **Runtime status**: view running VMs, start / stop / shut down all
- **Custom labels**: display names inside the app (e.g. "master")

### Cluster Management
- **Cluster nodes**: configure nodes (IP / credentials / role / cluster), **multi-cluster**
- **Cluster templates**: one-click node skeleton (Hadoop 3-node / Hadoop+Kerberos 5-node)
- **One-click start/stop**: ordered by dependency (NTP → KDC → HDFS → YARN → HistoryServer)
- **Health check**: online / processes / ports / services (traffic-light status)
- **Pre-deploy check**: Java / hosts / SSH / time / SELinux / firewall
- **Config distribution**: scan master config dirs, rsync to workers (per-node root supported)

### Diagnosis & UX
- **Plain-language errors**: common errors translated into "cause + fix" (12+ rules)
- **VMware env management**: status light + per-service start/stop + launch VMware
- **Skip powered-off nodes**: instant, no timeout wait
- **Concurrency lock**: buttons disabled during operations
- **UI**: vCenter-style (left nav + right pane), light/dark theme, ZH/EN, animations
- **Update check** + global exception capture (\`error.log\`)

---

## Prerequisites

This tool is for **local VM cluster experiments**. You need:

1. **VMware Workstation / Player** (the app uses its \`vmrun.exe\`)
2. **Several Linux VMs** (e.g. CentOS 7) forming a cluster (master / user1 / user2 / ntp / kdc)
3. Nodes **network-reachable** and **SSH-accessible** (config distribution also needs **SSH key** from master to workers)

> No cluster yet? Build one first (or use a **cluster template** to generate the node skeleton), then come back for health check / start-stop / diagnosis.

---

## Quick Start

1. **Open the app** → go to the "Cluster" tab
2. Click **＋ New Cluster** (or **⊞ Template** to generate a standard skeleton)
3. **Add nodes**: fill IP / user / password / role (linking a VM auto-fills config)
4. Click **Health Check** → see traffic lights (🟢 ok / 🟡 partial / 🔴 error / ⚪ off)
5. Problems? Use **Deploy Check**; start/stop failures show **plain-language diagnosis**
6. **Snapshot** before experiments; one-click **revert** if things break

---

## Usage

### Option 1: Installer (recommended)

1. Download \`集群快照管理器-安装包.exe\`
2. Double-click, choose install location
3. Launch from the desktop shortcut

**Requirement**: VMware Workstation / Player installed.

### Option 2: Run from source

\`\`\`bash
pip install pywebview paramiko
python app.py
\`\`\`

---

## Tech Stack

- **pywebview**: Python + embedded WebView desktop window
- **Frontend**: vanilla HTML / CSS / JavaScript (no framework)
- **Backend**: Python (calls VMware's \`vmrun\` CLI + SSH via paramiko)
- **Packaging**: PyInstaller (standalone exe) + Inno Setup (installer)

---

## Config Files

Generated at runtime **next to the program**:

- \`settings.json\` — settings (vmrun path, language, etc.)
- \`nodes.json\` — cluster nodes (IP / credentials / role)
- \`aliases.json\` — VM display names / notes
- \`vms_cache.json\` — VM scan cache
- \`health_cache.json\` — last health-check result
- \`error.log\` — error log

---

## Changelog

- **v0.9.1** (2026-10-11): Config distribution overhaul (auto-scan + manual path + per-node root + plain-language failures), concurrency locks, skip powered-off nodes, faster startup (TCP probe), VMware pre-checks.
- **v0.9.0** (2026-10-11): Config distribution (auto-scan), snapshot tree view, clone snapshot to VM, pre-deploy check, button tooltips.
- **v0.8.0** (2026-10-11): Cluster templates, health-result persistence, UI animations, clone snapshot, pre-deploy check, config distribution, plain-language errors.
- **v0.7.0** (2026-10-11): vCenter-style UI rebuild, multi-cluster, cluster snapshots, cluster overview, plain-language errors, pre-deploy check, config distribution.
- **v0.6.0** (2026-10-11): VMware env management, cluster start/stop improvements, health check enhancements, node notes.
- **v0.5.0** (2026-10-10): UI成型 (health card + detail tabs), port check, post-start self-check, auto health check.
- **v0.4.0** (2026-10-10): One-click cluster start/stop (dependency-ordered).
- **v0.3.0** (2026-10-10): Cluster node management + one-click health check.
- **v0.2.0** (2026-10-10): Language switch (ZH/EN), check for updates.
- **v0.1.0** (2026-10-10): First release. Auto-discovery, snapshot management, labels, theme switch, installer.

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)** — see [LICENSE](LICENSE).
