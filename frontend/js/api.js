/* ==========================================================
   api.js — every request to the backend goes through here
   Needs auth.js loaded first.
   ========================================================== */

// Change this if your backend runs somewhere else.
const API_BASE = 'http://localhost:5000/api';

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || []; // validation errors: [{ field, message }]
  }
}

/**
 * apiRequest('/members', { method: 'GET' })
 * - adds the Bearer token automatically (set auth:false for login)
 * - returns the parsed JSON
 * - throws ApiError with a readable message on any failure
 * - a 401 on a logged-in request clears the session and returns to login
 */
async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Cannot reach the server. Check that the backend is running on port 5000 and that this page is open at http://localhost:5173.',
      0
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // some responses may have no JSON body
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearSession();
      window.location.replace('login.html');
    }
    throw new ApiError(
      (data && data.error) || 'Something went wrong. Please try again.',
      response.status,
      data && data.details
    );
  }

  return data;
}

const api = {
  get: (path) => apiRequest(path),
  post: (path, body, options) => apiRequest(path, { method: 'POST', body, ...options }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
};