/**
 * sidebar.js — Shared Dashboard & Management Sidebar Component
 *
 * Source of truth for the vertical floating tile navigation across:
 * 1. Dashboard (dashboard.html)
 * 2. Dataset Management (dataset-management.html)
 * 3. User Management (user-management.html)
 * 4. Activity Log (activity-log.html)
 */
import { getMe } from './auth.js';

const SIDEBAR_ITEMS = [
  {
    id: 'dashboard',
    href: 'dashboard.html',
    title: 'Dashboard',
    badgeClass: 'icon-purple',
    adminOnly: false,
    svg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>`
  },
  {
    id: 'dataset-management',
    href: 'dataset-management.html',
    title: 'Dataset Management',
    badgeClass: 'icon-teal',
    adminOnly: false,
    svg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
      <path d="M2 17l10 5 10-5"></path>
      <path d="M2 12l10 5 10-5"></path>
    </svg>`
  },
  {
    id: 'user-management',
    href: 'user-management.html',
    title: 'User Management',
    badgeClass: 'icon-blue',
    adminOnly: true,
    svg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>`
  },
  {
    id: 'activity-log',
    href: 'activity-log.html',
    title: 'Activity Log',
    badgeClass: 'icon-amber',
    adminOnly: true,
    svg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>`
  }
];

const STORAGE_KEY = 'ethiomap_sidebar_collapsed';
const MOBILE_NAV_QUERY = '(max-width: 600px)';

function setTogglePresentation(dashMain, toggleBtn) {
  if (!toggleBtn) return;
  const isMobile = window.matchMedia(MOBILE_NAV_QUERY).matches;
  const isOpen = dashMain.classList.contains('mobile-sidebar-open');
  const isCollapsed = dashMain.classList.contains('sidebar-collapsed');

  if (isMobile) {
    toggleBtn.innerHTML = isOpen
      ? '<span aria-hidden="true">×</span>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>';
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    toggleBtn.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    toggleBtn.title = isOpen ? 'Close navigation' : 'Open navigation';
    return;
  }

  toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7"></path></svg>';
  toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
  toggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand navigation' : 'Collapse navigation');
  toggleBtn.title = isCollapsed ? 'Expand navigation' : 'Collapse navigation';
}

function currentPageId() {
  const path = window.location.pathname;
  return path.split('/').pop().replace(/\.html$/i, '') || 'dashboard';
}

export async function initSidebar() {
  const dashMain = document.querySelector('.dash-main');
  if (!dashMain) return;

  const currentId = currentPageId();

  // Restore collapsed state from sessionStorage
  const isCollapsed = sessionStorage.getItem(STORAGE_KEY) === 'true';
  if (isCollapsed) {
    dashMain.classList.add('sidebar-collapsed');
  } else {
    dashMain.classList.remove('sidebar-collapsed');
  }

  // Get user role
  const user = await getMe();
  const isAdmin = user && user.role === 'admin';

  // 1. Setup / render .dash-intro
  let dashIntro = dashMain.querySelector('.dash-intro');
  if (!dashIntro) {
    dashIntro = document.createElement('div');
    dashIntro.className = 'dash-intro';
    dashMain.insertBefore(dashIntro, dashMain.firstChild);
  }

  dashIntro.innerHTML = `
    <div class="sidebar-heading">
      <div>
        <div id="dashboard-eyebrow" class="eyebrow">${isAdmin ? 'Admin Dashboard' : 'Standard User Dashboard'}</div>
        <p id="dashboard-description">${isAdmin ? 'Manage datasets, users, and system activity.' : 'Manage datasets.'}</p>
      </div>
      <button id="sidebar-toggle" class="sidebar-toggle" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7"></path></svg>
      </button>
    </div>
  `;

  // Attach toggle listener
  const toggleBtn = dashIntro.querySelector('#sidebar-toggle');
  if (toggleBtn) {
    setTogglePresentation(dashMain, toggleBtn);
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.matchMedia(MOBILE_NAV_QUERY).matches) {
        dashMain.classList.toggle('mobile-sidebar-open');
        setTogglePresentation(dashMain, toggleBtn);
        return;
      }
      const nowCollapsed = dashMain.classList.toggle('sidebar-collapsed');
      sessionStorage.setItem(STORAGE_KEY, nowCollapsed ? 'true' : 'false');
      setTogglePresentation(dashMain, toggleBtn);
    });

    // Close mobile sidebar when tapping outside the card
    document.addEventListener('click', (e) => {
      if (dashMain.classList.contains('mobile-sidebar-open')) {
        const tileGridEl = dashMain.querySelector('.tile-grid');
        if (!dashIntro.contains(e.target) && (!tileGridEl || !tileGridEl.contains(e.target))) {
          dashMain.classList.remove('mobile-sidebar-open');
          setTogglePresentation(dashMain, toggleBtn);
        }
      }
    });
  }

  // 2. Render or populate .tile-grid
  let tileGrid = dashMain.querySelector('.tile-grid');
  if (!tileGrid) {
    tileGrid = document.createElement('div');
    tileGrid.className = 'tile-grid';
    dashIntro.insertAdjacentElement('afterend', tileGrid);
  }

  // Render all 4 navigation items in exact fixed order
  tileGrid.innerHTML = SIDEBAR_ITEMS
    .filter(item => !item.adminOnly || isAdmin)
    .map(item => {
      const isActive = item.id === currentId;
      return `
        <a class="tile ${item.adminOnly ? 'admin-only' : ''} ${isActive ? 'active' : ''}" href="${item.href}" aria-label="${item.title}" title="${item.title}" ${isActive ? 'aria-current="page"' : ''}>
          <div class="tile-icon-badge ${item.badgeClass}">
            ${item.svg}
          </div>
          <h2>${item.title}</h2>
        </a>
      `;
    }).join('');
}

// Global hook for onclick in HTML if needed
window.toggleDashboardSidebar = function() {
  const dashMain = document.querySelector('.dash-main');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (!dashMain) return;
  if (window.matchMedia(MOBILE_NAV_QUERY).matches) {
    dashMain.classList.toggle('mobile-sidebar-open');
    setTogglePresentation(dashMain, toggleBtn);
    return;
  }
  const nowCollapsed = dashMain.classList.toggle('sidebar-collapsed');
  sessionStorage.setItem(STORAGE_KEY, nowCollapsed ? 'true' : 'false');
  if (toggleBtn) {
    setTogglePresentation(dashMain, toggleBtn);
  }
};

initSidebar();
