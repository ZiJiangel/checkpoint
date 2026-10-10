# -*- coding: utf-8 -*-
"""集群快照管理器 - pywebview 主程序"""
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
             "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"],
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
                f.write("依赖缺失：缺少 pywebview，且自动安装失败。请手动执行 pip install pywebview\n")
                f.write("错误：" + str(e) + "\n")
        except Exception:
            pass
        sys.exit(1)


ensure_deps()

import webview  # noqa
import core
import cluster
import services

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
        webview.windows[0].toggle_fullscreen()

    def close_win(self):
        webview.windows[0].destroy()

    # ===== 集群节点 =====
    def get_nodes(self):
        return cluster.list_nodes()

    def save_node(self, node):
        if node.get("id"):
            cluster.update_node(node)
        else:
            cluster.add_node(node)
        return {"ok": True}

    def delete_node(self, nid):
        cluster.delete_node(nid)
        return {"ok": True}

    def test_node(self, node):
        ok, msg = cluster.test_node(node)
        return {"ok": ok, "out": msg}

    def health_check(self):
        return cluster.health_check_all()

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

    def check_nodes_ready(self):
        return cluster.check_nodes_ready()

    def nodes_vm_status(self):
        return cluster.nodes_vm_status()

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
            "集群快照管理器",
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
