/* ==========================================================
   reports.js — savings transaction report and audit log
   GET /api/members                   (member filter)
   GET /api/reports/transactions      ?from&to&type&memberId   (staff)
   GET /api/reports/audit             ?from&to&action&entityType (admin only)
   ========================================================== */

(function () {
  const user = requireAuth(STAFF_ROLES);
  if (!user) return;

  const isAdmin = user.role === 'admin';

  initShell('reports');

  // ---------- Elements ----------
  const tabTransactions = document.getElementById('tab-transactions');
  const tabAudit = document.getElementById('tab-audit');
  const panelTransactions = document.getElementById('panel-transactions');
  const panelAudit = document.getElementById('panel-audit');

  const txFrom = document.getElementById('tx-from');
  const txTo = document.getElementById('tx-to');
  const txType = document.getElementById('tx-type');
  const txMember = document.getElementById('tx-member');
  const txClear = document.getElementById('tx-clear');
  const txExport = document.getElementById('tx-export');
  const txSummary = document.getElementById('tx-summary');
  const txList = document.getElementById('tx-list');

  const auFrom = document.getElementById('au-from');
  const auTo = document.getElementById('au-to');
  const auAction = document.getElementById('au-action');
  const auEntity = document.getElementById('au-entity');
  const auClear = document.getElementById('au-clear');
  const auList = document.getElementById('au-list');

  // ---------- Labels ----------
  const TYPE_LABELS = { deposit: 'Deposit', withdrawal: 'Withdrawal', adjustment: 'Adjustment' };

  const ACTION_LABELS = {
    SUSPICIOUS_LOGIN: 'Suspicious login',
    CREATE_USER: 'User created',
    SELF_REGISTER: 'Member self-registered',
    CREATE_MEMBER: 'Member created',
    UPDATE_MEMBER: 'Member updated',
    CREATE_LOAN: 'Loan created',
    APPROVE_LOAN: 'Loan approved',
    DISBURSE_LOAN: 'Loan disbursed',
    RECORD_SAVINGS: 'Savings recorded',
    REVERSE_SAVINGS: 'Savings reversed',
    RECORD_REPAYMENT: 'Repayment recorded',
  };

  const ENTITY_LABELS = {
    users: 'User',
    members: 'Member',
    loans: 'Loan',
    savings_transactions: 'Savings transaction',
    repayments: 'Repayment',
  };

  // ---------- State ----------
  let transactions = [];
  let txRequest = 0; // bumped on every load so slow, outdated answers are ignored
  let auRequest = 0;
  let auditLoaded = false;

  // ---------- Helpers ----------
  /** "14,667.50" -> 1466750 (whole cents avoid rounding drift when adding). */
  function toCents(value) {
    return Math.round(parseFloat(value) * 100) || 0;
  }

  /** The audit filter compares timestamps, so "to" a date must mean the end of that day. */
  function nextDay(dateText) {
    const [y, m, d] = dateText.split('-').map(Number);
    const date = new Date(y, m - 1, d + 1);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function errorBox(message) {
    return `<div class="alert alert-error" role="alert">${escapeHtml(message)}</div>`;
  }

  function typeBadge(type) {
    return `<span class="badge badge-${escapeHtml(type)}">${escapeHtml(TYPE_LABELS[type] || type)}</span>`;
  }

  // ---------- Tabs ----------
  function showTab(name) {
    const onTransactions = name === 'transactions';
    tabTransactions.setAttribute('aria-selected', String(onTransactions));
    tabTransactions.tabIndex = onTransactions ? 0 : -1;
    tabAudit.setAttribute('aria-selected', String(!onTransactions));
    tabAudit.tabIndex = onTransactions ? -1 : 0;
    panelTransactions.hidden = !onTransactions;
    panelAudit.hidden = onTransactions;

    if (!onTransactions && !auditLoaded) {
      auditLoaded = true;
      loadAudit();
    }
  }

  tabTransactions.addEventListener('click', () => showTab('transactions'));
  tabAudit.addEventListener('click', () => showTab('audit'));

  // Left and right arrow keys move between tabs
  document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (!isAdmin) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const goingToAudit = tabTransactions.getAttribute('aria-selected') === 'true';
      showTab(goingToAudit ? 'audit' : 'transactions');
      (goingToAudit ? tabAudit : tabTransactions).focus();
    }
  });

  // ==========================================================
  //  Savings transactions
  // ==========================================================
  function renderTxSummary() {
    if (transactions.length === 0) {
      txSummary.innerHTML = '';
      return;
    }

    let moneyIn = 0;
    let moneyOut = 0;
    let reversedCount = 0;
    transactions.forEach((t) => {
      if (t.is_reversed) {
        reversedCount += 1;
        return;
      }
      if (t.transaction_type === 'withdrawal') moneyOut += toCents(t.amount);
      else moneyIn += toCents(t.amount);
    });

    const note = reversedCount
      ? `<p class="hint statement-note">${reversedCount} reversed ${reversedCount === 1 ? 'transaction is' : 'transactions are'} left out of these totals.</p>`
      : '';

    txSummary.innerHTML = `
      <section class="statement narrow">
        <h2>Totals for these results</h2>
        ${ledgerRow('Deposits and adjustments', formatRWF(moneyIn / 100))}
        ${ledgerRow('Withdrawals', formatRWF(moneyOut / 100))}
        ${ledgerRow('Net movement', formatRWF((moneyIn - moneyOut) / 100), 'total')}
        ${note}
      </section>`;
  }

  function renderTxList() {
    txExport.disabled = transactions.length === 0;

    if (transactions.length === 0) {
      txList.innerHTML = '<p class="state">No transactions match these filters.</p>';
      return;
    }

    const rows = transactions
      .map((t) => {
        const reversed = t.is_reversed;
        const sign = t.transaction_type === 'withdrawal' ? '−' : '+';

        const notes = [];
        if (t.notes) notes.push(escapeHtml(t.notes));
        if (reversed) {
          const why = t.reversal_reason ? `: ${escapeHtml(t.reversal_reason)}` : '';
          notes.push(`<span class="reversal">Reversed${why}</span>`);
        }

        return `
          <tr class="${reversed ? 'is-reversed' : ''}">
            <td>${escapeHtml(formatDate(t.transaction_date))}</td>
            <td>
              <div>${escapeHtml(t.full_name)}</div>
              <div class="sub">${escapeHtml(t.member_number)}</div>
            </td>
            <td>${typeBadge(t.transaction_type)}</td>
            <td class="amount-cell">${sign} ${escapeHtml(formatRWF(t.amount))}</td>
            <td class="num">${escapeHtml(t.reference_code)}</td>
            <td>${escapeHtml(t.recorded_by_name || '—')}</td>
            <td class="cell-wrap">${notes.join('<br>') || '—'}</td>
          </tr>`;
      })
      .join('');

    txList.innerHTML = `
      <p class="count">${transactions.length} ${transactions.length === 1 ? 'transaction' : 'transactions'}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Member</th>
              <th scope="col">Type</th>
              <th scope="col">Amount</th>
              <th scope="col">Reference</th>
              <th scope="col">Recorded by</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function loadTransactions() {
    const request = ++txRequest;
    txList.innerHTML = '<p class="state">Loading transactions…</p>';
    txSummary.innerHTML = '';
    txExport.disabled = true;

    const query = buildQuery({
      from: txFrom.value,
      to: txTo.value,
      type: txType.value,
      memberId: txMember.value,
    });

    try {
      const data = await api.get(`/reports/transactions${query}`);
      if (request !== txRequest) return;
      transactions = data.transactions;
      renderTxSummary();
      renderTxList();
    } catch (err) {
      if (request !== txRequest) return;
      txList.innerHTML = errorBox(err.message);
    }
  }

  async function loadMemberFilter() {
    try {
      const data = await api.get('/members');
      const sorted = data.members.slice().sort((a, b) => a.member_number.localeCompare(b.member_number));
      txMember.insertAdjacentHTML(
        'beforeend',
        sorted
          .map((m) => `<option value="${escapeHtml(m.member_id)}">${escapeHtml(m.member_number)}  ${escapeHtml(m.full_name)}</option>`)
          .join('')
      );
    } catch {
      // The report still works without the member filter.
    }
  }

  // ---------- CSV download ----------
  /** Text cells are quoted, and cells that start with = + - @ get a leading ' so spreadsheets never run them as formulas. */
  function csvText(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadTransactionsCsv() {
    if (transactions.length === 0) return;

    const header = [
      'Date', 'Member number', 'Member name', 'Type', 'Amount (RWF)',
      'Reference', 'Recorded by', 'Reversed', 'Reversal reason', 'Notes',
    ].map(csvText);

    const lines = transactions.map((t) =>
      [
        csvText(String(t.transaction_date).slice(0, 10)),
        csvText(t.member_number),
        csvText(t.full_name),
        csvText(TYPE_LABELS[t.transaction_type] || t.transaction_type),
        parseFloat(t.amount).toFixed(2),
        csvText(t.reference_code),
        csvText(t.recorded_by_name),
        csvText(t.is_reversed ? 'Yes' : 'No'),
        csvText(t.reversal_reason),
        csvText(t.notes),
      ].join(',')
    );

    // The leading \ufeff lets Excel read accented names correctly.
    const csv = '\ufeff' + [header.join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const stamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `savings-transactions-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  [txFrom, txTo, txType, txMember].forEach((el) => el.addEventListener('change', loadTransactions));
  txClear.addEventListener('click', () => {
    txFrom.value = '';
    txTo.value = '';
    txType.value = '';
    txMember.value = '';
    loadTransactions();
  });
  txExport.addEventListener('click', downloadTransactionsCsv);

  // ==========================================================
  //  Audit log (admin only)
  // ==========================================================
  function fillAuditFilters() {
    auAction.innerHTML =
      '<option value="">All actions</option>' +
      Object.entries(ACTION_LABELS)
        .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
        .join('');

    auEntity.innerHTML =
      '<option value="">All record types</option>' +
      Object.entries(ENTITY_LABELS)
        .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
        .join('');
  }

  function stateBlock(label, state) {
    if (!state) return '';
    return `<div><div class="sub">${escapeHtml(label)}</div><pre class="json">${escapeHtml(JSON.stringify(state, null, 2))}</pre></div>`;
  }

  function renderAudit(logs) {
    if (logs.length === 0) {
      auList.innerHTML = '<p class="state">No audit entries match these filters.</p>';
      return;
    }

    const rows = logs
      .map((log) => {
        const changes =
          log.before_state || log.after_state
            ? `<details><summary>View changes</summary><div class="json-pair">${stateBlock('Before', log.before_state)}${stateBlock('After', log.after_state)}</div></details>`
            : '';
        const reason = log.reason ? `<div>${escapeHtml(log.reason)}</div>` : '';
        const shortId = String(log.entity_id || '').slice(0, 8);

        return `
          <tr>
            <td>${escapeHtml(formatDateTime(log.timestamp))}</td>
            <td>${escapeHtml(log.username || 'Unknown')}</td>
            <td>${escapeHtml(ACTION_LABELS[log.action] || log.action)}</td>
            <td>
              <div>${escapeHtml(ENTITY_LABELS[log.entity_type] || log.entity_type)}</div>
              <div class="sub num" title="${escapeHtml(log.entity_id || '')}">${escapeHtml(shortId)}</div>
            </td>
            <td class="num">${escapeHtml(log.ip_address || '—')}</td>
            <td class="cell-wrap">${reason}${changes}${reason || changes ? '' : '—'}</td>
          </tr>`;
      })
      .join('');

    const limitNote =
      logs.length >= 500
        ? '<p class="hint-line">Showing the latest 500 entries. Narrow the dates to see older ones.</p>'
        : '';

    auList.innerHTML = `
      <p class="count">${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}</p>
      ${limitNote}
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">User</th>
              <th scope="col">Action</th>
              <th scope="col">Record</th>
              <th scope="col">IP address</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function loadAudit() {
    const request = ++auRequest;
    auList.innerHTML = '<p class="state">Loading audit log…</p>';

    const query = buildQuery({
      from: auFrom.value,
      to: auTo.value ? nextDay(auTo.value) : '', // include the whole "to" day
      action: auAction.value,
      entityType: auEntity.value,
    });

    try {
      const data = await api.get(`/reports/audit${query}`);
      if (request !== auRequest) return;
      renderAudit(data.logs);
    } catch (err) {
      if (request !== auRequest) return;
      auList.innerHTML = errorBox(err.message);
    }
  }

  [auFrom, auTo, auAction, auEntity].forEach((el) => el.addEventListener('change', loadAudit));
  auClear.addEventListener('click', () => {
    auFrom.value = '';
    auTo.value = '';
    auAction.value = '';
    auEntity.value = '';
    loadAudit();
  });

  // ---------- Start ----------
  if (isAdmin) {
    tabAudit.hidden = false;
    fillAuditFilters();
  }
  loadMemberFilter();
  loadTransactions();
})();