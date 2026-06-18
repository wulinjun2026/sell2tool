import { api } from './api.js';

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'trial_active', label: '试用中' },
  { key: 'trial_expired', label: '试用到期' },
  { key: 'limit_reached', label: '配额已满' },
  { key: 'paid', label: '付费版' },
];

let state = {
  overview: null,
  users: [],
  total: 0,
  status: 'all',
  q: '',
  loading: false,
};

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function fmtTrial(user) {
  if (user.status === 'paid') return '不限';
  const t = user.trial;
  if (!t) return '—';
  if (t.expired) return '已到期';
  return `剩余 ${t.daysRemaining ?? 0} 天`;
}

function quotaText(user) {
  if (user.unlimited) return `${user.used} / 不限`;
  return `${user.used} / ${user.limit ?? '—'}`;
}

function renderOverview(container, overview) {
  if (!container || !overview) return;
  container.innerHTML = `
    <div class="users-stat-grid">
      <div class="users-stat-card"><span class="num">${overview.totalUsers}</span><span class="lbl">总用户</span></div>
      <div class="users-stat-card ok"><span class="num">${overview.trialActive}</span><span class="lbl">试用中</span></div>
      <div class="users-stat-card warn"><span class="num">${overview.trialExpired}</span><span class="lbl">试用到期</span></div>
      <div class="users-stat-card"><span class="num">${overview.paidUsers}</span><span class="lbl">付费版</span></div>
      <div class="users-stat-card"><span class="num">${overview.limitReached}</span><span class="lbl">配额已满</span></div>
      <div class="users-stat-card"><span class="num">${overview.activeLast7Days}</span><span class="lbl">7 日活跃</span></div>
    </div>
    <p class="users-summary-extra">全站产品 ${overview.totalProducts} 件 · 已发布 ${overview.totalPublished} 件</p>`;
}

function renderFilters(root) {
  const bar = root.querySelector('#users-filter-bar');
  if (!bar) return;
  bar.innerHTML = STATUS_FILTERS.map((f) => `
    <button type="button" class="users-filter-chip ${state.status === f.key ? 'active' : ''}" data-user-filter="${f.key}">${f.label}</button>
  `).join('');
}

function renderList(root) {
  const list = root.querySelector('#users-admin-list');
  const meta = root.querySelector('#users-list-meta');
  if (!list) return;

  if (state.loading) {
    list.innerHTML = '<p class="users-empty">加载中…</p>';
    return;
  }

  if (!state.users.length) {
    list.innerHTML = '<p class="users-empty">暂无符合条件的用户</p>';
    if (meta) meta.textContent = '共 0 人';
    return;
  }

  if (meta) {
    meta.textContent = `共 ${state.total} 人${state.total > state.users.length ? ` · 显示 ${state.users.length} 人` : ''}`;
  }

  list.innerHTML = state.users.map((u) => `
    <div class="users-row" data-user-id="${u.id}">
      <div class="users-row-head">
        <div>
          <div class="users-row-phone">${u.phoneMasked || u.phone}</div>
          <div class="users-row-sub">${u.shopName || '未填写店铺'} · 最近登录 ${fmtTime(u.lastLoginAt)}</div>
        </div>
        <span class="users-status-tag status-${u.status}">${u.statusLabel}</span>
      </div>
      <div class="users-row-metrics">
        <span>产品 ${quotaText(u)}</span>
        <span>试用 ${fmtTrial(u)}</span>
        <span>已发布 ${u.publishedCount}</span>
      </div>
      <div class="users-row-actions">
        ${u.plan === 'paid'
    ? `<button type="button" class="btn-sm outline" data-user-plan="free" data-user-id="${u.id}">设为免费</button>`
    : `<button type="button" class="btn-sm primary" data-user-plan="paid" data-user-id="${u.id}">升级付费</button>`}
        <span class="users-row-id">${u.phone}</span>
      </div>
    </div>
  `).join('');
}

function renderPage(root) {
  if (!root) return;
  renderOverview(root.querySelector('#users-overview'), state.overview);
  renderFilters(root);
  renderList(root);
}

export async function loadUsersAdminPage() {
  const root = document.querySelector('#settings-form-users');
  if (!root) return;
  state.loading = true;
  renderPage(root);
  try {
    const [overviewRes, listRes] = await Promise.all([
      api.getAdminUsersOverview(),
      api.getAdminUsers({ status: state.status, q: state.q }),
    ]);
    state.overview = overviewRes.overview;
    state.users = listRes.users || [];
    state.total = listRes.total || 0;
  } catch (e) {
    root.innerHTML = `<p class="settings-error">${e.message === 'SETTINGS_FORBIDDEN' ? '无权查看使用者状态' : '加载失败'}</p>`;
    return;
  } finally {
    state.loading = false;
  }
  root.innerHTML = `
    <p class="dealer-settings-hint">查看全站注册用户试用、配额与活跃情况；可在此升级付费版。</p>
    <div id="users-overview"></div>
    <div class="users-toolbar">
      <input type="search" id="users-search-input" class="dealer-field" placeholder="搜索手机号" value="${state.q.replace(/"/g, '&quot;')}">
      <button type="button" class="btn-sm outline" id="users-refresh-btn">刷新</button>
    </div>
    <div class="users-filter-bar" id="users-filter-bar"></div>
    <p class="settings-meta" id="users-list-meta"></p>
    <div class="users-admin-list" id="users-admin-list"></div>`;
  renderPage(root);
}

async function setUserPlan(userId, plan, toast) {
  try {
    await api.setAdminUserPlan(userId, plan);
    toast?.(plan === 'paid' ? '已升级为付费版' : '已设为免费版');
    await loadUsersAdminPage();
  } catch {
    toast?.('操作失败');
  }
}

export function bindUsersAdminPage({ goto, toast }) {
  document.querySelector('#settings-hub')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto-settings="page-settings-users"]');
    if (btn) goto('page-settings-users');
  });

  document.querySelectorAll('[data-settings-page="users"]').forEach((page) => {
    const observer = new MutationObserver(() => {
      if (page.classList.contains('active')) loadUsersAdminPage();
    });
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  });

  document.body.addEventListener('click', (e) => {
    const filter = e.target.closest('[data-user-filter]');
    if (filter && document.querySelector('#page-settings-users.active')) {
      state.status = filter.dataset.userFilter;
      loadUsersAdminPage();
      return;
    }
    const planBtn = e.target.closest('[data-user-plan]');
    if (planBtn && document.querySelector('#page-settings-users.active')) {
      setUserPlan(planBtn.dataset.userId, planBtn.dataset.userPlan, toast);
      return;
    }
    if (e.target.id === 'users-refresh-btn') {
      loadUsersAdminPage();
    }
  });

  document.body.addEventListener('input', (e) => {
    if (e.target.id !== 'users-search-input') return;
    clearTimeout(bindUsersAdminPage._searchTimer);
    bindUsersAdminPage._searchTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      loadUsersAdminPage();
    }, 300);
  });
}
