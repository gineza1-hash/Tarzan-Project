/* ==========================================================
   login.js — sign in, or create an account (existing members)
   POST /api/auth/login
   POST /api/auth/register-member   (public; needs the new backend endpoint)
   ========================================================== */

(function () {
  // Already signed in? Skip the form.
  const existing = getUser();
  if (getToken() && existing) {
    window.location.replace(homeFor(existing.role));
    return;
  }

  // ---------- Elements ----------
  const tabSignin = document.getElementById('tab-signin');
  const tabRegister = document.getElementById('tab-register');
  const panelSignin = document.getElementById('panel-signin');
  const panelRegister = document.getElementById('panel-register');

  const loginForm = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const showPassword = document.getElementById('show-password');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');

  const registerForm = document.getElementById('register-form');
  const numberInput = document.getElementById('r-number');
  const nationalInput = document.getElementById('r-national');
  const regEmail = document.getElementById('r-email');
  const regUsername = document.getElementById('r-username');
  const regPassword = document.getElementById('r-password');
  const regConfirm = document.getElementById('r-confirm');
  const regShow = document.getElementById('r-show');
  const registerBtn = document.getElementById('register-btn');
  const registerError = document.getElementById('register-error');

  const FIELD_LABELS = {
    memberNumber: 'Member number',
    nationalId: 'National ID',
    username: 'Username',
    email: 'Email',
    password: 'Password',
  };

  // ---------- Helpers ----------
  function showError(box, message) {
    box.textContent = message;
    box.hidden = false;
  }

  function hideError(box) {
    box.hidden = true;
    box.textContent = '';
  }

  /** Uses the backend's own message when it gave a useful one. */
  function messageFrom(err, fallback) {
    if (err.details && err.details.length) {
      return err.details
        .map((d) =>
          d.message && d.message !== 'Invalid value'
            ? d.message
            : `${FIELD_LABELS[d.field] || d.field} is not valid.`
        )
        .join(' ');
    }
    return err.message || fallback;
  }

  function setLoading(button, isLoading, idleText) {
    button.disabled = isLoading;
    button.textContent = isLoading ? 'Please wait…' : idleText;
  }

  // ---------- Tabs ----------
  function showTab(name) {
    const signin = name === 'signin';
    tabSignin.setAttribute('aria-selected', String(signin));
    tabSignin.tabIndex = signin ? 0 : -1;
    tabRegister.setAttribute('aria-selected', String(!signin));
    tabRegister.tabIndex = signin ? -1 : 0;
    panelSignin.hidden = !signin;
    panelRegister.hidden = signin;
    hideError(loginError);
    hideError(registerError);
    document.title = (signin ? 'Sign in' : 'Create account') + ' · Tarzan SACCO Ledger';
  }

  tabSignin.addEventListener('click', () => showTab('signin'));
  tabRegister.addEventListener('click', () => showTab('register'));
  document.getElementById('go-register').addEventListener('click', (e) => { e.preventDefault(); showTab('register'); numberInput.focus(); });
  document.getElementById('go-signin').addEventListener('click', (e) => { e.preventDefault(); showTab('signin'); emailInput.focus(); });

  document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const toRegister = tabSignin.getAttribute('aria-selected') === 'true';
      showTab(toRegister ? 'register' : 'signin');
      (toRegister ? tabRegister : tabSignin).focus();
    }
  });

  // Links such as login.html?tab=register open the right tab
  if (new URLSearchParams(window.location.search).get('tab') === 'register') showTab('register');

  // ---------- Sign in ----------
  showPassword.addEventListener('change', () => {
    passwordInput.type = showPassword.checked ? 'text' : 'password';
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(loginError);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError(loginError, 'Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      showError(loginError, 'Passwords are at least 6 characters long.');
      return;
    }

    setLoading(loginBtn, true, 'Sign in');
    try {
      const data = await api.post('/auth/login', { email, password }, { auth: false });
      saveSession(data.token, data.user);
      if (data.suspicious) sessionStorage.setItem(SUSPICIOUS_KEY, '1');
      window.location.replace(homeFor(data.user.role));
    } catch (err) {
      showError(loginError, messageFrom(err, 'Could not sign in. Please try again.'));
      setLoading(loginBtn, false, 'Sign in');
    }
  });

  // ---------- Create account ----------
  regShow.addEventListener('change', () => {
    const type = regShow.checked ? 'text' : 'password';
    regPassword.type = type;
    regConfirm.type = type;
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(registerError);

    const memberNumber = numberInput.value.trim();
    const nationalId = nationalInput.value.trim();
    const email = regEmail.value.trim();
    const username = regUsername.value.trim();
    const password = regPassword.value;

    if (!memberNumber || !nationalId) {
      showError(registerError, 'Enter your member number and National ID.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      showError(registerError, 'Enter a valid email address.');
      return;
    }
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
      showError(registerError, 'The username needs at least 3 characters: letters, numbers, dots, dashes or underscores.');
      return;
    }
    if (password.length < 8) {
      showError(registerError, 'The password needs at least 8 characters.');
      return;
    }
    if (password !== regConfirm.value) {
      showError(registerError, 'The two passwords do not match.');
      return;
    }

    setLoading(registerBtn, true, 'Create account');
    try {
      const data = await api.post(
        '/auth/register-member',
        { memberNumber, nationalId, username, email, password },
        { auth: false }
      );
      saveSession(data.token, data.user); // the backend signs the new member straight in
      window.location.replace(homeFor(data.user.role));
    } catch (err) {
      showError(registerError, messageFrom(err, 'Could not create the account. Please try again.'));
      setLoading(registerBtn, false, 'Create account');
    }
  });
})();