/* ==========================================================
   utils.js — small helpers used across pages
   ========================================================== */

/** The API returns money as strings like "50000.00", so convert first. */
function formatRWF(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return 'RWF ' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function capitalize(text) {
  const s = String(text || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Always use this when putting text from the server into innerHTML. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** buildQuery({ from: '2026-01-01', type: '' }) -> "?from=2026-01-01" (empty values are skipped) */
function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.append(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** One ledger row for the statement panels. */
function ledgerRow(label, value, extraClass = '') {
  return `<div class="row ${extraClass}"><span class="label">${escapeHtml(label)}</span><span class="amount">${escapeHtml(value)}</span></div>`;
}