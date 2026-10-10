// ============ 主题 ============
let theme = localStorage.getItem('theme') || 'dark';
function applyTheme(t) {
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add('theme-' + t);
  localStorage.setItem('theme', t);
}
applyTheme(theme);
document.getElementById('themeBtn').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
});

// ============ 窗口按钮 ============
document.getElementById('minBtn').addEventListener('click', () => window.pywebview.api.minimize());
document.getElementById('maxBtn').addEventListener('click', () => window.pywebview.api.maximize());
document.getElementById('closeBtn').addEventListener('click', () => window.pywebview.api.close_win());

// ============ 标签页 ============
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + t.dataset.tab).classList.remove('hidden');
  });
});

// ============ 数据 ============
let VMS = [];

let loadingBg = false;

async function loadVms(force) {
  if (force === undefined) {
    // 第一屏：只拿虚拟机列表（不查快照，秒出）
    VMS = await window.pywebview.api.get_vms(false, false);
    renderAll();
    // 后台：扫快照 + 状态
    if (!loadingBg) {
      loadingBg = true;
      window.pywebview.api.get_vms(true, true).then(fresh => {
        VMS = fresh;
        renderAll();
        loadingBg = false;
      }).catch(() => { loadingBg = false; });
    }
  } else if (force) {
    VMS = await window.pywebview.api.get_vms(true, true);
    renderAll();
  } else {
    VMS = await window.pywebview.api.get_vms(false, true);
    renderAll();
  }
}

function renderAll() {
  renderOverview();
  renderOpsTargets();
  renderRuntime();
  renderDelSelectors();
  renderAliasList();
  renderRevSnaps();
}

function renderRevSnaps() {
  const sel = document.getElementById('revName');
  const cur = sel.value;
  const all = new Set();
  VMS.forEach(v => v.snapshots.forEach(s => all.add(s)));
  const names = Array.from(all).sort();
  sel.innerHTML = '<option value="">选择分支…</option>' +
    names.map(n => '<option value="' + n + '">' + n + '</option>').join('');
  if (cur) sel.value = cur;
  // 选分支 → 自动勾选有该快照的虚拟机（用户可再改）
  sel.onchange = () => {
    const branch = sel.value;
    if (!branch) return;
    revPicked.clear();
    VMS.forEach(v => { if (v.snapshots.includes(branch)) revPicked.add(v.vmx); });
    buildDD('revDDMenu', 'revDDLabel', revPicked);
    updateDDLabel('revDDLabel', revPicked);
  };
}

function renderOverview() {
  const box = document.getElementById('vmList');
  box.innerHTML = VMS.map(v => {
    const snaps = v.snapshots.map(s => '<span class="snap">' + s + '</span>').join('');
    const inner = snaps ? '<div class="snap-list">' + snaps + '</div>' : '<div class="empty">暂无快照</div>';
    const note = v.note ? '<span class="vm-role">' + v.note + '</span>' : '';
    let dotCls;
    if (!v.verified) dotCls = '';            // 灰：加载中（缓存，未验证）
    else if (!v.exists) dotCls = ' err';     // 红：失效
    else if (v.running) dotCls = ' on';      // 绿：运行中
    else dotCls = ' exist';                  // 蓝：存在未运行
    const dot = '<span class="status-dot' + dotCls + '"></span>';
    return '<div class="card"><div class="card-top"><div>' + dot +
      '<span class="vm-name">' + v.label + '</span>' + note + '</div>' +
      '<span class="vm-count">' + v.snapshots.length + ' 个</span></div>' + inner + '</div>';
  }).join('');
}

let snapPicked = new Set();
let revPicked = new Set();

function renderOpsTargets() {
  // 默认选中 master / 主节点
  if (snapPicked.size === 0 && revPicked.size === 0) {
    VMS.forEach(v => {
      const l = (v.label + v.note).toLowerCase();
      if (l.includes('master') || l.includes('主节点')) { snapPicked.add(v.vmx); revPicked.add(v.vmx); }
    });
  }
  buildDD('snapDDMenu', 'snapDDLabel', snapPicked);
  buildDD('revDDMenu', 'revDDLabel', revPicked);
  updateDDLabel('snapDDLabel', snapPicked);
  updateDDLabel('revDDLabel', revPicked);
}

function buildDD(menuId, labelId, picked) {
  const menu = document.getElementById(menuId);
  menu.innerHTML = VMS.map(v =>
    '<label class="dd-item"><input type="checkbox" value="' + v.vmx + '"' +
    (picked.has(v.vmx) ? ' checked' : '') + '>' + v.label + '</label>'
  ).join('');
  menu.querySelectorAll('input').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) picked.add(cb.value); else picked.delete(cb.value);
      updateDDLabel(labelId, picked);
    });
  });
}

function updateDDLabel(labelId, picked) {
  const el = document.getElementById(labelId);
  if (picked.size === 0) { el.textContent = '选择虚拟机'; return; }
  const names = VMS.filter(v => picked.has(v.vmx)).map(v => v.label);
  el.textContent = names.join('、');
}

function renderRuntime() {
  const running = VMS.filter(v => v.running);
  document.getElementById('runList').innerHTML = running.length
    ? running.map(v => '<div class="card"><span class="dot dot-on"></span><span class="vm-name">' + v.label + '</span></div>').join('')
    : '<div class="card"><span class="dot dot-off"></span><span class="empty" style="margin:0">当前没有运行中的虚拟机</span></div>';
  document.getElementById('opVm').innerHTML = VMS.map(v => '<option value="' + v.vmx + '">' + v.label + '</option>').join('');
}

function renderDelSelectors() {
  const sel = document.getElementById('delVm');
  sel.innerHTML = VMS.map(v => '<option value="' + v.vmx + '">' + v.label + '</option>').join('');
  const update = () => {
    const v = VMS.find(x => x.vmx === sel.value);
    const snaps = v ? v.snapshots : [];
    const snapSel2 = document.getElementById('delSnap');
    const delBtn = document.getElementById('doDel');
    if (snaps.length === 0) {
      snapSel2.innerHTML = '<option>（无快照）</option>';
      snapSel2.disabled = true;
      delBtn.disabled = true;
    } else {
      snapSel2.innerHTML = snaps.map(s => '<option>' + s + '</option>').join('');
      snapSel2.disabled = false;
      delBtn.disabled = false;
    }
  };
  sel.onchange = update;
  update();
}

function renderAliasList() {
  document.getElementById('aliasList').innerHTML = VMS.map(v =>
    '<div class="alias-row" data-vmx="' + v.vmx + '">' +
    '<span class="alias-file">' + v.name + '</span>' +
    '<input class="a-name" placeholder="显示名" value="' + (v.label !== v.name ? v.label : '') + '">' +
    '<input class="a-note" placeholder="备注（灰色小字）" value="' + (v.note || '') + '">' +
    '</div>'
  ).join('');
}

// ============ 操作 ============
async function doSnap() {
  const name = document.getElementById('snapName').value.trim();
  const box = document.getElementById('snapResult');
  const targets = Array.from(snapPicked);
  if (!name || targets.length === 0) { box.innerHTML = '<span class="err">请填快照名并选目标</span>'; return; }
  box.textContent = '执行中…';
  let html = '';
  for (const vmx of targets) {
    const r = await window.pywebview.api.snapshot(vmx, name);
    const v = VMS.find(x => x.vmx === vmx);
    html += '<div class="' + (r.ok ? 'ok' : 'err') + '">' + v.label + ' — ' + (r.ok ? '完成' : r.out) + '</div>';
  }
  box.innerHTML = html;
  loadVms();
}

async function doRev() {
  const name = document.getElementById('revName').value.trim();
  const box = document.getElementById('revResult');
  const targets = Array.from(revPicked);
  if (!name || targets.length === 0) { box.innerHTML = '<span class="err">请填快照名并选目标</span>'; return; }
  box.textContent = '执行中…';
  let html = '';
  for (const vmx of targets) {
    const r = await window.pywebview.api.revert(vmx, name);
    const v = VMS.find(x => x.vmx === vmx);
    html += '<div class="' + (r.ok ? 'ok' : 'err') + '">' + v.label + ' — ' + (r.ok ? '完成' : r.out) + '</div>';
  }
  box.innerHTML = html;
}

async function doDel() {
  const snapSel2 = document.getElementById('delSnap');
  const vmx = document.getElementById('delVm').value;
  const snap = snapSel2.value;
  const box = document.getElementById('delResult');
  if (!snap || snap === '（无快照）' || snapSel2.disabled) return;
  const r = await window.pywebview.api.delete_snap(vmx, snap);
  box.innerHTML = '<div class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? '已删除' : r.out) + '</div>';
  loadVms();
}

async function doStart() {
  const vmx = document.getElementById('opVm').value;
  const r = await window.pywebview.api.start_vm(vmx);
  document.getElementById('opResult').innerHTML = '<div class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? '已启动' : r.out) + '</div>';
  loadVms();
}

async function doStop() {
  const vmx = document.getElementById('opVm').value;
  const r = await window.pywebview.api.stop_vm(vmx);
  document.getElementById('opResult').innerHTML = '<div class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? '已停止' : r.out) + '</div>';
  loadVms();
}

async function saveVmrun() {
  const p = document.getElementById('vmrunPath').value.trim();
  await window.pywebview.api.save_vmrun(p);
  alert('已保存');
}

async function saveAllAlias() {
  const rows = document.querySelectorAll('#aliasList .alias-row');
  for (const row of rows) {
    const vmx = row.dataset.vmx;
    const name = row.querySelector('.a-name').value.trim();
    const note = row.querySelector('.a-note').value.trim();
    await window.pywebview.api.save_alias(vmx, name, note);
  }
  alert('已保存');
  loadVms();
}

// ============ 绑定 ============
document.getElementById('refreshOverview').addEventListener('click', () => loadVms(false));
document.getElementById('rescanVms').addEventListener('click', () => loadVms(true));
document.getElementById('refreshRun').addEventListener('click', loadVms);
document.getElementById('doSnap').addEventListener('click', doSnap);
document.getElementById('doRev').addEventListener('click', doRev);
document.getElementById('doDel').addEventListener('click', doDel);
document.getElementById('doStart').addEventListener('click', doStart);
document.getElementById('doStop').addEventListener('click', doStop);
document.getElementById('saveVmrun').addEventListener('click', saveVmrun);
document.getElementById('saveAllAlias').addEventListener('click', saveAllAlias);

// 下拉复选框开关
function bindDD(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.contains('open');
    document.querySelectorAll('.dd-menu').forEach(m => m.classList.remove('open'));
    if (!open) menu.classList.add('open');
  });
  menu.addEventListener('click', e => e.stopPropagation());
}
bindDD('snapDDBtn', 'snapDDMenu');
bindDD('revDDBtn', 'revDDMenu');
document.addEventListener('click', () => {
  document.querySelectorAll('.dd-menu').forEach(m => m.classList.remove('open'));
});

// ============ 启动 ============
window.addEventListener('pywebviewready', async () => {
  const s = await window.pywebview.api.get_settings();
  document.getElementById('vmrunPath').value = s.vmrun || '';
  loadVms();
});
