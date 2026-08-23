import { getMe, logout, fetchWithAuth, setToken } from './auth.js';
import { attachPasswordToggle, resetPasswordToggle, initAllPasswordToggles } from './password-toggle.js';

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
  const avatarSrc = user.avatar_url || user.avatarUrl;
  const avatarMarkup = avatarSrc
    ? `<span class="account-menu-avatar" aria-hidden="true"><img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(username)}" onerror="this.parentElement.textContent='${initialFor(username)}'"></span>`
    : `<span class="account-menu-avatar" aria-hidden="true">${initialFor(username)}</span>`;

  menu.innerHTML = `
    <div class="account-menu-summary">
      ${avatarMarkup}
      <div>
        <strong data-account-display-name>${escapeHtml(username)}</strong>
        <span data-account-display-email>${escapeHtml(email)}</span>
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

function evaluatePasswordPolicy(pwd) {
  if (!pwd || pwd.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(pwd)) return 'Please include at least one uppercase letter (A-Z).';
  if (!/[a-z]/.test(pwd)) return 'Please include at least one lowercase letter (a-z).';
  if (!/\d/.test(pwd)) return 'Please include at least one number (0-9).';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) return 'Please include at least one special character (e.g. !@#$%^&*).';
  return null;
}

function createAccountDialog(initialUser) {
  let currentUser = { ...initialUser };
  let pendingAvatarDataUrl = null;

  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';

  const username = currentUser.username || '';
  const email = currentUser.email || '';
  const role = currentUser.role === 'admin' ? 'Administrator' : 'Standard User';
  const avatarSrc = currentUser.avatar_url || currentUser.avatarUrl;

  dialog.innerHTML = `
    <form method="dialog" class="account-dialog-form" data-account-form="edit">
      <div class="account-dialog-head">
        <h2>Edit profile</h2>
        <button value="cancel" class="account-dialog-close" type="button" aria-label="Close">✕</button>
      </div>

      <div class="dialog-avatar-section">
        <div class="dialog-avatar-wrapper" title="Click to choose profile photo" tabindex="0" role="button" aria-label="Change profile photo">
          <div class="dialog-avatar-preview">
            ${avatarSrc ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(username)}" onerror="this.outerHTML='<span>${initialFor(username)}</span>'">` : `<span>${initialFor(username)}</span>`}
          </div>
          <span class="dialog-avatar-edit-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          </span>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" style="display: none;" class="dialog-file-input">
        <div class="dialog-avatar-meta">
          <strong>Profile photo</strong>
          <span class="dialog-avatar-hint">JPG, PNG, or WEBP (Max 5MB)</span>
          <div class="dialog-avatar-actions">
            <button type="button" class="dialog-avatar-btn change">Choose photo</button>
            <button type="button" class="dialog-avatar-btn remove" style="${avatarSrc ? '' : 'display: none;'}">Remove photo</button>
            <button type="button" class="dialog-avatar-btn cancel-preview" style="display: none;">Cancel preview</button>
          </div>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; margin-bottom: 2px;">
        <span style="font-size: 12px; color: var(--theme-muted, #526977); font-weight: 700;">Account role</span>
        <span class="account-dialog-role-badge ${currentUser.role === 'admin' ? 'admin' : 'user'}">${role}</span>
      </div>

      <label>
        Username
        <input name="username" required maxlength="100" autocomplete="off" value="${escapeHtml(username)}">
      </label>
      <label>
        Email address
        <input name="email" type="email" required maxlength="255" autocomplete="off" value="${escapeHtml(email)}">
      </label>

      <output class="account-dialog-message" aria-live="polite"></output>
      <div class="account-dialog-actions">
        <button value="cancel" type="button" data-close-dialog>Cancel</button>
        <button class="primary" type="submit">Save changes</button>
      </div>
    </form>

    <form method="dialog" class="account-dialog-form" data-account-form="password" hidden>
      <div class="account-dialog-head">
        <h2>Change password</h2>
        <button value="cancel" class="account-dialog-close" type="button" aria-label="Close">✕</button>
      </div>
      <p>Use a password with at least 8 characters, including uppercase and lowercase letters, a number, and a special character.</p>
      <label>
        Current password
        <div class="password-input-wrapper">
          <input name="currentPassword" type="password" required autocomplete="current-password">
        </div>
      </label>
      <label>
        New password
        <div class="password-input-wrapper">
          <input name="newPassword" type="password" required minlength="8" autocomplete="new-password">
        </div>
      </label>
      <label>
        Confirm new password
        <div class="password-input-wrapper">
          <input name="confirmPassword" type="password" required autocomplete="new-password">
        </div>
      </label>
      <output class="account-dialog-message" aria-live="polite"></output>
      <div class="account-dialog-actions">
        <button value="cancel" type="button" data-close-dialog>Cancel</button>
        <button class="primary" type="submit">Update password</button>
      </div>
    </form>`;

  document.body.appendChild(dialog);
<<<<<<< Updated upstream
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
=======

  const editForm = dialog.querySelector('[data-account-form="edit"]');
  const pwdForm = dialog.querySelector('[data-account-form="password"]');
  initAllPasswordToggles(pwdForm);
  const editMessage = editForm.querySelector('output');
  const pwdMessage = pwdForm.querySelector('output');

  const avatarWrapper = editForm.querySelector('.dialog-avatar-wrapper');
  const avatarPreview = editForm.querySelector('.dialog-avatar-preview');
  const fileInput = editForm.querySelector('.dialog-file-input');
  const changePhotoBtn = editForm.querySelector('.dialog-avatar-btn.change');
  const removePhotoBtn = editForm.querySelector('.dialog-avatar-btn.remove');
  const cancelPreviewBtn = editForm.querySelector('.dialog-avatar-btn.cancel-preview');

  function showMessage(el, text, isError = true) {
    el.textContent = text;
    el.className = `account-dialog-message ${isError ? 'error' : 'success'}`;
  }

  function updateUiEverywhere(u) {
    currentUser = { ...currentUser, ...u };
    const currUsername = currentUser.username || '';
    const currEmail = currentUser.email || '';
    const currAvatar = currentUser.avatar_url || currentUser.avatarUrl;

    // Update triggers on the page
    document.querySelectorAll('.profile-avatar-button').forEach((trigger) => {
      if (currAvatar) {
        trigger.innerHTML = `<img src="${escapeHtml(currAvatar)}" alt="${escapeHtml(currUsername)}" onerror="this.outerHTML='<span aria-hidden=\\\'true\\\'>${initialFor(currUsername)}</span>'">`;
      } else {
        trigger.innerHTML = `<span aria-hidden="true">${initialFor(currUsername)}</span>`;
      }
    });

    // Update menu summaries
    document.querySelectorAll('.account-menu-summary').forEach((summary) => {
      const avatarContainer = summary.querySelector('.account-menu-avatar');
      if (avatarContainer) {
        if (currAvatar) {
          avatarContainer.innerHTML = `<img src="${escapeHtml(currAvatar)}" alt="${escapeHtml(currUsername)}" onerror="this.parentElement.textContent='${initialFor(currUsername)}'">`;
        } else {
          avatarContainer.textContent = initialFor(currUsername);
        }
      }
      const nameEl = summary.querySelector('[data-account-display-name]');
      if (nameEl) nameEl.textContent = currUsername;
      const emailEl = summary.querySelector('[data-account-display-email]');
      if (emailEl) emailEl.textContent = currEmail;
    });

    // Update dialog preview
    if (currAvatar) {
      avatarPreview.innerHTML = `<img src="${escapeHtml(currAvatar)}" alt="${escapeHtml(currUsername)}" onerror="this.outerHTML='<span>${initialFor(currUsername)}</span>'">`;
      removePhotoBtn.style.display = 'inline-block';
    } else {
      avatarPreview.innerHTML = `<span>${initialFor(currUsername)}</span>`;
      removePhotoBtn.style.display = 'none';
    }
    cancelPreviewBtn.style.display = 'none';
  }

  // --- Photo Upload Logic inside Edit Profile Modal ---
  function triggerSelect() {
    fileInput.value = '';
    fileInput.click();
  }

  avatarWrapper.addEventListener('click', triggerSelect);
  avatarWrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerSelect();
    }
  });
  changePhotoBtn.addEventListener('click', triggerSelect);

  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    editMessage.textContent = '';

    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      showMessage(editMessage, 'Invalid file format. Please select a JPG, PNG, or WEBP image.');
      fileInput.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showMessage(editMessage, 'Image size exceeds the 5MB limit. Please choose a smaller image.');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      pendingAvatarDataUrl = event.target.result;
      avatarPreview.innerHTML = `<img src="${pendingAvatarDataUrl}" alt="Preview">`;
      cancelPreviewBtn.style.display = 'inline-block';
      removePhotoBtn.style.display = 'none';
    };
    reader.onerror = () => {
      showMessage(editMessage, 'Could not read selected image file.');
    };
    reader.readAsDataURL(file);
>>>>>>> Stashed changes
  });

  // Cancel preview
  cancelPreviewBtn.addEventListener('click', () => {
    pendingAvatarDataUrl = null;
    fileInput.value = '';
    const currAvatar = currentUser.avatar_url || currentUser.avatarUrl;
    if (currAvatar) {
      avatarPreview.innerHTML = `<img src="${escapeHtml(currAvatar)}" alt="${escapeHtml(currentUser.username)}">`;
      removePhotoBtn.style.display = 'inline-block';
    } else {
      avatarPreview.innerHTML = `<span>${initialFor(currentUser.username)}</span>`;
      removePhotoBtn.style.display = 'none';
    }
    cancelPreviewBtn.style.display = 'none';
    editMessage.textContent = '';
  });

  // Remove photo
  removePhotoBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to remove your profile photo?')) return;

    removePhotoBtn.disabled = true;
    editMessage.textContent = '';

    try {
      const res = await fetchWithAuth('/api/auth/avatar', { method: 'DELETE' });
      const data = await res.json();
      removePhotoBtn.disabled = false;

      if (!res.ok) {
        showMessage(editMessage, data.error || 'Unable to remove profile photo.');
        return;
      }

      pendingAvatarDataUrl = null;
      fileInput.value = '';
      updateUiEverywhere(data.user);
      showMessage(editMessage, 'Profile photo removed successfully.', false);
    } catch (err) {
      removePhotoBtn.disabled = false;
      showMessage(editMessage, 'Unable to remove profile photo. Please try again.');
    }
  });

  // Close handlers
  dialog.querySelectorAll('[data-close-dialog], .account-dialog-close').forEach((button) => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.addEventListener('close', () => {
    // Reset any unsaved pending photo preview
    pendingAvatarDataUrl = null;
    fileInput.value = '';
    const currAvatar = currentUser.avatar_url || currentUser.avatarUrl;
    if (currAvatar) {
      avatarPreview.innerHTML = `<img src="${escapeHtml(currAvatar)}" alt="${escapeHtml(currentUser.username)}">`;
      removePhotoBtn.style.display = 'inline-block';
    } else {
      avatarPreview.innerHTML = `<span>${initialFor(currentUser.username)}</span>`;
      removePhotoBtn.style.display = 'none';
    }
    cancelPreviewBtn.style.display = 'none';
    editMessage.textContent = '';
    pwdMessage.textContent = '';
    pwdForm.reset();
    pwdForm.querySelectorAll('input[name]').forEach(resetPasswordToggle);
  });

  // Submit Edit Profile Form
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    editMessage.textContent = '';

    const saveBtn = editForm.querySelector('button.primary');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      // 1. If photo preview is pending, upload photo first
      if (pendingAvatarDataUrl) {
        const avatarRes = await fetchWithAuth('/api/auth/avatar', {
          method: 'POST',
          body: JSON.stringify({ image: pendingAvatarDataUrl })
        });
        const avatarData = await avatarRes.json();
        if (!avatarRes.ok) {
          showMessage(editMessage, avatarData.error || 'Unable to update profile photo.');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save changes';
          return;
        }
        currentUser = { ...currentUser, ...avatarData.user };
        pendingAvatarDataUrl = null;
        fileInput.value = '';
      }

      // 2. Update profile fields (username, email)
      const usernameVal = editForm.querySelector('[name="username"]').value.trim();
      const emailVal = editForm.querySelector('[name="email"]').value.trim();

      const profileRes = await fetchWithAuth('/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ username: usernameVal, email: emailVal })
      });
      const profileData = await profileRes.json();

      if (!profileRes.ok) {
        showMessage(editMessage, profileData.error || 'Unable to update your profile.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
        return;
      }

      if (profileData.token) setToken(profileData.token);
      updateUiEverywhere(profileData.user);

      showMessage(editMessage, 'Profile details updated successfully!', false);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save changes';

      setTimeout(() => {
        dialog.close();
      }, 1000);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save changes';
      showMessage(editMessage, err.message || 'Error updating profile.');
    }
  });

  // Submit Change Password Form
  pwdForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    pwdMessage.textContent = '';

    const currentPassword = pwdForm.querySelector('[name="currentPassword"]').value;
    const newPassword = pwdForm.querySelector('[name="newPassword"]').value;
    const confirmPassword = pwdForm.querySelector('[name="confirmPassword"]').value;

    const policyError = evaluatePasswordPolicy(newPassword);
    if (policyError) {
      showMessage(pwdMessage, policyError);
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage(pwdMessage, 'New password and confirmation do not match.');
      return;
    }

    const updateBtn = pwdForm.querySelector('button.primary');
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating...';

    try {
      const response = await fetchWithAuth('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const result = await response.json();
      updateBtn.disabled = false;
      updateBtn.textContent = 'Update password';

      if (!response.ok) {
        showMessage(pwdMessage, result.error || 'Unable to change your password.');
        return;
      }

      showMessage(pwdMessage, 'Password changed successfully!', false);
      pwdForm.reset();

      setTimeout(() => {
        dialog.close();
      }, 1000);
    } catch (err) {
      updateBtn.disabled = false;
      updateBtn.textContent = 'Update password';
      showMessage(pwdMessage, err.message || 'Error changing password.');
    }
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
    const avatarSrc = user.avatar_url || user.avatarUrl;
    if (avatarSrc) {
      trigger.innerHTML = `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(user.username)}" onerror="this.outerHTML='<span aria-hidden=\\\'true\\\'>${initialFor(user.username)}</span>'">`;
    } else {
      trigger.innerHTML = `<span aria-hidden="true">${initialFor(user.username)}</span>`;
    }
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
      dialog.querySelectorAll('[data-account-form]').forEach((form) => {
        form.hidden = form.dataset.accountForm !== mode;
      });
      // Clear previous outputs
      dialog.querySelectorAll('.account-dialog-message').forEach(el => el.textContent = '');
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
