/* ============================================================
   SHRI VISAT MELDI MATA MANDIR — DIVINE MANDALA JAVASCRIPT ENGINE
   ============================================================ */

// Master State Store
const state = {
  activePage: 'dashboard',
  roleScope: 'admin',
  currentLang: 'en',

  // Devotees Register (Central Person Model)
  devotees: [],
  
  // Financial Donations Log — superseded by the Donations module (donations.js)
  donations: [],

  // 36 Pooja Master Catalog — superseded by POOJA.poojaTypes (pooja.js); kept for reference only
  poojas: [],

  // Inventory Stock
  inventory: [],

  // Expense Records
  expenses: []
};

// Initialize Application Engine
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  renderDevoteeTable();
  renderInventoryTable();
  renderExpensesTable();
  initCharts();
  renderCalendar();
  injectMandalaDecorations();
});

// Setup Navigation & Router
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.getAttribute('data-page');
      if (pageId) {
        switchPage(pageId);
      }
    });
  });

  const toggleBtn = document.getElementById('toggleSidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebarMenu);
  }
}

function toggleSidebarMenu() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
}

/**
 * Pages the currently active session may open.
 * Returns null for an unrestricted (admin / core-team) session, otherwise
 * the allow-list for the one restricted module scope that is active.
 * Kept here (not in a module -ui.js) so switchPage can enforce it centrally.
 */
function currentAllowedPages() {
  if (typeof CMT !== 'undefined' && CMT.session && CMT.session.role === 'leader') return ['dashboard', 'committees'];
  if (typeof POOJA !== 'undefined' && POOJA.session && POOJA.session.role === 'coordinator') return ['dashboard', 'puja'];
  if (typeof MG !== 'undefined' && MG.session && MG.session.role === 'lead') return ['dashboard', 'management'];
  return null;
}

/** True when the active session is allowed to open pageId. */
function canOpenPage(pageId) {
  const allowed = currentAllowedPages();
  return !allowed || allowed.indexOf(pageId) !== -1;
}

function switchPage(pageId) {
  // Central access guard — a scoped leader/coordinator can never be routed
  // (via a dashboard shortcut, calendar item, deep link, etc.) into a module
  // they are not authorised for.
  if (!canOpenPage(pageId)) {
    if (typeof showToast === 'function') showToast('You do not have access to that section.');
    pageId = 'dashboard';
  }
  state.activePage = pageId;

  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    if (el.getAttribute('data-page') === pageId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  document.querySelectorAll('.page').forEach(page => {
    if (page.id === `page-${pageId}`) {
      page.classList.add('active');
    } else {
      page.classList.remove('active');
    }
  });

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Scoped User Role Switcher
// Only one module (Management OR Pooja) is ever in a restricted scope at a time.
// The sibling module is reset to admin FIRST (silently) and the target scope is
// activated LAST, so the restricting nav-chrome pass is always the final writer.
function changeRoleScope(role) {
  state.roleScope = role;

  const resetOthers = (except) => {
    if (except !== 'mg' && typeof setMgSession === 'function') setMgSession('admin', null, false);
    if (except !== 'pj' && typeof setPoojaSession === 'function') setPoojaSession('admin', null, false);
    if (except !== 'cmt' && typeof setCmtSession === 'function') setCmtSession('admin', null, false);
  };

  // Pooja Coordinator scope
  if (role.indexOf('coord:') === 0) {
    resetOthers('pj');
    if (typeof setPoojaSession === 'function') setPoojaSession('coordinator', role.slice(6));
    return;
  }
  // Management Lead scope
  if (role.indexOf('lead:') === 0) {
    resetOthers('mg');
    if (typeof setMgSession === 'function') setMgSession('lead', role.slice(5));
    return;
  }
  // Committee Leader scope
  if (role.indexOf('cmt:') === 0) {
    resetOthers('cmt');
    if (typeof setCmtSession === 'function') setCmtSession('leader', role.slice(4));
    return;
  }

  // Admin / core-team scopes — every module back to admin
  resetOthers(null);

  const roleTitle = role === 'admin' ? 'Super Admin (Full Platform)' : role === 'pooja_manager' ? 'Pooja Manager' : role === 'accountant' ? 'Temple Accountant' : 'Parking & Operations Lead';
  showToast(`Context switched to: ${roleTitle}`);

  if (role === 'pooja_manager') {
    switchPage('puja');
  } else if (role === 'accountant') {
    switchPage('donations');
  } else if (role === 'parking_head') {
    switchPage('teams');
  } else {
    switchPage('dashboard');
  }
}


// Trilingual layer lives in i18n.js (window.setLanguage / t / tData).
// This wrapper keeps older callers working and syncs state.currentLang.
function changeLanguage(lang) {
  state.currentLang = lang;
  if (typeof setLanguage === 'function') setLanguage(lang);
}

// Devotees Table Renderer & Filter
function renderDevoteeTable() {
  const tbody = document.getElementById('devoteeTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.devotees.forEach(dev => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${dev.id}</strong></td>
      <td>${dev.name}</td>
      <td>${dev.phone}</td>
      <td>${dev.city}</td>
      <td><span class="badge badge-maroon">${dev.samaj}</span></td>
      <td><span class="badge badge-confirmed">${dev.status}</span></td>
      <td>
        <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="showToast('Profile: ${dev.name} (${dev.visits} visits)')">Profile</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const label = document.getElementById('devoteeCountLabel');
  if (label) label.innerText = `Showing ${state.devotees.length} Devotees`;
}

function filterDevotees() {
  const query = (document.getElementById('devoteeSearch')?.value || '').toLowerCase();
  const filterSamaj = document.getElementById('devoteeSamajFilter')?.value || 'all';

  const filtered = state.devotees.filter(dev => {
    const matchesQuery = dev.name.toLowerCase().includes(query) || dev.phone.includes(query) || dev.city.toLowerCase().includes(query);
    const matchesSamaj = filterSamaj === 'all' || dev.samaj === filterSamaj;
    return matchesQuery && matchesSamaj;
  });

  const tbody = document.getElementById('devoteeTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  filtered.forEach(dev => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${dev.id}</strong></td>
      <td>${dev.name}</td>
      <td>${dev.phone}</td>
      <td>${dev.city}</td>
      <td><span class="badge badge-maroon">${dev.samaj}</span></td>
      <td><span class="badge badge-confirmed">${dev.status}</span></td>
      <td>
        <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="showToast('Profile: ${dev.name}')">Profile</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const label = document.getElementById('devoteeCountLabel');
  if (label) label.innerText = `Showing ${filtered.length} Devotees`;
}

// Donations are handled by the Donations module (donations*.js).

// Inventory Table Renderer
function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.inventory.forEach(inv => {
    const badgeClass = inv.status === 'In Stock' ? 'badge-confirmed' : inv.status === 'Low Stock' ? 'badge-pending' : 'badge-cancelled';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${inv.id}</strong></td>
      <td>${inv.item}</td>
      <td>${inv.category}</td>
      <td><strong>${inv.stock}</strong></td>
      <td>${inv.minStock}</td>
      <td><span class="badge ${badgeClass}">${inv.status}</span></td>
      <td>
        <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="showToast('Reorder requested for ${inv.item}')">Reorder</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Expenses Table Renderer
function renderExpensesTable() {
  const tbody = document.getElementById('expensesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.expenses.forEach(exp => {
    const badgeClass = exp.status === 'Paid' ? 'badge-confirmed' : 'badge-pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${exp.id}</strong></td>
      <td>${exp.title}</td>
      <td>${exp.category}</td>
      <td><strong>₹${exp.amount.toLocaleString('en-IN')}</strong></td>
      <td>${exp.date}</td>
      <td><span class="badge ${badgeClass}">${exp.status}</span></td>
      <td>
        <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="showToast('Voucher details for ${exp.id}')">Voucher</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Modal Management
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// Form Submission Handlers
function handleSaveDevotee(e) {
  e.preventDefault();
  const name = document.getElementById('inputDevoteeName').value;
  const phone = document.getElementById('inputDevoteePhone').value;
  const samaj = document.getElementById('inputDevoteeSamaj').value;
  const city = document.getElementById('inputDevoteeCity').value;

  const newDevotee = {
    id: `#DEV-${1000 + state.devotees.length + 1}`,
    name, phone, city, samaj, status: 'Active', visits: 1
  };

  state.devotees.unshift(newDevotee);
  renderDevoteeTable();
  closeModal('modalAddDevotee');
  e.target.reset();
  showToast(`Devotee ${name} registered successfully!`);
}

function handleSaveExpense(e) {
  e.preventDefault();
  const title = document.getElementById('inputExpenseTitle').value;
  const amount = parseInt(document.getElementById('inputExpenseAmount').value);
  const category = document.getElementById('inputExpenseCategory').value;

  const newExpense = {
    id: `#EXP-${500 + state.expenses.length + 1}`,
    title, category, amount, date: '05 Sept 2026', status: 'Paid'
  };

  state.expenses.unshift(newExpense);
  renderExpensesTable();
  closeModal('modalAddExpense');
  e.target.reset();
  showToast(`Expense voucher created for ₹${amount.toLocaleString('en-IN')}!`);
}

function handleSaveInventory(e) {
  e.preventDefault();
  const item = document.getElementById('inputInventoryItem').value;
  const category = document.getElementById('inputInventoryCategory').value;
  const stock = document.getElementById('inputInventoryStock').value;
  const minStock = document.getElementById('inputInventoryMinStock').value;

  const newInventory = {
    id: `#INV-0${state.inventory.length + 1}`,
    item, category, stock, minStock, status: 'In Stock'
  };

  state.inventory.unshift(newInventory);
  renderInventoryTable();
  closeModal('modalAddInventory');
  e.target.reset();
  showToast(`Item '${item}' added to temple inventory!`);
}

function handleJoinTeam(e) {
  e.preventDefault();
  const name = document.getElementById('inputVolunteerName').value;
  closeModal('modalJoinTeam');
  e.target.reset();
  showToast(`Volunteer application submitted for ${name}!`);
}

/* Auth is a real page now (public/login.html + Google Sign-In). The in-app
   "Sign in" button and the user menu route here to end the session. */
function signOut() {
  try {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .finally(function () { window.location.href = '/login'; });
  } catch (e) { window.location.href = '/login'; }
}

function openBadgeGeneratorModal() {
  openModal('modalBadgeViewer');
}

function approveVolunteer(btn) {
  const parent = btn.closest('.summary-item');
  if (parent) {
    parent.innerHTML = `
      <div>
        <strong>Volunteer Application Approved</strong>
        <div style="font-size: 0.8rem; color: var(--success);">Added to Active Roster</div>
      </div>
      <span class="badge badge-confirmed">Accepted</span>
    `;
    showToast('Volunteer application approved!');
  }
}

function terminateSession(btn) {
  const row = btn.closest('tr');
  if (row) {
    row.remove();
    showToast('User session terminated.');
  }
}

function toggleNotificationsDrawer() {
  showToast('No new notifications');
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <span>${msg}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function handleGlobalSearch(val) {
  if (val.length > 2) {
    showToast(`Searching temple records for: "${val}"...`);
  }
}

// High-DPI Canvas Charts Initializer
function initCharts() {
  // 1. Donation Bar Chart
  const barCanvas = document.getElementById('donationBarChart');
  if (barCanvas) {
    const ctx = barCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = barCanvas.getBoundingClientRect();
    barCanvas.width = (rect.width || 500) * dpr;
    barCanvas.height = (rect.height || 230) * dpr;
    ctx.scale(dpr, dpr);

    const data = [18, 24, 20, 32, 30, 42, 36, 48, 52, 40, 50, 58];
    const maxVal = 65;
    const barWidth = 14;
    const width = rect.width || 500;
    const height = rect.height || 230;
    const gap = (width - (data.length * barWidth)) / (data.length + 1);

    ctx.clearRect(0, 0, width, height);

    data.forEach((val, i) => {
      const x = gap + i * (barWidth + gap);
      const barHeight = (val / maxVal) * (height - 30);
      const y = height - barHeight - 20;

      ctx.fillStyle = i % 2 === 0 ? '#6B1F2A' : '#C96A20';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    });
  }

  // 2. Donation Categories Donut Chart
  const donutCanvas = document.getElementById('sourcesDonutChart');
  if (donutCanvas) {
    const ctx = donutCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    donutCanvas.width = 140 * dpr;
    donutCanvas.height = 140 * dpr;
    ctx.scale(dpr, dpr);

    const segments = [
      { percentage: 0.48, color: '#6B1F2A' },
      { percentage: 0.32, color: '#C96A20' },
      { percentage: 0.12, color: '#C9A24A' },
      { percentage: 0.08, color: '#EFE3CF' }
    ];

    let startAngle = -Math.PI / 2;
    const cx = 70, cy = 70, radius = 55, innerRadius = 35;

    segments.forEach(seg => {
      const sliceAngle = seg.percentage * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      startAngle += sliceAngle;
    });
  }
}

// The Unified Calendar is rendered by calendar.js into #calendarRoot.
function renderCalendar() { if (typeof renderUnifiedCalendar === 'function') renderUnifiedCalendar(); }

// Mandala Geometric SVG Decorator
function injectMandalaDecorations() {
  // Can programmatically append background mandala overlays or corner flourishes if needed
}
