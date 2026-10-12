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
      field('f-role', t('cl.fRole'), '<select class="f-role">' + roleOpts + '</select>') +
      field('f-cfgroot', t('cl.fCfgRoot'), '<input class="f-cfgroot" value="' + esc(init.cfg_root) + '" placeholder="' + t('ph.cfgRoot') + '">');
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
        cfg_root: g('.f-cfgroot').trim(),
      }));
    };
    cancelBtn.onclick = () => done(null);
  });
}
function field(cls, label, ctrl) {
  return '<div class="form-row" style="margin-top:0.5rem"><span class="ff-label">' + label + '</span>' + ctrl + '</div>';
}
function esc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
function escAll(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

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

// ============ 明暗模式（原设计，保持不变）============
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

// ============ 界面风格（与明暗独立，设置界面切换）============
// 注册表：加新风格只需在此加一项 + 一段 CSS 变量块。
// nodeList 为可选渲染钩子；为 null 时用默认节点列表渲染。
const STYLES = ['default', 'dashboard', 'terminal', 'blueprint'];
const UI_STYLES = {
  default:   { nodeList: null },
  dashboard: { nodeList: renderNodesDashboard },
  terminal:  { nodeList: renderNodesTerminal },
  blueprint: { nodeList: renderNodesBlueprint },
};
let uiStyle = localStorage.getItem('uiStyle') || 'default';
function applyStyle(s) {
  if (!STYLES.includes(s)) s = 'default';
  uiStyle = s;
  STYLES.filter(x => x !== 'default').forEach(x =>
    document.body.classList.remove('style-' + x));
  if (s !== 'default') document.body.classList.add('style-' + s);
  localStorage.setItem('uiStyle', s);
  const sel = document.getElementById('themeSelect');
  if (sel) sel.value = s;
  // 重新渲染节点列表（清掉上一个主题的 DOM 残留结构）
  try { if (typeof renderNodes === 'function') renderNodes(); } catch (e) {}
}
applyStyle(uiStyle);
document.getElementById('themeSelect').addEventListener('change', (e) => {
  applyStyle(e.target.value);
});

// 使用帮助
document.getElementById('helpBtn').addEventListener('click', () => {
  const body = [
    t('help.intro'),
    '',
    t('help.h1'),
    '  ' + t('help.1'),
    '  ' + t('help.2'),
    '  ' + t('help.3'),
    '',
    t('help.h2'),
    '  ' + t('help.4'),
    '  ' + t('help.5'),
    '  ' + t('help.6'),
    '',
    t('help.h3'),
    '  ' + t('help.7'),
    '  ' + t('help.8'),
    '  ' + t('help.9'),
  ].join('\n');
  uiAlert(body, t('help.title'));
});

// ============ 窗口按钮 ============
document.getElementById('minBtn').addEventListener('click', () => window.pywebview.api.minimize());
document.getElementById('maxBtn').addEventListener('click', () => window.pywebview.api.maximize());
document.getElementById('closeBtn').addEventListener('click', () => window.pywebview.api.close_win());

// ============ 界面缩放（Ctrl + / Ctrl - / Ctrl 0 重置）============
const ZOOM_MIN = 0.7, ZOOM_MAX = 1.6, ZOOM_STEP = 0.1;
let zoomLevel = parseFloat(localStorage.getItem('uiZoom')) || 1;
if (!(zoomLevel >= ZOOM_MIN && zoomLevel <= ZOOM_MAX)) zoomLevel = 1;
function applyZoom(z) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  document.documentElement.style.zoom = String(zoomLevel);
  localStorage.setItem('uiZoom', String(zoomLevel));
  const el = document.getElementById('zoomHint');
  if (el) {
    el.textContent = Math.round(zoomLevel * 100) + '%';
    el.style.opacity = '1';
    clearTimeout(window._zoomHintTimer);
    window._zoomHintTimer = setTimeout(() => { el.style.opacity = '0'; }, 1200);
  }
}
applyZoom(zoomLevel);
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === '=' || e.key === '+') { applyZoom(zoomLevel + ZOOM_STEP); e.preventDefault(); }
  else if (e.key === '-' || e.key === '_') { applyZoom(zoomLevel - ZOOM_STEP); e.preventDefault(); }
  else if (e.key === '0') { applyZoom(1); e.preventDefault(); }
});

// ============ 无边框窗口边缘拖拽改尺寸 ============
// 无边框 + WebView2 会吞掉 Win32 边缘命中，故用前端热区 + 调 API 改窗口几何
(function initEdgeResize() {
  const EDGE = 7;              // 边缘热区宽度（px）
  const CORNER = 14;           // 角落热区（px）
  const MIN_W = 900, MIN_H = 600;
  const ZONES = [
    { dir: 'w',  css: { top: CORNER + 'px', bottom: CORNER + 'px', left: '0', width: EDGE + 'px' }, cursor: 'ew-resize' },
    { dir: 'e',  css: { top: CORNER + 'px', bottom: CORNER + 'px', right: '0', width: EDGE + 'px' }, cursor: 'ew-resize' },
    { dir: 's',  css: { left: CORNER + 'px', right: CORNER + 'px', bottom: '0', height: EDGE + 'px' }, cursor: 'ns-resize' },
    { dir: 'sw', css: { left: '0', bottom: '0', width: CORNER + 'px', height: CORNER + 'px' }, cursor: 'nesw-resize' },
    { dir: 'se', css: { right: '0', bottom: '0', width: CORNER + 'px', height: CORNER + 'px' }, cursor: 'nwse-resize' },
  ];
  let drag = null;

  function startResize(dir, e) {
    drag = {
      dir,
      sx: e.screenX, sy: e.screenY,
      wx: window.screenX, wy: window.screenY,
      ww: window.outerWidth, wh: window.outerHeight,
    };
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = 'none';
  }

  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.screenX - drag.sx;
    const dy = e.screenY - drag.sy;
    let x = drag.wx, y = drag.wy, w = drag.ww, h = drag.wh;
    if (drag.dir.includes('e')) w = drag.ww + dx;
    if (drag.dir.includes('s')) h = drag.wh + dy;
    if (drag.dir.includes('w')) { w = drag.ww - dx; x = drag.wx + dx; }
    if (w < MIN_W) { if (drag.dir.includes('w')) x = drag.wx + (drag.ww - MIN_W); w = MIN_W; }
    if (h < MIN_H) { if (drag.dir.includes('s')) y = drag.wy; h = MIN_H; }
    try { window.pywebview.api.set_window_geom(x, y, w, h); } catch (err) {}
  }, true);

  document.addEventListener('mouseup', () => {
    if (drag) { drag = null; document.body.style.userSelect = ''; }
  }, true);

  function build() {
    ZONES.forEach(z => {
      const el = document.createElement('div');
      el.className = 'ck-resize-zone';
      Object.assign(el.style, { position: 'fixed', zIndex: '9000', cursor: z.cursor }, z.css);
      el.addEventListener('mousedown', (e) => { if (e.button === 0) startResize(z.dir, e); });
      document.body.appendChild(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

// ============ 滚动条：滚动时显示 ============
(function initScrollbarHint() {
  function attach(el) {
    if (!el) return;
    let timer = null;
    el.addEventListener('scroll', () => {
      el.classList.add('scrolling');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('scrolling'), 900);
    }, { passive: true });
  }
  function init() {
    attach(document.querySelector('.main'));
    attach(document.querySelector('.side-scroll'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ============ 视图导航（左栏 + 右区，vCenter 式）============
let AUTO_CHECK = true;    // 由设置加载
let CHECKED_ONCE = false;  // 避免反复体检

function showView(name) {
  const doSwitch = () => {
    ['cluster', 'node', 'vm', 'settings', 'hdfs', 'hive', 'tables', 'import', 'hbase', 'yarn', 'verify', 'deploycheck', 'diagpack', 'clustercfg', 'cfgtmpl', 'jobtpl'].forEach(v => {
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

// ============ 活动栏（域切换）============
let CUR_DOMAIN = 'env';

function switchDomain(dom) {
  CUR_DOMAIN = dom;
  document.querySelectorAll('.act-btn').forEach(b => b.classList.toggle('active', b.dataset.domain === dom));
  // 侧栏域显隐
  const map = { env: 'sideEnv', data: 'sideData', job: 'sideJob', tool: 'sideTool' };
  Object.entries(map).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', k !== dom);
  });
  // 环境域 → 默认回集群视图；数据域 → HDFS 工作台
  if (dom === 'env') showView('cluster');
  else if (dom === 'data') { showView('hdfs'); renderHdfs(); detectComponents(); }
  else if (dom === 'job') { showView('yarn'); renderYarn(); }
  else if (dom === 'settings') { showView('settings'); }
}

function bindActivityBar() {
  document.querySelectorAll('.act-btn').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.domain === 'settings') { showView('settings'); return; }
      switchDomain(b.dataset.domain);
    });
  });
  // 数据域侧栏项
  document.querySelectorAll('[data-pane]').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('[data-pane]').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      if (el.dataset.pane === 'hdfs') { showView('hdfs'); renderHdfs(); }
      else if (el.dataset.pane === 'hive') { showView('hive'); }
      else if (el.dataset.pane === 'tables') { showView('tables'); renderTables(); }
      else if (el.dataset.pane === 'import') { showView('import'); }
      else if (el.dataset.pane === 'hbase') { showView('hbase'); renderHbase(); }
      else if (el.dataset.pane === 'yarn') { showView('yarn'); renderYarn(); }
      else if (el.dataset.pane === 'jobtpl') { showView('jobtpl'); renderJobTemplates(); }
      else if (el.dataset.pane === 'verify') { showView('verify'); }
      else if (el.dataset.pane === 'deploycheck') { showView('deploycheck'); }
      else if (el.dataset.pane === 'diagpack') { showView('diagpack'); }
      else if (el.dataset.pane === 'clustercfg') { showView('clustercfg'); }
      else if (el.dataset.pane === 'cfgtmpl') { showView('cfgtmpl'); loadCfgTemplate(); }
    });
  });
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

// 把扁平快照树(depth序列)渲染成带连接线的树
function buildSnapTree(flat) {
  const root = { name: '__root__', children: [] };
  const parents = [root];   // parents[d] = 深度 d 节点的父
  for (const item of flat) {
    const d = item.depth || 0;
    const parent = parents[d] || root;
    const node = { name: item.name, depth: d, children: [] };
    parent.children.push(node);
    parents[d + 1] = node;
    parents.length = d + 2;
  }
  return root;
}

function renderSnapTreeHtml(flat) {
  const root = buildSnapTree(flat);
  const out = [];
  const line = (guide, node) =>
    '<div class="svc-line snap-tree-line" style="margin-top:0.5rem">' +
    (guide ? '<span class="snap-tree-guide">' + escAll(guide) + '</span>' : '') +
    '<span class="snap">' + escAll(node.name) + '</span><span class="bar-spacer"></span>' +
    '<span class="svc-action" data-vm-snap-rev="' + escAll(node.name) + '">' + t('btn.revert') + '</span>' +
    '<span class="svc-action" data-vm-snap-clone="' + escAll(node.name) + '">' + t('cl.clone') + '</span>' +
    '<span class="svc-action" data-vm-snap-del="' + escAll(node.name) + '" style="color:#e06c6c">' + t('btn.delete') + '</span>' +
    '</div>';
  const walk = (node, prefix) => {
    node.children.forEach((child, idx) => {
      const isLast = idx === node.children.length - 1;
      out.push(line(prefix + (isLast ? '└─ ' : '├─ '), child));
      walk(child, prefix + (isLast ? '   ' : '│  '));
    });
  };
  // 顶层节点：不带连接线（它是根）
  root.children.forEach(top => {
    out.push(line('', top));
    walk(top, '');
  });
  return out.join('');
}

function renderVmView(vmx) {
  const box = document.getElementById('vmDetail');
  const v = VMS.find(x => x.vmx === vmx);
  if (!v) { box.innerHTML = '<div class="empty">' + t('run.none') + '</div>'; return; }
  // 切了 VM → 重置树状状态（否则会串到上一个 VM 的快照树）
  if (window._SNAP_TREE_VMX !== vmx) {
    window._SNAP_TREE = [];
    window._SNAP_TREE_MODE = false;
    window._SNAP_TREE_VMX = vmx;
  }
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
  // 快照区（支持树状视图）
  const treeMode = window._SNAP_TREE_MODE;
  const treeData = window._SNAP_TREE || [];
  html += '<div class="card" style="margin-top:0.8rem">' +
    '<div class="bar-title" style="margin-bottom:0.5rem">' + t('cl.snapshots') + '（' + snaps.length + '）' +
    '<span class="svc-action" style="margin-left:0.6rem" id="vmSnapTreeToggle">' + (treeMode ? t('cl.flatView') : t('cl.treeView')) + '</span></div>' +
    '<div class="form-row">' +
    '<input class="vm-snapname" placeholder="' + t('ph.snapName') + '" style="max-width:240px">' +
    '<button class="primary" id="vmSnapCreate">' + t('btn.create') + '</button>' +
    '</div>' +
    '<div class="result" id="vmSnapResult"></div>';
  if (snaps.length === 0) {
    html += '<div class="empty">' + t('ov.empty') + '</div>';
  } else if (treeMode && treeData.length) {
    // 树状：带连接线（├─└─│）
    html += renderSnapTreeHtml(treeData);
  } else {
    html += snaps.map(s =>
      '<div class="svc-line" style="margin-top:0.5rem">' +
      '<span class="snap">' + s + '</span><span class="bar-spacer"></span>' +
      '<span class="svc-action" data-vm-snap-rev="' + s + '">' + t('btn.revert') + '</span>' +
      '<span class="svc-action" data-vm-snap-clone="' + s + '">' + t('cl.clone') + '</span>' +
      '<span class="svc-action" data-vm-snap-del="' + s + '" style="color:#e06c6c">' + t('btn.delete') + '</span>' +
      '</div>'
    ).join('');
  }
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
    await resetCmdLog();
    const r = await window.pywebview.api.start_vm(vmx);
    document.getElementById('vmOpResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.started') : r.out) + '</span>' + await takeCmdLogHtml();
    await loadVms();
  });
  document.getElementById('vmStopBtn').addEventListener('click', async () => {
    await resetCmdLog();
    const r = await window.pywebview.api.stop_vm(vmx);
    document.getElementById('vmOpResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.stopped') : r.out) + '</span>' + await takeCmdLogHtml();
    await loadVms();
  });
  document.getElementById('vmSnapCreate').addEventListener('click', async () => {
    const name = box.querySelector('.vm-snapname').value.trim();
    const res = document.getElementById('vmSnapResult');
    if (!name) { res.innerHTML = '<span class="err">' + t('ops.needName') + '</span>'; return; }
    res.textContent = t('ops.running');
    await resetCmdLog();
    const r = await window.pywebview.api.snapshot(vmx, name);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>' + await takeCmdLogHtml();
    await loadVms(false, true);
    renderVmView(vmx);
  });
  box.querySelectorAll('[data-vm-snap-rev]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.vmSnapRev;
    if (!await uiConfirm(t('ops.revert') + '：' + s + ' ?')) return;
    await resetCmdLog();
    const r = await window.pywebview.api.revert(vmx, s);
    const cmdHtml = await takeCmdLogHtml();
    await loadVms(false, true);
    renderVmView(vmx);
    document.getElementById('vmSnapResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>' + cmdHtml;
  }));
  box.querySelectorAll('[data-vm-snap-del]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.vmSnapDel;
    if (!await uiConfirm(t('ops.delete') + '：' + s + ' ?')) return;
    await resetCmdLog();
    const r = await window.pywebview.api.delete_snap(vmx, s);
    const cmdHtml = await takeCmdLogHtml();
    await loadVms(false, true);
    renderVmView(vmx);
    document.getElementById('vmSnapResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.deleted') : r.out) + '</span>' + cmdHtml;
  }));
  const treeToggle = document.getElementById('vmSnapTreeToggle');
  if (treeToggle) treeToggle.addEventListener('click', async () => {
    if (window._SNAP_TREE_MODE) {
      window._SNAP_TREE_MODE = false;
      renderVmView(vmx);
    } else {
      // 取树状数据
      try { window._SNAP_TREE = await window.pywebview.api.snapshot_tree(vmx); } catch (e) { window._SNAP_TREE = []; }
      window._SNAP_TREE_VMX = vmx;
      window._SNAP_TREE_MODE = true;
      renderVmView(vmx);
    }
  });
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
    await resetCmdLog();
    const r = await window.pywebview.api.test_node(node);
    document.getElementById('vcResult').innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + r.out + '</span>' + await takeCmdLogHtml();
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
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }   // 操作进行中禁止切集群
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
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }
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
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }
  const name = document.getElementById('clusterSnapName').value.trim();
  const res = document.getElementById('clusterSnapResult');
  if (!name) { res.innerHTML = '<span class="err">' + t('ops.needName') + '</span>'; return; }
  const targets = snapPickedNodes();
  if (targets.length === 0) { res.innerHTML = '<span class="err">' + t('cl.noVmxNodes') + '</span>'; return; }
  // 运行中的 VM 打快照很慢且占大量磁盘空间 → 先确认
  const runningNodes = targets.filter(n => {
    const vm = VMS.find(v => normVmx(v.vmx) === normVmx(n.vmx));
    return vm && vm.running;
  });
  if (runningNodes.length) {
    const names = runningNodes.map(n => n.name).join('、');
    if (!await uiConfirm(t('cl.snapRunningWarn').replace('{n}', names))) return;
  }
  POWER_RUNNING = true; setPowerBtns(true);
  await resetCmdLog();
  res.innerHTML = '<div id="cmdLiveBox"></div><div id="snapProg" class="result"></div>';
  const liveBox = document.getElementById('cmdLiveBox');
  const prog = document.getElementById('snapProg');
  startLiveCmds(liveBox);
  let ok = 0, fail = 0;
  for (const n of targets) {
    prog.textContent = t('ops.running') + ' (' + (ok + fail) + '/' + targets.length + ')';
    try {
      const r = await window.pywebview.api.snapshot(n.vmx, name);
      if (r.ok) ok++; else fail++;
    } catch (e) { fail++; }
  }
  stopLiveCmds();
  res.innerHTML = '<span class="' + (fail === 0 ? 'ok' : 'err') + '">' +
    ok + ' 台成功' + (fail ? '，' + fail + ' 台失败' : '') + '</span>' + await takeCmdLogHtml();
  POWER_RUNNING = false; setPowerBtns(false);
  await loadVms(false, true);
  renderClusterSnap();
}

async function revertClusterSnap(name) {
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }
  if (!await uiConfirm(t('ops.revert') + '（整个集群）：' + name + ' ?')) return;
  POWER_RUNNING = true; setPowerBtns(true);
  const res = document.getElementById('clusterSnapResult');
  const targets = NODES.filter(n => n.vmx);
  res.textContent = t('ops.running');
  await resetCmdLog();
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
  res.innerHTML = '<span class="' + (fail === 0 ? 'ok' : 'err') + '">回滚：' + ok + ' 台成功' + (fail ? '，' + fail + ' 台失败' : '') + '</span>' + await takeCmdLogHtml();
  POWER_RUNNING = false; setPowerBtns(false);
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

// 健康状态 → 文案
function statusLabelOf(st) {
  const key = { green: 'st.ok', yellow: 'st.partial', red: 'st.err', gray: 'st.gray', off: 'st.off' }[st] || 'st.gray';
  return t(key);
}

// 仪表盘：表格化节点列表（主机 / 进程 / 状态）
function renderNodesDashboard(nodes) {
  const head = '<div class="node-table-head">' +
    '<span></span><span>' + t('ov.nodes') + '</span>' +
    '<span class="r">' + t('cl.check') + '</span>' +
    '<span class="r">' + t('ov.ok') + '</span><span></span></div>';
  const rows = nodes.map(n => {
    const st = healthStatusOf(n.id);
    const h = HEALTH[n.id];
    let proc = '—';
    if (h && h.expected && h.expected.length) {
      const got = (h.online && h.procs) ? h.procs.length : 0;
      proc = got + '/' + h.expected.length;
    }
    const expanded = (window._DETAIL_ID === n.id);
    let row = '<div class="node-row' + (expanded ? ' selected' : '') + '" data-id="' + n.id + '">' +
      '<span class="status-dot st-' + st + '"></span>' +
      '<span class="nd-host"><span class="vm-name">' + n.name + '</span>' +
        '<span class="vm-role">' + (n.role || '') + '</span></span>' +
      '<span class="nd-proc">' + proc + '</span>' +
      '<span class="nd-status st-' + st + '">' + statusLabelOf(st) + '</span>' +
      '<span class="vm-count nd-del" data-del="' + n.id + '">' + t('btn.delete') + '</span>' +
      '</div>';
    if (expanded) row += '<div class="node-expand">' + renderHealthInline(n) + '</div>';
    return row;
  }).join('');
  return '<div class="node-table">' + head + rows + '</div>';
}

// 终端：固定宽度方括号标签 + 点线引导 + 右对齐数值
function renderNodesTerminal(nodes) {
  const tagMap = { green: '[ OK ]', yellow: '[ WRN ]', red: '[ ERR ]', gray: '[ -- ]', off: '[ -- ]' };
  return nodes.map(n => {
    const st = healthStatusOf(n.id);
    const h = HEALTH[n.id];
    let val = '';
    if (h && h.expected && h.expected.length) {
      const got = (h.online && h.procs) ? h.procs.length : 0;
      val = got + '/' + h.expected.length;
    } else if (st === 'off') val = t('st.off');
    else val = statusLabelOf(st);
    const expanded = (window._DETAIL_ID === n.id);
    let row = '<div class="node-row' + (expanded ? ' selected' : '') + '" data-id="' + n.id + '">' +
      '<span class="term-tag st-' + st + '">' + (tagMap[st] || '[ -- ]') + '</span>' +
      '<span class="term-name">' + n.name + '</span>' +
      '<span class="term-dots"></span>' +
      '<span class="term-val">' + val + '</span>' +
      '<span class="term-del" data-del="' + n.id + '">' + t('btn.delete') + '</span>' +
      '</div>';
    if (expanded) row += '<div class="node-expand">' + renderHealthInline(n) + '</div>';
    return row;
  }).join('');
}

// 蓝图：空心方框状态 + 名字 + 右对齐大写角色
function renderNodesBlueprint(nodes) {
  return nodes.map(n => {
    const st = healthStatusOf(n.id);
    const role = (n.role || '').toUpperCase();
    const expanded = (window._DETAIL_ID === n.id);
    let row = '<div class="node-row' + (expanded ? ' selected' : '') + '" data-id="' + n.id + '">' +
      '<span class="bp-mark st-' + st + '"></span>' +
      '<span class="bp-name">' + n.name + '</span>' +
      '<span class="bar-spacer"></span>' +
      '<span class="bp-role">' + role + '</span>' +
      '<span class="bp-del" data-del="' + n.id + '">' + t('btn.delete') + '</span>' +
      '</div>';
    if (expanded) row += '<div class="node-expand">' + renderHealthInline(n) + '</div>';
    return row;
  }).join('');
}

function renderNodes() {
  const box = document.getElementById('nodeList');
  const cnt = document.getElementById('nodeCount');
  if (cnt) cnt.textContent = NODES.length;
  if (NODES.length === 0) {
    // 首次使用引导（空状态）
    box.innerHTML =
      '<div class="card" style="padding:1.1rem 1.3rem">' +
      '<div class="bar-title" style="margin-bottom:0.7rem">' + t('guide.title') + '</div>' +
      '<div class="guide-step"><span class="guide-num">1</span>' + t('guide.s1') + '</div>' +
      '<div class="guide-step"><span class="guide-num">2</span>' + t('guide.s2') + '</div>' +
      '<div class="guide-step"><span class="guide-num">3</span>' + t('guide.s3') + '</div>' +
      '<div class="form-row" style="margin-top:0.9rem">' +
      '<button class="primary" id="guideTpl">' + t('guide.tpl') + '</button>' +
      '<button id="guideAdd">' + t('guide.add') + '</button>' +
      '</div></div>';
    const gt = document.getElementById('guideTpl');
    if (gt) gt.addEventListener('click', createFromTemplate);
    const ga = document.getElementById('guideAdd');
    if (ga) ga.addEventListener('click', addNode);
    return;
  }
  // 界面风格提供独立渲染器时，走它的逻辑
  const styleDef = UI_STYLES[uiStyle];
  if (styleDef && styleDef.nodeList) {
    box.innerHTML = styleDef.nodeList(NODES);
    bindNodeRowEvents(box);
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
      '<span class="vm-count" style="cursor:pointer" data-detail="' + n.id + '">' + t('cl.detail') + '</span>' +
      '<span class="vm-count" style="cursor:pointer" data-del="' + n.id + '">删除</span>' +
      '</div>';
    // 就地展开：健康详情
    if (expanded) row += '<div class="node-expand">' + renderHealthInline(n) + '</div>';
    return row;
  }).join('');
  bindNodeRowEvents(box);
}

// 节点行事件绑定（默认渲染 / 主题渲染共用）
function bindNodeRowEvents(box) {
  box.querySelectorAll('.node-row').forEach(r => {
    r.addEventListener('click', (e) => {
      if (e.target.dataset.del) { delNode(e.target.dataset.del); return; }
      if (e.target.dataset.detail) { showDetail(e.target.dataset.detail); return; }
      const id = r.dataset.id;
      window._DETAIL_ID = (window._DETAIL_ID === id) ? null : id;
      renderNodes();
      if (window._DETAIL_ID === id) {
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
    ['terminal', '终端'],
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
  } else if (DETAIL_TAB === 'terminal') {
    body.innerHTML = renderTerminalTab(n);
    bindTerminalTab(n);
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
    await resetCmdLog();
    const r = await window.pywebview.api.snapshot(n.vmx, name);
    const cmdHtml = await takeCmdLogHtml();
    await loadVms(false, true);
    showDetail(n.id);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>' + cmdHtml;
  });
  box.querySelectorAll('[data-snap-rev]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.snapRev;
    if (!await uiConfirm(t('ops.revert') + '：' + s + ' ?')) return;
    res.textContent = t('ops.running');
    await resetCmdLog();
    const r = await window.pywebview.api.revert(n.vmx, s);
    const cmdHtml = await takeCmdLogHtml();
    await loadVms(false, true);
    showDetail(n.id);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.done') : r.out) + '</span>' + cmdHtml;
  }));
  box.querySelectorAll('[data-snap-del]').forEach(el => el.addEventListener('click', async () => {
    const s = el.dataset.snapDel;
    if (!await uiConfirm(t('ops.delete') + '：' + s + ' ?')) return;
    res.textContent = t('ops.running');
    await resetCmdLog();
    const r = await window.pywebview.api.delete_snap(n.vmx, s);
    const cmdHtml = await takeCmdLogHtml();
    await loadVms(false, true);
    showDetail(n.id);
    res.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + (r.ok ? t('ops.deleted') : r.out) + '</span>' + cmdHtml;
  }));
}

// 终端 tab：SSH 到该节点执行命令
let _TERM_HISTORY = {};   // id -> [输出行]

function renderTerminalTab(n) {
  const hist = (_TERM_HISTORY[n.id] || []).map(l =>
    '<div class="term-line ' + (l.cls || '') + '">' + escAll(l.text) + '</div>').join('');
  return '<div class="term-wrap">' +
    '<div class="term-out" id="termOut">' + (hist || '<div class="empty">' + t('term.hint') + '</div>') + '</div>' +
    '<div class="term-input"><span class="term-prompt">$</span>' +
    '<input id="termCmd" placeholder="' + t('term.placeholder') + '" autocomplete="off"></div>' +
    '</div>';
}

function bindTerminalTab(n) {
  const inp = document.getElementById('termCmd');
  const out = document.getElementById('termOut');
  if (!inp) return;
  if (!_TERM_HISTORY[n.id]) _TERM_HISTORY[n.id] = [];
  const paint = () => {
    out.innerHTML = _TERM_HISTORY[n.id].map(l =>
      '<div class="term-line ' + (l.cls || '') + '">' + escAll(l.text) + '</div>').join('') || '<div class="empty">' + t('term.hint') + '</div>';
    out.scrollTop = out.scrollHeight;
  };
  inp.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const cmd = inp.value.trim();
    if (!cmd) return;
    inp.value = '';
    _TERM_HISTORY[n.id].push({ text: '$ ' + cmd, cls: 'cmd' });
    _TERM_HISTORY[n.id].push({ text: t('term.running'), cls: 'run' });
    paint();
    try {
      const r = await window.pywebview.api.node_exec(n, cmd);
      _TERM_HISTORY[n.id].pop();   // 去掉 running
      _TERM_HISTORY[n.id].push({ text: (r.out || '(无输出)'), cls: r.ok ? '' : 'err' });
    } catch (err) {
      _TERM_HISTORY[n.id].pop();
      _TERM_HISTORY[n.id].push({ text: String(err), cls: 'err' });
    }
    // 只留最近 200 行
    if (_TERM_HISTORY[n.id].length > 200) _TERM_HISTORY[n.id] = _TERM_HISTORY[n.id].slice(-200);
    paint();
  });
  inp.focus();
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
    '<input class="nd-cfgroot" value="' + (n.cfg_root || '') + '" placeholder="配置根目录（留空=同路径；如 /opt）">' +
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
    cfg_root: q('.nd-cfgroot') ? q('.nd-cfgroot').value.trim() : (base.cfg_root || ''),
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
  await resetCmdLog();
  const r = await window.pywebview.api.test_node(node);
  box.innerHTML = '<span class="' + (r.ok ? 'ok' : 'err') + '">' + r.out + '</span>' + await takeCmdLogHtml();
}

async function delNode(id) {
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }   // 操作进行中禁止删节点
  if (!await uiConfirm(t('cl.confirmDel'))) return;
  await window.pywebview.api.delete_node(id);
  delete HEALTH[id];
  await loadNodes();
  document.getElementById('nodeDetail').innerHTML = '<div class="empty">' + t('cl.pick') + '</div>';
}

async function addNode() {
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }
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

let DIST_FOUND = [];   // 扫描到的配置目录

async function scanConfigDirs() {
  const btn = document.getElementById('distScan');
  const box = document.getElementById('distList');
  btn.disabled = true; btn.textContent = t('cl.scanning');
  box.innerHTML = '<div class="empty">' + t('cl.scanning') + '</div>';
  try {
    const r = await window.pywebview.api.scan_config_dirs();
    DIST_FOUND = r.dirs || [];
    if (!r.ok) { box.innerHTML = '<div class="err">' + (r.msg || '扫描失败') + '</div>'; return; }
    if (!DIST_FOUND.length) { box.innerHTML = '<div class="empty">' + t('cl.noConfigFound') + '</div>'; return; }
    // 行式列表（每行一个配置目录，含软件名 + 路径 + 勾选）
    box.innerHTML = DIST_FOUND.map(d =>
      '<label class="dist-row">' +
      '<input type="checkbox" data-distpath="' + esc(d.path) + '" checked>' +
      '<span class="dist-sw">' + d.software + '</span>' +
      '<span class="dist-path">' + d.path + '</span>' +
      '</label>'
    ).join('');
    box.querySelectorAll('[data-distpath]').forEach(cb => {
      cb.addEventListener('change', () => cb.parentElement.classList.toggle('on', cb.checked));
      cb.parentElement.classList.toggle('on', cb.checked);
    });
    document.getElementById('distGo').disabled = false;
  } catch (e) {
    box.innerHTML = '<div class="err">' + e + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = t('cl.distScan');
  }
}

async function distributeConfig() {
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }
  const res = document.getElementById('distResult');
  const picked = Array.from(document.querySelectorAll('[data-distpath]:checked')).map(cb => cb.dataset.distpath);
  if (!picked.length) { res.innerHTML = '<span class="err">' + t('cl.pickConfig') + '</span>'; return; }
  const root = (document.getElementById('distTarget').value || '').trim();
  const scope = root ? ('覆盖根目录 ' + root) : '同路径';
  if (!await uiConfirm('把选中的 ' + picked.length + ' 个配置分发到从节点（' + scope + '）？')) return;
  await resetCmdLog();
  res.innerHTML = '<div id="distLiveBox"></div><div id="distProg" class="result">' + t('ops.running') + '</div>';
  startLiveCmds(document.getElementById('distLiveBox'));
  let html = '';
  let anyFail = '';
  for (const src of picked) {
    // 目标路径由后端按"节点 cfg_root 优先 / 否则全局 root / 否则同路径"算，返回在 results[].dst
    const r = await window.pywebview.api.distribute_config(src, root, ['worker']);
    const failOut = (r.results || []).filter(x => !x.ok).map(x => x.out || '').join(' ');
    if (failOut && !anyFail) anyFail = failOut;
    const dsts = [...new Set((r.results || []).map(x => x.dst).filter(Boolean))];
    const dstShow = dsts.length ? dsts.join(' | ') : src;
    html += '<div class="' + (r.ok ? 'ok' : 'err') + '">' + src + ' → ' + dstShow + ' — ' +
      (r.skipped ? t('cl.svcSkipped') : (r.ok ? t('ops.done') : t('ops.fail'))) + '</div>';
  }
  // 失败 → 附人话诊断（rsync 缺失 / 免密没配）
  if (anyFail) {
    const diag = await diagnoseHtml(anyFail);
    if (diag) html += diag;
    else html += '<div class="hint-foot">' + t('cl.distFailHint') + '</div>';
  }
  clearLiveCmds(document.getElementById('distLiveBox'));
  html += await takeCmdLogHtml();
  res.innerHTML = html;
}
document.getElementById('distScan').addEventListener('click', scanConfigDirs);
// 手动添加配置路径（扫描不到时用）
document.getElementById('distManual').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const p = e.target.value.trim();
  if (!p) return;
  const box = document.getElementById('distList');
  if (box.querySelector('[data-distpath="' + p + '"]')) { e.target.value = ''; return; }
  const row = document.createElement('label');
  row.className = 'dist-row on';
  row.innerHTML = '<input type="checkbox" data-distpath="' + p + '" checked>' +
    '<span class="dist-sw">手动</span><span class="dist-path">' + p + '</span>';
  box.appendChild(row);
  e.target.value = '';
  document.getElementById('distGo').disabled = false;
});
document.getElementById('distGo').addEventListener('click', distributeConfig);

// ============ 集群启停编排 ============
let POWER_RUNNING = false;

function powerLog(html) {
  document.getElementById('powerProgress').innerHTML = html;
}

// 运行期间禁用启停相关按钮（避免并发操作打架）
function setPowerBtns(disabled) {
  ['clusterStart', 'clusterStop', 'vmShutdown', 'clusterSnapCreate', 'distGo'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = disabled;
  });
}

async function runCluster(action) {
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }
  POWER_RUNNING = true;
  setPowerBtns(true);
  await resetCmdLog();
  // 实时命令区（挂 powerProgress 的兄弟，避免被 powerLog 重绘冲掉）
  let _live = document.getElementById('clusterCmdLive');
  if (!_live) {
    _live = document.createElement('div');
    _live.id = 'clusterCmdLive';
    const pp = document.getElementById('powerProgress');
    pp.parentNode.insertBefore(_live, pp.nextSibling);
  }
  _live.innerHTML = '';
  startLiveCmds(_live);
  const svcs = await window.pywebview.api.get_services();
  const enabled = svcs.filter(s => s.enabled);
  const stages = [...new Set(enabled.map(s => s.stage))].sort((a, b) => action === 'stop' ? b - a : a - b);

  // 阶段0：启动 VM 并等待 SSH 就绪（仅启动时做）
  let lines = [];
  let aborted = false;
  if (action === 'start') {
    // 启动前先确认 VMware 服务（vmrun 依赖授权服务）
    let vmstate = VMWARE_STATE;
    try { vmstate = await window.pywebview.api.vmware_state(); VMWARE_STATE = vmstate; } catch (e) {}
    if (vmstate && vmstate.state === 'red') {
      POWER_RUNNING = false;
      setPowerBtns(false);
      powerLog('<div class="diag-box"><div class="diag-item diag-error">' +
        '<div class="diag-title">💡 VMware 授权服务未启动</div>' +
        '<div class="diag-meaning">vmrun 依赖「VMware 授权服务」，没启动就无法启停虚拟机</div>' +
        '<div class="diag-fix">👉 先点上方 VMware 状态条的「启动服务」（会弹 UAC），或打开 VMware Workstation</div>' +
        '</div></div>');
      return;
    }
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
      lines.push('<div class="result err">✕ 节点未就绪，已停止（请检查虚拟机是否正常启动）</div>');
      clearLiveCmds(document.getElementById('clusterCmdLive'));
      const _cmdHtml = await takeCmdLogHtml();
      if (_cmdHtml) lines.push(_cmdHtml);
      POWER_RUNNING = false;
      setPowerBtns(false);
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
  setPowerBtns(false);
  clearLiveCmds(document.getElementById('clusterCmdLive'));
  if (!aborted) {
    lines.push('<div class="empty" style="margin-top:0.6rem">' + t('cl.powerDone') + '</div>');
  }
  const _cmdHtml = await takeCmdLogHtml();
  if (_cmdHtml) lines.push(_cmdHtml);
  powerLog(lines.join(''));
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

// ============ 集群视图选项卡（概览/节点/拓扑/监控/快照/分发）============
function bindClusterTabs() {
  document.querySelectorAll('#clusterTabs .detail-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#clusterTabs .detail-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const k = t.dataset.ctab;
      ['overview', 'nodes', 'topo', 'monitor', 'snapshot', 'dist'].forEach(c => {
        const el = document.getElementById('ctab-' + c);
        if (el) el.classList.toggle('hidden', c !== k);
      });
      if (k === 'topo') renderTopology();
      if (k === 'monitor') renderMonitor();
    });
  });
}

// 服务拓扑：每台机器跑了哪些服务
async function renderTopology() {
  const box = document.getElementById('svcTopo');
  if (!box) return;
  box.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.services_topology(); }
  catch (e) { box.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  if (!r.ok) { box.innerHTML = '<div class="empty err">' + escAll(r.msg || '') + '</div>' + cmdHtml; return; }
  let html = '<div class="topo">';
  html += r.nodes.map(n => {
    const isMaster = n.role === 'master';
    let svc;
    if (n.off) svc = '<div class="topo-svc" style="color:var(--muted)">' + t('topo.off') + '</div>';
    else if (!(n.procs || []).length) svc = '<div class="topo-svc" style="color:var(--muted)">' + t('topo.none') + '</div>';
    else svc = n.procs.map(p => '<div class="topo-svc"><span class="d"></span>' + escAll(p) + '</div>').join('');
    return '<div class="topo-node' + (isMaster ? ' master' : '') + '">' +
      '<div class="topo-name"><span class="status-dot ' + (n.off ? 'st-off' : 'st-green') + '"></span>' +
      escAll(n.name) + '</div>' + svc + '</div>';
  }).join('');
  html += '</div>';
  box.innerHTML = html + cmdHtml;
}

// 资源监控：CPU / 内存 / 磁盘 / HDFS 容量
let _MON_HISTORY = [];   // [{cpu, mem, disk}] 最近 N 次采样

// 生成简单折线 SVG（无依赖）
function sparkline(values, color, max) {
  if (!values.length) return '';
  const w = 240, h = 40, n = values.length;
  const mx = max || Math.max.apply(null, values.concat([1]));
  const pts = values.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * w : 0;
    const y = h - (Math.min(v, mx) / mx) * h;
    return (Math.round(x * 10) / 10) + ',' + (Math.round(y * 10) / 10);
  }).join(' ');
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="40" preserveAspectRatio="none">' +
    '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.5"/></svg>';
}

async function renderMonitor() {
  const box = document.getElementById('monitorView');
  if (!box) return;
  box.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.resource_metrics(); }
  catch (e) { box.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  if (!r.ok) { box.innerHTML = '<div class="empty err">' + escAll(r.msg || '') + '</div>' + cmdHtml; return; }
  // 记录本次采样
  const mm = r.master || {};
  _MON_HISTORY.push({ cpu: Number(mm.cpu || 0), mem: (Number(mm.mem_total || 1) > 0 ? Math.round(Number(mm.mem_used || 0) / Number(mm.mem_total) * 100) : 0), disk: (Number(mm.disk_total || 1) > 0 ? Math.round(Number(mm.disk_used || 0) / Number(mm.disk_total) * 100) : 0) });
  if (_MON_HISTORY.length > 20) _MON_HISTORY = _MON_HISTORY.slice(-20);
  const pct = (a, b) => (b && Number(b) > 0) ? Math.min(100, Math.round(Number(a) / Number(b) * 100)) : 0;
  const cls = (p) => p >= 85 ? 'warn' : '';
  const m = r.master || {};
  const card = (label, val, p, cl) =>
    '<div class="mon-card"><div class="mon-label">' + label + '</div>' +
    '<div class="mon-val">' + val + '</div>' +
    '<div class="bar-track"><div class="bar-fill ' + cl + '" style="width:' + p + '%"></div></div></div>';
  let html = '<div class="mon-grid">';
  html += card('CPU', escAll(m.cpu || '?') + '%', Number(m.cpu || 0), cls(Number(m.cpu || 0)));
  html += card(t('mon.mem'), escAll(m.mem_used || '?') + ' / ' + escAll(m.mem_total || '?') + ' M', pct(m.mem_used, m.mem_total), cls(pct(m.mem_used, m.mem_total)));
  html += card(t('mon.disk'), escAll(m.disk_used || '?') + ' / ' + escAll(m.disk_total || '?') + ' M', pct(m.disk_used, m.disk_total), cls(pct(m.disk_used, m.disk_total)));
  const h = r.hdfs || {};
  html += card('HDFS', escAll(h.used || '?') + ' / ' + escAll(h.capacity || '?'), pct(h.used_raw, h.capacity_raw), 'blue');
  html += '</div>';
  // 趋势图（按采样历史；至少 2 次才有线）
  if (_MON_HISTORY.length >= 2) {
    const cpuV = _MON_HISTORY.map(x => x.cpu);
    const memV = _MON_HISTORY.map(x => x.mem);
    const diskV = _MON_HISTORY.map(x => x.disk);
    html += '<div class="mon-card" style="margin-top:0.6rem"><div class="mon-label">' + t('mon.trend') + '（' + _MON_HISTORY.length + ' 次采样）</div>';
    html += '<div class="mon-trend-row"><span class="mon-k">CPU</span>' + sparkline(cpuV, '#4ec97a', 100) + '</div>';
    html += '<div class="mon-trend-row"><span class="mon-k">' + t('mon.mem') + '</span>' + sparkline(memV, '#d9a441', 100) + '</div>';
    html += '<div class="mon-trend-row"><span class="mon-k">' + t('mon.disk') + '</span>' + sparkline(diskV, '#7aa2f7', 100) + '</div>';
    html += '</div>';
  } else {
    html += '<div class="mon-card" style="margin-top:0.2rem"><div class="mon-label">' + t('mon.trend') + '</div>' +
      '<div class="muted" style="margin-top:0.5rem;font-size:0.8rem">' + t('mon.trendHint') + '</div></div>';
  }
  box.innerHTML = html + cmdHtml;
}

// ============ 底部面板（仿 VSCode，B+ 档）============
function bindBottomPanel() {
  const panel = document.getElementById('bottomPanel');
  if (!panel) return;
  // tab 切换
  document.querySelectorAll('.bp-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.bp-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const bp = t.dataset.bp;
    document.getElementById('bpOutput').classList.toggle('hidden', bp !== 'output');
    document.getElementById('bpTask').classList.toggle('hidden', bp !== 'task');
    document.getElementById('bpTerm').classList.toggle('hidden', bp !== 'term');
    const sel = document.getElementById('bpTermNode');
    if (sel) sel.classList.toggle('hidden', bp !== 'term');
    if (bp === 'term') {
      if (panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
      fillTermNodeSelect();
    }
  }));
  // 终端：节点选择 + 输入
  const termSel = document.getElementById('bpTermNode');
  const termCmd = document.getElementById('bpTermCmd');
  if (termCmd) termCmd.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const cmd = termCmd.value.trim();
    if (!cmd) return;
    const nid = termSel && termSel.value;
    const n = NODES.find(x => x.id === nid);
    if (!n) { uiAlert(t('term.pickNode')); return; }
    termCmd.value = '';
    const out = document.getElementById('bpTermOut');
    out.innerHTML += '<div class="term-line cmd">$ ' + escAll(cmd) + '</div>';
    out.innerHTML += '<div class="term-line run">' + t('term.running') + '</div>';
    out.scrollTop = out.scrollHeight;
    try {
      const r = await window.pywebview.api.node_exec(n, cmd);
      out.querySelector('.term-line.run:last-of-type') && out.lastElementChild.remove();
      out.innerHTML += '<div class="term-line ' + (r.ok ? '' : 'err') + '">' + escAll(r.out || '(无输出)') + '</div>';
    } catch (err) {
      out.innerHTML += '<div class="term-line err">' + escAll(String(err)) + '</div>';
    }
    out.scrollTop = out.scrollHeight;
  });
  // 折叠/展开
  document.getElementById('bpClose').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
  });
  // 折叠状态下点标题栏任意处可展开
  panel.querySelector('.bp-head').addEventListener('click', (e) => {
    if (e.target.closest('.bp-icon') || e.target.closest('.bp-tab')) return;
    if (panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
  });
  // 最大化
  document.getElementById('bpMax').addEventListener('click', () => {
    panel.classList.toggle('maximized');
  });
  // 拖拽调高度（上边缘）
  const grip = document.createElement('div');
  grip.className = 'bp-resize';
  panel.appendChild(grip);
  let dragging = false, startY = 0, startH = 0;
  grip.addEventListener('mousedown', (e) => {
    dragging = true; startY = e.clientY; startH = panel.offsetHeight;
    panel.classList.remove('maximized', 'collapsed');
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const h = Math.max(34, Math.min(window.innerHeight * 0.7, startH - (e.clientY - startY)));
    panel.style.height = h + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    try { localStorage.setItem('bpHeight', panel.offsetHeight); } catch (e) {}
  });
  // 高度记忆
  try {
    const saved = localStorage.getItem('bpHeight');
    if (saved) panel.style.height = saved + 'px';
  } catch (e) {}
}

function fillTermNodeSelect() {
  const sel = document.getElementById('bpTermNode');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = NODES.map(n => '<option value="' + n.id + '">' + escAll(n.name) + '</option>').join('');
  if (cur) sel.value = cur;
}

// ============ 命令透明：显示本次操作实际执行的命令 + 输出 ============
// 用法：操作前 await resetCmdLog()；操作后 const cmdHtml = await takeCmdLogHtml()
let _CMD_CACHE = [];   // 最近一次取出的命令（供复制）

async function resetCmdLog() {
  try { await window.pywebview.api.drain_cmd_log(); } catch (e) {}
}

// 把命令数组渲染成 HTML（running 状态也支持）
function renderCmdItems(cmds, open) {
  const items = cmds.map((c, i) => {
    const st = c.running ? 'run' : (c.ok ? 'ok' : 'err');
    const pre = c.running ? '⏳ ' : '$ ';
    const out = (!c.running && c.out) ? '<div class="cmd-out">' + escAll(c.out) + '</div>' : '';
    return '<div class="cmd-item">' +
      '<div class="cmd-line">' +
      (c.target ? '<span class="cmd-tgt">' + escAll(c.target) + '</span>' : '') +
      '<span class="cmd-text ' + st + '">' + pre + escAll(c.cmd) + '</span>' +
      '<span class="cmd-copy" data-copy="' + i + '" title="复制命令">⧉</span>' +
      '</div>' + out + '</div>';
  }).join('');
  return '<div class="cmd-log">' +
    '<div class="cmd-log-head">' + t('cmd.transparent') + '（' + cmds.length + '）' +
    '<span class="cmd-toggle" data-toggle="1">' + (open ? t('cmd.collapse') : t('cmd.expand')) + '</span></div>' +
    '<div class="cmd-log-body"' + (open ? '' : ' style="display:none"') + '>' + items + '</div>' +
    '</div>';
}

async function takeCmdLogHtml(expanded) {
  let cmds = [];
  try { cmds = await window.pywebview.api.drain_cmd_log(); } catch (e) { cmds = []; }
  _CMD_CACHE = cmds || [];
  if (!_CMD_CACHE.length) return '';
  return renderCmdItems(_CMD_CACHE, expanded !== false);
}

// 实时命令显示：操作执行期间，把命令区挂在某个容器上定时刷新（像 shell）
let _LIVE_TIMER = null;
function startLiveCmds(container) {
  stopLiveCmds();
  const tick = async () => {
    let cmds = [];
    try { cmds = await window.pywebview.api.peek_cmd_log(); } catch (e) { cmds = []; }
    if (cmds && cmds.length) {
      container.innerHTML = renderCmdItems(cmds, true);
    }
  };
  tick();
  _LIVE_TIMER = setInterval(tick, 600);
}
function stopLiveCmds() {
  if (_LIVE_TIMER) { clearInterval(_LIVE_TIMER); _LIVE_TIMER = null; }
}

// 清空并停止实时命令区（操作结束后用，避免与最终命令块重复）
function clearLiveCmds(container) {
  stopLiveCmds();
  if (container) container.innerHTML = '';
}

// 事件委托：命令块复制 / 折叠
document.addEventListener('click', (e) => {
  const cp = e.target.closest('.cmd-copy');
  if (cp) {
    const c = _CMD_CACHE[Number(cp.dataset.copy)];
    if (c && navigator.clipboard) navigator.clipboard.writeText(c.cmd);
    return;
  }
  const tg = e.target.closest('.cmd-toggle');
  if (tg) {
    const body = tg.closest('.cmd-log').querySelector('.cmd-log-body');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    tg.textContent = hidden ? t('cmd.collapse') : t('cmd.expand');
  }
});

// 轮询等待节点 SSH 就绪（前端轮询，进度可见）。最长 150 秒
async function waitNodesReady(onTick) {
  const maxSec = 150, intervalMs = 2000;
  let waited = 0;
  while (waited < maxSec) {
    await new Promise(r => setTimeout(r, intervalMs));
    waited += 2;
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
  if (POWER_RUNNING) { uiAlert(t('cl.busy')); return; }   // 有其他操作进行中 → 拒绝
  if (!await uiConfirm(t('cl.confirmShutdown'))) return;
  // 并发逐台关机，每台一行进度
  const targets = NODES.filter(n => (VM_STATUS[n.id] || {}).has_vmx);
  if (targets.length === 0) { powerLog('<div class="empty">' + t('cl.noVmxNodes') + '</div>'); return; }
  POWER_RUNNING = true;
  setPowerBtns(true);
  await resetCmdLog();
  const rows = {};   // id -> 状态
  targets.forEach(n => { rows[n.id] = { name: n.name, state: 'running', text: t('cl.shutdownWait') }; });
  // 实时命令区挂在 powerProgress 的兄弟（避免被 paint 重绘冲掉）
  let _live = document.getElementById('sdLiveBox');
  if (!_live) {
    _live = document.createElement('div');
    _live.id = 'sdLiveBox';
    const pp = document.getElementById('powerProgress');
    pp.parentNode.insertBefore(_live, pp.nextSibling);
  }
  _live.innerHTML = '';
  const paint = () => {
    powerLog(targets.map(n => {
      const r = rows[n.id];
      const st = r.state === 'done' ? 'done' : (r.state === 'fail' ? 'fail' : 'running');
      return renderLine(n.name + ' — ' + r.text, st);
    }).join(''));
  };
  paint();
  startLiveCmds(_live);
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
  setPowerBtns(false);
  const allOk = targets.every(n => rows[n.id].state === 'done');
  clearLiveCmds(document.getElementById('sdLiveBox'));
  paint();
  const _cmdHtml = await takeCmdLogHtml();
  powerLog(targets.map(n => {
    const r = rows[n.id];
    return renderLine(n.name + ' — ' + r.text, r.state === 'done' ? 'done' : 'fail');
  }).join('') + '<div class="empty" style="margin-top:0.5rem">' +
    (allOk ? t('cl.allShutdown') : t('cl.shutdownTimeout')) + '</div>' + _cmdHtml);
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
  if (mode === 'all') {
    // 检查是否有 VM 在运行——有则强力警告（会断网+失去控制）
    let runningCount = 0;
    try {
      const st = await window.pywebview.api.nodes_vm_status();
      runningCount = Object.values(st).filter(v => v.running).length;
    } catch (e) {}
    if (runningCount > 0) {
      warn = '⚠️ 当前有 ' + runningCount + ' 台虚拟机在运行！\n\n' +
        '停止「授权/NAT/DHCP」服务会导致：\n' +
        '  • 虚拟机断网，SSH 连不上（集群失联）\n' +
        '  • vmrun 失效，无法再启停/快照虚拟机\n\n' +
        '虚拟机本身不会关机，但你会失去对它们的控制。\n\n' +
        '建议：先「关闭所有虚拟机」，再停服务。\n\n确定仍要停止？';
    } else {
      warn = t('vm.stopAllWarn');
    }
  }
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
// ============ HDFS 操作（数据域工作台）============
let HDFS_PATH = "/";

// HDFS 左侧目录树（懒加载子目录）
let _HDFS_EXPANDED = new Set(['/']);
async function renderHdfsTree() {
  const tree = document.getElementById('hdfsTree');
  if (!tree) return;
  tree.innerHTML = '<div class="bar-title" style="margin-bottom:0.5rem">' + t('pane.hdfs') + '</div><div class="hdfs-tree-root" data-hdfs-go="/">📁 /</div><div id="hdfsTreeBody" style="padding-left:12px"></div>';
  tree.querySelector('[data-hdfs-go="/"]').addEventListener('click', () => { HDFS_PATH = '/'; renderHdfs(); });
  await expandTreeNode('/', document.getElementById('hdfsTreeBody'));
}

async function expandTreeNode(path, container) {
  let r;
  try { r = await window.pywebview.api.hdfs_dirs(path); } catch (e) { return; }
  if (!r.ok || !r.dirs.length) return;
  container.innerHTML = r.dirs.map(d => {
    const base = d.replace(/\/$/, '').split('/').pop();
    return '<div class="hdfs-tree-node"><span class="hdfs-tree-name" data-hdfs-go="' + escAll(d) + '">📁 ' + escAll(base) + '</span></div>';
  }).join('');
  container.querySelectorAll('[data-hdfs-go]').forEach(el => el.addEventListener('click', () => {
    HDFS_PATH = el.dataset.hdfsGo;
    renderHdfs();
  }));
}

async function renderHdfs() {
  const list = document.getElementById('hdfsList');
  const tree = document.getElementById('hdfsTree');
  const pathEl = document.getElementById('hdfsPath');
  if (!list) return;
  if (pathEl) pathEl.textContent = HDFS_PATH;
  await resetCmdLog();
  list.innerHTML = '<div class="empty">' + t('hdfs.hint') + '</div>';
  let r;
  try { r = await window.pywebview.api.hdfs_ls(HDFS_PATH); }
  catch (e) { list.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  if (!r.ok) {
    list.innerHTML = '<div class="empty err">' + escAll(r.msg || '') + '</div>' + await takeCmdLogHtml();
    return;
  }
  // 左侧目录树（可展开）
  await renderHdfsTree();

  let html = '<div class="hdfs-row head"><span>' + t('hdfs.name') + '</span><span>' + t('hdfs.size') + '</span><span>' + t('hdfs.date') + '</span><span>' + t('hdfs.perm') + '</span><span>' + t('hdfs.act') + '</span></div>';
  if (!r.items.length) {
    html += '<div class="empty">' + t('hdfs.emptyDir') + '</div>';
  } else {
    html += r.items.map(it => {
      const isDir = it.type === 'dir';
      const icon = isDir ? '📁' : '📄';
      const nm = escAll(it.name);
      const full = escAll(it.full);
      return '<div class="hdfs-row">' +
        '<span class="hdfs-name" ' + (isDir ? 'data-hdfs-go="' + full + '"' : '') + '>' + icon + ' ' + nm + '</span>' +
        '<span class="vm-role">' + (isDir ? '—' : escAll(it.size)) + '</span>' +
        '<span class="vm-role">' + escAll(it.date) + '</span>' +
        '<span class="vm-role">' + escAll(it.perm) + '</span>' +
        '<span class="hdfs-actions">' +
          (isDir ? '' : '<span class="svc-action" data-hdfs-dl="' + full + '">' + t('hdfs.dl') + '</span>') +
          '<span class="svc-action" data-hdfs-rename="' + full + '">' + t('hdfs.rename') + '</span>' +
          '<span class="svc-action" data-hdfs-del="' + full + '" data-hdfs-dir="' + (isDir ? 1 : 0) + '" style="color:#e06c6c">' + t('hdfs.del') + '</span></span>' +
        '</div>';
    }).join('');
  }
  html += await takeCmdLogHtml();
  list.innerHTML = html;

  // 绑定：进目录
  list.querySelectorAll('[data-hdfs-go]').forEach(el => el.addEventListener('click', () => {
    HDFS_PATH = el.dataset.hdfsGo || '/';
    renderHdfs();
  }));
  tree.querySelectorAll('[data-hdfs-go]').forEach(el => el.addEventListener('click', () => {
    HDFS_PATH = el.dataset.hdfsGo || '/';
    renderHdfs();
  }));
  // 绑定：下载
  list.querySelectorAll('[data-hdfs-dl]').forEach(el => el.addEventListener('click', async () => {
    const p = el.dataset.hdfsDl;
    await resetCmdLog();
    let r;
    try { r = await window.pywebview.api.hdfs_download_dialog(p); }
    catch (e) { uiAlert('下载失败：' + e); return; }
    if (r.cancelled) return;
    if (!r.ok) { uiAlert('下载失败：' + (r.msg || '')); return; }
    const cmdHtml = await takeCmdLogHtml();
    const list2 = document.getElementById('hdfsList');
    list2.innerHTML = '<div class="empty ok">' + t('hdfs.dlDone') + ': ' + escAll(r.local || '') + '</div>' + cmdHtml +
      '<button class="mini-btn" id="hdfsBack">' + t('hdfs.back') + '</button>';
    document.getElementById('hdfsBack').addEventListener('click', renderHdfs);
  }));
  // 绑定：重命名
  list.querySelectorAll('[data-hdfs-rename]').forEach(el => el.addEventListener('click', async () => {
    const p = el.dataset.hdfsRename;
    const base = p.replace(/\/$/, '').split('/').pop();
    const nn = await uiPrompt(t('hdfs.renameTo'), base);
    if (!nn || nn === base) return;
    const dir = p.replace(/\/[^/]*$/, '');
    const dst = (dir ? dir : '') + '/' + nn;
    const rr = await window.pywebview.api.hdfs_rename(p, dst);
    if (!rr.ok) uiAlert(rr.msg || '');
    renderHdfs();
  }));
  // 绑定：删除
  list.querySelectorAll('[data-hdfs-del]').forEach(el => el.addEventListener('click', async () => {
    const p = el.dataset.hdfsDel;
    if (!await uiConfirm(t('hdfs.delConfirm').replace('{n}', p))) return;
    const rec = el.dataset.hdfsDir === '1';
    const rr = await window.pywebview.api.hdfs_rm(p, rec);
    if (!rr.ok) uiAlert(rr.msg || '');
    renderHdfs();
  }));
}

// HDFS 搜索
async function hdfsSearch() {
  const kw = (document.getElementById('hdfsSearch').value || '').trim();
  const list = document.getElementById('hdfsList');
  if (!kw) { renderHdfs(); return; }
  list.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.hdfs_search(HDFS_PATH, kw); }
  catch (e) { list.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  if (!r.items.length) { list.innerHTML = '<div class="empty">' + t('hdfs.noMatch') + '</div>' + cmdHtml; return; }
  list.innerHTML = '<div class="hdfs-row head"><span>' + t('hdfs.name') + '</span><span>' + t('hdfs.size') + '</span><span></span><span>' + t('hdfs.perm') + '</span><span></span></div>' +
    r.items.map(it => '<div class="hdfs-row"><span>' + (it.type === 'dir' ? '📁' : '📄') + ' ' + escAll(it.full) + '</span><span class="vm-role">' + escAll(it.size) + '</span><span></span><span class="vm-role">' + escAll(it.perm) + '</span><span></span></div>').join('') +
    cmdHtml;
}

// ============ Hive 查询（数据域工作台）============
function parseBeelineTable(text) {
  // beeline --silent 输出：表头 + 数据行，用 | 分隔（默认）
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // 找表头行（第一个含 | 的）
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('|') && !lines[i].startsWith('+')) { start = i; break; }
  }
  if (start < 0) return null;
  const splitRow = (l) => l.split('|').map(c => c.trim()).filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));
  const headers = splitRow(lines[start]);
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('+')) continue;
    if (!lines[i].includes('|')) break;
    rows.push(splitRow(lines[i]));
  }
  return { headers, rows };
}

// SQL 高亮（关键字/字符串/数字/注释）
const SQL_KW = new Set(("select from where group by order having limit insert into values update set delete create " +
  "table external if not exists drop alter add partition partitioned as and or in like join left right inner outer on " +
  "distinct count sum avg min max desc asc union all load data inpath overwrite location row format delimited fields " +
  "terminated stored textfile using describe show databases use").split(" "));

function highlightSql(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 先转义，再按 token 着色（简单正则，够用）
  let out = esc(text);
  out = out.replace(/--[^\n]*/g, m => '\u0001' + m + '\u0002');   // 注释占位
  out = out.replace(/'[^']*'/g, m => '<span class="hive-str">' + m + '</span>');
  out = out.replace(/\b\d+\b/g, m => '<span class="hive-num">' + m + '</span>');
  out = out.replace(/\b([A-Za-z_]+)\b/g, (m, w) => SQL_KW.has(w.toLowerCase()) ? '<span class="hive-kw">' + w + '</span>' : m);
  out = out.replace(/\u0001([\s\S]*?)\u0002/g, (m, c) => '<span class="hive-cmt">' + c + '</span>');
  return out + '\n';
}

function syncHiveHighlight() {
  const ta = document.getElementById('hiveSql');
  const hl = document.getElementById('hiveHighlight');
  if (ta && hl) { hl.innerHTML = highlightSql(ta.value); hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; }
}

async function loadHiveTree() {
  const tree = document.getElementById('hiveTree');
  if (!tree) return;
  tree.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  let r;
  try { r = await window.pywebview.api.hive_tables(); } catch (e) { tree.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  if (!r.ok) { tree.innerHTML = '<div class="empty err">' + escAll(r.msg || '') + '</div>'; return; }
  tree.innerHTML = '<div class="bar-title" style="margin-bottom:0.4rem">default</div>' +
    (r.tables.length ? r.tables.map(tb => '<span class="hive-tree-item" data-hive-tbl="' + escAll(tb) + '">▤ ' + escAll(tb) + '</span>').join('') : '<div class="empty">' + t('tables.none') + '</div>');
  tree.querySelectorAll('[data-hive-tbl]').forEach(el => el.addEventListener('click', () => {
    document.getElementById('hiveSql').value = 'select * from ' + el.dataset.hiveTbl + ' limit 100';
    syncHiveHighlight();
  }));
}

async function runHive() {
  const sql = (document.getElementById('hiveSql').value || '').trim();
  const out = document.getElementById('hiveOut');
  if (!sql) return;
  out.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.hive_exec(sql); }
  catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  const tbl = parseBeelineTable(r.out || '');
  let html = '';
  if (tbl && tbl.headers.length) {
    html = '<table class="hive-tbl"><thead><tr>' +
      tbl.headers.map(h => '<th>' + escAll(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      tbl.rows.map(row => '<tr>' + row.map(c => '<td>' + escAll(c) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';
  } else {
    html = '<pre class="cmd-out" style="max-height:24rem">' + escAll(r.out || '') + '</pre>';
  }
  out.innerHTML = html + cmdHtml;
}

// ============ 部署后验证（作业域）============
async function runDeployCheck2() {
  const out = document.getElementById('dcheckOut');
  if (!out) return;
  out.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.post_deploy_verify(); }
  catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  if (!r.items || !r.items.length) {
    out.innerHTML = '<div class="empty err">' + escAll(r.detail || t('ops.fail')) + '</div>' + cmdHtml;
    return;
  }
  let html = r.items.map(it =>
    '<div class="verify-step ' + (it.ok ? 'done' : 'fail') + '">' +
    '<span class="vs-ico">' + (it.ok ? '✓' : '✕') + '</span>' + escAll(it.label) + '：<b>' + escAll(it.value || '') + '</b></div>'
  ).join('');
  html += '<div class="verify-step ' + (r.ok ? 'done' : 'fail') + '" style="margin-top:0.5rem"><span class="vs-ico">' + (r.ok ? '✓' : '✕') + '</span>' +
    (r.ok ? t('dcheck.pass') : t('dcheck.fail')) + '</div>';
  out.innerHTML = html + cmdHtml;
}

// ============ 配置模板（工具域）============
async function loadCfgTemplate() {
  const name = document.getElementById('cfgtmplSelect').value;
  const ta = document.getElementById('cfgtmplText');
  ta.value = t('ops.running');
  try {
    const content = await window.pywebview.api.get_cfg_template(name);
    ta.value = content || '';
  } catch (e) { ta.value = '加载失败：' + e; }
}

async function saveCfgTemplate() {
  const name = document.getElementById('cfgtmplSelect').value;
  const content = document.getElementById('cfgtmplText').value;
  const out = document.getElementById('cfgtmplOut');
  try {
    const r = await window.pywebview.api.save_text_file(name, content);
    if (r.cancelled) return;
    out.innerHTML = r.ok
      ? '<div class="verify-step done"><span class="vs-ico">✓</span>' + escAll(r.path) + '</div>'
      : '<div class="verify-step fail"><span class="vs-ico">✕</span>' + escAll(r.msg || '') + '</div>';
  } catch (e) { out.innerHTML = '<div class="verify-step fail">' + escAll(String(e)) + '</div>'; }
}

// ============ 结果导出（体检结果 → markdown）============
function buildHealthMarkdown() {
  const lines = [];
  lines.push('# Checkpoint 体检报告');
  lines.push('');
  lines.push('- 集群：' + (CURRENT_CLUSTER || ''));
  lines.push('- 时间：' + new Date().toLocaleString());
  lines.push('');
  lines.push('| 节点 | 角色 | 状态 | 缺失进程 | 缺失服务 | 缺失端口 |');
  lines.push('|---|---|---|---|---|---|');
  const nameMap = { green: '正常', yellow: '部分异常', red: '异常', gray: '未检查', off: '关机' };
  NODES.forEach(n => {
    const h = HEALTH[n.id];
    const st = h ? (nameMap[h.status] || h.status) : '未检查';
    const miss = h && h.missing ? h.missing.join(', ') : '';
    const svcs = h && h.svcs_missing ? h.svcs_missing.join(', ') : '';
    const ports = h && h.ports_missing ? h.ports_missing.join(', ') : '';
    lines.push('| ' + n.name + ' | ' + (n.role || '') + ' | ' + st + ' | ' + miss + ' | ' + svcs + ' | ' + ports + ' |');
  });
  lines.push('');
  return lines.join('\n');
}

async function exportResult() {
  const md = buildHealthMarkdown();
  try {
    const r = await window.pywebview.api.save_text_file('checkpoint-report.md', md);
    if (r.cancelled) return;
    if (r.ok) uiAlert(t('cl.exported') + '\n' + r.path);
    else uiAlert(t('ops.fail') + ': ' + (r.msg || ''));
  } catch (e) { uiAlert(t('ops.fail') + ': ' + e); }
}

// ============ 声明式集群配置（工具域）============
async function exportClusterCfg() {
  const out = document.getElementById('ccfgOut');
  if (!out) return;
  out.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  let r;
  try { r = await window.pywebview.api.export_cluster_config(); }
  catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  if (r.cancelled) { out.innerHTML = ''; return; }
  if (r.ok) out.innerHTML = '<div class="verify-step done"><span class="vs-ico">✓</span>' + escAll(r.msg) + '（' + r.count + ' 节点）</div>';
  else out.innerHTML = '<div class="verify-step fail"><span class="vs-ico">✕</span>' + escAll(r.msg || t('ops.fail')) + '</div>';
}

async function importClusterCfg() {
  const out = document.getElementById('ccfgOut');
  if (!out) return;
  out.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  let r;
  try { r = await window.pywebview.api.import_cluster_config(); }
  catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  if (r.cancelled) { out.innerHTML = ''; return; }
  if (r.ok) {
    out.innerHTML = '<div class="verify-step done"><span class="vs-ico">✓</span>' + escAll(r.msg || '') + '</div>';
    await loadClusters();
    await loadNodes();
    renderSidebar();
  } else {
    out.innerHTML = '<div class="verify-step fail"><span class="vs-ico">✕</span>' + escAll(r.msg || t('ops.fail')) + '</div>';
  }
}

// ============ 脱敏诊断包（工具域）============
async function makeDiagPack() {
  const out = document.getElementById('diagOut');
  if (!out) return;
  out.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  let r;
  try { r = await window.pywebview.api.make_diagpack(); }
  catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  if (r.cancelled) { out.innerHTML = ''; return; }
  if (r.ok) out.innerHTML = '<div class="verify-step done"><span class="vs-ico">✓</span>' + escAll(r.msg) + '</div>';
  else out.innerHTML = '<div class="verify-step fail"><span class="vs-ico">✕</span>' + escAll(r.msg || t('ops.fail')) + '</div>';
}

// ============ HBase 浏览（数据域，按需显示）============
async function renderHbase() {
  const box = document.getElementById('hbaseList');
  if (!box) return;
  box.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.hbase_tables(); }
  catch (e) { box.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  if (!r.tables || !r.tables.length) {
    box.innerHTML = '<div class="empty">' + (r.ok ? t('hbase.none') : escAll(r.msg || '')) + '</div>' + cmdHtml;
    return;
  }
  box.innerHTML = '<table class="yarn-tbl"><thead><tr><th>' + t('hbase.table') + '</th></tr></thead><tbody>' +
    r.tables.map(tb => '<tr><td>' + escAll(tb) + '</td></tr>').join('') + '</tbody></table>' + cmdHtml;
}

// 组件检测：装了 HBase 才显示 HBase 浏览
async function detectComponents() {
  try {
    const r = await window.pywebview.api.detect_components();
    const comp = (r && r.components) || {};
    const hbaseNav = document.getElementById('navHbase');
    if (hbaseNav) hbaseNav.classList.toggle('hidden', !comp.hbase);
  } catch (e) {}
}

// ============ 数据导入（数据域）============
let _importCols = '';

async function previewImport() {
  const path = (document.getElementById('importPath').value || '').trim();
  const box = document.getElementById('importPreviewBox');
  if (!path) return;
  box.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.hive_preview(path); }
  catch (e) { box.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  const lines = (r.out || '').split('\n').filter(Boolean);
  // 按第一行的分隔符数量推算列数，生成默认列名
  const first = lines[0] || '';
  const ncol = Math.max(1, first.split(',').length);
  _importCols = Array.from({length: ncol}, (_, i) => 'c' + (i + 1)).join(',');
  box.innerHTML = '<pre class="cmd-out" style="max-height:10rem">' + escAll(lines.slice(0, 8).join('\n')) + '</pre>' +
    '<div class="hint-foot">' + t('import.detected') + ncol + t('import.cols') + '</div>' + cmdHtml;
  document.getElementById('importStep2').style.display = '';
  const colsInput = document.getElementById('importCols');
  if (colsInput) colsInput.value = _importCols;
}

async function doImport() {
  const path = (document.getElementById('importPath').value || '').trim();
  const table = (document.getElementById('importTable').value || '').trim();
  const sep = document.getElementById('importSep').value || ',';
  const cols = (_importCols || '');
  const out = document.getElementById('importResult');
  if (!path || !table) { uiAlert(t('import.needAll')); return; }
  if (!await uiConfirm(t('import.confirm'))) return;
  out.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.hive_import(path, table, sep, cols); }
  catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  out.innerHTML = '<div class="verify-step ' + (r.ok ? 'done' : 'fail') + '"><span class="vs-ico">' + (r.ok ? '✓' : '✕') + '</span>' +
    escAll(r.msg || '') + '</div>' +
    (r.ddl ? '<div class="hint-foot">DDL: ' + escAll(r.ddl) + '</div>' : '') +
    '<pre class="cmd-out" style="max-height:16rem">' + escAll(r.out || '') + '</pre>' + cmdHtml;
}

// ============ 表管理（数据域）============
async function renderTables() {
  const box = document.getElementById('tablesList');
  if (!box) return;
  box.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.hive_tables(); }
  catch (e) { box.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  if (!r.ok) { box.innerHTML = '<div class="empty err">' + escAll(r.msg || '') + '</div>' + cmdHtml; return; }
  if (!r.tables.length) { box.innerHTML = '<div class="empty">' + t('tables.none') + '</div>' + cmdHtml; return; }
  let html = '<table class="yarn-tbl"><thead><tr><th>' + t('tables.name') + '</th><th>' + t('hdfs.act') + '</th></tr></thead><tbody>';
  html += r.tables.map(tb =>
    '<tr><td>' + escAll(tb) + '</td><td class="hdfs-actions">' +
    '<span class="svc-action" data-table-desc="' + escAll(tb) + '">' + t('tables.desc') + '</span>' +
    '</td></tr>').join('');
  html += '</tbody></table>';
  box.innerHTML = html + cmdHtml;
  box.querySelectorAll('[data-table-desc]').forEach(el => el.addEventListener('click', async () => {
    const tb = el.dataset.tableDesc;
    await resetCmdLog();
    let dr;
    try { dr = await window.pywebview.api.hive_describe(tb); }
    catch (e) { uiAlert('查表失败：' + e); return; }
    const cmds = await takeCmdLogHtml();
    const box2 = document.getElementById('tablesList');
    box2.innerHTML = '<div class="obj-sub">describe ' + escAll(tb) + '</div>' +
      '<pre class="cmd-out" style="max-height:24rem;margin-top:0.6rem">' + escAll(dr.out || '') + '</pre>' + cmds +
      '<button class="mini-btn" id="tablesBack">' + t('hdfs.back') + '</button>';
    document.getElementById('tablesBack').addEventListener('click', renderTables);
  }));
}

// ============ 作业模板（作业域）============
async function renderJobTemplates() {
  const box = document.getElementById('jobtplList');
  if (!box) return;
  let tpls = [];
  try { tpls = await window.pywebview.api.list_job_templates(); }
  catch (e) { box.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  box.innerHTML = tpls.map(tp =>
    '<div class="jobtpl-card"><div class="jobtpl-name">' + escAll(tp.name) + '</div>' +
    '<div class="jobtpl-desc">' + escAll(tp.desc) + '</div>' +
    '<button class="mini-btn primary" data-jobtpl="' + escAll(tp.id) + '">' + t('jobtpl.run') + '</button></div>'
  ).join('');
  box.querySelectorAll('[data-jobtpl]').forEach(el => el.addEventListener('click', async () => {
    const tid = el.dataset.jobtpl;
    const out = document.getElementById('jobtplResult');
    if (!await uiConfirm(t('jobtpl.confirm'))) return;
    out.innerHTML = '<div class="empty">' + t('ops.running') + '（可能较慢，请稍候）</div>';
    await resetCmdLog();
    let r;
    try { r = await window.pywebview.api.run_job_template(tid); }
    catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
    const cmdHtml = await takeCmdLogHtml();
    out.innerHTML = '<div class="verify-step ' + (r.ok ? 'done' : 'fail') + '"><span class="vs-ico">' + (r.ok ? '✓' : '✕') + '</span>' +
      (r.ok ? t('ops.done') : t('ops.fail')) + '</div>' +
      '<pre class="cmd-out" style="max-height:22rem">' + escAll(r.out || '') + '</pre>' + cmdHtml;
  }));
}

// ============ 集群验证（作业域）============
async function runVerify() {
  const out = document.getElementById('verifyOut');
  if (!out) return;
  out.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.cluster_verify(); }
  catch (e) { out.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  let html = '';
  (r.steps || []).forEach(s => {
    const cls = s.ok ? 'done' : 'fail';
    const ico = s.ok ? '✓' : '✕';
    html += '<div class="verify-step ' + cls + '"><span class="vs-ico">' + ico + '</span>' + escAll(s.label) + '</div>';
  });
  if (r.ok) {
    html += '<div class="sec-head" style="margin-top:1rem"><span class="sec-title">' + t('verify.result') + '</span></div>';
    html += '<pre class="cmd-out" style="max-height:14rem">' + escAll(r.result || '') + '</pre>';
    html += '<div class="verify-step done" style="margin-top:0.5rem"><span class="vs-ico">✓</span>' + t('verify.pass') + '</div>';
  } else {
    html += '<div class="verify-step fail" style="margin-top:0.5rem"><span class="vs-ico">✕</span>' + escAll(r.msg || t('ops.fail')) + '</div>';
  }
  out.innerHTML = html + cmdHtml;
}

// ============ YARN 作业（作业域）============
async function renderYarn() {
  const box = document.getElementById('yarnList');
  if (!box) return;
  box.innerHTML = '<div class="empty">' + t('ops.running') + '</div>';
  await resetCmdLog();
  let r;
  try { r = await window.pywebview.api.yarn_apps(); }
  catch (e) { box.innerHTML = '<div class="empty err">' + e + '</div>'; return; }
  const cmdHtml = await takeCmdLogHtml();
  if (!r.ok) {
    box.innerHTML = '<div class="empty err">' + escAll(r.msg || '') + '</div>' + cmdHtml;
    return;
  }
  if (!r.apps.length) {
    box.innerHTML = '<div class="empty">' + t('yarn.noApps') + '</div>' + cmdHtml;
    return;
  }
  let html = '<table class="yarn-tbl"><thead><tr>' +
    '<th>' + t('yarn.id') + '</th><th>' + t('yarn.name') + '</th><th>' + t('yarn.type') + '</th>' +
    '<th>' + t('yarn.queue') + '</th><th>' + t('yarn.state') + '</th><th>' + t('yarn.start') + '</th>' +
    '<th>' + t('hdfs.act') + '</th>' +
    '</tr></thead><tbody>';
  html += r.apps.map(a =>
    '<tr>' +
    '<td class="vm-role">' + escAll(a.id) + '</td>' +
    '<td>' + escAll(a.name) + '</td>' +
    '<td>' + escAll(a.type) + '</td>' +
    '<td>' + escAll(a.queue) + '</td>' +
    '<td><span class="yarn-state ' + escAll(a.state) + '">' + escAll(a.state) + '</span></td>' +
    '<td class="vm-role">' + escAll(a.start) + '</td>' +
    '<td class="hdfs-actions">' +
      '<span class="svc-action" data-yarn-log="' + escAll(a.id) + '">' + t('yarn.log') + '</span>' +
      (a.state === 'RUNNING' ? '<span class="svc-action" data-yarn-kill="' + escAll(a.id) + '" style="color:#e06c6c">' + t('yarn.kill') + '</span>' : '') +
    '</td>' +
    '</tr>'
  ).join('');
  html += '</tbody></table>';
  box.innerHTML = html + cmdHtml;
  // 绑定：查看日志
  box.querySelectorAll('[data-yarn-log]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.yarnLog;
    await resetCmdLog();
    let lr;
    try { lr = await window.pywebview.api.yarn_app_logs(id); }
    catch (e) { uiAlert('取日志失败：' + e); return; }
    const cmds = await takeCmdLogHtml();
    const box2 = document.getElementById('yarnList');
    box2.innerHTML = '<div class="obj-sub">' + t('yarn.logOf') + escAll(id) + '</div>' +
      '<pre class="cmd-out" style="max-height:32rem;margin-top:0.6rem">' + escAll(lr.out || '') + '</pre>' + cmds +
      '<button class="mini-btn" id="yarnLogBack">' + t('hdfs.back') + '</button>';
    document.getElementById('yarnLogBack').addEventListener('click', renderYarn);
  }));
  // 绑定：kill
  box.querySelectorAll('[data-yarn-kill]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.yarnKill;
    if (!await uiConfirm(t('yarn.killConfirm').replace('{id}', id))) return;
    try { await window.pywebview.api.yarn_kill(id); } catch (e) {}
    renderYarn();
  }));
}

window.addEventListener('pywebviewready', async () => {
  bindActivityBar();
  bindBottomPanel();
  bindClusterTabs();
  const yarnRefreshBtn = document.getElementById('yarnRefresh');
  if (yarnRefreshBtn) yarnRefreshBtn.addEventListener('click', renderYarn);
  const tablesRefreshBtn = document.getElementById('tablesRefresh');
  if (tablesRefreshBtn) tablesRefreshBtn.addEventListener('click', renderTables);
  const hbaseRefreshBtn = document.getElementById('hbaseRefresh');
  if (hbaseRefreshBtn) hbaseRefreshBtn.addEventListener('click', renderHbase);
  const impPrev = document.getElementById('importPreview');
  if (impPrev) impPrev.addEventListener('click', previewImport);
  const impGo = document.getElementById('importGo');
  if (impGo) impGo.addEventListener('click', doImport);
  const verifyRunBtn = document.getElementById('verifyRun');
  if (verifyRunBtn) verifyRunBtn.addEventListener('click', runVerify);
  const diagMakeBtn = document.getElementById('diagMake');
  if (diagMakeBtn) diagMakeBtn.addEventListener('click', makeDiagPack);
  // Kerberos 开关（= kdc service 的 enable 状态）
  const kbSwitch = document.getElementById('kerberosSwitch');
  if (kbSwitch) {
    try {
      const svcs = await window.pywebview.api.get_services();
      const kdc = svcs.find(s => s.id === 'kdc');
      kbSwitch.checked = kdc ? kdc.enabled : false;
    } catch (e) {}
    kbSwitch.addEventListener('change', async () => {
      try { await window.pywebview.api.set_service_enabled('kdc', kbSwitch.checked); } catch (e) {}
    });
  }
  const exportResultBtn = document.getElementById('exportResult');
  if (exportResultBtn) exportResultBtn.addEventListener('click', exportResult);
  const dcheckRunBtn = document.getElementById('dcheckRun');
  if (dcheckRunBtn) dcheckRunBtn.addEventListener('click', runDeployCheck2);
  const cfgLoad = document.getElementById('cfgtmplLoad');
  if (cfgLoad) cfgLoad.addEventListener('click', loadCfgTemplate);
  const cfgSave = document.getElementById('cfgtmplSave');
  if (cfgSave) cfgSave.addEventListener('click', saveCfgTemplate);
  const cfgCopy = document.getElementById('cfgtmplCopy');
  if (cfgCopy) cfgCopy.addEventListener('click', () => {
    const txt = document.getElementById('cfgtmplText').value;
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    uiAlert(t('cfgtmpl.copied'));
  });
  const cfgSel = document.getElementById('cfgtmplSelect');
  if (cfgSel) cfgSel.addEventListener('change', loadCfgTemplate);
  const ccfgExp = document.getElementById('ccfgExport');
  if (ccfgExp) ccfgExp.addEventListener('click', exportClusterCfg);
  const ccfgImp = document.getElementById('ccfgImport');
  if (ccfgImp) ccfgImp.addEventListener('click', importClusterCfg);
  // Hive 工具栏
  const hiveRunBtn = document.getElementById('hiveRun');
  if (hiveRunBtn) hiveRunBtn.addEventListener('click', runHive);
  const hiveSqlEl = document.getElementById('hiveSql');
  if (hiveSqlEl) {
    hiveSqlEl.addEventListener('input', syncHiveHighlight);
    hiveSqlEl.addEventListener('scroll', syncHiveHighlight);
    syncHiveHighlight();
  }
  const hiveLoadTreeBtn = document.getElementById('hiveLoadTree');
  if (hiveLoadTreeBtn) hiveLoadTreeBtn.addEventListener('click', loadHiveTree);
  const hiveClearBtn = document.getElementById('hiveClear');
  if (hiveClearBtn) hiveClearBtn.addEventListener('click', () => { document.getElementById('hiveSql').value = ''; document.getElementById('hiveOut').innerHTML = ''; });
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
  // HDFS 工具栏
  const hdfsSearchBtn = document.getElementById('hdfsSearchBtn');
  if (hdfsSearchBtn) hdfsSearchBtn.addEventListener('click', hdfsSearch);
  const hdfsSearchInput = document.getElementById('hdfsSearch');
  if (hdfsSearchInput) hdfsSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') hdfsSearch(); });
  const hr = document.getElementById('hdfsRefresh');
  if (hr) hr.addEventListener('click', renderHdfs);
  const hm = document.getElementById('hdfsMkdir');
  if (hm) hm.addEventListener('click', async () => {
    const name = await uiPrompt(t('hdfs.mkdir'), '');
    if (!name) return;
    const p = (HDFS_PATH.replace(/\/$/, '') + '/' + name);
    const rr = await window.pywebview.api.hdfs_mkdir(p);
    if (!rr.ok) uiAlert(rr.msg || '');
    renderHdfs();
  });
  const hu = document.getElementById('hdfsUpload');
  if (hu) hu.addEventListener('click', async () => {
    await resetCmdLog();
    let r;
    try { r = await window.pywebview.api.hdfs_pick_and_upload(HDFS_PATH); }
    catch (e) { uiAlert('上传失败：' + e); return; }
    if (r.cancelled) return;
    if (!r.ok) { uiAlert('上传失败：' + (r.msg || '')); }
    renderHdfs();
  });
  await loadHealthCache();   // 恢复上次体检结果
  loadVmware();
  // 无边框窗口：补回可拖拽边缘（延迟到窗口完全就绪）
  try { await window.pywebview.api.enable_resize(); } catch (e) {}
});
