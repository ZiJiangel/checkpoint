# Snapshot Manager

A small desktop tool for managing VMware virtual machine snapshots (branches). Create, revert, and track VM snapshots the way you'd switch Git branches.

> Current version: **v0.1.0**

---

## Features

- **Auto-discovery**: reads VMware's records to find local VMs automatically (with caching for instant startup)
- **Snapshot management**: create snapshots, switch branches (revert), delete snapshots
- **Batch operations**: select multiple VMs and create/revert the same snapshot at once
- **Custom labels**: give each VM a display name inside the app (e.g. "master") without renaming the VM itself
- **Status dots**: gray = loading / blue = exists / green = running / red = path invalid
- **Light & dark themes**: one-click switch, applied across the whole window
- **Frameless window**: custom title bar (no native Windows title bar)
- **Runtime status**: view running VMs, start/stop them
- **Error handling**: global exception capture, written to `error.log` with a dialog

---

## Screenshots

> To be added (run it yourself to see).

---

## Usage

### Option 1: Standalone executable (recommended)

1. Download `snapshot-manager-v0.1.0.exe`
2. Double-click to run. No installation needed.

**Requirement**: VMware Workstation / Player must be installed (the app uses its bundled `vmrun.exe`).

### Option 2: Run from source

```bash
# 1. Install dependency
pip install pywebview

# 2. Run
python app.py
```

---

## Tech Stack

- **pywebview**: Python + embedded WebView for the desktop window
- **Frontend**: vanilla HTML / CSS / JavaScript (no framework)
- **Backend**: Python (calls VMware's `vmrun` CLI)
- **Packaging**: PyInstaller (standalone exe) + Inno Setup (installer)

---

## Project Structure

```
.
├── app.py          # Main program (pywebview window + API)
├── core.py         # Core logic (scanning, vmrun, snapshot ops)
├── web/            # Frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── icon.ico        # App icon
├── icon.svg        # Icon source
├── launcher.c      # Portable launcher source (optional)
└── setup.iss       # Inno Setup script
```

---

## Config Files

Generated at runtime **next to the program**:

- `settings.json` — settings (vmrun path, etc.)
- `aliases.json` — VM display names / notes
- `vms_cache.json` — VM scan cache
- `error.log` — error log (if any exception occurs)

---

## Changelog

- **v0.1.0** (2026-10-10): First release. Auto-discovery, snapshot management, labels, theme switch, installer.

---

## License

MIT License
