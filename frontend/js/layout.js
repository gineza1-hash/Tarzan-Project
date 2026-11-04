/* ==========================================================
   layout.js — draws the sidebar and the new-login warning
   Needs auth.js and utils.js loaded first.

   To add a page to the menu later, add a line to NAV_ITEMS.
   ========================================================== */

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', roles: ['admin', 'treasurer'] },
  { key: 'members', label: 'Members', href: 'members.html', roles: ['admin', 'treasurer'] },
  { key: 'savings', label: 'Savings', href: 'savings.html', roles: ['admin', 'treasurer', 'member'] },
  { key: 'loans', label: 'Loans', href: 'loans.html', roles: ['admin', 'treasurer', 'member'] },
  { key: 'repayments', label: 'Repayments', href: 'repayments.html', roles: ['admin', 'treasurer', 'member'] },
  { key: 'reports', label: 'Reports', href: 'reports.html', roles: ['admin', 'treasurer'] },
  { key: 'users', label: 'Users', href: 'users.html', roles: ['admin'] },
  { key: 'portal', label: 'My account', href: 'portal.html', roles: ['member'] },
];

function initShell(activeKey) {
  const user = getUser();
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || !user) return;

  const links = NAV_ITEMS
    .filter((item) => item.roles.includes(user.role))
    .map((item) => {
      const active = item.key === activeKey;
      return `<a href="${item.href}" class="nav-link${active ? ' is-active' : ''}"${active ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`;
    })
    .join('');

  sidebar.innerHTML = `
    <div class="brand">Tarzan SACCO<span>Ledger</span></div>
    <nav class="nav" aria-label="Main">${links}</nav>
    <div class="user-block">
      <div class="user-name">${escapeHtml(user.username)}</div>
      <div class="user-role">${escapeHtml(capitalize(user.role))}</div>
      <button type="button" class="btn btn-quiet" id="logout-btn">Log out</button>
    </div>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
  showSecurityBanner();
}

/** Shown once after a login from a new IP address (the backend sets suspicious: true). */
function showSecurityBanner() {
  const slot = document.getElementById('banner');
  if (!slot || sessionStorage.getItem(SUSPICIOUS_KEY) !== '1') return;

  slot.innerHTML = `
    <div class="alert alert-warn" role="alert">
      <div><strong>New sign-in location.</strong> This login came from a different IP address than your last one. If it was not you, tell your administrator.</div>
      <button type="button" class="btn btn-quiet" id="dismiss-banner">Dismiss</button>
    </div>`;

  document.getElementById('dismiss-banner').addEventListener('click', () => {
    sessionStorage.removeItem(SUSPICIOUS_KEY);
    slot.innerHTML = '';
  });
}