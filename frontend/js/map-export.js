/**
 * map-export.js — Download / Export Frontend UI (Milestone Scope)
 *
 * NOTE: This is a frontend UI milestone only.
 * - ZERO backend API calls for export.
 * - ZERO dataset retrieval triggered by export.
 * - ZERO file generation / downloads.
 * - ZERO fake success messages.
 */

function escapeHtml(str = '') {
  return String(str ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function initMapExport() {
  const panel = document.getElementById('export-panel');
  const toggleBtn = document.getElementById('export-panel-toggle');
  const formatSelect = document.getElementById('export-format-select');
  const datasetField = document.getElementById('export-dataset-field');
  const datasetSelect = document.getElementById('export-dataset-select');
  const form = document.getElementById('export-form');
  const cancelBtn = document.getElementById('export-cancel');

  if (!panel || !form) return;

  function populateDatasetOptionsFromMemory() {
    if (!datasetSelect) return;
    datasetSelect.innerHTML = '<option value="">Select Dataset</option>';

    // Use only already-existing in-memory locations without making any API request
    const inMemory = Array.isArray(window.databaseLocations) ? window.databaseLocations : [];
    if (inMemory.length > 0) {
      inMemory.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.datasetId || item.name || '';
        opt.textContent = item.name || 'Dataset';
        datasetSelect.appendChild(opt);
      });
    }
  }

  // Toggle between GeoJSON (shows dataset field) and Map PNG (hides dataset field)
  formatSelect?.addEventListener('change', () => {
    if (formatSelect.value === 'png') {
      if (datasetField) datasetField.style.display = 'none';
    } else {
      if (datasetField) datasetField.style.display = 'block';
    }
  });

  // Open / Expand export section
  toggleBtn?.addEventListener('click', () => {
    const isCollapsed = panel.classList.toggle('collapsed');
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    if (!isCollapsed) {
      populateDatasetOptionsFromMemory();
    }
  });

  // Cancel button collapses the export panel back to trigger
  cancelBtn?.addEventListener('click', () => {
    panel.classList.add('collapsed');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  });

  // Form submit: Intentionally non-functional for this milestone
  // Does NOT download any file, does NOT call export APIs, does NOT show fake messages
  form.addEventListener('submit', (e) => {
    e.preventDefault();
  });
}
