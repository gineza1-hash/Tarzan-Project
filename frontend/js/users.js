/* ==========================================================
   users.js — admin: see which members have a login, create accounts
   GET  /api/members          (each row carries its login, if any)
   POST /api/auth/register    (admin only)

   The backend has no "list users" endpoint, so only accounts linked
   to a member can be shown here. It also has no password reset or
   deactivate endpoint, so this page can only create accounts.
   ========================================================== */

(function () {
  const user = requireAuth(['admin']);
  if (!user) return;

  initShell('users');

  // ---------- Elements ----------
  const listBox = document.getElementById('members');
  const onlyMissing = document.getElementById('only-missing');
  const newBtn = document.getElementById('new-btn');

  const dialog = document.getElementById('user-dialog');
  const form = document.getElementById('user-form');
  const doneView = document.getElementById('done-view');
  const doneDetails = document.getElementById('done-details');
  const copyStatus = document.getElementById('copy-status');
  const errorBox = document.getElementById('user-error');
  const submitBtn = document.getElementById('submit-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const copyBtn = document.getElementById('copy-btn');
  const doneBtn = document.getElementById('done-btn');

  const roleSelect = document.getElementById('f-role');
  const memberSelect = document.getElementById('f-member');
  const roleHint = document.getElementById('role-hint');
  const usernameInput = document.getElementById('f-username');
  const emailInput = document.getElementById('f-email');
  const passwordInput = document.getElementById('f-password');
  const showPassword = document.getElementById('show-password');
  const generateBtn = document.getElementById('generate-btn');

  // ---------- State ----------
  let members = []; // one entry per member, each with a logins array
  let usernameTouched = false;
  let emailTouched = false;
  let created = false;
  let createdPassword = '';

  const ROLE_LABELS = { member: 'Member', treasurer: 'Treasurer', admin: 'Admin' };
  const ROLE_HINTS = {
    member: 'Sees only their own savings, loans and repayments. Needs a member record.',
    treasurer: 'Manages members, records savings and repayments, creates and disburses loans, and views reports.',
    admin: 'Everything a treasurer can do, plus approving loans, reversing savings, creating accounts and reading the audit log.',
  };
  const FIELD_LABELS = {
    username: 'Username',
    email: 'Email',
    password: 'Password',
    role: 'Role',
  };

  // ---------- Helpers ----------
  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  /** Uses the backend's own message when it gave a useful one. */
  function messageFrom(err) {
    if (err.details && err.details.length) {
      return err.details
        .map((d) =>
          d.message && d.message !== 'Invalid value'
            ? d.message
            : `${FIELD_LABELS[d.field] || d.field} is not valid.`
        )
        .join(' ');
    }
    return err.message;
  }

  /** The members endpoint repeats a member once per login, so merge them. */
  function groupMembers(rows) {
    const byId = new Map();
    rows.forEach((row) => {
      if (!byId.has(row.member_id)) byId.set(row.member_id, { ...row, logins: [] });
      if (row.username) {
        byId.get(row.member_id).logins.push({ username: row.username, email: row.user_email });
      }
    });
    return [...byId.values()].sort((a, b) => a.member_number.localeCompare(b.member_number));
  }

  function membersWithoutLogin() {
    return members.filter((m) => m.logins.length === 0);
  }

  function suggestUsername(member) {
    const first = String(member.full_name).trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (first.length >= 3) return first;
    return String(member.member_number).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** Random password from characters that are easy to tell apart when read out. */
  function generatePassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const limit = 256 - (256 % chars.length); // avoids favouring some characters
    let out = '';
    while (out.length < length) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      for (const b of bytes) {
        if (b < limit && out.length < length) out += chars[b % chars.length];
      }
    }
    return out;
  }

  // ---------- Member list ----------
  function renderMembers() {
    if (members.length === 0) {
      listBox.innerHTML = '<p class="state">No members yet. Add members first, then create their logins here.</p>';
      return;
    }

    const withLogin = members.filter((m) => m.logins.length > 0).length;
    const shown = onlyMissing.checked ? membersWithoutLogin() : members;

    if (shown.length === 0) {
      listBox.innerHTML = '<p class="state">Every member already has a login.</p>';
      return;
    }

    const rows = shown
      .map((m) => {
        const login = m.logins.length
          ? m.logins
              .map((l) => `<div>${escapeHtml(l.username)}</div><div class="sub">${escapeHtml(l.email)}</div>`)
              .join('')
          : '<span class="muted-text">No login yet</span>';

        const action = m.logins.length
          ? ''
          : `<button type="button" class="btn btn-quiet btn-small" data-create="${escapeHtml(m.member_id)}">Create login</button>`;

        const badgeKind = m.status === 'active' ? 'active' : 'inactive';
        return `
          <tr>
            <td class="num">${escapeHtml(m.member_number)}</td>
            <td>${escapeHtml(m.full_name)}</td>
            <td><span class="badge badge-${badgeKind}">${escapeHtml(capitalize(m.status))}</span></td>
            <td>${login}</td>
            <td>${action}</td>
          </tr>`;
      })
      .join('');

    listBox.innerHTML = `
      <p class="count">${withLogin} of ${members.length} members have a login</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Member no.</th>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col">Login</th>
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
      members = groupMembers(data.members);
      renderMembers();
    } catch (err) {
      listBox.innerHTML = `<div class="alert alert-error" role="alert">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------- Dialog ----------
  function rebuildMemberOptions(selectedId) {
    const placeholder = roleSelect.value === 'member' ? 'Choose a member' : 'No member record';
    memberSelect.innerHTML =
      `<option value="">${placeholder}</option>` +
      membersWithoutLogin()
        .map((m) => {
          const tag = m.status === 'active' ? '' : ' (inactive)';
          return `<option value="${escapeHtml(m.member_id)}">${escapeHtml(m.member_number)}  ${escapeHtml(m.full_name)}${tag}</option>`;
        })
        .join('');
    memberSelect.value = selectedId || '';
  }

  function updateRoleUi() {
    roleHint.textContent = ROLE_HINTS[roleSelect.value] || '';
    rebuildMemberOptions(memberSelect.value);
  }

  /** Fills in username and email from the chosen member, unless the admin already typed their own. */
  function applyMemberSuggestions() {
    const member = members.find((m) => m.member_id === memberSelect.value);
    if (!member) return;
    if (!usernameTouched) usernameInput.value = suggestUsername(member);
    if (!emailTouched && member.email) emailInput.value = member.email;
  }

  function openDialog({ role = 'member', memberId = '' } = {}) {
    form.reset();
    hideError();
    created = false;
    createdPassword = '';
    usernameTouched = false;
    emailTouched = false;
    passwordInput.type = 'password';

    form.hidden = false;
    doneView.hidden = true;

    roleSelect.value = role;
    updateRoleUi();
    memberSelect.value = memberId;
    applyMemberSuggestions();

    dialog.showModal();
    (memberId ? usernameInput : roleSelect).focus();
  }

  function showDone(account, password) {
    createdPassword = password;
    copyStatus.textContent = '';
    doneDetails.innerHTML = `
      <h2>Sign-in details</h2>
      ${ledgerRow('Role', ROLE_LABELS[account.role] || account.role)}
      ${ledgerRow('Username', account.username)}
      ${ledgerRow('Email', account.email)}
      <div class="row total"><span class="label">Password</span><span class="amount secret">${escapeHtml(password)}</span></div>`;
    form.hidden = true;
    doneView.hidden = false;
    doneBtn.focus();
  }

  // ---------- Events ----------
  newBtn.addEventListener('click', () => openDialog({ role: 'treasurer' }));
  cancelBtn.addEventListener('click', () => dialog.close());
  doneBtn.addEventListener('click', () => dialog.close());
  onlyMissing.addEventListener('change', renderMembers);

  listBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-create]');
    if (button) openDialog({ role: 'member', memberId: button.dataset.create });
  });

  roleSelect.addEventListener('change', updateRoleUi);
  memberSelect.addEventListener('change', applyMemberSuggestions);
  usernameInput.addEventListener('input', () => { usernameTouched = true; });
  emailInput.addEventListener('input', () => { emailTouched = true; });

  showPassword.addEventListener('change', () => {
    passwordInput.type = showPassword.checked ? 'text' : 'password';
  });

  generateBtn.addEventListener('click', () => {
    passwordInput.value = generatePassword();
    showPassword.checked = true;
    passwordInput.type = 'text';
    passwordInput.focus();
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(createdPassword);
      copyStatus.textContent = 'Password copied.';
    } catch {
      copyStatus.textContent = 'Could not copy automatically. Select the password and copy it by hand.';
    }
  });

  // Refresh the list after an account was created, whichever way the dialog closes.
  dialog.addEventListener('close', () => {
    createdPassword = '';
    passwordInput.value = '';
    if (created) {
      created = false;
      loadMembers();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const role = roleSelect.value;
    const memberId = memberSelect.value;
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (role === 'member' && !memberId) {
      showError('Choose the member this login belongs to.');
      return;
    }
    if (username.length < 3) {
      showError('The username needs at least 3 characters.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      showError('Enter a valid email address. It is what the person signs in with.');
      return;
    }
    if (password.length < 8) {
      showError('The password needs at least 8 characters.');
      return;
    }

    const body = { username, email, password, role };
    if (memberId) body.memberId = memberId;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      const data = await api.post('/auth/register', body);
      created = true;
      showDone(data.user, password);
    } catch (err) {
      showError(messageFrom(err));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create account';
    }
  });

  loadMembers();
})();