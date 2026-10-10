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
let AUTO_CHECK = true;    // 由设置加载
let CHECKED_ONCE = false;  // 避免反复体检

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + t.dataset.tab).classList.remove('hidden');
    // 进入「集群」页且开启自动检查 → 自动体检一次
    if (t.dataset.tab === 'cluster' && AUTO_CHECK && !CHECKED_ONCE && NODES.length) {
      CHECKED_ONCE = true;
      runHealthCheck();
    }
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
}

async function doStop() {
  const vmx = document.getElementById('opVm').value;
  const r = await window.pywebview.api.stop_vm(vmx);
  document.getElementById('opResult').innerHTML = '<div class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.stopped') : r.out) + '</div>';
  loadVms();
}

async function saveVmrun() {
  const p = document.getElementById('vmrunPath').value.trim();
  await window.pywebview.api.save_vmrun(p);
  alert(t('msg.saved'));
}

async function saveAllAlias() {
  const rows = document.querySelectorAll('#aliasList .alias-row');
  for (const row of rows) {
    const vmx = row.dataset.vmx;
    const name = row.querySelector('.a-name').value.trim();
    const note = row.querySelector('.a-note').value.trim();
    await window.pywebview.api.save_alias(vmx, name, note);
  }
  alert(t('msg.saved'));
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

async function loadNodes() {
  NODES = await window.pywebview.api.get_nodes();
  renderNodes();
  renderClusterCard();
  refreshVmStatus();
}

async function refreshVmStatus() {
  try {
    VM_STATUS = await window.pywebview.api.nodes_vm_status();
  } catch (e) { VM_STATUS = {}; }
  renderNodes();
  renderClusterCard();
}

function healthStatusOf(id) {
  return HEALTH[id] ? HEALTH[id].status : 'gray';
}

// 状态严重度：取最严重（vSphere 规则）
const SEVERITY = { gray: 0, green: 1, yellow: 2, red: 3 };

function renderClusterCard() {
  const box = document.getElementById('clusterCard');
  if (!box) return;
  if (NODES.length === 0) { box.innerHTML = ''; return; }

  // 聚合：集群状态 = 最差节点状态
  let worst = 'gray', counts = { green: 0, yellow: 0, red: 0, gray: 0 };
  NODES.forEach(n => {
    const st = healthStatusOf(n.id);
    counts[st] = (counts[st] || 0) + 1;
    if (SEVERITY[st] > SEVERITY[worst]) worst = st;
  });

  const label = { green: '健康', yellow: '部分异常', red: '异常', gray: '未检查' }[worst];
  const total = NODES.length;
  const parts = [];
  if (counts.green) parts.push('<span class="ok">' + counts.green + ' 正常</span>');
  if (counts.yellow) parts.push('<span style="color:#e0b34a">' + counts.yellow + ' 部分异常</span>');
  if (counts.red) parts.push('<span class="err">' + counts.red + ' 异常</span>');
  if (counts.gray) parts.push('<span class="vm-role">' + counts.gray + ' 未检查</span>');

  box.innerHTML =
    '<div class="card" style="border-left:3px solid ' + severityColor(worst) + '">' +
    '<div class="card-top"><div>' +
    '<span class="status-dot st-' + worst + '"></span>' +
    '<span class="vm-name">集群整体状态：' + label + '</span></div>' +
    '<span class="vm-count">' + total + ' 台</span></div>' +
    '<div style="margin-top:0.5rem;font-size:0.82rem;display:flex;gap:1rem">' + parts.join('') + '</div>' +
    '</div>';
}

function severityColor(s) {
  return { green: '#3ecf8e', yellow: '#e0b34a', red: '#e06c6c', gray: '#8a8a94' }[s] || '#8a8a94';
}

function renderNodes() {
  const box = document.getElementById('nodeList');
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
    return '<div class="card" data-id="' + n.id + '" style="cursor:pointer">' +
      '<div class="card-top"><div>' + dot +
      '<span class="vm-name">' + n.name + '</span>' + role + host + note + '</div>' +
      '<div style="display:flex;align-items:center;gap:0.5rem">' + vmBadge +
      '<span class="vm-count" style="cursor:pointer" data-del="' + n.id + '">删除</span></div></div></div>';
  }).join('');
  // 点击卡片 → 详情；点击删除
  box.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', (e) => {
      if (e.target.dataset.del) { delNode(e.target.dataset.del); return; }
      showDetail(c.dataset.id);
    });
  });
}

let DETAIL_TAB = 'config';    // 当前节点详情的选项卡

function showDetail(id) {
  const n = NODES.find(x => x.id === id);
  if (!n) return;
  window._DETAIL_ID = id;
  const st = healthStatusOf(id);
  const statusText = { green: '正常', yellow: '部分异常', red: '异常', gray: '未检查' }[st] || '未知';

  // 选项卡栏
  const tabs = [
    ['health', '健康'], ['service', '服务'], ['snapshot', '快照'], ['config', '配置'],
  ];
  const tabBar = '<div class="detail-tabs">' + tabs.map(([k, label]) =>
    '<button class="detail-tab' + (DETAIL_TAB === k ? ' active' : '') + '" data-dtab="' + k + '">' + label + '</button>'
  ).join('') + '</div>';

  document.getElementById('nodeDetail').innerHTML =
    '<div class="card">' +
    '<div class="card-top"><div><span class="status-dot st-' + st + '"></span>' +
    '<span class="vm-name">' + n.name + '</span>' +
    '<span class="vm-role">' + (n.role || '') + '</span></div>' +
    '<span class="vm-count">' + statusText + '</span></div>' +
    tabBar +
    '<div id="detailBody"></div>' +
    '</div>';

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
  } else {
    body.innerHTML = renderConfigTab(n);
    document.getElementById('ndSave').addEventListener('click', () => saveDetail(n.id));
    document.getElementById('ndTest').addEventListener('click', () => testDetail(n));
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

function renderSnapshotTab(n) {
  return '<div class="empty">' + t('cl.snapshotHint') + '</div>';
}

function renderConfigTab(n) {
  return '<div class="form-row" style="margin-top:0.8rem">' +
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
  });
}

async function saveDetail(id) {
  const base = NODES.find(x => x.id === id) || {};
  const node = readDetailForm(base);
  await window.pywebview.api.save_node(node);
  await loadNodes();
  showDetail(id);
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
  if (!confirm(t('cl.confirmDel'))) return;
  await window.pywebview.api.delete_node(id);
  delete HEALTH[id];
  await loadNodes();
  document.getElementById('nodeDetail').innerHTML = '<div class="empty">' + t('cl.pick') + '</div>';
}

async function addNode() {
  await window.pywebview.api.save_node({ name: '新节点', host: '', user: 'root', pass: '', role: 'worker' });
  await loadNodes();
  if (NODES.length) showDetail(NODES[NODES.length - 1].id);
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
  } catch (e) {
    alert('体检失败: ' + e);
  } finally {
    btn.disabled = false;
    btn.textContent = t('cl.check');
  }
}

document.getElementById('clusterAdd').addEventListener('click', addNode);
document.getElementById('clusterCheck').addEventListener('click', runHealthCheck);

// ============ 集群启停编排 ============
let POWER_RUNNING = false;

function powerLog(html) {
  document.getElementById('powerProgress').innerHTML = html;
}

async function runCluster(action) {
  if (POWER_RUNNING) { alert(t('cl.busy')); return; }
  POWER_RUNNING = true;
  const svcs = await window.pywebview.api.get_services();
  const enabled = svcs.filter(s => s.enabled);
  const stages = [...new Set(enabled.map(s => s.stage))].sort((a, b) => action === 'stop' ? b - a : a - b);

  // 阶段0：启动 VM 并等待 SSH 就绪（仅启动时做）
  let lines = [];
  let aborted = false;
  if (action === 'start') {
    lines.push(renderLine('阶段0 · 启动虚拟机', 'running'));
    powerLog(lines.join(''));
    try { await window.pywebview.api.start_vms(); } catch (e) {}
    // 轮询等待所有节点 SSH 就绪（最长 150 秒）
    const ready = await waitNodesReady((sec, total, allOk) => {
      lines[lines.length - 1] = renderLine('阶段0 · 等待节点就绪 (' + sec + 's)', 'running');
      powerLog(lines.join(''));
    });
    if (!ready) {
      lines[lines.length - 1] = renderLine('阶段0 · 等待节点就绪超时（有节点未连上）', 'fail');
      powerLog(lines.join(''));
      lines.push('<div class="result err">✕ 节点未就绪，已停止（请检查虚拟机是否正常启动）</div>');
      POWER_RUNNING = false;
      powerLog(lines.join(''));
      return;
    }
    lines[lines.length - 1] = renderLine('阶段0 · 节点已就绪', 'done');
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
        // 取自检状态与首个失败信息
        if (r.results && r.results.length) {
          const bad = r.results.find(x => !x.ok);
          if (bad) { verified = false; detail = bad.node + ': ' + (bad.out || '').split('\n')[0]; }
        }
      } catch (e) { ok = false; detail = String(e); }
      if (!ok) {
        lines[lines.length - 1] = renderLine(label + (detail ? ' — ' + detail : ''), 'fail');
        powerLog(lines.join(''));
        // 依赖被破坏，停止后续阶段
        lines.push('<div class="result err">✕ 检测未通过，已停止后续阶段（依赖未就绪）</div>');
        aborted = true;
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

// 单独启动所有虚拟机（不启动服务）
async function bootVms() {
  if (POWER_RUNNING) { alert(t('cl.busy')); return; }
  POWER_RUNNING = true;
  powerLog(renderLine(t('cl.booting'), 'running'));
  try {
    const r = await window.pywebview.api.start_vms();
    const n = r.results ? r.results.length : 0;
    powerLog(renderLine(t('cl.booting') + ' (' + n + ' 台)', 'running'));
    const ready = await waitNodesReady((sec) => {
      powerLog(renderLine(t('cl.booting') + ' — ' + t('cl.waitReady') + ' (' + sec + 's)', 'running'));
    });
    if (ready) {
      powerLog(renderLine(t('cl.booting') + ' — ' + t('cl.ready'), 'done'));
    } else {
      powerLog(renderLine(t('cl.booting') + ' — ' + t('cl.readyTimeout'), 'fail'));
    }
  } catch (e) {
    powerLog(renderLine(t('cl.booting') + ': ' + e, 'fail'));
  }
  POWER_RUNNING = false;
  loadVms();
  refreshVmStatus();
}
document.getElementById('vmBoot').addEventListener('click', bootVms);

document.getElementById('clusterStart').addEventListener('click', () => runCluster('start'));
document.getElementById('clusterStop').addEventListener('click', () => runCluster('stop'));

async function shutdownVms() {
  if (!confirm(t('cl.confirmShutdown'))) return;
  powerLog(renderLine(t('cl.shuttingDown'), 'running'));
  try {
    await window.pywebview.api.stop_vms();
    // 软关机会持续几秒~几十秒，轮询等待全部关机
    let sec = 0, allOff = false;
    while (sec < 90) {
      await new Promise(r => setTimeout(r, 5000));
      sec += 5;
      await refreshVmStatus();
      const states = Object.values(VM_STATUS).filter(v => v.has_vmx);
      allOff = states.length > 0 && states.every(v => !v.running);
      powerLog(renderLine(t('cl.shuttingDown') + ' (' + sec + 's)', allOff ? 'done' : 'running'));
      if (allOff) break;
    }
    powerLog(renderLine(allOff ? t('cl.allShutdown') : t('cl.shutdownTimeout'), allOff ? 'done' : 'fail'));
  } catch (e) {
    powerLog(renderLine(t('cl.shuttingDown') + ': ' + e, 'fail'));
  }
  refreshVmStatus();
}
document.getElementById('vmShutdown').addEventListener('click', shutdownVms);
document.getElementById('autoCheck').addEventListener('change', (e) => {
  AUTO_CHECK = e.target.checked;
  window.pywebview.api.save_auto_check(AUTO_CHECK);
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
  loadVms();
  loadNodes();
});
