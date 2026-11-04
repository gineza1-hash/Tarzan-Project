/* ==========================================================
   loans.js — loan list, new loan, approve, disburse, details
   GET   /api/members                    (staff: member picker)
   GET   /api/loans/member/:id           (list)
   POST  /api/loans                      (staff: create)
   PATCH /api/loans/:id/approve          (admin only)
   PATCH /api/loans/:id/disburse         (staff)
   GET   /api/loans/:id/schedule         (figures for the details view)

   Loan life cycle: pending -> approved -> disbursed -> closed
   (a loan closes by itself when its principal is fully repaid)
   ========================================================== */

(function () {
  const user = requireAuth(); // any logged-in role
  if (!user) return;

  const isStaff = STAFF_ROLES.includes(user.role);
  const isAdmin = user.role === 'admin';

  initShell('loans');

  // ---------- Elements ----------
  const pageTitle = document.getElementById('page-title');
  const pageIntro = document.getElementById('page-intro');
  const notice = document.getElementById('notice');
  const picker = document.getElementById('picker');
  const memberSelect = document.getElementById('member-select');
  const pickHint = document.getElementById('pick-hint');
  const memberArea = document.getElementById('member-area');
  const listBox = document.getElementById('loans');
  const newBtn = document.getElementById('new-btn');
  const newHint = document.getElementById('new-hint');

  const loanDialog = document.getElementById('loan-dialog');
  const loanForm = document.getElementById('loan-form');
  const loanFor = document.getElementById('loan-for');
  const loanError = document.getElementById('loan-error');
  const loanSubmit = document.getElementById('loan-submit');
  const loanCancel = document.getElementById('loan-cancel');
  const principalInput = document.getElementById('f-principal');
  const methodSelect = document.getElementById('f-method');
  const rateInput = document.getElementById('f-rate');
  const rateHint = document.getElementById('rate-hint');
  const monthsInput = document.getElementById('f-months');
  const dueInput = document.getElementById('f-due');
  const notesInput = document.getElementById('f-notes');

  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmForm = document.getElementById('confirm-form');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmText = document.getElementById('confirm-text');
  const confirmError = document.getElementById('confirm-error');
  const confirmSubmit = document.getElementById('confirm-submit');
  const confirmCancel = document.getElementById('confirm-cancel');

  const detailDialog = document.getElementById('detail-dialog');
  const detailTitle = document.getElementById('detail-title');
  const detailBody = document.getElementById('detail-body');
  const detailClose = document.getElementById('detail-close');

  // ---------- State ----------
  let members = [];
  let currentMemberId = null;
  let loans = [];
  let pendingAction = null;
  let dueEdited = false;
  let noticeTimer = null;

  const METHOD_LABELS = {
    flat: 'Flat rate',
    reducing_balance: 'Reducing balance',
    simple: 'Simple interest',
  };
  const STATUS_LABELS = {
    pending: 'Pending',
    approved: 'Approved',
    disbursed: 'Disbursed',
    closed: 'Closed',
    defaulted: 'Defaulted',
  };
  const RATE_HINTS = {
    reducing_balance: 'Percent per year. Interest is charged each month on what is still owed.',
    flat: 'Percent per month. A 2% flat rate over 12 months adds 24% of the amount borrowed.',
    simple: 'Percent per year, charged on the full amount borrowed.',
  };
  const FIELD_LABELS = {
    memberId: 'Member',
    principal: 'Amount borrowed',
    interestMethod: 'Interest method',
    interestRate: 'Interest rate',
    durationMonths: 'Duration',
  };

  // ---------- Helpers ----------
  function toDateInput(d) {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  /** Today plus n months, clamped to the end of short months. */
  function monthsFromNow(n) {
    const d = new Date();
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() !== day) d.setDate(0);
    return toDateInput(d);
  }

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
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

  /** Flat rates are charged per month; the other two methods per year. */
  function formatRate(rate, method) {
    const unit = method === 'flat' ? 'per month' : 'per year';
    return `${parseFloat(rate)}% ${unit}`;
  }

  /** Principal still owed, or null when nothing is owed yet. */
  function outstanding(loan) {
    if (loan.status === 'pending') return null;
    if (loan.status === 'closed') return 0;
    return Math.max(parseFloat(loan.principal) - parseFloat(loan.paid_principal || 0), 0);
  }

  // ---------- Loan list ----------
  function renderLoans() {
    if (loans.length === 0) {
      listBox.innerHTML = '<p class="state">No loans on record for this member.</p>';
      return;
    }

    const rows = loans
      .map((loan) => {
        const owed = outstanding(loan);
        const id = escapeHtml(loan.loan_id);

        const actions = [`<button type="button" class="btn btn-quiet btn-small" data-details="${id}">Details</button>`];
        if (loan.status !== 'pending') {
          actions.push(
            `<a class="btn btn-quiet btn-small" href="repayments.html?member=${encodeURIComponent(loan.member_id)}&amp;loan=${encodeURIComponent(loan.loan_id)}">Repayments</a>`
          );
        }
        if (loan.status === 'pending') {
          if (isAdmin) {
            actions.push(`<button type="button" class="btn btn-quiet btn-small" data-approve="${id}">Approve</button>`);
          } else if (isStaff) {
            actions.push('<span class="muted-text">Awaiting admin approval</span>');
          }
        }
        if (isStaff && loan.status === 'approved') {
          actions.push(`<button type="button" class="btn btn-quiet btn-small" data-disburse="${id}">Disburse</button>`);
        }

        return `
          <tr>
            <td>${escapeHtml(formatDate(loan.created_at))}</td>
            <td class="num">${escapeHtml(formatRWF(loan.principal))}</td>
            <td>
              <div>${escapeHtml(formatRate(loan.interest_rate, loan.interest_method))}</div>
              <div class="sub">${escapeHtml(METHOD_LABELS[loan.interest_method] || loan.interest_method)}, ${escapeHtml(loan.duration_months)} months</div>
            </td>
            <td>${escapeHtml(formatDate(loan.due_date))}</td>
            <td class="num">${owed === null ? '—' : escapeHtml(formatRWF(owed))}</td>
            <td>${statusBadge(loan.status)}</td>
            <td class="actions-cell">${actions.join(' ')}</td>
          </tr>`;
      })
      .join('');

    listBox.innerHTML = `
      <p class="count">${loans.length} ${loans.length === 1 ? 'loan' : 'loans'}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Applied</th>
              <th scope="col">Borrowed</th>
              <th scope="col">Terms</th>
              <th scope="col">Due</th>
              <th scope="col">Still owed</th>
              <th scope="col">Status</th>
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function loadLoans() {
    const requestedFor = currentMemberId;
    listBox.innerHTML = '<p class="state">Loading loans…</p>';
    try {
      const data = await api.get(`/loans/member/${encodeURIComponent(requestedFor)}`);
      if (requestedFor !== currentMemberId) return; // member changed while loading
      loans = data.loans;
      renderLoans();
    } catch (err) {
      if (requestedFor !== currentMemberId) return;
      listBox.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------- Choosing a member (staff) ----------
  function selectMember(memberId) {
    currentMemberId = memberId || null;

    const url = memberId ? `?member=${encodeURIComponent(memberId)}` : window.location.pathname;
    history.replaceState(null, '', url);

    if (!currentMemberId) {
      memberArea.hidden = true;
      pickHint.hidden = false;
      return;
    }

    pickHint.hidden = true;
    memberArea.hidden = false;

    const member = members.find((m) => m.member_id === currentMemberId);
    const canCreate = member && member.status === 'active';
    newBtn.hidden = false;
    newBtn.disabled = !canCreate;
    newHint.hidden = Boolean(canCreate);
    newHint.textContent = 'This member is inactive, so a new loan cannot be created.';

    loadLoans();
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
        .map((m) => {
          const tag = m.status === 'active' ? '' : ' (inactive)';
          return `<option value="${escapeHtml(m.member_id)}">${escapeHtml(memberLabel(m))}${tag}</option>`;
        })
        .join('');

    const wanted = new URLSearchParams(window.location.search).get('member');
    if (wanted && members.some((m) => m.member_id === wanted)) {
      memberSelect.value = wanted;
      selectMember(wanted);
    }
  }

  function setupMember() {
    pageTitle.textContent = 'My loans';
    pageIntro.textContent = 'Your loans and how much you still owe.';

    if (!user.memberId) {
      pickHint.hidden = true;
      memberArea.insertAdjacentHTML(
        'beforebegin',
        '<div class="alert alert-warn" role="alert">Your login is not linked to a member record yet. Ask your administrator to link it.</div>'
      );
      return;
    }

    currentMemberId = user.memberId;
    memberArea.hidden = false;
    newBtn.hidden = true;
    loadLoans();
  }

  // ---------- New loan dialog ----------
  function updateRateHint() {
    rateHint.textContent = RATE_HINTS[methodSelect.value] || '';
  }

  function openNewLoan() {
    const member = members.find((m) => m.member_id === currentMemberId);
    if (!member) return;

    loanForm.reset();
    hideError(loanError);
    dueEdited = false;
    loanFor.textContent = `Member: ${memberLabel(member)}`;
    updateRateHint();
    loanDialog.showModal();
    principalInput.focus();
  }

  methodSelect.addEventListener('change', updateRateHint);
  dueInput.addEventListener('input', () => { dueEdited = true; });

  monthsInput.addEventListener('input', () => {
    const months = parseInt(monthsInput.value, 10);
    if (!dueEdited && Number.isInteger(months) && months > 0 && months <= 600) {
      dueInput.value = monthsFromNow(months);
    }
  });

  loanForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(loanError);

    const principalText = principalInput.value.replace(/[,\s]/g, '');
    const rateText = rateInput.value.replace(/[,\s%]/g, '');
    const monthsText = monthsInput.value.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(principalText) || parseFloat(principalText) <= 0) {
      showError(loanError, 'Enter the amount borrowed as a number above zero, like 200000.');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(rateText)) {
      showError(loanError, 'Enter the interest rate as a number, like 18 or 2.5. Use 0 for an interest-free loan.');
      return;
    }
    if (!/^\d+$/.test(monthsText) || parseInt(monthsText, 10) < 1) {
      showError(loanError, 'Enter the duration as a whole number of months, like 12.');
      return;
    }

    const body = {
      memberId: currentMemberId,
      principal: principalText,
      interestMethod: methodSelect.value,
      interestRate: rateText,
      durationMonths: parseInt(monthsText, 10),
    };
    if (dueInput.value) body.dueDate = dueInput.value;
    if (notesInput.value.trim()) body.notes = notesInput.value.trim();

    loanSubmit.disabled = true;
    loanSubmit.textContent = 'Saving…';
    try {
      await api.post('/loans', body);
      loanDialog.close();
      showNotice('Loan created. It now waits for admin approval.');
      loadLoans();
    } catch (err) {
      showError(loanError, messageFrom(err));
    } finally {
      loanSubmit.disabled = false;
      loanSubmit.textContent = 'Create loan';
    }
  });

  // ---------- Approve / disburse ----------
  function openConfirm({ title, text, button, run, success }) {
    pendingAction = { run, success, button };
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmSubmit.textContent = button;
    hideError(confirmError);
    confirmDialog.showModal();
  }

  function startApprove(loanId) {
    const loan = loans.find((l) => l.loan_id === loanId);
    if (!loan) return;
    openConfirm({
      title: 'Approve loan',
      text: `Approve the loan of ${formatRWF(loan.principal)}? The member is sent an SMS if they have a phone number.`,
      button: 'Approve loan',
      run: () => api.patch(`/loans/${encodeURIComponent(loanId)}/approve`),
      success: 'Loan approved.',
    });
  }

  function startDisburse(loanId) {
    const loan = loans.find((l) => l.loan_id === loanId);
    if (!loan) return;
    openConfirm({
      title: 'Disburse loan',
      text: `Confirm that ${formatRWF(loan.principal)} has been handed over to the member. Repayments can be recorded after this.`,
      button: 'Disburse loan',
      run: () => api.patch(`/loans/${encodeURIComponent(loanId)}/disburse`),
      success: 'Loan disbursed.',
    });
  }

  confirmForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pendingAction) return;
    hideError(confirmError);

    const action = pendingAction;
    confirmSubmit.disabled = true;
    confirmSubmit.textContent = 'Saving…';
    try {
      await action.run();
      confirmDialog.close();
      showNotice(action.success);
      loadLoans();
    } catch (err) {
      showError(confirmError, messageFrom(err));
    } finally {
      confirmSubmit.disabled = false;
      confirmSubmit.textContent = action.button;
    }
  });

  // ---------- Details dialog ----------
  function termsPanel(loan) {
    const approvedBy = loan.approved_by_name ? ` by ${loan.approved_by_name}` : '';
    return `
      <section class="statement">
        <h2>Terms</h2>
        <div class="row"><span class="label">Status</span><span class="amount">${statusBadge(loan.status)}</span></div>
        ${ledgerRow('Interest rate', formatRate(loan.interest_rate, loan.interest_method))}
        ${ledgerRow('Interest method', METHOD_LABELS[loan.interest_method] || loan.interest_method)}
        ${ledgerRow('Duration', `${loan.duration_months} months`)}
        ${ledgerRow('Applied', formatDate(loan.created_at))}
        ${ledgerRow('Approved', loan.approved_at ? formatDate(loan.approved_at) + approvedBy : '—')}
        ${ledgerRow('Disbursed', formatDate(loan.disbursed_at))}
        ${ledgerRow('Due date', formatDate(loan.due_date))}
        ${ledgerRow('Recorded by', loan.recorded_by_name || '—')}
      </section>`;
  }

  /** schedule is null while loading, an object when loaded, or { error } on failure. */
  function figuresPanel(loan, schedule) {
    const paidPrincipal = parseFloat(loan.paid_principal || 0);
    const paidInterest = parseFloat(loan.paid_interest || 0);
    const owed = outstanding(loan);

    let calculated;
    if (!schedule) {
      calculated = ledgerRow('Total interest', 'Calculating…') + ledgerRow('Total to repay', 'Calculating…');
    } else if (schedule.error) {
      calculated = `<div class="alert alert-error" role="alert">${escapeHtml(schedule.error)}</div>`;
    } else {
      const rate = parseFloat(loan.interest_rate);
      const principal = parseFloat(loan.principal);

      // The backend returns null when a 0% reducing-balance loan hits a divide-by-zero.
      let interest = schedule.totalInterest;
      let total = schedule.totalRepayable;
      if (rate === 0) {
        interest = 0;
        total = principal;
      }

      // The backend's monthly installment always assumes reducing balance,
      // so flat and simple loans are worked out here from the total instead.
      let monthly = schedule.monthlyInstallment;
      if (loan.interest_method !== 'reducing_balance' && Number.isFinite(total)) {
        monthly = total / loan.duration_months;
      }

      const money = (v) => (Number.isFinite(v) ? formatRWF(v) : '—');
      calculated =
        ledgerRow('Total interest', money(interest)) +
        ledgerRow('Total to repay', money(total)) +
        ledgerRow('Monthly installment', money(monthly));
    }

    return `
      <section class="statement">
        <h2>Figures</h2>
        ${calculated}
        ${ledgerRow('Principal repaid', formatRWF(paidPrincipal))}
        ${ledgerRow('Interest paid', formatRWF(paidInterest))}
        ${ledgerRow('Principal still owed', owed === null ? '—' : formatRWF(owed), 'total')}
      </section>`;
  }

  function renderDetail(loan, schedule) {
    const notes = loan.notes ? `<p class="detail-notes"><strong>Notes:</strong> ${escapeHtml(loan.notes)}</p>` : '';
    detailBody.innerHTML = `
      <div class="grid-2">${termsPanel(loan)}${figuresPanel(loan, schedule)}</div>
      ${notes}
      <p class="hint detail-foot">Totals and installments are calculated from the loan terms, not from payments received.</p>`;
  }

  async function openDetails(loanId) {
    const loan = loans.find((l) => l.loan_id === loanId);
    if (!loan) return;

    detailTitle.textContent = `Loan of ${formatRWF(loan.principal)}`;
    renderDetail(loan, null);
    detailDialog.showModal();

    try {
      const schedule = await api.get(`/loans/${encodeURIComponent(loanId)}/schedule`);
      renderDetail(loan, schedule);
    } catch (err) {
      renderDetail(loan, { error: err.message });
    }
  }

  // ---------- Events ----------
  memberSelect.addEventListener('change', () => selectMember(memberSelect.value));
  newBtn.addEventListener('click', openNewLoan);
  loanCancel.addEventListener('click', () => loanDialog.close());
  confirmCancel.addEventListener('click', () => confirmDialog.close());
  detailClose.addEventListener('click', () => detailDialog.close());

  listBox.addEventListener('click', (event) => {
    const details = event.target.closest('[data-details]');
    const approve = event.target.closest('[data-approve]');
    const disburse = event.target.closest('[data-disburse]');
    if (details) openDetails(details.dataset.details);
    else if (approve) startApprove(approve.dataset.approve);
    else if (disburse) startDisburse(disburse.dataset.disburse);
  });

  // ---------- Start ----------
  if (isStaff) {
    setupStaff();
  } else {
    setupMember();
  }
})();