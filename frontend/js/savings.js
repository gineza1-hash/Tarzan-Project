/* ==========================================================
   savings.js — savings history, record a transaction, reverse one
   GET   /api/members                         (staff: member picker)
   GET   /api/members/:id/summary             (balance)
   GET   /api/savings/member/:id?from&to&type (history)
   POST  /api/savings                         (staff: record)
   PATCH /api/savings/:id/reverse             (admin: reverse)

   Staff choose a member. A member sees only their own savings.
   ========================================================== */

(function () {
  const user = requireAuth(); // any logged-in role
  if (!user) return;

  const isStaff = STAFF_ROLES.includes(user.role);
  const isAdmin = user.role === 'admin';

  initShell('savings');

  // ---------- Elements ----------
  const pageTitle = document.getElementById('page-title');
  const pageIntro = document.getElementById('page-intro');
  const notice = document.getElementById('notice');
  const picker = document.getElementById('picker');
  const memberSelect = document.getElementById('member-select');
  const pickHint = document.getElementById('pick-hint');
  const memberArea = document.getElementById('member-area');
  const summaryBox = document.getElementById('summary');
  const listBox = document.getElementById('transactions');
  const recordBtn = document.getElementById('record-btn');
  const recordHint = document.getElementById('record-hint');
  const filterFrom = document.getElementById('filter-from');
  const filterTo = document.getElementById('filter-to');
  const filterType = document.getElementById('filter-type');
  const clearFilters = document.getElementById('clear-filters');

  const recordDialog = document.getElementById('record-dialog');
  const recordForm = document.getElementById('record-form');
  const recordFor = document.getElementById('record-for');
  const recordError = document.getElementById('record-error');
  const recordSubmit = document.getElementById('record-submit');
  const recordCancel = document.getElementById('record-cancel');
  const typeSelect = document.getElementById('f-type');
  const amountInput = document.getElementById('f-amount');
  const refInput = document.getElementById('f-ref');
  const dateInput = document.getElementById('f-date');
  const notesInput = document.getElementById('f-notes');

  const reverseDialog = document.getElementById('reverse-dialog');
  const reverseForm = document.getElementById('reverse-form');
  const reverseText = document.getElementById('reverse-text');
  const reverseError = document.getElementById('reverse-error');
  const reverseSubmit = document.getElementById('reverse-submit');
  const reverseCancel = document.getElementById('reverse-cancel');
  const reasonInput = document.getElementById('f-reason');

  // ---------- State ----------
  let members = [];
  let currentMemberId = null;
  let transactions = [];
  let reversingId = null;
  let noticeTimer = null;

  const TYPE_LABELS = { deposit: 'Deposit', withdrawal: 'Withdrawal', adjustment: 'Adjustment' };
  const FIELD_LABELS = {
    memberId: 'Member',
    amount: 'Amount',
    transactionType: 'Type',
    referenceCode: 'Reference',
  };

  // ---------- Helpers ----------
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

  function typeBadge(type) {
    return `<span class="badge badge-${escapeHtml(type)}">${escapeHtml(TYPE_LABELS[type] || type)}</span>`;
  }

  function hasFilters() {
    return Boolean(filterFrom.value || filterTo.value || filterType.value);
  }

  // ---------- Summary ----------
  function renderSummary(s) {
    summaryBox.innerHTML = `
      <section class="statement narrow">
        <h2>Balance</h2>
        ${ledgerRow('Deposits and adjustments', formatRWF(s.totalDeposits))}
        ${ledgerRow('Withdrawals', formatRWF(s.totalWithdrawals))}
        ${ledgerRow('Savings balance', formatRWF(s.savingsBalance), 'total')}
      </section>`;
  }

  async function loadSummary() {
    const requestedFor = currentMemberId;
    summaryBox.innerHTML = '<p class="state">Loading balance…</p>';
    try {
      const data = await api.get(`/members/${encodeURIComponent(requestedFor)}/summary`);
      if (requestedFor !== currentMemberId) return; // member changed while loading
      renderSummary(data);
    } catch (err) {
      if (requestedFor !== currentMemberId) return;
      summaryBox.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------- Transactions ----------
  function renderTransactions() {
    if (transactions.length === 0) {
      listBox.innerHTML = hasFilters()
        ? '<p class="state">No transactions match these filters.</p>'
        : '<p class="state">No transactions recorded yet.</p>';
      return;
    }

    const rows = transactions
      .map((tx) => {
        const reversed = tx.is_reversed;
        const sign = tx.transaction_type === 'withdrawal' ? '−' : '+';

        const notes = [];
        if (tx.notes) notes.push(escapeHtml(tx.notes));
        if (reversed) {
          const why = tx.reversal_reason ? `: ${escapeHtml(tx.reversal_reason)}` : '';
          notes.push(`<span class="reversal">Reversed${why}</span>`);
        }

        const action =
          isAdmin && !reversed
            ? `<button type="button" class="btn btn-quiet btn-small" data-reverse="${escapeHtml(tx.transaction_id)}">Reverse</button>`
            : '';

        return `
          <tr class="${reversed ? 'is-reversed' : ''}">
            <td>${escapeHtml(formatDate(tx.transaction_date))}</td>
            <td>${typeBadge(tx.transaction_type)}</td>
            <td class="amount-cell">${sign} ${escapeHtml(formatRWF(tx.amount))}</td>
            <td class="num">${escapeHtml(tx.reference_code)}</td>
            <td>${escapeHtml(tx.recorded_by_name || '—')}</td>
            <td class="cell-wrap">${notes.join('<br>') || '—'}</td>
            <td>${action}</td>
          </tr>`;
      })
      .join('');

    listBox.innerHTML = `
      <p class="count">${transactions.length} ${transactions.length === 1 ? 'transaction' : 'transactions'}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Type</th>
              <th scope="col">Amount</th>
              <th scope="col">Reference</th>
              <th scope="col">Recorded by</th>
              <th scope="col">Notes</th>
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function loadTransactions() {
    const requestedFor = currentMemberId;
    listBox.innerHTML = '<p class="state">Loading transactions…</p>';

    const query = buildQuery({
      from: filterFrom.value,
      to: filterTo.value,
      type: filterType.value,
    });

    try {
      const data = await api.get(`/savings/member/${encodeURIComponent(requestedFor)}${query}`);
      if (requestedFor !== currentMemberId) return;
      transactions = data.transactions;
      renderTransactions();
    } catch (err) {
      if (requestedFor !== currentMemberId) return;
      listBox.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  function loadAll() {
    return Promise.all([loadSummary(), loadTransactions()]);
  }

  // ---------- Choosing a member (staff) ----------
  function selectMember(memberId) {
    currentMemberId = memberId || null;

    // keep the choice in the address so the page can be linked to
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
    const canRecord = member && member.status === 'active';
    recordBtn.hidden = false;
    recordBtn.disabled = !canRecord;
    recordHint.hidden = Boolean(canRecord);

    loadAll();
  }

  async function setupStaff() {
    picker.hidden = false;
    recordBtn.hidden = false;
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
    pageTitle.textContent = 'My savings';
    pageIntro.textContent = 'Every deposit and withdrawal on your account.';

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
    recordBtn.hidden = true;
    loadAll();
  }

  // ---------- Record dialog ----------
  function openRecord() {
    const member = members.find((m) => m.member_id === currentMemberId);
    if (!member) return;

    recordForm.reset();
    hideError(recordError);
    recordFor.textContent = `Member: ${memberLabel(member)}`;
    dateInput.value = todayLocal();
    recordDialog.showModal();
    amountInput.focus();
  }

  recordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(recordError);

    // allow "50,000" by dropping commas and spaces
    const amountText = amountInput.value.replace(/[,\s]/g, '');
    const reference = refInput.value.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(amountText) || parseFloat(amountText) <= 0) {
      showError(recordError, 'Enter the amount as a number above zero, like 50000 or 2500.50.');
      return;
    }
    if (!reference) {
      showError(recordError, 'Enter a reference for this transaction.');
      return;
    }

    const body = {
      memberId: currentMemberId,
      amount: amountText,
      transactionType: typeSelect.value,
      referenceCode: reference,
    };
    if (dateInput.value) body.transactionDate = dateInput.value;
    if (notesInput.value.trim()) body.notes = notesInput.value.trim();

    recordSubmit.disabled = true;
    recordSubmit.textContent = 'Saving…';
    try {
      const data = await api.post('/savings', body);
      recordDialog.close();
      showNotice(`Transaction recorded. New balance: ${formatRWF(data.newBalance)}.`);
      loadAll();
    } catch (err) {
      showError(recordError, messageFrom(err));
    } finally {
      recordSubmit.disabled = false;
      recordSubmit.textContent = 'Record transaction';
    }
  });

  // ---------- Reverse dialog ----------
  function openReverse(transactionId) {
    const tx = transactions.find((t) => t.transaction_id === transactionId);
    if (!tx) return;

    reversingId = transactionId;
    reverseForm.reset();
    hideError(reverseError);
    reverseText.textContent =
      `${TYPE_LABELS[tx.transaction_type] || tx.transaction_type} of ${formatRWF(tx.amount)}, ` +
      `reference ${tx.reference_code}, dated ${formatDate(tx.transaction_date)}.`;
    reverseDialog.showModal();
    reasonInput.focus();
  }

  reverseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(reverseError);

    const reason = reasonInput.value.trim();
    if (!reason) {
      showError(reverseError, 'Enter a reason. It is kept in the audit trail.');
      return;
    }

    reverseSubmit.disabled = true;
    reverseSubmit.textContent = 'Saving…';
    try {
      await api.patch(`/savings/${encodeURIComponent(reversingId)}/reverse`, { reason });
      reverseDialog.close();
      showNotice('Transaction reversed.');
      loadAll();
    } catch (err) {
      showError(reverseError, messageFrom(err));
    } finally {
      reverseSubmit.disabled = false;
      reverseSubmit.textContent = 'Reverse transaction';
    }
  });

  // ---------- Events ----------
  memberSelect.addEventListener('change', () => selectMember(memberSelect.value));
  recordBtn.addEventListener('click', openRecord);
  recordCancel.addEventListener('click', () => recordDialog.close());
  reverseCancel.addEventListener('click', () => reverseDialog.close());

  [filterFrom, filterTo, filterType].forEach((el) =>
    el.addEventListener('change', () => { if (currentMemberId) loadTransactions(); })
  );

  clearFilters.addEventListener('click', () => {
    filterFrom.value = '';
    filterTo.value = '';
    filterType.value = '';
    if (currentMemberId) loadTransactions();
  });

  listBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reverse]');
    if (button) openReverse(button.dataset.reverse);
  });

  // ---------- Start ----------
  if (isStaff) {
    setupStaff();
  } else {
    setupMember();
  }
})();