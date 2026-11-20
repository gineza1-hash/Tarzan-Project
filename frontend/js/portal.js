/* ==========================================================
   portal.js — member's own summary (GET /api/members/:id/summary and /api/members/:id)
   ========================================================== */

(function () {
  const user = requireAuth(['member']);
  if (!user) return;

  initShell('portal');

  const container = document.getElementById('portal');
  const pageIntro = document.getElementById('page-intro');

  // A member login must be linked to a member record to have any data.
  if (!user.memberId) {
    container.innerHTML =
      '<div class="alert alert-warn" role="alert">Your login is not linked to a member record yet. Ask your administrator to link it.</div>';
    return;
  }

  function render(s) {
    container.innerHTML = `
      <div class="grid-2">
        <section class="statement">
          <h2>Savings</h2>
          ${ledgerRow('Total deposits', formatRWF(s.totalDeposits))}
          ${ledgerRow('Total withdrawals', formatRWF(s.totalWithdrawals))}
          ${ledgerRow('Your balance', formatRWF(s.savingsBalance), 'total')}
        </section>

        <section class="statement">
          <h2>Loan</h2>
          ${ledgerRow('Active loans', s.activeLoans)}
          ${ledgerRow('Principal still owed', formatRWF(s.totalOutstandingLoan), 'total')}
        </section>
      </div>`;
  }

  async function load() {
    container.innerHTML = '<p class="state">Loading your account…</p>';
    try {
      const id = encodeURIComponent(user.memberId);
      const [summary, memberData] = await Promise.all([
        api.get(`/members/${id}/summary`),
        api.get(`/members/${id}`).catch(() => null), // the heading is a nicety: the figures show without it
      ]);
      render(summary);

      // The member number is the member's ID, so show it next to their name
      if (memberData && memberData.member) {
        const m = memberData.member;
        pageIntro.textContent = `${tidyName(m.full_name)}, member number ${m.member_number}.`;
      }
    } catch (err) {
      container.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  load();
})();