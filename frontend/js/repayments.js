/* ==========================================================
   repayments.js — repayment history for a loan, and recording new ones
   GET  /api/members                  (staff: member picker)
   GET  /api/loans/member/:id         (the member's loans)
   GET  /api/repayments/loan/:loanId  (history)
   POST /api/repayments               (staff: record)

   Staff choose a member, then a loan. A member sees their own loans.
   The backend needs principal + interest + fees to add up to the
   total, so this page works the total out for you.
   ========================================================== */

(function () {
  const user = requireAuth(); // any logged-in role
  if (!user) return;

  const isStaff = STAFF_ROLES.includes(user.role);

  initShell('repayments');

  // ---------- Elements ----------
  const pageTitle = document.getElementById('page-title');
  const pageIntro = document.getElementById('page-intro');
  const notice = document.getElementById('notice');
  const picker = document.getElementById('picker');
  const memberSelect = document.getElementById('member-select');
  const pickHint = document.getElementById('pick-hint');
  const memberArea = document.getElementById('member-area');
  const noLoans = document.getElementById('no-loans');
  const loanArea = document.getElementById('loan-area');
  const loanSelect = document.getElementById('loan-select');
  const summaryBox = document.getElementById('summary');
  const listBox = document.getElementById('repayments');
  const recordBtn = document.getElementById('record-btn');
  const recordHint = document.getElementById('record-hint');

  const recordDialog = document.getElementById('record-dialog');
  const recordForm = document.getElementById('record-form');
  const recordFor = document.getElementById('record-for');
  const recordError = document.getElementById('record-error');
  const recordSubmit = document.getElementById('record-submit');
  const recordCancel = document.getElementById('record-cancel');
  const principalInput = document.getElementById('f-principal');
  const interestInput = document.getElementById('f-interest');
  const feesInput = document.getElementById('f-fees');
  const dateInput = document.getElementById('f-date');
  const refInput = document.getElementById('f-ref');
  const notesInput = document.getElementById('f-notes');
  const totalEl = document.getElementById('total-received');

  // ---------- State ----------
  let members = [];
  let currentMemberId = null;
  let loans = [];
  let currentLoanId = null;
  let repayments = [];
  let noticeTimer = null;

  const STATUS_LABELS = {
    pending: 'Pending',
    approved: 'Approved',
    disbursed: 'Disbursed',
    closed: 'Closed',
    defaulted: 'Defaulted',
  };
  const FIELD_LABELS = {
    loanId: 'Loan',
    memberId: 'Member',
    amount: 'Total',
    principalComponent: 'Towards the loan',
    interestComponent: 'Interest',
    referenceCode: 'Reference',
  };

  // ---------- Helpers ----------
  // Money is handled in whole cents so additions never drift (0.1 + 0.2 problems).
  /** "14,667.50" -> 1466750. Empty -> 0. Not a valid amount -> null. */
  function toCents(text) {
    const t = String(text ?? '').replace(/[,\s]/g, '');
    if (t === '') return 0;
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(parseFloat(t) * 100);
  }

  function centsToString(cents) {
    return (cents / 100).toFixed(2);
  }

  function todayLocal() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 7000);
  }

  function showError(box, message) {
    box.textContent = message;
    box.hidden = false;
  }

  function hideError(box) {
    box.hidden = true;
    box.textContent = '';
  }

  function messageFrom(err) {
    if (err.details && err.details.length) {
      return err.details
        .map((d) => `${FIELD_LABELS[d.field] || d.field} is not valid.`)
        .join(' ');
    }
    return err.message;
  }

  function memberLabel(m) {
    return `${m.member_number}  ${m.full_name}`;
  }

  function statusBadge(status) {
    return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
  }

  function loanLabel(loan) {
    return `${formatRWF(loan.principal)}, ${STATUS_LABELS[loan.status] || loan.status}, applied ${formatDate(loan.created_at)}`;
  }

  function currentLoan() {
    return loans.find((l) => l.loan_id === currentLoanId) || null;
  }

  /** Principal still owed on a loan, in cents. */
  function owedCents(loan) {
    if (loan.status === 'closed') return 0;
    const principal = toCents(loan.principal) || 0;
    const paid = toCents(loan.paid_principal) || 0;
    return Math.max(principal - paid, 0);
  }

  function syncUrl() {
    const params = new URLSearchParams();
    if (isStaff && currentMemberId) params.set('member', currentMemberId);
    if (currentLoanId) params.set('loan', currentLoanId);
    const text = params.toString();
    history.replaceState(null, '', text ? `?${text}` : window.location.pathname);
  }

  // ---------- Loan summary and record button ----------
  function renderSummary(loan) {
    summaryBox.innerHTML = `
      <section class="statement narrow">
        <h2>Loan position</h2>
        <div class="row"><span class="label">Status</span><span class="amount">${statusBadge(loan.status)}</span></div>
        ${ledgerRow('Borrowed', formatRWF(loan.principal))}
        ${ledgerRow('Principal repaid', formatRWF(loan.paid_principal))}
        ${ledgerRow('Interest paid', formatRWF(loan.paid_interest))}
        ${ledgerRow('Principal still owed', formatRWF(owedCents(loan) / 100), 'total')}
      </section>`;
  }

  function updateRecordButton(loan) {
    if (!isStaff) {
      recordBtn.hidden = true;
      recordHint.hidden = true;
      return;
    }

    recordBtn.hidden = false;
    const hints = {
      approved: 'This loan is approved but not disbursed yet. Disburse it on the Loans page before recording repayments.',
      closed: 'This loan is fully repaid.',
      defaulted: 'Repayments cannot be recorded on a defaulted loan.',
    };
    const canRecord = loan.status === 'disbursed';
    recordBtn.disabled = !canRecord;
    recordHint.hidden = canRecord;
    recordHint.textContent = hints[loan.status] || '';
  }

  // ---------- Repayment history ----------
  function renderRepayments() {
    if (repayments.length === 0) {
      listBox.innerHTML = '<p class="state">No repayments recorded for this loan yet.</p>';
      return;
    }

    const totals = { amount: 0, principal: 0, interest: 0, fees: 0 };

    const rows = repayments
      .map((r) => {
        totals.amount += toCents(r.amount) || 0;
        totals.principal += toCents(r.principal_component) || 0;
        totals.interest += toCents(r.interest_component) || 0;
        totals.fees += toCents(r.fees_component) || 0;

        return `
          <tr>
            <td>${escapeHtml(formatDate(r.paid_at))}</td>
            <td class="num">${escapeHtml(formatRWF(r.amount))}</td>
            <td class="num">${escapeHtml(formatRWF(r.principal_component))}</td>
            <td class="num">${escapeHtml(formatRWF(r.interest_component))}</td>
            <td class="num">${escapeHtml(formatRWF(r.fees_component))}</td>
            <td class="num">${escapeHtml(r.reference_code)}</td>
            <td>${escapeHtml(r.recorded_by_name || '—')}</td>
            <td class="cell-wrap">${escapeHtml(r.notes || '—')}</td>
          </tr>`;
      })
      .join('');

    listBox.innerHTML = `
      <p class="count">${repayments.length} ${repayments.length === 1 ? 'repayment' : 'repayments'}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Date paid</th>
              <th scope="col">Total</th>
              <th scope="col">Towards the loan</th>
              <th scope="col">Interest</th>
              <th scope="col">Fees</th>
              <th scope="col">Reference</th>
              <th scope="col">Recorded by</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td>Totals</td>
              <td class="num">${escapeHtml(formatRWF(totals.amount / 100))}</td>
              <td class="num">${escapeHtml(formatRWF(totals.principal / 100))}</td>
              <td class="num">${escapeHtml(formatRWF(totals.interest / 100))}</td>
              <td class="num">${escapeHtml(formatRWF(totals.fees / 100))}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  async function loadRepayments() {
    const requestedLoan = currentLoanId;
    listBox.innerHTML = '<p class="state">Loading repayments…</p>';
    try {
      const data = await api.get(`/repayments/loan/${encodeURIComponent(requestedLoan)}`);
      if (requestedLoan !== currentLoanId) return; // loan changed while loading
      repayments = data.repayments;
      renderRepayments();
    } catch (err) {
      if (requestedLoan !== currentLoanId) return;
      listBox.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------- Choosing a loan ----------
  function selectLoan(loanId) {
    currentLoanId = loanId || null;
    const loan = currentLoan();
    if (!loan) return;

    syncUrl();
    renderSummary(loan);
    updateRecordButton(loan);
    loadRepayments();
  }

  /** Loads the member's loans, then picks one (the wanted one, else the active one, else the latest). */
  async function loadLoans(wantedLoanId) {
    const requestedFor = currentMemberId;
    memberArea.hidden = false;
    noLoans.hidden = true;
    loanArea.hidden = true;

    try {
      const data = await api.get(`/loans/member/${encodeURIComponent(requestedFor)}`);
      if (requestedFor !== currentMemberId) return; // member changed while loading
      loans = data.loans.filter((l) => l.status !== 'pending'); // pending loans cannot have payments
    } catch (err) {
      if (requestedFor !== currentMemberId) return;
      noLoans.textContent = err.message;
      noLoans.hidden = false;
      return;
    }

    if (loans.length === 0) {
      currentLoanId = null;
      noLoans.textContent = 'No approved loans yet, so there are no repayments to show.';
      noLoans.hidden = false;
      return;
    }

    loanSelect.innerHTML = loans
      .map((l) => `<option value="${escapeHtml(l.loan_id)}">${escapeHtml(loanLabel(l))}</option>`)
      .join('');

    const wanted = loans.find((l) => l.loan_id === wantedLoanId);
    const active = loans.find((l) => l.status === 'disbursed');
    const chosen = wanted || active || loans[0];

    loanArea.hidden = false;
    loanSelect.value = chosen.loan_id;
    selectLoan(chosen.loan_id);
  }

  // ---------- Choosing a member (staff) ----------
  function selectMember(memberId, wantedLoanId) {
    currentMemberId = memberId || null;
    currentLoanId = null;

    if (!currentMemberId) {
      memberArea.hidden = true;
      pickHint.hidden = false;
      syncUrl();
      return;
    }

    pickHint.hidden = true;
    syncUrl();
    loadLoans(wantedLoanId);
  }

  async function setupStaff() {
    picker.hidden = false;
    memberArea.hidden = true;
    pickHint.hidden = false;

    try {
      const data = await api.get('/members');
      members = data.members.slice().sort((a, b) => a.member_number.localeCompare(b.member_number));
    } catch (err) {
      pickHint.hidden = true;
      picker.insertAdjacentHTML(
        'afterend',
        `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`
      );
      return;
    }

    memberSelect.innerHTML =
      '<option value="">Choose a member</option>' +
      members
        .map((m) => `<option value="${escapeHtml(m.member_id)}">${escapeHtml(memberLabel(m))}</option>`)
        .join('');

    const params = new URLSearchParams(window.location.search);
    const wantedMember = params.get('member');
    if (wantedMember && members.some((m) => m.member_id === wantedMember)) {
      memberSelect.value = wantedMember;
      selectMember(wantedMember, params.get('loan'));
    }
  }

  function setupMember() {
    pageTitle.textContent = 'My repayments';
    pageIntro.textContent = 'Payments you have made towards your loans.';

    if (!user.memberId) {
      pickHint.hidden = true;
      memberArea.insertAdjacentHTML(
        'beforebegin',
        '<div class="alert alert-warn" role="alert">Your login is not linked to a member record yet. Ask your administrator to link it.</div>'
      );
      return;
    }

    currentMemberId = user.memberId;
    loadLoans(new URLSearchParams(window.location.search).get('loan'));
  }

  // ---------- Record dialog ----------
  function updateTotal() {
    const parts = [principalInput, interestInput, feesInput].map((input) => toCents(input.value));
    if (parts.some((cents) => cents === null)) {
      totalEl.textContent = '—';
      return;
    }
    totalEl.textContent = formatRWF(parts.reduce((a, b) => a + b, 0) / 100);
  }

  function openRecord() {
    const loan = currentLoan();
    if (!loan) return;

    recordForm.reset();
    hideError(recordError);
    recordFor.textContent =
      `Loan of ${formatRWF(loan.principal)}. Principal still owed: ${formatRWF(owedCents(loan) / 100)}.`;
    dateInput.value = todayLocal();
    updateTotal();
    recordDialog.showModal();
    principalInput.focus();
  }

  [principalInput, interestInput, feesInput].forEach((input) =>
    input.addEventListener('input', updateTotal)
  );

  recordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(recordError);

    const loan = currentLoan();
    if (!loan) return;

    const principal = toCents(principalInput.value);
    const interest = toCents(interestInput.value);
    const fees = toCents(feesInput.value);
    const reference = refInput.value.trim();

    if (principal === null || interest === null || fees === null) {
      showError(recordError, 'Enter amounts as numbers, like 14667 or 3333.50. Leave a part empty if it does not apply.');
      return;
    }

    const total = principal + interest + fees;
    if (total <= 0) {
      showError(recordError, 'Enter at least one amount above zero.');
      return;
    }
    if (principal > owedCents(loan)) {
      showError(
        recordError,
        `The amount towards the loan (${formatRWF(principal / 100)}) is more than the principal still owed (${formatRWF(owedCents(loan) / 100)}).`
      );
      return;
    }
    if (!reference) {
      showError(recordError, 'Enter a reference for this payment.');
      return;
    }

    const body = {
      loanId: loan.loan_id,
      memberId: loan.member_id,
      amount: centsToString(total),
      principalComponent: centsToString(principal),
      interestComponent: centsToString(interest),
      feesComponent: centsToString(fees),
      referenceCode: reference,
    };
    if (dateInput.value) body.paidAt = dateInput.value;
    if (notesInput.value.trim()) body.notes = notesInput.value.trim();

    recordSubmit.disabled = true;
    recordSubmit.textContent = 'Saving…';
    try {
      const data = await api.post('/repayments', body);
      recordDialog.close();

      const owed = Number(data.outstandingBalance);
      showNotice(
        owed <= 0
          ? 'Repayment recorded. The loan is now fully repaid and closed.'
          : `Repayment recorded. Principal still owed: ${formatRWF(owed)}.`
      );
      loadLoans(loan.loan_id); // refreshes the loan status, summary and history
    } catch (err) {
      showError(recordError, messageFrom(err));
    } finally {
      recordSubmit.disabled = false;
      recordSubmit.textContent = 'Record repayment';
    }
  });

  // ---------- Events ----------
  memberSelect.addEventListener('change', () => selectMember(memberSelect.value));
  loanSelect.addEventListener('change', () => selectLoan(loanSelect.value));
  recordBtn.addEventListener('click', openRecord);
  recordCancel.addEventListener('click', () => recordDialog.close());

  // ---------- Start ----------
  if (isStaff) {
    setupStaff();
  } else {
    setupMember();
  }
})();