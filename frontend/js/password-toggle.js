/**
 * Password Visibility Toggle Utility Component
 * Provides independent show/hide toggling for password input fields.
 */

const EYE_OFF_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon-eye-off"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

const EYE_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

/**
 * Attaches a visibility toggle to a password input element.
 * @param {HTMLInputElement} inputEl - The password input element.
 * @returns {HTMLButtonElement|null} The toggle button element.
 */
export function attachPasswordToggle(inputEl) {
  if (!inputEl || inputEl.dataset.passwordToggleAttached === 'true') {
    return null;
  }

  inputEl.dataset.passwordToggleAttached = 'true';

  // Ensure input is wrapped in a .password-input-wrapper container
  let wrapper = inputEl.closest('.password-input-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'password-input-wrapper';
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    wrapper.appendChild(inputEl);
  }

  // Create toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'password-toggle-btn';
  toggleBtn.setAttribute('aria-label', 'Show password');
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.setAttribute('title', 'Show password');
  toggleBtn.tabIndex = 0;
  toggleBtn.innerHTML = EYE_OFF_SVG;

  // Toggle handler
  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isCurrentlyPassword = inputEl.type === 'password';
    if (isCurrentlyPassword) {
      inputEl.type = 'text';
      toggleBtn.setAttribute('aria-label', 'Hide password');
      toggleBtn.setAttribute('aria-pressed', 'true');
      toggleBtn.setAttribute('title', 'Hide password');
      toggleBtn.innerHTML = EYE_SVG;
    } else {
      inputEl.type = 'password';
      toggleBtn.setAttribute('aria-label', 'Show password');
      toggleBtn.setAttribute('aria-pressed', 'false');
      toggleBtn.setAttribute('title', 'Show password');
      toggleBtn.innerHTML = EYE_OFF_SVG;
    }

    // Preserve focus and caret position if practical
    try {
      inputEl.focus();
    } catch (_) {}
  });

  wrapper.appendChild(toggleBtn);
  return toggleBtn;
}

/**
 * Resets a password input and its toggle back to hidden state.
 * @param {HTMLInputElement} inputEl
 */
export function resetPasswordToggle(inputEl) {
  if (!inputEl) return;
  inputEl.type = 'password';
  const wrapper = inputEl.closest('.password-input-wrapper');
  if (wrapper) {
    const btn = wrapper.querySelector('.password-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-label', 'Show password');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('title', 'Show password');
      btn.innerHTML = EYE_OFF_SVG;
    }
  }
}

/**
 * Automatically initializes password visibility toggles on all password inputs within a root container.
 * @param {ParentNode} root
 */
export function initAllPasswordToggles(root = document) {
  const inputs = root.querySelectorAll('input[type="password"]:not([data-password-toggle-attached="true"])');
  inputs.forEach((input) => attachPasswordToggle(input));
}

// Global attachment for non-module scripts
if (typeof window !== 'undefined') {
  window.attachPasswordToggle = attachPasswordToggle;
  window.resetPasswordToggle = resetPasswordToggle;
  window.initAllPasswordToggles = initAllPasswordToggles;
}

// Auto-run when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllPasswordToggles());
  } else {
    initAllPasswordToggles();
  }
}
