import { getMe, logout, fetchWithAuth, setToken } from './auth.js';

const initialFor = (name = 'User') => name.trim().charAt(0).toUpperCase() || 'U';
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function closeMenu(trigger, menu) {
  trigger.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
}

function createMenu(user) {
  const menu = document.createElement('section');
  menu.className = 'account-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Account menu');
  const username = user.username || 'EthioMap user';
  const email = user.email || 'No email address available';
  const role = user.role === 'admin' ? 'Administrator' : 'User';
  menu.innerHTML = `
    <div class="account-menu-summary">
      <span class="account-menu-avatar" aria-hidden="true">${initialFor(username)}</span>
      <div>
        <strong>${escapeHtml(username)}</strong>
        <span>${escapeHtml(email)}</span>
        <em>${role}</em>
      </div>
    </div>
    <div class="account-menu-actions">
      <button type="button" class="account-menu-item" data-account-action="edit">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 9.5-9.5 3 3L7 19H4z"></path><path d="m12 6 3 3"></path></svg>
        Edit profile
      </button>
      <button type="button" class="account-menu-item" data-account-action="password">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>
        Change password
      </button>
      <button type="button" class="account-menu-item account-menu-signout">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5"></path><path d="m14 8 4 4-4 4M18 12H9"></path></svg>
        Sign out
      </button>
    </div>`;
  menu.querySelector('.account-menu-signout').addEventListener('click', logout);
  return menu;
}

function createAccountDialog(user) {
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.innerHTML = `
    <form method="dialog" class="account-dialog-form" data-account-form="edit">
      <div class="account-dialog-head"><h2>Edit profile</h2><button value="cancel" class="account-dialog-close" aria-label="Close">×</button></div>
      <p>Update your username and email address.</p>
      <label>Username<input name="username" required maxlength="100" value="${escapeHtml(user.username)}"></label>
      <label>Email address<input name="email" type="email" required maxlength="255" value="${escapeHtml(user.email)}"></label>
      <output class="account-dialog-message" aria-live="polite"></output>
      <div class="account-dialog-actions"><button value="cancel" type="button" data-close-dialog>Cancel</button><button class="primary" type="submit">Save changes</button></div>
    </form>
    <form method="dialog" class="account-dialog-form" data-account-form="password" hidden>
      <div class="account-dialog-head"><h2>Change password</h2><button value="cancel" class="account-dialog-close" aria-label="Close">×</button></div>
      <p>Use a password with at least 8 characters, including upper and lowercase letters, a number, and a special character.</p>
      <label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label>
      <label>New password<input name="newPassword" type="password" required minlength="8" autocomplete="new-password"></label>
      <label>Confirm new password<input name="confirmPassword" type="password" required autocomplete="new-password"></label>
      <output class="account-dialog-message" aria-live="polite"></output>
      <div class="account-dialog-actions"><button value="cancel" type="button" data-close-dialog>Cancel</button><button class="primary" type="submit">Update password</button></div>
    </form>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll('[data-close-dialog], .account-dialog-close').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.querySelector('[data-account-form="edit"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('output');
    const data = Object.fromEntries(new FormData(form));
    const response = await fetchWithAuth('/api/auth/profile', { method: 'POST', body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { message.className = 'account-dialog-message error'; message.textContent = result.error || 'Unable to update your profile.'; return; }
    setToken(result.token);
    message.className = 'account-dialog-message success';
    message.textContent = 'Profile updated successfully. Taking you to the dashboard…';
    window.setTimeout(() => window.location.assign('dashboard.html'), 1200);
  });
  dialog.querySelector('[data-account-form="password"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('output');
    const data = Object.fromEntries(new FormData(form));
    if (data.newPassword !== data.confirmPassword) { message.className = 'account-dialog-message error'; message.textContent = 'New password and confirmation do not match.'; return; }
    const response = await fetchWithAuth('/api/auth/change-password', { method: 'PUT', body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { message.className = 'account-dialog-message error'; message.textContent = result.error || 'Unable to change your password.'; return; }
    message.className = 'account-dialog-message success';
    message.textContent = 'Password changed successfully. Taking you to the dashboard…';
    window.setTimeout(() => window.location.assign('dashboard.html'), 1200);
  });
  return dialog;
}

export async function initialiseProfileMenu() {
  const triggers = [...document.querySelectorAll('.profile-nav, [data-profile-trigger]')];
  if (!triggers.length) return;
  const user = await getMe();
  if (!user) return;

  triggers.forEach((trigger) => {
    if (trigger.dataset.accountMenuReady === 'true') return;
    trigger.dataset.accountMenuReady = 'true';
    trigger.classList.add('profile-avatar-button');
    trigger.removeAttribute('href');
    trigger.removeAttribute('title');
    trigger.innerHTML = `<span aria-hidden="true">${initialFor(user.username)}</span>`;
    trigger.setAttribute('type', 'button');
    trigger.setAttribute('aria-label', 'Open account menu');
    trigger.setAttribute('aria-expanded', 'false');

    const menu = createMenu(user);
    const dialog = createAccountDialog(user);
    trigger.insertAdjacentElement('afterend', menu);
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const open = trigger.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.account-menu:not([hidden])').forEach((item) => {
        item.hidden = true;
      });
      document.querySelectorAll('.profile-avatar-button[aria-expanded="true"]').forEach((item) => {
        item.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
    menu.querySelectorAll('[data-account-action]').forEach((action) => action.addEventListener('click', () => {
      const mode = action.dataset.accountAction;
      dialog.querySelectorAll('[data-account-form]').forEach((form) => { form.hidden = form.dataset.accountForm !== mode; });
      dialog.showModal();
      closeMenu(trigger, menu);
    }));
    document.addEventListener('click', (event) => {
      if (!menu.hidden && !menu.contains(event.target) && !trigger.contains(event.target)) closeMenu(trigger, menu);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) closeMenu(trigger, menu);
    });
  });
}

initialiseProfileMenu();
