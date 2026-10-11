// ============ 自绘弹窗 ============
function showModal(opts) {
  return new Promise((resolve) => {
    const mask = document.getElementById('modalMask');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const okBtn = document.getElementById('modalOk');
    const cancelBtn = document.getElementById('modalCancel');
    titleEl.textContent = opts.title || (typeof t === 'function' ? t('app.name') : '提示');
    bodyEl.textContent = opts.body || '';
    cancelBtn.style.display = opts.confirm ? '' : 'none';
    okBtn.textContent = opts.okText || (typeof t === 'function' ? t('btn.ok') : '确定');
    cancelBtn.textContent = opts.cancelText || (typeof t === 'function' ? t('btn.cancel') : '取消');
    mask.classList.remove('hidden');
    const done = (val) => {
      mask.classList.add('hidden');
      okBtn.onclick = null; cancelBtn.onclick = null;
      resolve(val);
    };
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = () => done(false);
  });
}
function uiAlert(body, title) { return showModal({ body: body, title: title, confirm: false }); }
function uiConfirm(body, title) { return showModal({ body: body, title: title, confirm: true }); }

// 节点表单弹窗（新建/编辑节点，一步填全）
function uiNodeForm(title, init) {
  init = init || {};
  return new Promise((resolve) => {
    const mask = document.getElementById('modalMask');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const okBtn = document.getElementById('modalOk');
    const cancelBtn = document.getElementById('modalCancel');
    titleEl.textContent = title || '';
    const vmOpts = '<option value="">' + t('cl.noVmLink') + '</option>' +
      VMS.map(v => '<option value="' + v.vmx.replace(/"/g, '&quot;') + '"' +
        (v.vmx === init.vmx ? ' selected' : '') + '>' + v.label + '</option>').join('');
    const roleOpts = ['master', 'worker', 'ntp', 'kdc'].map(r =>
      '<option value="' + r + '"' + ((init.role || 'worker') === r ? ' selected' : '') + '>' + r + '</option>').join('');
    bodyEl.innerHTML =
      field('f-vmx', t('cl.linkVm'), '<select class="f-vmx">' + vmOpts + '</select>') +
      field('f-name', t('cl.fName'), '<input class="f-name" value="' + esc(init.name) + '">') +
      field('f-host', t('cl.fHost'), '<input class="f-host" value="' + esc(init.host) + '">') +
      field('f-port', t('cl.fPort'), '<input class="f-port" value="' + (init.port || 22) + '">') +
      field('f-user', t('cl.fUser'), '<input class="f-user" value="' + esc(init.user || 'root') + '">') +
      field('f-pass', t('cl.fPass'), '<input class="f-pass" type="password" value="' + esc(init.pass) + '">') +
      field('f-role', t('cl.fRole'), '<select class="f-role">' + roleOpts + '</select>');
    cancelBtn.style.display = '';
    mask.classList.remove('hidden');
    // 选 VM → 自动填名称 + 带出其他集群里该 VM 的 IP/密码
    const vmSel = bodyEl.querySelector('.f-vmx');
    vmSel.addEventListener('change', async () => {
      const vmx = vmSel.value;
      const vm = VMS.find(v => v.vmx === vmx);
      const ni = bodyEl.querySelector('.f-name');
      if (vm && ni && !ni.value.trim()) ni.value = vm.label;
      // 查"其他集群里关联同一 VM 的节点"，带出 IP/密码
      if (vmx) {
        try {
          const known = await window.pywebview.api.known_vm_config(vmx);
          if (known && known.host) {
            const set = (s, v) => { const el = bodyEl.querySelector(s); if (el) el.value = v; };
            set('.f-host', known.host);
            set('.f-user', known.user || 'root');
            set('.f-pass', known.pass || '');
            set('.f-port', known.port || 22);
          }
        } catch (e) {}
      }
    });
    setTimeout(() => bodyEl.querySelector('.f-name').focus(), 50);
    const done = (val) => { mask.classList.add('hidden'); okBtn.onclick = null; cancelBtn.onclick = null; resolve(val); };
    okBtn.onclick = () => {
      const g = (s) => (bodyEl.querySelector(s) || {}).value || '';
      done(Object.assign({}, init, {
        vmx: g('.f-vmx'),
        name: g('.f-name').trim(),
        host: g('.f-host').trim(),
        port: parseInt(g('.f-port')) || 22,
        user: g('.f-user').trim(),
        pass: g('.f-pass'),
        role: g('.f-role'),
      }));
    };
    cancelBtn.onclick = () => done(null);
  });
}
function field(cls, label, ctrl) {
  return '<div class="form-row" style="margin-top:0.5rem"><span class="ff-label">' + label + '</span>' + ctrl + '</div>';
}
function esc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

// 带下拉选择的弹窗（返回选中值，取消返回 null）
function uiPick(title, optionsHtml) {
  return new Promise((resolve) => {
    const mask = document.getElementById('modalMask');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const okBtn = document.getElementById('modalOk');
    const cancelBtn = document.getElementById('modalCancel');
    titleEl.textContent = title || '';
    bodyEl.innerHTML = '<select class="prompt-input" style="width:100%">' + optionsHtml + '</select>';
    cancelBtn.style.display = '';
    mask.classList.remove('hidden');
    const sel = bodyEl.querySelector('.prompt-input');
    setTimeout(() => sel.focus(), 50);
    const done = (val) => { mask.classList.add('hidden'); okBtn.onclick = null; cancelBtn.onclick = null; resolve(val); };
    okBtn.onclick = () => done(sel.value);
    cancelBtn.onclick = () => done(null);
  });
}

// 带输入框的弹窗（返回输入的字符串，取消返回 null）
function uiPrompt(title, defaultVal) {
  return new Promise((resolve) => {
    const mask = document.getElementById('modalMask');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const okBtn = document.getElementById('modalOk');
    const cancelBtn = document.getElementById('modalCancel');
    titleEl.textContent = title || '';
    bodyEl.innerHTML = '<input class="prompt-input" style="width:100%" value="' +
      (defaultVal || '').replace(/"/g, '&quot;') + '">';
    cancelBtn.style.display = '';
    mask.classList.remove('hidden');
    const input = bodyEl.querySelector('.prompt-input');
    setTimeout(() => input.focus(), 50);
    const done = (val) => {
      mask.classList.add('hidden');
      okBtn.onclick = null; cancelBtn.onclick = null;
      resolve(val);
    };
    okBtn.onclick = () => done(input.value.trim() || null);
    cancelBtn.onclick = () => done(null);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
      else if (e.key === 'Escape') done(null);
    });
  });
}

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

// ============ 视图导航（左栏 + 右区，vCenter 式）============
let AUTO_CHECK = true;    // 由设置加载
let CHECKED_ONCE = false;  // 避免反复体检

function showView(name) {
  const doSwitch = () => {
    ['cluster', 'node', 'vm', 'settings'].forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== name);
    });
  };
  // View Transitions API（现代浏览器平滑过渡；不支持则直接切）
  if (document.startViewTransition) {
    document.startViewTransition(doSwitch);
  } else {
    doSwitch();
  }
  if (name === 'cluster') {
    loadVmware();
    if (AUTO_CHECK && !CHECKED_ONCE && NODES.length) {
      CHECKED_ONCE = true;
      runHealthCheck();
    }
  }
}

// 渲染左栏（集群列表 + 虚拟机列表）
function renderSidebar() {
  const cn = document.getElementById('clusterNav');
  if (cn) {
    cn.innerHTML = CLUSTERS.map(c =>
      '<div class="nav-item' + (c === CURRENT_CLUSTER ? ' active' : '') + '" data-cluster="' + esc(c) + '">' +
      '<span class="nav-ico">▌</span>' + c + '</div>'
    ).join('');
    cn.querySelectorAll('[data-cluster]').forEach(el => {
      el.addEventListener('click', () => selectCluster(el.dataset.cluster));
    });
  }
  const vn = document.getElementById('vmNav');
  if (vn) {
    vn.innerHTML = VMS.map(v =>
      '<div class="nav-item' + (window._VM_SEL === v.vmx ? ' active' : '') + '" data-vm="' + esc(v.vmx) + '">' +
      '<span class="status-dot ' + (v.running ? 'st-green' : 'st-gray') + '"></span>' + v.label + '</div>'
    ).join('');
    vn.querySelectorAll('[data-vm]').forEach(el => {
      el.addEventListener('click', () => showVm(el.dataset.vm));
    });
  }
}

// 显示虚拟机视图
function showVm(vmx) {
  window._VM_SEL = vmx;
  renderSidebar();
  showView('vm');
  renderVmView(vmx);
}

function renderVmView(vmx) {
  const box = document.getElementById('vmDetail');
  const v = VMS.find(x => x.vmx === vmx);
  if (!v) { box.innerHTML = '<div class="empty">' + t('run.none') + '</div>'; return; }
  const dotCls = v.running ? 'st-green' : 'st-gray';
  const snaps = v.snapshots || [];
  let html = '<div class="obj-head">' +
    '<span class="status-dot ' + dotCls + '"></span>' +
    '<span class="obj-title">' + v.label + '</span>' +
    (v.note ? '<span class="obj-sub">' + v.note + '</span>' : '') +
    '<span class="bar-spacer"></span>' +
    '<span class="obj-badge">' + (v.running ? t('cl.vmOn') : t('cl.vmOff')) + '</span>' +
    '</div>' +
    '<div class="form-row" style="margin-bottom:0.8rem">' +
    '<button class="primary" id="vmStartBtn">' + t('btn.start') + '</button>' +
    '<button id="vmStopBtn">' + t('btn.stop') + '</button>' +
    '</div>' +
    '<div class="result" id="vmOpResult"></div>';
  // 快照区（树状）
  html += '<div class="card" style="margin-top:0.8rem">' +
    '<div class="bar-title" style="margin-bottom:0.5rem">' + t('cl.snapshots') + '（' + snaps.length + '）</div>' +
    '<div class="form-row">' +
    '<input class="vm-snapname" placeholder="' + t('ph.snapName') + '" style="max-width:240px">' +
    '<button class="primary" id="vmSnapCreate">' + t('btn.create') + '</button>' +
    '</div>' +
    '<div class="result" id="vmSnapResult"></div>';
  html += snaps.length ? snaps.map(s =>
    '<div class="svc-line" style="margin-top:0.5rem">' +
    '<span class="snap">' + s + '</span><span class="bar-spacer"></span>' +
    '<span class="svc-action" data-vm-snap-rev="' + s + '">' + t('btn.revert') + '</span>' +
    '<span class="svc-action" data-vm-snap-clone="' + s + '">' + t('cl.clone') + '</span>' +
    '<span class="svc-action" data-vm-snap-del="' + s + '" style="color:#e06c6c">' + t('btn.delete') + '</span>' +
    '</div>'
  ).join('') : '<div class="empty">' + t('ov.empty') + '</div>';
  html += '</div>';
  // 关联节点配置（若该 VM 在某集群里是节点）
  const linked = NODES.find(n => normVmx(n.vmx) === normVmx(vmx));
  html += '<div class="card" style="margin-top:0.8rem">' +
    '<div class="bar-title" style="margin-bottom:0.5rem">' + t('cl.nodeConfig') + '</div>';
  if (linked) {
    html += '<div class="form-row">' +
      '<input class="vc-host" value="' + esc(linked.host) + '" placeholder="IP / 主机名">' +
      '<input class="vc-port" value="' + (linked.port || 22) + '" placeholder="端口" style="max-width:90px">' +
      '</div>' +
      '<div class="form-row" style="margin-top:0.5rem">' +
      '<input class="vc-user" value="' + esc(linked.user) + '" placeholder="用户名">' +
      '<input class="vc-pass" type="password" value="' + esc(linked.pass) + '" placeholder="密码">' +
      '<select class="vc-role">' +
      ['master','worker','ntp','kdc'].map(r => '<option value="' + r + '"' + (linked.role === r ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select>' +
      '</div>' +
      '<div class="form-row" style="margin-top:0.5rem">' +
      '<input class="vc-note" value="' + esc(linked.note) + '" placeholder="备注">' +
      '<select class="vc-cluster">' +
      CLUSTERS.map(c => '<option value="' + esc(c) + '"' + (c === (linked.cluster || CURRENT_CLUSTER) ? ' selected' : '') + '>' + c + '</option>').join('') +
      '</select>' +
      '</div>' +
      '<div class="form-row" style="margin-top:0.7rem">' +
      '<button class="primary" id="vcSave">' + t('btn.save') + '</button>' +
      '<button id="vcTest">' + t('cl.test') + '</button>' +
      '</div>' +
      '<div class="result" id="vcResult"></div>';
  } else {
    html += '<div class="empty">' + t('cl.notInCluster') + '</div>' +
      '<button class="mini-btn" id="vcAddNode" style="margin-top:0.5rem">' + t('cl.addToCluster') + '</button>';
  }
  html += '</div>';
  box.innerHTML = html;

  // 绑定
  document.getElementById('vmStartBtn').addEventListener('click', async () => {
    const r = await window.pywebview.api.start_vm(vmx);
    document.getElementById('vmOpResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.started') : r.out) + '</span>';
    await loadVms();
  });
  document.getElementById('vmStopBtn').addEventListener('click', async () => {
    const r = await window.pywebview.api.stop_vm(vmx);
    document.getElementById('vmOpResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.stopped') : r.out) + '</span>';
    await loadVms();
  });
  document.getElementById('vmSnapCreate').addEventListener('click', async () => {
    const name = box.querySelector('.vm-snapname').value.trim();
    const res = document.getElementById('vmSnapResult');
    if (!name) { res.innerHTML = '<span class="err">' + t('ops.needName') + '</span>'; return; }
    res.textContent = t('ops.running');
    const r = await window.pywebview.api.snapshot(vmx, name);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>';
    await loadVms(false, true);
    renderVmView(vmx);
  });
  box.querySelectorAll('[data-vm-snap-rev]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.vmSnapRev;
    if (!await uiConfirm(t('ops.revert') + '：' + s + ' ?')) return;
    const r = await window.pywebview.api.revert(vmx, s);
    document.getElementById('vmSnapResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>';
    await loadVms(false, true);
    renderVmView(vmx);
  }));
  box.querySelectorAll('[data-vm-snap-del]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.vmSnapDel;
    if (!await uiConfirm(t('ops.delete') + '：' + s + ' ?')) return;
    const r = await window.pywebview.api.delete_snap(vmx, s);
    document.getElementById('vmSnapResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.deleted') : r.out) + '</span>';
    await loadVms(false, true);
    renderVmView(vmx);
  }));
  box.querySelectorAll('[data-vm-snap-clone]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.vmSnapClone;
    if (!await uiConfirm('基于快照「' + s + '」克隆一台新虚拟机？（需该 VM 已关机/挂起）')) return;
    const dst = await uiPrompt('新虚拟机 .vmx 完整路径', vmx.replace(/\.vmx$/i, '_clone.vmx'));
    if (!dst) return;
    document.getElementById('vmSnapResult').textContent = '克隆中…（可能较慢）';
    const r = await window.pywebview.api.clone_vm(vmx, dst, s, 'full');
    document.getElementById('vmSnapResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? '克隆完成：' + dst : r.out) + '</span>';
    await loadVms(true);
  }));
  // 节点配置：保存 / 测试
  const vcSave = document.getElementById('vcSave');
  if (vcSave) vcSave.addEventListener('click', async () => {
    const g = (s) => (box.querySelector(s) || {}).value || '';
    const node = Object.assign({}, linked, {
      vmx: vmx,
      host: g('.vc-host').trim(),
      port: parseInt(g('.vc-port')) || 22,
      user: g('.vc-user').trim(),
      pass: g('.vc-pass'),
      role: g('.vc-role'),
      note: g('.vc-note').trim(),
      cluster: g('.vc-cluster'),
    });
    await window.pywebview.api.save_node(node);
    await loadClusters();
    await loadNodes();
    renderSidebar();
    renderVmView(vmx);
  });
  const vcTest = document.getElementById('vcTest');
  if (vcTest) vcTest.addEventListener('click', async () => {
    const g = (s) => (box.querySelector(s) || {}).value || '';
    const node = Object.assign({}, linked, {
      host: g('.vc-host').trim(), port: parseInt(g('.vc-port')) || 22,
      user: g('.vc-user').trim(), pass: g('.vc-pass'),
    });
    const r = await window.pywebview.api.test_node(node);
    document.getElementById('vcResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + r.out + '</span>';
  });
  const vcAdd = document.getElementById('vcAddNode');
  if (vcAdd) vcAdd.addEventListener('click', () => {
    addNodeWithVm(v.label, vmx);
  });
}

// 把某 VM 加为当前集群的节点
async function addNodeWithVm(name, vmx) {
  const node = await uiNodeForm(t('cl.add'), { name: name, vmx: vmx, user: 'root', role: 'worker', port: 22 });
  if (!node) return;
  node.cluster = CURRENT_CLUSTER;
  const r = await window.pywebview.api.save_node(node);
  await loadClusters();
  await loadNodes();
  renderSidebar();
  renderVmView(vmx);
}

async function selectCluster(name) {
  await switchCluster(name);
  renderSidebar();
  showView('cluster');
}

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
  renderAliasList();
  renderSidebar();
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
  if (picked.size === 0) { el.textContent = t('dd.select'); return; }
  const names = VMS.filter(v => picked.has(v.vmx)).map(v => v.label);
  el.textContent = names.join('、');
}

function renderRuntime() {
  const running = VMS.filter(v => v.running);
  document.getElementById('runList').innerHTML = running.length
    ? running.map(v => '<div class="card"><span class="dot dot-on"></span><span class="vm-name">' + v.label + '</span></div>').join('')
    : '<div class="card"><span class="dot dot-off"></span><span class="empty" style="margin:0">' + t('run.none') + '</span></div>';
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
      snapSel2.innerHTML = '<option>' + t('ops.noSnap') + '</option>';
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
    '<input class="a-name" placeholder="' + t('alias.name') + '" value="' + (v.label !== v.name ? v.label : '') + '">' +
    '<input class="a-note" placeholder="' + t('alias.note') + '" value="' + (v.note || '') + '">' +
    '</div>'
  ).join('');
}

// ============ 操作 ============
async function doSnap() {
  const name = document.getElementById('snapName').value.trim();
  const box = document.getElementById('snapResult');
  const targets = Array.from(snapPicked);
  if (!name || targets.length === 0) { box.innerHTML = '<span class="err">' + t('ops.needName') + '</span>'; return; }
  box.textContent = t('ops.running');
  let html = '';
  for (const vmx of targets) {
    const r = await window.pywebview.api.snapshot(vmx, name);
    const v = VMS.find(x => x.vmx === vmx);
    html += '<div class="' + (r.ok ? 'ok' : 'err') + '">' + v.label + ' — ' + (r.ok ? t('ops.done') : r.out) + '</div>';
  }
  box.innerHTML = html;
  loadVms();
}

async function doRev() {
  const name = document.getElementById('revName').value.trim();
  const box = document.getElementById('revResult');
  const targets = Array.from(revPicked);
  if (!name || targets.length === 0) { box.innerHTML = '<span class="err">' + t('ops.needName') + '</span>'; return; }
  box.textContent = t('ops.running');
  let html = '';
  for (const vmx of targets) {
    const r = await window.pywebview.api.revert(vmx, name);
    const v = VMS.find(x => x.vmx === vmx);
    html += '<div class="' + (r.ok ? 'ok' : 'err') + '">' + v.label + ' — ' + (r.ok ? t('ops.done') : r.out) + '</div>';
  }
  box.innerHTML = html;
  loadVms();
}

async function doDel() {
  const snapSel2 = document.getElementById('delSnap');
  const vmx = document.getElementById('delVm').value;
  const snap = snapSel2.value;
  const box = document.getElementById('delResult');
  if (!snap || snap === t('ops.noSnap') || snapSel2.disabled) return;
  const r = await window.pywebview.api.delete_snap(vmx, snap);
  box.innerHTML = '<div class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.deleted') : r.out) + '</div>';
  loadVms();
}

async function doStart() {
  const vmx = document.getElementById('opVm').value;
  const r = await window.pywebview.api.start_vm(vmx);
  document.getElementById('opResult').innerHTML = '<div class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.started') : r.out) + '</div>';
  loadVms();
  refreshVmStatus();
}

async function doStop() {
  const vmx = document.getElementById('opVm').value;
  const r = await window.pywebview.api.stop_vm(vmx);
  document.getElementById('opResult').innerHTML = '<div class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.stopped') : r.out) + '</div>';
  loadVms();
  refreshVmStatus();
}

async function saveVmrun() {
  const p = document.getElementById('vmrunPath').value.trim();
  await window.pywebview.api.save_vmrun(p);
  uiAlert(t('msg.saved'));
}

async function saveAllAlias() {
  const rows = document.querySelectorAll('#aliasList .alias-row');
  for (const row of rows) {
    const vmx = row.dataset.vmx;
    const name = row.querySelector('.a-name').value.trim();
    const note = row.querySelector('.a-note').value.trim();
    await window.pywebview.api.save_alias(vmx, name, note);
  }
  uiAlert(t('msg.saved'));
  loadVms();
}

// ============ 绑定 ============
document.getElementById('rescanVms').addEventListener('click', () => loadVms(true));
document.getElementById('clusterSnapCreate').addEventListener('click', createClusterSnap);
document.getElementById('snapSelectAll').addEventListener('click', () => { SNAP_PICKED = null; renderSnapPick(); });
document.getElementById('snapSelectNone').addEventListener('click', () => { SNAP_PICKED = new Set(); renderSnapPick(); });
document.getElementById('saveVmrun').addEventListener('click', saveVmrun);
document.getElementById('saveAllAlias').addEventListener('click', saveAllAlias);
const _navSet = document.getElementById('navSettings');
if (_navSet) _navSet.addEventListener('click', () => showView('settings'));
const _nodeBack = document.getElementById('nodeBack');
if (_nodeBack) _nodeBack.addEventListener('click', () => showView('cluster'));
const _vmBack = document.getElementById('vmBack');
if (_vmBack) _vmBack.addEventListener('click', () => { window._VM_SEL = null; renderSidebar(); showView('cluster'); });

// ============ 关于 / 检查更新 ============
document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
  const msg = document.getElementById('updateMsg');
  msg.textContent = t('upd.checking');
  try {
    const r = await window.pywebview.api.check_update();
    if (r.has) {
      msg.innerHTML = t('upd.found') + ' <b>v' + r.latest + '</b> ' +
        '<a href="#" id="dlLink" style="color:#5b8def">' + t('upd.go') + '</a>';
      const link = document.getElementById('dlLink');
      if (link) link.addEventListener('click', (e) => {
        e.preventDefault();
        window.pywebview.api.open_url(r.url);
      });
    } else {
      msg.textContent = t('upd.latest') + ' (v' + (r.current || '') + ')';
    }
  } catch (e) {
    msg.textContent = t('upd.failed') + ': ' + e;
  }
});

// ============ 语言切换 ============
function initLang(lang) {
  currentLang = lang || 'zh';
  const sel = document.getElementById('langSelect');
  if (sel) sel.value = currentLang;
  applyI18n();
}
document.getElementById('langSelect').addEventListener('change', (e) => {
  currentLang = e.target.value;
  window.pywebview.api.save_lang(currentLang);
  applyI18n();
  renderAll();       // 重渲染（动态文字也换语言）
});

// ============ 集群节点 ============
let NODES = [];
let HEALTH = {};       // id -> 健康结果
let VM_STATUS = {};    // id -> {running, has_vmx}
let CLUSTERS = [];     // 集群名列表
let CURRENT_CLUSTER = '';

async function loadClusters() {
  CLUSTERS = await window.pywebview.api.get_clusters();
  CURRENT_CLUSTER = await window.pywebview.api.get_current_cluster();
}

async function switchCluster(name) {
  CURRENT_CLUSTER = name;
  await window.pywebview.api.set_current_cluster(name);
  HEALTH = {};          // 切换集群后清空体检结果
  await loadNodes();
  renderSidebar();
}

async function newCluster() {
  const name = await uiPrompt(t('cl.newClusterName'));
  if (!name) return;
  await switchCluster(name);
  await loadClusters();
}

async function loadNodes() {
  NODES = await window.pywebview.api.get_nodes();
  renderNodes();
  renderClusterCard();
  renderClusterOverview();
  renderClusterSnap();
  refreshVmStatus();
}

// 载入上次的体检结果（持久化，重开软件仍可见）
async function loadHealthCache() {
  try {
    const cache = await window.pywebview.api.load_health_cache();
    if (cache && cache.results) {
      HEALTH = {};
      cache.results.forEach(r => { HEALTH[r.id] = r; });
      renderNodes();
      renderClusterCard();
      renderClusterOverview();
    }
  } catch (e) {}
}

// 新建集群
document.getElementById('clusterNew').addEventListener('click', newCluster);
document.getElementById('clusterTpl').addEventListener('click', createFromTemplate);

async function createFromTemplate() {
  const tpls = await window.pywebview.api.list_templates();
  const opts = tpls.map(tp => '<option value="' + tp.id + '">' + tp.name + '（' + tp.count + ' 节点）</option>').join('');
  const tid = await uiPick(t('cl.pickTemplate'), opts);
  if (!tid) return;
  const cname = await uiPrompt(t('cl.templateClusterName'), '新集群');
  if (!cname) return;
  await window.pywebview.api.create_from_template(tid, cname);
  await loadClusters();
  await switchCluster(cname);
}

async function refreshVmStatus(force) {
  let next;
  try {
    next = await window.pywebview.api.nodes_vm_status();
  } catch (e) { next = {}; }
  // 仅当状态变化（或 force）时才重渲染，避免打断用户操作
  const changed = JSON.stringify(next) !== JSON.stringify(VM_STATUS);
  VM_STATUS = next;
  if (changed || force) {
    renderNodes();
    renderClusterCard();
    renderClusterSnap();
  }
}

function healthStatusOf(id) {
  return HEALTH[id] ? HEALTH[id].status : 'gray';
}

// 状态严重度：取最严重（vSphere 规则）。off(关机) 比 gray 高，比 yellow 低
const SEVERITY = { gray: 0, off: 1, green: 2, yellow: 3, red: 4 };

function renderClusterCard() {
  const box = document.getElementById('clusterCard');
  if (!box) return;
  if (NODES.length === 0) { box.innerHTML = ''; return; }

  // 聚合：集群状态 = 最差节点状态
  let worst = 'gray', counts = { green: 0, yellow: 0, red: 0, gray: 0, off: 0 };
  NODES.forEach(n => {
    const st = healthStatusOf(n.id);
    counts[st] = (counts[st] || 0) + 1;
    if (SEVERITY[st] > SEVERITY[worst]) worst = st;
  });

  const label = { green: '健康', yellow: '部分异常', red: '异常', gray: '未检查', off: '关机' }[worst];
  const parts = [];
  if (counts.green) parts.push('<span class="ok">' + counts.green + ' 正常</span>');
  if (counts.yellow) parts.push('<span style="color:#e0b34a">' + counts.yellow + ' 部分异常</span>');
  if (counts.red) parts.push('<span class="err">' + counts.red + ' 异常</span>');
  if (counts.off) parts.push('<span class="vm-role">' + counts.off + ' 关机</span>');
  if (counts.gray) parts.push('<span class="vm-role">' + counts.gray + ' 未检查</span>');

  // 紧凑状态条（一行）
  box.innerHTML =
    '<div class="bar" style="border-left:3px solid ' + severityColor(worst) + '">' +
    '<span class="status-dot st-' + worst + '"></span>' +
    '<span class="bar-title">集群</span>' +
    '<span class="bar-text">' + label + '</span>' +
    '<span class="bar-spacer"></span>' +
    '<span style="display:flex;gap:0.8rem;font-size:0.8rem">' + parts.join('') + '</span>' +
    '<span class="vm-count">' + NODES.length + ' 台</span>' +
    '</div>';
}

// 集群快照：哪些节点被选中（默认全选）
let SNAP_PICKED = null;   // null = 全选（未初始化）

function snapPickedNodes() {
  if (SNAP_PICKED === null) return NODES.filter(n => n.vmx);   // 默认全部（配了 vmx 的）
  return NODES.filter(n => n.vmx && SNAP_PICKED.has(n.id));
}

function renderSnapPick() {
  const box = document.getElementById('snapNodePick');
  if (!box) return;
  const withVmx = NODES.filter(n => n.vmx);
  if (withVmx.length === 0) { box.innerHTML = ''; return; }
  const sel = snapPickedNodes();
  const selIds = new Set(sel.map(n => n.id));
  box.innerHTML = withVmx.map(n =>
    '<label class="snap-chip' + (selIds.has(n.id) ? ' on' : '') + '" data-snapnode="' + n.id + '">' +
    '<span class="snap-tick">✓</span>' + n.name + '</label>'
  ).join('');
  box.querySelectorAll('[data-snapnode]').forEach(cb => {
    cb.addEventListener('click', () => {
      if (SNAP_PICKED === null) SNAP_PICKED = new Set(withVmx.map(n => n.id));   // 首次：从"全选"固化
      const id = cb.dataset.snapnode;
      const on = selIds.has(id);
      if (on) SNAP_PICKED.delete(id); else SNAP_PICKED.add(id);
      renderSnapPick();
    });
  });
}

// 集群快照：按节点列出各 VM 的快照 + 批量打
function renderClusterSnap() {
  renderSnapPick();
  const box = document.getElementById('clusterSnapList');
  if (!box) return;
  if (NODES.length === 0) { box.innerHTML = ''; return; }
  // 汇总：每个快照名 → 哪些节点有
  const nameMap = {};   // snapName -> [nodeName...]
  NODES.forEach(n => {
    const vm = VMS.find(v => normVmx(v.vmx) === normVmx(n.vmx));
    const snaps = vm ? vm.snapshots : [];
    snaps.forEach(s => { (nameMap[s] = nameMap[s] || []).push(n.name); });
  });
  const names = Object.keys(nameMap).sort();
  if (names.length === 0) { box.innerHTML = '<div class="empty">' + t('ov.empty') + '</div>'; return; }
  box.innerHTML = names.map(s => {
    const nodesWith = nameMap[s];
    const all = nodesWith.length === NODES.length;
    return '<div class="node-row">' +
      '<span class="snap">' + s + '</span>' +
      '<span class="vm-role">' + nodesWith.length + '/' + NODES.length + ' 台' + (all ? '（全集群）' : '') + '</span>' +
      '<span class="bar-spacer"></span>' +
      '<span class="svc-action" data-cluster-rev="' + esc(s) + '">' + t('btn.revert') + '</span>' +
      '</div>';
  }).join('');
  box.querySelectorAll('[data-cluster-rev]').forEach(el => el.addEventListener('click', () => revertClusterSnap(el.dataset.clusterRev)));
}

async function createClusterSnap() {
  const name = document.getElementById('clusterSnapName').value.trim();
  const res = document.getElementById('clusterSnapResult');
  if (!name) { res.innerHTML = '<span class="err">' + t('ops.needName') + '</span>'; return; }
  const targets = snapPickedNodes();
  if (targets.length === 0) { res.innerHTML = '<span class="err">' + t('cl.noVmxNodes') + '</span>'; return; }
  res.textContent = t('ops.running');
  let ok = 0, fail = 0;
  for (const n of targets) {
    try {
      const r = await window.pywebview.api.snapshot(n.vmx, name);
      if (r.ok) ok++; else fail++;
    } catch (e) { fail++; }
    res.textContent = t('ops.running') + ' (' + (ok + fail) + '/' + targets.length + ')';
  }
  res.innerHTML = '<span class="' + (fail === 0 ? 'ok' : 'err') + '">' +
    ok + ' 台成功' + (fail ? '，' + fail + ' 台失败' : '') + '</span>';
  await loadVms(false, true);
  renderClusterSnap();
}

async function revertClusterSnap(name) {
  if (!await uiConfirm(t('ops.revert') + '（整个集群）：' + name + ' ?')) return;
  const res = document.getElementById('clusterSnapResult');
  const targets = NODES.filter(n => n.vmx);
  res.textContent = t('ops.running');
  let ok = 0, fail = 0;
  for (const n of targets) {
    const vm = VMS.find(v => normVmx(v.vmx) === normVmx(n.vmx));
    if (!vm || !vm.snapshots.includes(name)) continue;   // 该节点没这个快照，跳过
    try {
      const r = await window.pywebview.api.revert(n.vmx, name);
      if (r.ok) ok++; else fail++;
    } catch (e) { fail++; }
    res.textContent = t('ops.running') + ' (' + (ok + fail) + ')';
  }
  res.innerHTML = '<span class="' + (fail === 0 ? 'ok' : 'err') + '">回滚：' + ok + ' 台成功' + (fail ? '，' + fail + ' 台失败' : '') + '</span>';
  await loadVms(false, true);
}

// 集群概览（vSphere 摘要式）：健康分布 / 异常节点 / 快照 / 角色分布
function renderClusterOverview() {
  const box = document.getElementById('clusterOverview');
  if (!box) return;
  if (NODES.length === 0) { box.innerHTML = ''; return; }

  // 健康分布
  const counts = { green: 0, yellow: 0, red: 0, off: 0, gray: 0 };
  const bad = [];
  NODES.forEach(n => {
    const st = healthStatusOf(n.id);
    counts[st] = (counts[st] || 0) + 1;
    if (st === 'red' || st === 'yellow') bad.push({ name: n.name, st: st });
  });
  // 角色分布
  const roles = {};
  NODES.forEach(n => { const r = n.role || 'worker'; roles[r] = (roles[r] || 0) + 1; });
  // 快照汇总
  const snapNames = new Set();
  NODES.forEach(n => {
    const vm = VMS.find(v => normVmx(v.vmx) === normVmx(n.vmx));
    if (vm) vm.snapshots.forEach(s => snapNames.add(s));
  });

  const part = (label, val, cls) =>
    '<div class="ov-item"><div class="ov-num ' + (cls || '') + '">' + val + '</div>' +
    '<div class="ov-label">' + label + '</div></div>';

  box.innerHTML = '<div class="ov-row">' +
    part(t('ov.nodes'), NODES.length, '') +
    part(t('ov.ok'), counts.green, 'ok') +
    part(t('ov.warn'), counts.yellow + counts.red, (counts.red || counts.yellow) ? 'err' : '') +
    part(t('ov.gray'), counts.gray, '') +
    part(t('ov.off'), counts.off, '') +
    part(t('ov.snaps'), snapNames.size, '') +
    '</div>' +
    (bad.length ? '<div class="svc-line err" style="margin-top:0.5rem">⚠ ' +
      t('ov.alertNodes') + '：' + bad.map(b => b.name).join('、') + '</div>' :
      (counts.gray === NODES.length ? '<div class="svc-line" style="margin-top:0.5rem;color:var(--muted)">' +
        t('ov.notCheckedHint') + '</div>' : ''));
}

function severityColor(s) {
  return { green: '#3ecf8e', yellow: '#e0b34a', red: '#e06c6c', gray: '#8a8a94', off: '#8a8a94' }[s] || '#8a8a94';
}

function renderNodes() {
  const box = document.getElementById('nodeList');
  const cnt = document.getElementById('nodeCount');
  if (cnt) cnt.textContent = NODES.length;
  if (NODES.length === 0) {
    box.innerHTML = '<div class="card"><div class="empty">' + t('cl.empty') + '</div></div>';
    return;
  }
  box.innerHTML = NODES.map(n => {
    const st = healthStatusOf(n.id);
    const dot = '<span class="status-dot st-' + st + '"></span>';
    const role = '<span class="vm-role">' + (n.role || 'worker') + '</span>';
    const host = '<span class="vm-role">' + n.host + '</span>';
    const note = n.note ? '<span class="vm-role">' + n.note + '</span>' : '';
    // VM 开机/关机 徽标
    const vm = VM_STATUS[n.id];
    let vmBadge = '';
    if (vm && vm.has_vmx) {
      vmBadge = vm.running
        ? '<span class="vm-power on">● ' + t('cl.vmOn') + '</span>'
        : '<span class="vm-power off">○ ' + t('cl.vmOff') + '</span>';
    } else if (vm && !vm.has_vmx) {
      vmBadge = '<span class="vm-power none">— ' + t('cl.noVmx') + '</span>';
    }
    const expanded = (window._DETAIL_ID === n.id);
    let row = '<div class="node-row' + (expanded ? ' selected' : '') + '" data-id="' + n.id + '">' +
      dot +
      '<span class="vm-name">' + n.name + '</span>' + role + host + note +
      '<span class="bar-spacer"></span>' + vmBadge +
      '<span class="vm-count" style="cursor:pointer" data-del="' + n.id + '">删除</span>' +
      '</div>';
    // 就地展开：健康详情
    if (expanded) row += '<div class="node-expand">' + renderHealthInline(n) + '</div>';
    return row;
  }).join('');
  // 点击行 → 就地展开/收起健康；点击删除
  box.querySelectorAll('.node-row').forEach(r => {
    r.addEventListener('click', (e) => {
      if (e.target.dataset.del) { delNode(e.target.dataset.del); return; }
      const id = r.dataset.id;
      window._DETAIL_ID = (window._DETAIL_ID === id) ? null : id;
      renderNodes();
      if (window._DETAIL_ID === id) {
        // 自动体检一次（若没结果）
        if (!HEALTH[id]) runHealthCheck();
      }
    });
  });
}

// 节点健康（就地展开，不用跳页）
function renderHealthInline(n) {
  const h = HEALTH[n.id];
  const st = healthStatusOf(n.id);
  if (!h) return '<div class="empty">' + t('cl.notChecked') + '</div>';
  let html = '<div class="svc-line"><span class="vm-role">' + (h.detail || '') + '</span></div>';
  if (h.missing && h.missing.length)
    html += '<div class="svc-line err">缺进程：' + h.missing.join(', ') + '</div>';
  if (h.svcs_missing && h.svcs_missing.length)
    html += '<div class="svc-line err">缺服务：' + h.svcs_missing.join(', ') + '</div>';
  if (h.ports_missing && h.ports_missing.length)
    html += '<div class="svc-line err">缺端口：' + h.ports_missing.join(', ') + '</div>';
  const noProb = (!h.missing || !h.missing.length)
    && (!h.svcs_missing || !h.svcs_missing.length)
    && (!h.ports_missing || !h.ports_missing.length);
  if (noProb) html += '<div class="svc-line ok">全部检查通过</div>';
  else {
    // 人话诊断（异步填充）
    const id = 'diag_' + n.id;
    html += '<div id="' + id + '"></div>';
    setTimeout(async () => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = await diagnoseHtml(h.detail || '');
    }, 30);
  }
  return html;
}

let DETAIL_TAB = 'config';    // 当前节点详情的选项卡

function showDetail(id) {
  const n = NODES.find(x => x.id === id);
  if (!n) return;
  window._DETAIL_ID = id;
  const st = healthStatusOf(id);
  const statusText = { green: '正常', yellow: '部分异常', red: '异常', gray: '未检查', off: '关机' }[st] || '未知';

  // 选项卡栏
  const tabs = [
    ['health', '健康'], ['service', '服务'], ['snapshot', '快照'], ['config', '配置'],
  ];
  const tabBar = '<div class="detail-tabs">' + tabs.map(([k, label]) =>
    '<button class="detail-tab' + (DETAIL_TAB === k ? ' active' : '') + '" data-dtab="' + k + '">' + label + '</button>'
  ).join('') + '</div>';

  showView('node');
  document.getElementById('nodeDetail').innerHTML =
    '<div class="obj-head">' +
    '<span class="status-dot st-' + st + '"></span>' +
    '<span class="obj-title">' + n.name + '</span>' +
    '<span class="obj-sub">' + (n.role || '') + '</span>' +
    '<span class="bar-spacer"></span>' +
    '<span class="obj-badge st-' + st + '">' + statusText + '</span>' +
    '</div>' +
    tabBar +
    '<div id="detailBody"></div>';

  // 选项卡切换
  document.querySelectorAll('.detail-tab').forEach(b => {
    b.addEventListener('click', () => {
      DETAIL_TAB = b.dataset.dtab;
      showDetail(id);
    });
  });
  renderDetailBody(n);
}

function renderDetailBody(n) {
  const body = document.getElementById('detailBody');
  if (DETAIL_TAB === 'health') {
    body.innerHTML = renderHealthTab(n);
  } else if (DETAIL_TAB === 'service') {
    body.innerHTML = renderServiceTab(n);
  } else if (DETAIL_TAB === 'snapshot') {
    body.innerHTML = renderSnapshotTab(n);
    bindSnapshotTab(n);
  } else {
    body.innerHTML = renderConfigTab(n);
    document.getElementById('ndSave').addEventListener('click', () => saveDetail(n.id));
    document.getElementById('ndTest').addEventListener('click', () => testDetail(n));
    // 选虚拟机 → 自动填名称；IP 空着时带出已知配置
    const vmxSel = body.querySelector('.nd-vmx');
    if (vmxSel) vmxSel.addEventListener('change', async () => {
      const vmx = vmxSel.value;
      const vm = VMS.find(v => v.vmx === vmx);
      const nameInput = body.querySelector('.nd-name');
      if (vm && nameInput && (!nameInput.value.trim() || nameInput.value.trim() === '新节点')) {
        nameInput.value = vm.label;
      }
      const hostInput = body.querySelector('.nd-host');
      if (vmx && hostInput && !hostInput.value.trim()) {
        try {
          const known = await window.pywebview.api.known_vm_config(vmx);
          if (known && known.host) {
            body.querySelector('.nd-host').value = known.host;
            if (body.querySelector('.nd-user')) body.querySelector('.nd-user').value = known.user || 'root';
            if (body.querySelector('.nd-pass')) body.querySelector('.nd-pass').value = known.pass || '';
            if (body.querySelector('.nd-port')) body.querySelector('.nd-port').value = known.port || 22;
          }
        } catch (e) {}
      }
    });
  }
}

function renderHealthTab(n) {
  const h = HEALTH[n.id];
  if (!h) return '<div class="empty">' + t('cl.notChecked') + '</div>';
  let html = '<div class="result">' + (h.detail || '') + '</div>';
  if (h.missing && h.missing.length)
    html += '<div class="result err" style="margin-top:0.4rem">缺进程：' + h.missing.join(', ') + '</div>';
  if (h.svcs_missing && h.svcs_missing.length)
    html += '<div class="result err" style="margin-top:0.2rem">缺服务：' + h.svcs_missing.join(', ') + '</div>';
  if (h.ports_missing && h.ports_missing.length)
    html += '<div class="result err" style="margin-top:0.2rem">缺端口：' + h.ports_missing.join(', ') + '</div>';
  const noProb = (!h.missing || !h.missing.length)
    && (!h.svcs_missing || !h.svcs_missing.length)
    && (!h.ports_missing || !h.ports_missing.length);
  if (noProb) html += '<div class="result ok" style="margin-top:0.4rem">全部检查通过</div>';
  return html;
}

function renderServiceTab(n) {
  return '<div class="empty">' + t('cl.serviceHint') + '</div>';
}

function normVmx(p) { return (p || '').replace(/\\/g, '/').toLowerCase(); }

function renderSnapshotTab(n) {
  if (!n.vmx) return '<div class="empty">' + t('cl.noVmx') + '</div>';
  const vm = VMS.find(v => normVmx(v.vmx) === normVmx(n.vmx));
  const snaps = vm ? vm.snapshots : [];
  let html = '<div class="form-row" style="margin-top:0.6rem">' +
    '<input class="nd-snapname" placeholder="' + t('ph.snapName') + '" style="max-width:260px">' +
    '<button class="primary" id="ndSnapCreate">' + t('btn.create') + '</button>' +
    '</div>' +
    '<div class="result" id="ndSnapResult"></div>' +
    '<div style="margin-top:0.9rem;font-size:0.85rem" class="vm-role">' + t('cl.snapshots') + '（' + snaps.length + '）</div>';
  html += snaps.length ? snaps.map(s =>
    '<div class="card" style="margin-top:0.4rem;padding:0.5rem 0.7rem">' +
    '<div class="card-top"><span class="snap">' + s + '</span>' +
    '<div style="display:flex;gap:0.6rem">' +
    '<span class="svc-action" data-snap-rev="' + s + '">' + t('btn.revert') + '</span>' +
    '<span class="svc-action" data-snap-del="' + s + '" style="color:#e06c6c">' + t('btn.delete') + '</span>' +
    '</div></div></div>'
  ).join('') : '<div class="empty">' + t('ov.empty') + '</div>';
  return html;
}

function bindSnapshotTab(n) {
  const box = document.getElementById('detailBody');
  const res = document.getElementById('ndSnapResult');
  const create = document.getElementById('ndSnapCreate');
  if (create) create.addEventListener('click', async () => {
    const name = box.querySelector('.nd-snapname').value.trim();
    if (!name) { res.innerHTML = '<span class="err">' + t('ops.needName') + '</span>'; return; }
    res.textContent = t('ops.running');
    const r = await window.pywebview.api.snapshot(n.vmx, name);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>';
    await loadVms(false, true);
    showDetail(n.id);
  });
  box.querySelectorAll('[data-snap-rev]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.snapRev;
    if (!await uiConfirm(t('ops.revert') + '：' + s + ' ?')) return;
    res.textContent = t('ops.running');
    const r = await window.pywebview.api.revert(n.vmx, s);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>';
    await loadVms(false, true);
    showDetail(n.id);
  }));
  box.querySelectorAll('[data-snap-del]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.snapDel;
    if (!await uiConfirm(t('ops.delete') + '：' + s + ' ?')) return;
    res.textContent = t('ops.running');
    const r = await window.pywebview.api.delete_snap(n.vmx, s);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.deleted') : r.out) + '</span>';
    await loadVms(false, true);
    showDetail(n.id);
  }));
}

function renderConfigTab(n) {
  // 虚拟机选择（从已扫描的 VM 里选）
  const vmOpts = '<option value="">' + t('cl.noVmLink') + '</option>' +
    VMS.map(v => '<option value="' + v.vmx.replace(/"/g, '&quot;') + '"' +
      (normVmx(v.vmx) === normVmx(n.vmx) ? ' selected' : '') + '>' + v.label + '</option>').join('');
  return '<div class="form-row" style="margin-top:0.8rem">' +
    '<span class="sec-note-inline">' + t('cl.linkVm') + '</span>' +
    '<select class="nd-vmx" style="max-width:320px;flex:1">' + vmOpts + '</select>' +
    '</div>' +
    '<div class="form-row" style="margin-top:0.8rem">' +
    '<input class="nd-name" value="' + (n.name || '') + '" placeholder="名称">' +
    '<input class="nd-host" value="' + (n.host || '') + '" placeholder="IP / 主机名">' +
    '<input class="nd-port" value="' + (n.port || 22) + '" placeholder="端口" style="max-width:90px">' +
    '</div>' +
    '<div class="form-row" style="margin-top:0.6rem">' +
    '<input class="nd-user" value="' + (n.user || '') + '" placeholder="用户名">' +
    '<input class="nd-pass" type="password" value="' + (n.pass || '') + '" placeholder="密码">' +
    '<select class="nd-role">' +
    ['master','worker','ntp','kdc'].map(r => '<option value="' + r + '"' + (n.role === r ? ' selected' : '') + '>' + r + '</option>').join('') +
    '</select>' +
    '</div>' +
    '<div class="form-row" style="margin-top:0.6rem">' +
    '<input class="nd-note" value="' + (n.note || '') + '" placeholder="备注（如：主节点 / Kerberos 客户端）">' +
    '</div>' +
    '<div class="form-row" style="margin-top:0.6rem">' +
    '<span class="sec-note-inline">' + t('cl.belongCluster') + '</span>' +
    '<select class="nd-cluster" style="max-width:220px">' +
    CLUSTERS.map(c => '<option value="' + c + '"' + (c === (n.cluster || CURRENT_CLUSTER) ? ' selected' : '') + '>' + c + '</option>').join('') +
    '</select>' +
    '</div>' +
    '<div class="form-row" style="margin-top:0.8rem">' +
    '<button class="primary" id="ndSave">保存</button>' +
    '<button id="ndTest">测试连接</button>' +
    '</div>' +
    '<div class="result" id="ndResult"></div>';
}

function readDetailForm(base) {
  const q = (s) => document.querySelector(s);
  return Object.assign({}, base, {
    name: q('.nd-name').value.trim(),
    host: q('.nd-host').value.trim(),
    port: parseInt(q('.nd-port').value) || 22,
    user: q('.nd-user').value.trim(),
    pass: q('.nd-pass').value,
    role: q('.nd-role').value,
    note: q('.nd-note') ? q('.nd-note').value.trim() : (base.note || ''),
    cluster: q('.nd-cluster') ? q('.nd-cluster').value : (base.cluster || CURRENT_CLUSTER),
    vmx: q('.nd-vmx') ? q('.nd-vmx').value : (base.vmx || ''),
  });
}

async function saveDetail(id) {
  const base = NODES.find(x => x.id === id) || {};
  const node = readDetailForm(base);
  await window.pywebview.api.save_node(node);
  await loadClusters();   // 可能新增集群
  await loadNodes();
  // 节点可能已改到别的集群 → 从当前列表消失，详情也清空
  if (NODES.find(x => x.id === id)) showDetail(id);
  else document.getElementById('nodeDetail').innerHTML = '<div class="empty">' + t('cl.pick') + '</div>';
}

async function testDetail(n) {
  const base = NODES.find(x => x.id === n.id) || n;
  const node = readDetailForm(base);
  const box = document.getElementById('ndResult');
  box.textContent = t('cl.testing');
  const r = await window.pywebview.api.test_node(node);
  box.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + r.out + '</span>';
}

async function delNode(id) {
  if (!await uiConfirm(t('cl.confirmDel'))) return;
  await window.pywebview.api.delete_node(id);
  delete HEALTH[id];
  await loadNodes();
  document.getElementById('nodeDetail').innerHTML = '<div class="empty">' + t('cl.pick') + '</div>';
}

async function addNode() {
  const node = await uiNodeForm(t('cl.add'), { user: 'root', role: 'worker', port: 22 });
  if (!node) return;
  node.cluster = CURRENT_CLUSTER;
  const r = await window.pywebview.api.save_node(node);
  await loadClusters();
  await loadNodes();
  const newId = r && r.node && r.node.id;
  if (newId && NODES.find(x => x.id === newId)) showDetail(newId);
}

async function runHealthCheck() {
  const btn = document.getElementById('clusterCheck');
  btn.disabled = true;
  btn.textContent = t('cl.checking');
  try {
    const res = await window.pywebview.api.health_check();
    HEALTH = {};
    res.forEach(r => { HEALTH[r.id] = r; });
    renderNodes();
    renderClusterCard();
    refreshVmStatus();
  } catch (e) {
    uiAlert('体检失败: ' + e);
  } finally {
    btn.disabled = false;
    btn.textContent = t('cl.check');
  }
}

async function runDeployCheck() {
  const btn = document.getElementById('deployCheck');
  btn.disabled = true; btn.textContent = t('cl.checking');
  const box = document.getElementById('clusterOverview');
  try {
    const res = await window.pywebview.api.pre_deploy_check();
    const nameOf = {}; NODES.forEach(n => nameOf[n.id] = n.name);
    let html = '<div class="ov-row" style="align-items:stretch">';
    res.forEach(r => {
      const dot = r.status === 'green' ? 'st-green' : (r.status === 'red' ? 'st-red' : (r.status === 'off' ? 'st-off' : 'st-yellow'));
      html += '<div class="ov-item" style="text-align:left">' +
        '<div style="display:flex;align-items:center;gap:0.4rem"><span class="status-dot ' + dot + '"></span>' +
        '<b>' + (nameOf[r.id] || '?') + '</b></div>';
      if (!r.online) html += '<div class="vm-role" style="margin-top:0.3rem">' + (r.detail || '连接失败') + '</div>';
      else r.items.forEach(it => {
        html += '<div style="font-size:0.76rem;margin-top:0.2rem" class="' + (it.ok ? '' : 'err') + '">' +
          (it.ok ? '✓' : '✗') + ' ' + it.label + '：' + it.value + '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    box.innerHTML = html;
  } catch (e) {
    uiAlert('部署自检失败：' + e);
  } finally {
    btn.disabled = false; btn.textContent = t('cl.deployCheck');
  }
}

document.getElementById('clusterAdd').addEventListener('click', addNode);
document.getElementById('clusterCheck').addEventListener('click', runHealthCheck);
document.getElementById('deployCheck').addEventListener('click', runDeployCheck);

async function distributeConfig() {
  const src = document.getElementById('distSrc').value.trim();
  const dst = document.getElementById('distDst').value.trim();
  const res = document.getElementById('distResult');
  if (!src || !dst) { res.innerHTML = '<span class="err">请填写源/目标目录</span>'; return; }
  if (!await uiConfirm('把 master 的 ' + src + ' 分发到从节点的 ' + dst + '？')) return;
  res.textContent = t('ops.running');
  const r = await window.pywebview.api.distribute_config(src, dst, ['worker']);
  if (r.skipped) { res.innerHTML = '<span class="vm-role">' + (r.msg || '无目标节点') + '</span>'; return; }
  res.innerHTML = (r.results || []).map(x =>
    '<div class="' + (x.ok ? 'ok' : 'err') + '">' + x.node + ' — ' + (x.ok ? t('ops.done') : x.out) + '</div>'
  ).join('') + (r.msg ? '<div class="err">' + r.msg + '</div>' : '');
}
document.getElementById('distGo').addEventListener('click', distributeConfig);

// ============ 集群启停编排 ============
let POWER_RUNNING = false;

function powerLog(html) {
  document.getElementById('powerProgress').innerHTML = html;
}

async function runCluster(action) {
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }
  POWER_RUNNING = true;
  const svcs = await window.pywebview.api.get_services();
  const enabled = svcs.filter(s => s.enabled);
  const stages = [...new Set(enabled.map(s => s.stage))].sort((a, b) => action === 'stop' ? b - a : a - b);

  // 阶段0：启动 VM 并等待 SSH 就绪（仅启动时做）
  let lines = [];
  let aborted = false;
  if (action === 'start') {
    // 并发启动（跳过已运行的），逐台显示
    const targets = NODES.filter(n => (VM_STATUS[n.id] || {}).has_vmx);
    const vrows = {};
    targets.forEach(n => { vrows[n.id] = { name: n.name, state: 'running', text: t('cl.bootWait') }; });
    const vpaint = () => {
      powerLog(lines.concat(targets.map(n => {
        const r = vrows[n.id];
        const st = r.state === 'done' ? 'done' : (r.state === 'fail' ? 'fail' : 'running');
        return renderLine('阶段0 · ' + n.name + ' — ' + r.text, st);
      })).join(''));
    };
    lines.push(renderLine('阶段0 · 启动虚拟机（逐个）', 'running'));
    vpaint();
    // 串行启动：vmrun start 本身很快，串行避免并发冲突
    for (const n of targets) {
      try {
        const r = await window.pywebview.api.start_vm_node(n.id);
        if (r.ok) {
          vrows[n.id].state = 'done';
          vrows[n.id].text = r.mode === 'skipped' ? t('cl.bootSkipped') : t('cl.bootStarted');
        } else {
          vrows[n.id].state = 'fail';
          vrows[n.id].text = t('cl.bootFailed') + ': ' + (r.detail || '');
        }
      } catch (e) { vrows[n.id].state = 'fail'; vrows[n.id].text = String(e); }
      vpaint();
    }
    // 等待节点 SSH 就绪
    const ready = await waitNodesReady((sec) => {
      powerLog(lines.concat(targets.map(n => {
        const r = vrows[n.id];
        const st = r.state === 'fail' ? 'fail' : 'done';
        return renderLine('阶段0 · ' + n.name + ' — ' + r.text, st);
      })).concat([renderLine('阶段0 · 等待节点就绪 (' + sec + 's)', 'running')]).join(''));
    });
    lines = targets.map(n => {
      const r = vrows[n.id];
      return renderLine('阶段0 · ' + n.name + ' — ' + r.text, r.state === 'fail' ? 'fail' : 'done');
    });
    if (!ready) {
      lines.push(renderLine('阶段0 · 等待节点就绪超时（有节点未连上）', 'fail'));
      powerLog(lines.join(''));
      lines.push('<div class="result err">✕ 节点未就绪，已停止（请检查虚拟机是否正常启动）</div>');
      POWER_RUNNING = false;
      powerLog(lines.join(''));
      return;
    }
    lines.push(renderLine('阶段0 · 节点已就绪', 'done'));
    powerLog(lines.join(''));
  }
  for (const st of stages) {
    if (aborted) break;
    const group = enabled.filter(s => s.stage === st);
    for (const svc of group) {
      const label = '阶段' + st + ' · ' + svc.name;
      lines.push(renderLine(label, 'running'));
      powerLog(lines.join(''));
      let ok = true, verified = true, detail = '';
      try {
        const r = await window.pywebview.api.run_service(svc.id, action);
        ok = r.ok;
        // 无目标节点 → 跳过（如未配 kdc 节点时，KDC 阶段跳过）
        if (r.skipped) {
          lines[lines.length - 1] = renderLine(label + ' — ' + t('cl.svcSkipped'), 'done');
          powerLog(lines.join(''));
          continue;
        }
        // 取自检状态与首个失败信息
        if (r.results && r.results.length) {
          const bad = r.results.find(x => !x.ok);
          if (bad) { verified = false; detail = bad.node + ': ' + (bad.out || '').split('\n')[0]; }
        }
      } catch (e) { ok = false; detail = String(e); }
      if (!ok) {
        lines[lines.length - 1] = renderLine(label + (detail ? ' — ' + detail : ''), 'fail');
        powerLog(lines.join(''));
        // 人话诊断
        const diag = await diagnoseHtml(detail);
        if (diag) lines.push(diag);
        // 依赖被破坏，停止后续阶段
        lines.push('<div class="result err">✕ 检测未通过，已停止后续阶段（依赖未就绪）</div>');
        aborted = true;
        powerLog(lines.join(''));
        break;
      }
      lines[lines.length - 1] = renderLine(label, 'done');
      powerLog(lines.join(''));
    }
  }
  POWER_RUNNING = false;
  if (!aborted) {
    lines.push('<div class="empty" style="margin-top:0.6rem">' + t('cl.powerDone') + '</div>');
    powerLog(lines.join(''));
  }
  runHealthCheck();   // 结束后自动刷新体检
  refreshVmStatus();  // 刷新 VM 开/关机状态
}

// 人话诊断：调后端规则表，返回 HTML（失败时展示）
async function diagnoseHtml(text) {
  if (!text) return '';
  let hits = [];
  try { hits = await window.pywebview.api.diagnose(text); } catch (e) { return ''; }
  if (!hits || !hits.length) return '';
  return '<div class="diag-box">' + hits.map(h =>
    '<div class="diag-item diag-' + h.sev + '">' +
    '<div class="diag-title">💡 ' + h.title + '</div>' +
    '<div class="diag-meaning">' + h.meaning + '</div>' +
    '<div class="diag-fix">👉 ' + h.fix + '</div>' +
    '</div>'
  ).join('') + '</div>';
}

function renderLine(text, state) {
  const icon = { running: '⏳', done: '✓', fail: '✕' }[state] || '';
  const cls = { running: 'cl-run', done: 'ok', fail: 'err' }[state] || '';
  return '<div class="result ' + cls + '">' + icon + ' ' + text + '</div>';
}

// 轮询等待节点 SSH 就绪（前端轮询，进度可见）。最长 150 秒
async function waitNodesReady(onTick) {
  const maxSec = 150, intervalMs = 5000;
  let waited = 0;
  while (waited < maxSec) {
    await new Promise(r => setTimeout(r, intervalMs));
    waited += 5;
    let res;
    try { res = await window.pywebview.api.check_nodes_ready(); } catch (e) { res = { ready: false }; }
    if (onTick) onTick(waited, maxSec, res.ready);
    if (res.ready) return true;
  }
  return false;
}

document.getElementById('clusterStart').addEventListener('click', () => runCluster('start'));
document.getElementById('clusterStop').addEventListener('click', () => runCluster('stop'));

async function shutdownVms() {
  if (!await uiConfirm(t('cl.confirmShutdown'))) return;
  // 并发逐台关机，每台一行进度
  const targets = NODES.filter(n => (VM_STATUS[n.id] || {}).has_vmx);
  if (targets.length === 0) { powerLog('<div class="empty">' + t('cl.noVmxNodes') + '</div>'); return; }
  POWER_RUNNING = true;
  const rows = {};   // id -> 状态
  targets.forEach(n => { rows[n.id] = { name: n.name, state: 'running', text: t('cl.shutdownWait') }; });
  const paint = () => {
    powerLog(targets.map(n => {
      const r = rows[n.id];
      const st = r.state === 'done' ? 'done' : (r.state === 'fail' ? 'fail' : 'running');
      return renderLine(n.name + ' — ' + r.text, st);
    }).join(''));
  };
  paint();
  // 并发发起
  await Promise.all(targets.map(async (n) => {
    try {
      const r = await window.pywebview.api.stop_vm_node(n.id);
      if (r.ok) {
        rows[n.id].state = 'done';
        rows[n.id].text = r.mode === 'hard' ? t('cl.shutdownHard') : t('cl.shutdownSoft');
      } else {
        rows[n.id].state = 'fail';
        rows[n.id].text = t('cl.shutdownFail') + ': ' + (r.detail || '');
      }
    } catch (e) {
      rows[n.id].state = 'fail';
      rows[n.id].text = String(e);
    }
    paint();
  }));
  POWER_RUNNING = false;
  const allOk = targets.every(n => rows[n.id].state === 'done');
  paint();
  powerLog(targets.map(n => {
    const r = rows[n.id];
    return renderLine(n.name + ' — ' + r.text, r.state === 'done' ? 'done' : 'fail');
  }).join('') + '<div class="empty" style="margin-top:0.5rem">' +
    (allOk ? t('cl.allShutdown') : t('cl.shutdownTimeout')) + '</div>');
  refreshVmStatus();
}
document.getElementById('vmShutdown').addEventListener('click', shutdownVms);
document.getElementById('autoCheck').addEventListener('change', (e) => {
  AUTO_CHECK = e.target.checked;
  window.pywebview.api.save_auto_check(AUTO_CHECK);
});



// ============ VMware 宿主机环境 ============
let VMWARE_STATE = null;

const VMWARE_STATE_META = {
  green:  { color: '#3ecf8e', text: 'VMware 就绪' },
  yellow: { color: '#e0b34a', text: 'VMware 部分服务' },
  red:    { color: '#e06c6c', text: 'VMware 授权未启动' },
  gray:   { color: '#8a8a94', text: 'VMware 检查中' },
};

let VMWARE_LOADING = false;   // 防重入

async function loadVmware() {
  if (VMWARE_LOADING) return;   // 上次还没查完，跳过本次
  // 有下拉菜单打开时，不重渲染卡片（避免冲掉用户的展开）
  const anyMenuOpen = document.querySelector('.split-menu:not(.hidden)');
  VMWARE_LOADING = true;
  try {
    VMWARE_STATE = await window.pywebview.api.vmware_state();
  } catch (e) { VMWARE_STATE = null; }
  renderVmwareStatusBar();
  if (!anyMenuOpen) renderVmwareCard();
  VMWARE_LOADING = false;
}

// 定时轮询（每 15 秒）：VMware 环境状态 + VM 开/关机状态，让界面保持最新
setInterval(() => {
  loadVmware();
  if (NODES.length) refreshVmStatus();
}, 15000);

function renderVmwareStatusBar() {
  const dot = document.getElementById('vmwareDot');
  const txt = document.getElementById('vmwareStatusText');
  if (!dot || !txt) return;
  const state = VMWARE_STATE ? VMWARE_STATE.state : 'gray';
  const meta = VMWARE_STATE_META[state] || VMWARE_STATE_META.gray;
  dot.style.background = meta.color;
  txt.textContent = VMWARE_STATE
    ? meta.text + '（' + VMWARE_STATE.running_count + '/' + VMWARE_STATE.total_count + '）'
    : 'VMware 检查中…';
}

// 分裂按钮：主按钮直接执行，小箭头展开更多选项（VSCode 风格）
// 返回 HTML；通过 window.__splitMenus[id] 暂存下拉项
function splitBtn(id, mainLabel, items) {
  window.__splitMenus = window.__splitMenus || {};
  window.__splitMenus[id] = items;
  return '<div class="split-btn">' +
    '<button class="mini-btn split-main" id="' + id + 'Main">' + mainLabel + '</button>' +
    '<button class="mini-btn split-arrow" id="' + id + 'Arrow">▾</button>' +
    '<div class="split-menu hidden" id="' + id + 'Menu">' +
    items.map((it, i) => '<div class="split-item" data-split="' + id + '" data-idx="' + i + '">' + it.label + '</div>').join('') +
    '</div></div>';
}

function bindSplitBtns(root) {
  root = root || document;
  root.querySelectorAll('.split-main').forEach(b => {
    b.addEventListener('click', () => {
      const items = (window.__splitMenus || {})[b.id.replace('Main', '')];
      if (items && items[0]) items[0].fn();   // 主按钮 = 第一项
    });
  });
  root.querySelectorAll('.split-arrow').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById(b.id.replace('Arrow', 'Menu'));
      if (!menu) return;
      const wasHidden = menu.classList.contains('hidden');
      document.querySelectorAll('.split-menu').forEach(m => m.classList.add('hidden'));
      if (wasHidden) menu.classList.remove('hidden');
    });
  });
  root.querySelectorAll('.split-item').forEach(it => {
    it.addEventListener('click', () => {
      const items = (window.__splitMenus || {})[it.dataset.split];
      const idx = parseInt(it.dataset.idx);
      document.querySelectorAll('.split-menu').forEach(m => m.classList.add('hidden'));
      if (items && items[idx]) items[idx].fn();
    });
  });
}

// 全局：点别处关掉下拉
document.addEventListener('click', () => {
  document.querySelectorAll('.split-menu').forEach(m => m.classList.add('hidden'));
});

let VMWARE_EXPANDED = false;

function renderVmwareCard() {
  const box = document.getElementById('vmwareCard');
  if (!box) return;
  if (!VMWARE_STATE) { box.innerHTML = ''; return; }
  const state = VMWARE_STATE.state;
  const meta = VMWARE_STATE_META[state] || VMWARE_STATE_META.gray;
  const dotCls = state === 'green' ? 'green' : (state === 'red' ? 'red' : 'yellow');

  // 紧凑状态条（一行）
  let html =
    '<div class="bar" style="border-left:3px solid ' + meta.color + '">' +
    '<span class="status-dot st-' + dotCls + '"></span>' +
    '<span class="bar-title">VMware</span>' +
    '<span class="bar-text">' + meta.text.replace('VMware ', '') + '（' + VMWARE_STATE.running_count + '/' + VMWARE_STATE.total_count + '）</span>' +
    '<span class="bar-spacer"></span>' +
    splitBtn('vmwareStart', t('vm.start'), [
      { label: t('vm.startAll'), fn: () => startVmwareServices('all') },
      { label: t('vm.startCritical'), fn: () => startVmwareServices('critical') },
    ]) +
    splitBtn('vmwareStop', t('vm.stop'), [
      { label: t('vm.stopOptional'), fn: () => stopVmwareServices('optional') },
      { label: t('vm.stopAll'), fn: () => stopVmwareServices('all') },
    ]) +
    '<span class="svc-action" id="vmwareToggle">' + (VMWARE_EXPANDED ? t('cl.collapse') : t('cl.expand')) + '</span>' +
    '</div>';

  // 展开：服务明细
  if (VMWARE_EXPANDED) {
    const appLine = VMWARE_STATE.app_running
      ? '<span class="ok">VMware 软件运行中</span>'
      : '<span class="vm-role">VMware 软件未运行</span>';
    const svcRows = VMWARE_STATE.services.map(s => {
      const dot = s.running ? 'st-green' : (s.critical ? 'st-red' : 'st-gray');
      const tag = s.critical ? '' : '<span class="vm-role">可选</span>';
      const action = s.running
        ? '<span class="svc-action" data-svc="' + s.name + '" data-act="stop">停止</span>'
        : '<span class="svc-action" data-svc="' + s.name + '" data-act="start">启动</span>';
      return '<div class="svc-line">' +
        '<span class="status-dot ' + dot + '"></span>' +
        '<span>' + s.label + '</span>' + tag +
        '<span class="bar-spacer"></span>' +
        '<span class="vm-role">' + (s.running ? '运行中' : '已停止') + '</span>' +
        action + '</div>';
    }).join('');
    html += '<div class="bar-detail">' + appLine + svcRows +
      '<div class="hint-foot" style="margin-top:0.5rem">vmrun 依赖「授权服务」；联网依赖「NAT/DHCP」。启动服务需管理员权限（会弹 UAC）。</div>' +
      '</div>';
  }

  box.innerHTML = html;
  bindSplitBtns(box);
  const tg = document.getElementById('vmwareToggle');
  if (tg) tg.addEventListener('click', () => { VMWARE_EXPANDED = !VMWARE_EXPANDED; renderVmwareCard(); });
  box.querySelectorAll('.svc-action[data-svc]').forEach(el => {
    el.addEventListener('click', () => toggleService(el.dataset.svc, el.dataset.act));
  });
}

async function toggleService(name, act) {
  const critical = (VMWARE_STATE.services.find(s => s.name === name) || {}).critical;
  if (act === 'stop') {
    let warn = '确定停止服务「' + name + '」？';
    if (critical) warn = '「' + name + '」是必需服务，停止后 vmrun / 虚拟机操作将失效！\n\n确定停止？';
    if (!await uiConfirm(warn)) return;
  }
  try {
    if (act === 'start') await window.pywebview.api.vmware_start_one(name);
    else await window.pywebview.api.vmware_stop_one(name);
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1500));
  await loadVmware();
}

async function startVmwareServices(mode) {
  mode = mode || 'all';
  const label = mode === 'critical' ? t('vm.startCritical') : t('vm.startAll');
  if (!await uiConfirm(label + '？（需要管理员权限，会弹出 UAC 授权窗口）')) return;
  const box = document.getElementById('vmwareCard');
  box.insertAdjacentHTML('afterbegin', '<div class="result cl-run" id="vmwareBusy">' + t('vm.working') + '</div>');
  try {
    await window.pywebview.api.vmware_start_services(mode);
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1500));
  await loadVmware();
}

async function stopVmwareServices(mode) {
  mode = mode || 'optional';
  const label = mode === 'all' ? t('vm.stopAll') : t('vm.stopOptional');
  let warn = label + '？';
  if (mode === 'all') warn = t('vm.stopAllWarn');
  if (!await uiConfirm(warn)) return;
  const box = document.getElementById('vmwareCard');
  box.insertAdjacentHTML('afterbegin', '<div class="result cl-run" id="vmwareBusy">' + t('vm.working') + '</div>');
  try {
    await window.pywebview.api.vmware_stop_services(mode);
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1500));
  await loadVmware();
}

async function launchVmwareApp() {
  try {
    const r = await window.pywebview.api.vmware_launch_app();
    if (!r.ok && r.out) uiAlert('启动 VMware 失败：' + r.out);
  } catch (e) { uiAlert('启动失败：' + e); }
  await new Promise(r => setTimeout(r, 1500));
  await loadVmware();
}

document.getElementById('vmwareStatus').addEventListener('click', () => {
  // 点击标题栏状态 → 跳到集群视图
  showView('cluster');
  loadVmware();
});

// ============ 启动 ============
window.addEventListener('pywebviewready', async () => {
  const s = await window.pywebview.api.get_settings();
  initLang(s.lang);
  document.getElementById('vmrunPath').value = s.vmrun || '';
  AUTO_CHECK = s.auto_check !== false;
  document.getElementById('autoCheck').checked = AUTO_CHECK;
  // 加载版本 / 作者
  try {
    const meta = await window.pywebview.api.get_meta();
    document.getElementById('aboutVer').textContent = 'v' + meta.version;
    document.getElementById('aboutAuthor').textContent = t('about.author') + meta.author;
  } catch (e) {}
  await loadVms();
  await loadClusters();
  renderSidebar();
  showView('cluster');
  await loadNodes();
  await loadHealthCache();   // 恢复上次体检结果
  loadVmware();
});
