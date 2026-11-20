/* ==========================================================
   login.js — sign in (email OR phone number), or create an account

   POST /api/auth/login                          { identifier, password }
   POST /api/auth/register-member/request-code   step 1: details checked, a 6-digit code is texted
   POST /api/auth/register-member                step 2: code + password, the account is created

   Nothing exists until step 2 succeeds. The password the member typed in step 1
   is kept only in this page's memory, and sent once more with the code.
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
  const identifierInput = document.getElementById('identifier');
  const passwordInput = document.getElementById('password');
  const showPassword = document.getElementById('show-password');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');

  const regTitle = document.getElementById('reg-title');
  const regIntro = document.getElementById('reg-intro');
  const registerError = document.getElementById('register-error');

  const detailsForm = document.getElementById('details-form');
  const nationalInput = document.getElementById('r-national');
  const phoneInput = document.getElementById('r-phone');
  const regPassword = document.getElementById('r-password');
  const regConfirm = document.getElementById('r-confirm');
  const regShow = document.getElementById('r-show');
  const regEmail = document.getElementById('r-email');
  const continueBtn = document.getElementById('continue-btn');

  const verifyForm = document.getElementById('verify-form');
  const devNote = document.getElementById('dev-note');
  const codeInput = document.getElementById('r-code');
  const verifyBtn = document.getElementById('verify-btn');
  const resendBtn = document.getElementById('resend-btn');
  const backBtn = document.getElementById('back-btn');

  const FIELD_LABELS = {
    identifier: 'Email or phone number',
    nationalId: 'National ID',
    phone: 'Phone number',
    code: 'Code',
    email: 'Email',
    password: 'Password',
  };

  const TITLE_STEP1 = 'Create your account';
  const INTRO_STEP1 =
    'For SACCO members. Fill in your details. We will then text a code to your phone to confirm it is you.';

  // What was typed in step 1. The password lives only here (never saved anywhere).
  let pending = { nationalId: '', phone: '', email: '', password: '', token: '' };
  let countdownTimer = null;

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

  function digitCount(text) {
    return String(text).replace(/\D/g, '').length;
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
  document.getElementById('go-register').addEventListener('click', (e) => { e.preventDefault(); showTab('register'); });
  document.getElementById('go-signin').addEventListener('click', (e) => { e.preventDefault(); showTab('signin'); identifierInput.focus(); });

  document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const toRegister = tabSignin.getAttribute('aria-selected') === 'true';
      showTab(toRegister ? 'register' : 'signin');
      (toRegister ? tabRegister : tabSignin).focus();
    }
  });

  // ---------- Sign in (email or phone) ----------
  showPassword.addEventListener('change', () => {
    passwordInput.type = showPassword.checked ? 'text' : 'password';
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(loginError);

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    if (!identifier || !password) {
      showError(loginError, 'Enter your email or phone number, and your password.');
      return;
    }
    const looksLikeEmail = identifier.includes('@');
    if (looksLikeEmail ? !/^\S+@\S+\.\S+$/.test(identifier) : digitCount(identifier) < 9) {
      showError(loginError, 'Enter your email address, or the phone number on your account (for example 0788 123 456).');
      return;
    }
    if (password.length < 6) {
      showError(loginError, 'Passwords are at least 6 characters long.');
      return;
    }

    setLoading(loginBtn, true, 'Sign in');
    try {
      const data = await api.post('/auth/login', { identifier, password }, { auth: false });
      saveSession(data.token, data.user);
      if (data.suspicious) sessionStorage.setItem(SUSPICIOUS_KEY, '1');
      window.location.replace(homeFor(data.user.role));
    } catch (err) {
      showError(loginError, messageFrom(err, 'Could not sign in. Please try again.'));
      setLoading(loginBtn, false, 'Sign in');
    }
  });

  // ---------- Create account: steps ----------
  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  /** Keeps "Resend code" switched off for a minute, matching the backend's limit. */
  function startCountdown(seconds) {
    stopCountdown();
    let left = seconds;
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend code (${left}s)`;
    countdownTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        stopCountdown();
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend code';
      } else {
        resendBtn.textContent = `Resend code (${left}s)`;
      }
    }, 1000);
  }

  function showStep(step) {
    const one = step === 1;
    detailsForm.hidden = !one;
    verifyForm.hidden = one;
    hideError(registerError);
    if (one) {
      stopCountdown();
      regTitle.textContent = TITLE_STEP1;
      regIntro.textContent = INTRO_STEP1;
    } else {
      regTitle.textContent = 'Confirm it is you';
    }
  }

  regShow.addEventListener('change', () => {
    const type = regShow.checked ? 'text' : 'password';
    regPassword.type = type;
    regConfirm.type = type;
  });

  /** Asks the backend to check the details and text a code. Used by "Continue" and "Resend code". */
  async function requestCode() {
    const body = { nationalId: pending.nationalId, phone: pending.phone };
    if (pending.email) body.email = pending.email;

    const data = await api.post('/auth/register-member/request-code', body, { auth: false });
    pending.token = data.verificationToken;

    regIntro.textContent =
      `We sent a 6-digit code to ${data.phoneHint}. Enter it to finish creating your account. It expires in ${data.expiresInMinutes} minutes.`;

    // Only present when the backend runs with SMS_DEV_ECHO=true (testing without an SMS account)
    if (data.devCode) {
      devNote.textContent = `Test mode: no SMS was sent. Your code is ${data.devCode}.`;
      devNote.hidden = false;
    } else {
      devNote.hidden = true;
      devNote.textContent = '';
    }
  }

  // ---------- Create account: step 1 (your details) ----------
  detailsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(registerError);

    const nationalId = nationalInput.value.trim();
    const phone = phoneInput.value.trim();
    const password = regPassword.value;
    const email = regEmail.value.trim();

    if (!nationalId) {
      showError(registerError, 'Enter your National ID.');
      return;
    }
    if (digitCount(phone) < 9) {
      showError(registerError, 'Enter the phone number you gave the SACCO, for example 0788 123 456.');
      return;
    }
    if (password.length < 8) {
      showError(registerError, 'The password needs at least 8 characters.');
      return;
    }
    if (password.length > 72) {
      showError(registerError, 'The password can be at most 72 characters.');
      return;
    }
    if (password !== regConfirm.value) {
      showError(registerError, 'The two passwords do not match.');
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      showError(registerError, 'That email address does not look right. Fix it, or leave it empty.');
      return;
    }

    pending = { nationalId, phone, email, password, token: '' };

    setLoading(continueBtn, true, 'Continue');
    try {
      await requestCode();
      showStep(2);
      codeInput.value = '';
      startCountdown(60);
      codeInput.focus();
    } catch (err) {
      pending.password = '';
      showError(registerError, messageFrom(err, 'Could not send the code. Please try again.'));
    } finally {
      setLoading(continueBtn, false, 'Continue');
    }
  });

  // ---------- Create account: step 2 (the code) ----------
  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(registerError);

    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      showError(registerError, 'Enter the 6-digit code from the SMS.');
      return;
    }

    const body = { verificationToken: pending.token, code, password: pending.password };
    if (pending.email) body.email = pending.email;

    setLoading(verifyBtn, true, 'Verify and create account');
    try {
      const data = await api.post('/auth/register-member', body, { auth: false });
      stopCountdown();
      pending = { nationalId: '', phone: '', email: '', password: '', token: '' };
      saveSession(data.token, data.user); // the backend signs the new member straight in
      window.location.replace(homeFor(data.user.role));
    } catch (err) {
      showError(registerError, messageFrom(err, 'Could not create the account. Please try again.'));
      setLoading(verifyBtn, false, 'Verify and create account');
    }
  });

  resendBtn.addEventListener('click', async () => {
    hideError(registerError);
    resendBtn.disabled = true;
    try {
      await requestCode();
      codeInput.value = '';
      codeInput.focus();
      startCountdown(60);
    } catch (err) {
      showError(registerError, messageFrom(err, 'Could not send a new code. Please try again.'));
      resendBtn.disabled = false;
    }
  });

  backBtn.addEventListener('click', () => {
    pending.token = '';
    pending.password = '';
    devNote.hidden = true;
    showStep(1);
    nationalInput.focus(); // the details stay filled in, so they only fix what is wrong
  });

  // ---------- Start ----------
  regIntro.textContent = INTRO_STEP1;
  if (new URLSearchParams(window.location.search).get('tab') === 'register') showTab('register');
})();