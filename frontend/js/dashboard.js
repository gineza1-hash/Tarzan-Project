/* ==========================================================
   dashboard.js — staff dashboard (GET /api/reports/dashboard)
   ========================================================== */

(function () {
  const user = requireAuth(STAFF_ROLES);
  if (!user) return;

  initShell('dashboard');

  const container = document.getElementById('dashboard');

  function render(d) {
    container.innerHTML = `
      <div class="grid-2">
        <section class="statement">
          <h2>Savings</h2>
          ${ledgerRow('Total deposits', formatRWF(d.savings.totalDeposits))}
          ${ledgerRow('Total withdrawals', formatRWF(d.savings.totalWithdrawals))}
          ${ledgerRow('Net savings held', formatRWF(d.savings.netBalance), 'total')}
        </section>

        <section class="statement">
          <h2>Loans</h2>
          ${ledgerRow('Loans on record', d.loans.total)}
          ${ledgerRow('Currently disbursed', d.loans.active)}
          ${ledgerRow('Principal still owed', formatRWF(d.loans.totalOutstandingPrincipal), 'total')}
        </section>

        <section class="statement">
          <h2>Members</h2>
          ${ledgerRow('Registered members', d.members.total)}
          ${ledgerRow('Active members', d.members.active, 'total')}
        </section>

        <section class="statement">
          <h2>Repayments</h2>
          ${ledgerRow('Total collected', formatRWF(d.repayments.totalCollected), 'total')}
        </section>
      </div>`;
  }

  async function load() {
    container.innerHTML = '<p class="state">Loading figures…</p>';
    try {
      const data = await api.get('/reports/dashboard');
      render(data);
    } catch (err) {
      container.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  load();
})();