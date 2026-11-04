/* ==========================================================
   auth.js — who is logged in, and where they are allowed to go
   Load this BEFORE api.js on every page.
   ========================================================== */

const TOKEN_KEY = 'sacco_token';
const USER_KEY = 'sacco_user';
const SUSPICIOUS_KEY = 'sacco_suspicious';
const STAFF_ROLES = ['admin', 'treasurer'];

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(SUSPICIOUS_KEY);
}

/** The first page each role lands on after login. */
function homeFor(role) {
  return STAFF_ROLES.includes(role) ? 'dashboard.html' : 'portal.html';
}

/**
 * Call at the top of every protected page.
 *   requireAuth()                       -> any logged-in user
 *   requireAuth(['admin','treasurer'])  -> staff only
 * Returns the user, or null after redirecting away.
 */
function requireAuth(allowedRoles) {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    window.location.replace('login.html');
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.replace(homeFor(user.role));
    return null;
  }
  return user;
}

function logout() {
  clearSession();
  window.location.replace('login.html');
}