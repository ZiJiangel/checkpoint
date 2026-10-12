# -*- coding: utf-8 -*-
"""Checkpoint - pywebview 主程序"""
import os
import sys
import subprocess


def ensure_deps():
    """检查依赖，缺失则静默安装"""
    try:
        import webview  # noqa
        import paramiko  # noqa
        return
    except ImportError:
        pass
    py = sys.executable
    if py.lower().endswith("pythonw.exe"):
        py = py[:-len("pythonw.exe")] + "python.exe"
    try:
        CREATE_NO_WINDOW = 0x08000000
        subprocess.run(
            [py, "-m", "pip", "install", "pywebview", "paramiko", "-q",
             "-i", "https://mirrors.aliyun.com/pypi/simple/"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception as e:
        # 不依赖 tkinter：写日志 + 打印
        try:
            logf = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "error.log")
            with open(logf, "a", encoding="utf-8") as f:
                f.write("依赖缺失：缺少 pywebview 或 paramiko，且自动安装失败。请手动执行：pip install pywebview paramiko\n")
                f.write("错误：" + str(e) + "\n")
        except Exception:
            pass
        sys.exit(1)


ensure_deps()

import webview  # noqa
import core
import cluster
import services
import vmware_env
import diagnose

import sys

if getattr(sys, "frozen", False):
    # PyInstaller 打包后
    BASE = sys._MEIPASS
else:
    BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")


class Api:
    def minimize(self):
        webview.windows[0].minimize()

    def maximize(self):
        w = webview.windows[0]
        try:
            if getattr(w, "_ck_maxed", False):
                w.restore()
                w._ck_maxed = False
            else:
                w.maximize()
                w._ck_maxed = True
        except Exception:
            w.toggle_fullscreen()

    def close_win(self):
        webview.windows[0].destroy()

    def enable_resize(self):
        """前端就绪后调用：给无边框窗口补回可拖拽边缘样式。"""
        try:
            ok, msg = _enable_window_resize_impl()
            try:
                core.log("enable_resize: ok=%s %s" % (ok, msg))
            except Exception:
                pass
            return {"ok": ok, "msg": msg}
        except Exception as e:
            return {"ok": False, "msg": str(e)}

    def set_window_geom(self, x, y, w, h):
        """前端拖拽边缘时调用：一次设置窗口位置与大小（SetWindowPos）。"""
        if not sys.platform.startswith("win"):
            return {"ok": False}
        try:
            import ctypes
            from ctypes import wintypes
            hwnd = _get_hwnd()
            if not hwnd:
                return {"ok": False, "msg": "no hwnd"}
            user32 = ctypes.windll.user32
            SWP_NOZORDER = 0x0004
            SWP_NOACTIVATE = 0x0010
            ok = user32.SetWindowPos(wintypes.HWND(hwnd), 0,
                                     int(round(x)), int(round(y)),
                                     int(round(w)), int(round(h)),
                                     SWP_NOZORDER | SWP_NOACTIVATE)
            return {"ok": bool(ok)}
        except Exception as e:
            return {"ok": False, "msg": str(e)}

    # ===== 集群 =====
    def get_clusters(self):
        return cluster.list_clusters()

    def get_current_cluster(self):
        return cluster.get_current_cluster()

    def set_current_cluster(self, name):
        cluster.set_current_cluster(name)
        return {"ok": True}

    # ===== 集群节点 =====
    def get_nodes(self):
        return cluster.list_nodes()

    def known_vm_config(self, vmx):
        return cluster.known_vm_config(vmx)

    def save_node(self, node):
        if node.get("id"):
            r = cluster.update_node(node)
        else:
            r = cluster.add_node(node)
        return {"ok": True, "node": r}

    def delete_node(self, nid):
        cluster.delete_node(nid)
        return {"ok": True}

    def test_node(self, node):
        ok, msg = cluster.test_node(node)
        return {"ok": ok, "out": msg}

    def health_check(self):
        return cluster.health_check_all()

    def diagnose(self, text):
        return diagnose.diagnose(text)

    def pre_deploy_check(self):
        return cluster.pre_deploy_check_all()

    def load_health_cache(self):
        return cluster.load_health_cache()

    def distribute_config(self, src, dst, roles):
        return cluster.distribute_config(src, dst, roles)

    def scan_config_dirs(self):
        return cluster.scan_config_dirs()

    def list_templates(self):
        return cluster.list_templates()

    def create_from_template(self, tid, cluster_name):
        return cluster.create_from_template(tid, cluster_name)

    # ===== 集群启停 =====
    def get_services(self):
        return services.get_services()

    def set_service_enabled(self, sid, enabled):
        services.set_service_enabled(sid, enabled)
        return {"ok": True}

    def run_service(self, sid, action="start"):
        return services.run_service(sid, action)

    def start_vms(self):
        return services.start_vms()

    def stop_vms(self):
        return services.stop_vms()

    def stop_vm_node(self, nid):
        return services.stop_vm_node(nid)

    def start_vm_node(self, nid):
        return services.start_vm_node(nid)

    # ===== VMware 宿主机环境 =====
    def vmware_state(self):
        return vmware_env.overall_state()

    def vmware_start_services(self, mode="all"):
        ok = vmware_env.start_services(mode)
        return {"ok": ok}

    def vmware_stop_services(self, mode="optional"):
        ok = vmware_env.stop_services(mode)
        return {"ok": ok}

    def vmware_start_one(self, name):
        ok = vmware_env.start_one(name)
        return {"ok": ok}

    def vmware_stop_one(self, name):
        ok = vmware_env.stop_one(name)
        return {"ok": ok}

    def vmware_launch_app(self):
        ok, msg = vmware_env.launch_app()
        return {"ok": ok, "out": msg}

    def check_nodes_ready(self):
        return cluster.check_nodes_ready()

    def nodes_vm_status(self):
        return cluster.nodes_vm_status()

    def snapshot_tree(self, vmx):
        return core.list_snapshots_tree(vmx)

    def clone_vm(self, src, dst, snapshot, mode):
        ok, out = core.clone_vm(src, dst, snapshot, mode)
        return {"ok": ok, "out": out}

    def get_vms(self, force=False, snaps=True):
        running = [os.path.basename(r) for r in core.list_running()] if snaps else []
        result = []
        for v in core.list_vms(force=force):
            s = core.list_snapshots(v["vmx"]) if snaps else []
            result.append({
                "label": v["label"],
                "name": v["name"],
                "note": v["note"],
                "vmx": v["vmx"],
                "exists": os.path.exists(v["vmx"]),
                "snapshots": s,
                "running": os.path.basename(v["vmx"]) in running,
                "verified": bool(force),
            })
        return result

    def get_settings(self):
        return {"vmrun": core.get_vmrun(), "lang": core.get_lang(),
                "auto_check": core.get_auto_check()}

    def save_auto_check(self, enabled):
        core.set_auto_check(enabled)
        return {"ok": True}

    def save_lang(self, lang):
        core.set_lang(lang)
        return {"ok": True}

    def get_meta(self):
        return {"version": core.VERSION, "author": core.AUTHOR}

    def drain_cmd_log(self):
        """取出并清空命令日志（供前端"命令透明"展示本次操作的命令）。"""
        return core.drain_cmd_log()

    def peek_cmd_log(self):
        """看一眼命令日志（不清空），供执行中实时显示。"""
        return core.peek_cmd_log()

    # ===== HDFS 操作 =====
    def hdfs_ls(self, path="/"):
        return cluster.hdfs_ls(path)

    def hdfs_mkdir(self, path):
        ok, out = cluster.hdfs_mkdir(path)
        return {"ok": ok, "msg": out}

    def hdfs_rm(self, path, recursive=False):
        ok, out = cluster.hdfs_rm(path, recursive)
        return {"ok": ok, "msg": out}

    def hive_exec(self, sql):
        return cluster.hive_exec(sql)

    def yarn_apps(self):
        return cluster.yarn_apps()

    def hdfs_download_dialog(self, remote_path):
        """选本地保存目录 → 从 HDFS 下载该文件。"""
        import webview
        try:
            w = webview.windows[0]
            res = w.create_file_dialog(webview.FOLDER_DIALOG)
        except Exception as e:
            return {"ok": False, "msg": "打开目录对话框失败：" + str(e)}
        if not res:
            return {"ok": False, "msg": "", "cancelled": True}
        local_dir = res[0] if isinstance(res, (list, tuple)) else res
        return cluster.hdfs_download(remote_path, local_dir)

    def hdfs_pick_and_upload(self, remote_dir):
        """打开文件对话框选本地文件 → 上传到 HDFS。"""
        import webview
        try:
            w = webview.windows[0]
            res = w.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False)
        except Exception as e:
            return {"ok": False, "msg": "打开文件对话框失败：" + str(e)}
        if not res:
            return {"ok": False, "msg": "", "cancelled": True}
        local = res[0] if isinstance(res, (list, tuple)) else res
        return cluster.hdfs_upload(local, remote_dir)

    def check_update(self):
        return core.check_update()

    def open_url(self, url):
        import webbrowser
        try:
            webbrowser.open(url)
        except Exception as e:
            core.log("打开链接失败：" + str(url) + " — " + str(e), exc=True)
            return {"ok": False, "out": str(e)}
        return {"ok": True}

    def save_vmrun(self, path):
        core.set_vmrun(path)
        return {"ok": True}

    def save_alias(self, vmx, name, note):
        core.save_alias(vmx, name, note)
        return {"ok": True}

    def snapshot(self, vmx, name):
        ok, out = core.take_snapshot(vmx, name)
        return {"ok": ok, "out": out}

    def revert(self, vmx, name):
        ok, out = core.revert_snapshot(vmx, name)
        return {"ok": ok, "out": out}

    def delete_snap(self, vmx, name):
        ok, out = core.delete_snapshot(vmx, name)
        return {"ok": ok, "out": out}

    def start_vm(self, vmx):
        ok, out = core.start_vm(vmx)
        return {"ok": ok, "out": out}

    def stop_vm(self, vmx):
        ok, out = core.stop_vm(vmx)
        return {"ok": ok, "out": out}

    def list_running(self):
        return core.list_running()


def _get_hwnd():
    """获取主窗口原生句柄（找不到返回 0）。"""
    try:
        import ctypes
        user32 = ctypes.windll.user32
    except Exception:
        return 0
    hwnd = 0
    try:
        w = webview.windows[0]
        for attr in ("native", "gui"):
            obj = getattr(w, attr, None)
            if obj is None:
                continue
            for hn in ("Handle", "hwnd", "HandleRef"):
                h = getattr(obj, hn, None)
                if h is None:
                    continue
                try:
                    hwnd = int(h)
                except Exception:
                    try:
                        hwnd = int(h.ToInt64())
                    except Exception:
                        hwnd = 0
                if hwnd:
                    break
            if hwnd:
                break
    except Exception:
        pass
    if not hwnd:
        try:
            hwnd = int(user32.FindWindowW(None, "Checkpoint"))
        except Exception:
            hwnd = 0
    return hwnd


def _enable_window_resize_impl():
    """无边框窗口补回可拖拽边框样式。返回 (ok, msg)。"""
    if not sys.platform.startswith("win"):
        return False, "非 Windows 平台"
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    if ctypes.sizeof(ctypes.c_void_p) == 8:
        get_long = user32.GetWindowLongPtrW
        set_long = user32.SetWindowLongPtrW
        get_long.restype = ctypes.c_ssize_t
        get_long.argtypes = [wintypes.HWND, ctypes.c_int]
        set_long.restype = ctypes.c_ssize_t
        set_long.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
    else:
        get_long = user32.GetWindowLongW
        set_long = user32.SetWindowLongW
        get_long.argtypes = [wintypes.HWND, ctypes.c_int]
        set_long.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]

    hwnd = _get_hwnd()
    if not hwnd:
        return False, "找不到窗口句柄"

    GWL_STYLE = -16
    WS_MAXIMIZEBOX = 0x00010000
    WS_MINIMIZEBOX = 0x00020000
    SWP_FRAMECHANGED = 0x0020
    SWP_NOMOVE = 0x0002
    SWP_NOSIZE = 0x0001
    SWP_NOZORDER = 0x0004
    try:
        # 只保留最大化/最小化按钮能力，不加 WS_THICKFRAME（避免系统画出灰色边框）；
        # 边缘拖拽由前端热区 + set_window_geom 实现
        style = get_long(wintypes.HWND(hwnd), GWL_STYLE)
        style |= (WS_MAXIMIZEBOX | WS_MINIMIZEBOX)
        style &= ~0x00040000  # 确保去掉 WS_THICKFRAME
        set_long(wintypes.HWND(hwnd), GWL_STYLE, style)
        user32.SetWindowPos(wintypes.HWND(hwnd), 0, 0, 0, 0, 0,
                            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER)
        return True, "hwnd=%s style=0x%x" % (hwnd, style)
    except Exception as e:
        return False, "设置失败: " + str(e)


def show_error(title, msg):
    # 不依赖 tkinter：写日志 + 打印
    try:
        core.log(title + ": " + msg)
    except Exception:
        pass
    print(title + ": " + msg)


if __name__ == "__main__":
    try:
        api = Api()
        webview.create_window(
            "Checkpoint",
            os.path.join(WEB, "index.html"),
            js_api=api,
            width=1180, height=780,
            min_size=(900, 600),
            frameless=True,
            easy_drag=False,
            resizable=True,
            background_color="#16161a",
        )
        webview.start()
    except Exception as e:
        core.log("程序异常：" + str(e), exc=True)
        show_error("程序出错",
                   "程序发生了错误：\n\n" + str(e) +
                   "\n\n详细信息已写入日志：\n" + core.LOG_FILE +
                   "\n\n请把该日志发给开发者。")
        sys.exit(1)
