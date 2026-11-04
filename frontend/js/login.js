/* ==========================================================
   login.js — sends the login request and redirects by role
   ========================================================== */

(function () {
  // Already signed in? Skip the form.
  const existing = getUser();
  if (getToken() && existing) {
    window.location.replace(homeFor(existing.role));
    return;
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const showPassword = document.getElementById('show-password');
  const button = document.getElementById('login-btn');
  const errorBox = document.getElementById('login-error');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function setLoading(isLoading) {
    button.disabled = isLoading;
    button.textContent = isLoading ? 'Signing in…' : 'Sign in';
  }

  /** Turns an ApiError into one readable sentence. */
  function messageFrom(err) {
    if (err.details && err.details.length) {
      return err.details.map((d) => `${d.field}: ${d.message}`).join(' ');
    }
    return err.message || 'Could not sign in. Please try again.';
  }

  showPassword.addEventListener('change', () => {
    passwordInput.type = showPassword.checked ? 'text' : 'password';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      showError('Passwords are at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/auth/login', { email, password }, { auth: false });
      saveSession(data.token, data.user);
      if (data.suspicious) sessionStorage.setItem(SUSPICIOUS_KEY, '1');
      window.location.replace(homeFor(data.user.role));
    } catch (err) {
      showError(messageFrom(err));
      setLoading(false);
    }
  });
})();