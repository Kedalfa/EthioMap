const API_BASE = window.ETHIOMAP_API_BASE || 'http://localhost:4000';
const form = document.getElementById('login-form');
const usernameInput = document.getElementById('login-username');
const passwordInput = document.getElementById('login-password');
const errorBox = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');

// If already logged in, go straight to dashboard
const existing = localStorage.getItem('ethiomap_token');
if (existing) {
  fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${existing}` } })
    .then(r => r.ok ? window.location.href = 'dashboard.html' : null)
    .catch(() => {});
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
  errorBox.classList.add('shake');
  setTimeout(() => errorBox.classList.remove('shake'), 500);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value
      })
    });
    const data = await res.json();

    if (!res.ok) {
      const isLocked = res.status === 423 || res.status === 429;
      showError(data.error || 'Login failed.');
      if (isLocked) submitBtn.disabled = true;
      else { submitBtn.disabled = false; submitBtn.textContent = 'Sign in'; }
      return;
    }

    localStorage.setItem('ethiomap_token', data.token);
    window.location.href = 'dashboard.html';
  } catch {
    showError('Cannot reach the server. Make sure the backend is running.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
});
