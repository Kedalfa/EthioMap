import { requireAuth, fetchWithAuth } from './auth.js';

// Auth guard — redirects to login if not signed in
const currentUser = await requireAuth();
if (!currentUser) throw new Error('Not authenticated');
const isAdmin = currentUser.role === 'admin';

const API_BASE = window.ETHIOMAP_API_BASE || 'http://localhost:4000';
const datasetList = document.getElementById('dataset-list');
const datasetCount = document.getElementById('dataset-count');
const datasetSearch = document.getElementById('dataset-search');
const feedback = document.getElementById('feedback');
const editDialog = document.getElementById('edit-dialog');
const uploadDialog = document.getElementById('upload-dialog');
let datasets = [];
let editingDataset;

function escapeHtml(value = '') { const element = document.createElement('div'); element.textContent = value; return element.innerHTML; }
function showFeedback(message) { feedback.textContent = message; feedback.hidden = false; setTimeout(() => { feedback.hidden = true; }, 3500); }

// Use fetchWithAuth for all requests (adds Bearer token automatically)
async function api(url, options = {}) {
    return fetchWithAuth(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
}

function renderDatasets() {
    const query = datasetSearch.value.trim().toLowerCase();
    const visibleDatasets = datasets.filter((dataset) => String(dataset.name || dataset.originalFilename || '').toLowerCase().includes(query));
    datasetCount.textContent = `${visibleDatasets.length} dataset${visibleDatasets.length === 1 ? '' : 's'}`;
    if (!visibleDatasets.length) { datasetList.innerHTML = `<div class="empty-state">${query ? 'No datasets match your search.' : 'No datasets have been uploaded yet.'}</div>`; return; }
    datasetList.innerHTML = visibleDatasets.map((dataset) => {
        const metadata = dataset.metadata || {};
        const removeButton = isAdmin ? `<button type="button" class="remove" data-remove="${dataset.id}">Remove</button>` : '';
        return `<article class="dataset-card"><div class="dataset-card-head"><span class="layer-color"></span><h2>${escapeHtml(dataset.name || dataset.originalFilename)}</h2></div><p>${escapeHtml(metadata.description || 'Uploaded GeoJSON dataset')}</p><div class="dataset-meta"><div><span>Coordinate system</span><strong>${escapeHtml(metadata.coordinateReferenceSystem || 'EPSG:4326')}</strong></div><div><span>Owner</span><strong>${escapeHtml(metadata.owner || 'Not specified')}</strong></div><div><span>Source</span><strong>${escapeHtml(metadata.source || 'Not specified')}</strong></div><div><span>File</span><strong>${escapeHtml(dataset.originalFilename || 'Unknown')}</strong></div></div><div class="dataset-actions"><button type="button" data-edit="${dataset.id}">Edit</button>${removeButton}</div></article>`;
    }).join('');
}

async function loadDatasets() {
    try { const response = await api('/api/datasets'); if (!response.ok) throw new Error('Could not load datasets.'); datasets = await response.json(); renderDatasets(); }
    catch (error) { datasetCount.textContent = '0 datasets'; datasetList.innerHTML = `<div class="empty-state"><strong>${escapeHtml(error.message)}</strong></div>`; }
}

function openEditor(dataset) {
    editingDataset = dataset; const metadata = dataset.metadata || {};
    document.getElementById('edit-name').value = dataset.name || dataset.originalFilename || '';
    document.getElementById('edit-description').value = metadata.description || '';
    document.getElementById('edit-crs').value = metadata.coordinateReferenceSystem || 'EPSG:4326';
    document.getElementById('edit-owner').value = metadata.owner || '';
    document.getElementById('edit-source').value = metadata.source || ''; editDialog.showModal();
}
function metadata(prefix) { return { description: document.getElementById(`${prefix}-description`).value.trim(), coordinateReferenceSystem: document.getElementById(`${prefix}-crs`).value.trim() || 'EPSG:4326', owner: document.getElementById(`${prefix}-owner`).value.trim(), source: document.getElementById(`${prefix}-source`).value.trim() }; }

datasetList.addEventListener('click', async (event) => {
    const editId = event.target.dataset.edit; const removeId = event.target.dataset.remove;
    if (editId) openEditor(datasets.find((dataset) => dataset.id === editId));
    if (removeId) {
        if (!isAdmin) return;
        const dataset = datasets.find((item) => item.id === removeId);
        if (!dataset || !window.confirm(`Remove dataset "${dataset.name}"?`)) return;
        const response = await api(`/api/datasets/${removeId}`, { method: 'DELETE' });
        if (!response.ok) { showFeedback('Dataset removal failed.'); return; }
        datasets = datasets.filter((item) => item.id !== removeId);
        renderDatasets();
        showFeedback('Dataset removed.');
    }
});
datasetSearch.addEventListener('input', renderDatasets);
document.getElementById('edit-cancel').addEventListener('click', () => editDialog.close());
document.getElementById('edit-form').addEventListener('submit', async (event) => { event.preventDefault(); const response = await api(`/api/datasets/${editingDataset.id}`, { method: 'PUT', body: JSON.stringify({ name: document.getElementById('edit-name').value.trim(), metadata: metadata('edit') }) }); if (!response.ok) { showFeedback('Dataset update failed.'); return; } const result = await response.json(); editingDataset.name = result.name; editingDataset.metadata = result.metadata; editDialog.close(); renderDatasets(); showFeedback('Dataset updated.'); });

document.getElementById('upload-dataset').addEventListener('click', () => uploadDialog.showModal());
document.getElementById('upload-cancel').addEventListener('click', () => { uploadDialog.close(); document.getElementById('upload-form').reset(); document.getElementById('upload-crs').value = 'EPSG:4326'; });
document.getElementById('geojson-file').addEventListener('change', (event) => { const file = event.target.files[0]; if (file && !document.getElementById('upload-name').value) document.getElementById('upload-name').value = file.name; });
document.getElementById('upload-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const file = document.getElementById('geojson-file').files[0]; if (!file) return;
    try { const geojson = JSON.parse(await file.text()); if (!['Feature', 'FeatureCollection'].includes(geojson.type)) throw new Error('The file must be a GeoJSON Feature or FeatureCollection.'); const response = await api('/api/datasets', { method: 'POST', body: JSON.stringify({ filename: file.name, name: document.getElementById('upload-name').value.trim() || file.name, geojson, metadata: metadata('upload') }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Dataset upload failed.'); uploadDialog.close(); document.getElementById('upload-form').reset(); document.getElementById('upload-crs').value = 'EPSG:4326'; await loadDatasets(); showFeedback('Dataset uploaded successfully.'); } catch (error) { showFeedback(error.message); }
});

loadDatasets();
