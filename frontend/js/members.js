/* ==========================================================
   members.js — list, search, add and edit members (staff only)
   GET   /api/members
   POST  /api/members
   PATCH /api/members/:id
   ========================================================== */

(function () {
  const user = requireAuth(STAFF_ROLES);
  if (!user) return;

  initShell('members');

  // ---------- Elements ----------
  const listBox = document.getElementById('members');
  const searchInput = document.getElementById('search');
  const statusFilter = document.getElementById('status-filter');
  const addBtn = document.getElementById('add-btn');
  const notice = document.getElementById('notice');

  const dialog = document.getElementById('member-dialog');
  const form = document.getElementById('member-form');
  const dialogTitle = document.getElementById('dialog-title');
  const formError = document.getElementById('form-error');
  const submitBtn = document.getElementById('submit-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  const numberInput = document.getElementById('f-number');
  const nameInput = document.getElementById('f-name');
  const phoneInput = document.getElementById('f-phone');
  const emailInput = document.getElementById('f-email');
  const nationalInput = document.getElementById('f-national');
  const joinedInput = document.getElementById('f-joined');
  const statusSelect = document.getElementById('f-status');
  const nationalWrap = document.getElementById('wrap-national');
  const joinedWrap = document.getElementById('wrap-joined');
  const statusWrap = document.getElementById('wrap-status');

  // ---------- State ----------
  let members = [];
  let mode = 'create'; // 'create' or 'edit'
  let editingId = null;
  let noticeTimer = null;

  const FIELD_LABELS = {
    memberNumber: 'Member number',
    fullName: 'Full name',
    phone: 'Phone',
    email: 'Email',
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
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function hideFormError() {
    formError.hidden = true;
    formError.textContent = '';
  }

  /** The backend sends { field, message } for each invalid field. */
  function messageFrom(err) {
    if (err.details && err.details.length) {
      return err.details
        .map((d) => `${FIELD_LABELS[d.field] || d.field} is not valid.`)
        .join(' ');
    }
    return err.message;
  }

  function statusBadge(status) {
    const kind = status === 'active' ? 'active' : 'inactive';
    return `<span class="badge badge-${kind}">${escapeHtml(capitalize(status))}</span>`;
  }

  // ---------- Table ----------
  function renderTable() {
    if (members.length === 0) {
      listBox.innerHTML = '<p class="state">No members yet. Add the first member to get started.</p>';
      return;
    }

    const query = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;

    const filtered = members.filter((m) => {
      if (status && m.status !== status) return false;
      if (!query) return true;
      return [m.full_name, m.member_number, m.phone, m.email].some((value) =>
        String(value || '').toLowerCase().includes(query)
      );
    });

    if (filtered.length === 0) {
      listBox.innerHTML = '<p class="state">No members match your search.</p>';
      return;
    }

    const rows = filtered
      .map(
        (m) => `
        <tr>
          <td class="num">${escapeHtml(m.member_number)}</td>
          <td>${escapeHtml(m.full_name)}</td>
          <td>${escapeHtml(m.phone || '—')}</td>
          <td>${escapeHtml(m.email || '—')}</td>
          <td>${escapeHtml(formatDate(m.joined_at))}</td>
          <td>${statusBadge(m.status)}</td>
          <td>
            <a class="btn btn-quiet btn-small" href="savings.html?member=${encodeURIComponent(m.member_id)}">Savings</a>
            <a class="btn btn-quiet btn-small" href="loans.html?member=${encodeURIComponent(m.member_id)}">Loans</a>
            <button type="button" class="btn btn-quiet btn-small" data-edit="${escapeHtml(m.member_id)}">Edit</button>
          </td>
        </tr>`
      )
      .join('');

    listBox.innerHTML = `
      <p class="count">Showing ${filtered.length} of ${members.length} members</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Member no.</th>
              <th scope="col">Name</th>
              <th scope="col">Phone</th>
              <th scope="col">Email</th>
              <th scope="col">Joined</th>
              <th scope="col">Status</th>
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function loadMembers() {
    listBox.innerHTML = '<p class="state">Loading members…</p>';
    try {
      const data = await api.get('/members');
      members = data.members;
      renderTable();
    } catch (err) {
      listBox.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------- Dialog ----------
  function openCreate() {
    mode = 'create';
    editingId = null;
    form.reset();
    hideFormError();

    dialogTitle.textContent = 'Add member';
    submitBtn.textContent = 'Add member';
    numberInput.readOnly = false;
    nationalWrap.hidden = false;
    joinedWrap.hidden = false;
    statusWrap.hidden = true;
    joinedInput.value = todayLocal();

    dialog.showModal();
    numberInput.focus();
  }

  function openEdit(memberId) {
    const member = members.find((m) => m.member_id === memberId);
    if (!member) return;

    mode = 'edit';
    editingId = memberId;
    form.reset();
    hideFormError();

    dialogTitle.textContent = 'Edit member';
    submitBtn.textContent = 'Save changes';
    numberInput.value = member.member_number;
    numberInput.readOnly = true; // the backend cannot change member numbers
    nameInput.value = member.full_name;
    phoneInput.value = member.phone || '';
    emailInput.value = member.email || '';
    statusSelect.value = member.status;
    nationalWrap.hidden = true;
    joinedWrap.hidden = true;
    statusWrap.hidden = user.role !== 'admin';

    dialog.showModal();
    nameInput.focus();
  }

  function closeDialog() {
    dialog.close();
  }

  // ---------- Events ----------
  addBtn.addEventListener('click', openCreate);
  cancelBtn.addEventListener('click', closeDialog);
  searchInput.addEventListener('input', renderTable);
  statusFilter.addEventListener('change', renderTable);

  listBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit]');
    if (button) openEdit(button.dataset.edit);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormError();

    const fullName = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();

    let body;
    if (mode === 'create') {
      const memberNumber = numberInput.value.trim();
      if (!memberNumber || fullName.length < 2) {
        showFormError('Enter a member number and a full name of at least 2 characters.');
        return;
      }
      // Leave empty fields out: the backend rejects empty strings.
      body = { memberNumber, fullName };
      if (phone) body.phone = phone;
      if (email) body.email = email;
      if (nationalInput.value.trim()) body.nationalId = nationalInput.value.trim();
      if (joinedInput.value) body.joinedAt = joinedInput.value;
    } else {
      if (fullName.length < 2) {
        showFormError('Enter a full name of at least 2 characters.');
        return;
      }
      body = { fullName };
      if (phone) body.phone = phone;
      if (email) body.email = email;
    }

    const idleLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      if (mode === 'create') {
        await api.post('/members', body);
        showNotice('Member added.');
      } else {
        await api.patch(`/members/${encodeURIComponent(editingId)}`, body);
        const selectedStatus = statusSelect.value;
        const currentMember = members.find((member) => member.member_id === editingId);
        if (user.role === 'admin' && selectedStatus !== currentMember.status) {
          const reason = selectedStatus === 'inactive'
            ? window.prompt('Reason for deactivating this member:')?.trim()
            : 'Member reactivated';
          if (selectedStatus === 'inactive' && (!reason || reason.length < 3)) {
            throw new Error('A reason of at least 3 characters is required to deactivate a member.');
          }
          await api.patch(`/members/${encodeURIComponent(editingId)}/status`, {
            status: selectedStatus,
            reason,
          });
        }
        showNotice('Changes saved.');
      }
      closeDialog();
      await loadMembers();
    } catch (err) {
      showFormError(messageFrom(err));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = idleLabel;
    }
  });

  loadMembers();
})();