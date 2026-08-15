const API_BASE = window.ETHIOMAP_API_BASE || 'http://localhost:5000';
const datasetList = document.getElementById('dataset-list');
const datasetCount = document.getElementById('dataset-count');
const datasetSearch = document.getElementById('dataset-search');
const feedback = document.getElementById('feedback');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
let datasets = [];
let editingDataset;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = false;
    window.setTimeout(() => { feedback.hidden = true; }, 4000);
}

function renderDatasets() {
    const query = datasetSearch.value.trim().toLowerCase();
    const visibleDatasets = datasets.filter((dataset) => {
        const name = String(dataset.name || dataset.originalFilename || '');
        return name.toLowerCase().includes(query);
    });
    datasetCount.textContent = `${visibleDatasets.length} dataset${visibleDatasets.length === 1 ? '' : 's'}`;
    if (!visibleDatasets.length) {
        datasetList.innerHTML = query
            ? '<div class="empty-state">No datasets match your search.</div>'
            : '<div class="empty-state">No datasets have been uploaded yet.</div>';
        return;
    }
    datasetList.innerHTML = visibleDatasets.map((dataset) => {
        const metadata = dataset.metadata || {};
        return `<article class="dataset-card"><div class="dataset-card-head"><span class="layer-color"></span><h2>${escapeHtml(dataset.name || dataset.originalFilename)}</h2></div><p>${escapeHtml(metadata.description || 'Uploaded GeoJSON dataset')}</p><div class="dataset-meta"><div><span>Coordinate system</span><strong>${escapeHtml(metadata.coordinateReferenceSystem || 'EPSG:4326')}</strong></div><div><span>Owner</span><strong>${escapeHtml(metadata.owner || 'Not specified')}</strong></div><div><span>Source</span><strong>${escapeHtml(metadata.source || 'Not specified')}</strong></div><div><span>File</span><strong>${escapeHtml(dataset.originalFilename || 'Unknown')}</strong></div></div><div class="dataset-actions"><button type="button" data-edit="${dataset.id}">Edit</button><button type="button" class="remove" data-remove="${dataset.id}">Remove</button></div></article>`;
    }).join('');
}

async function loadDatasets() {
    try {
        const response = await fetch(`${API_BASE}/api/datasets`);
        if (!response.ok) throw new Error('Could not load datasets.');
        const result = await response.json();
        if (!Array.isArray(result)) throw new Error('The server returned an invalid dataset list.');
        datasets = result;
        renderDatasets();
    } catch (error) {
        datasetCount.textContent = '0 datasets';
        datasetList.innerHTML = `<div class="empty-state"><strong>${escapeHtml(error.message)}</strong><br>Keep the backend running and refresh this page.</div>`;
    }
}

function openEditor(dataset) {
    editingDataset = dataset;
    const metadata = dataset.metadata || {};
    document.getElementById('edit-name').value = dataset.name || dataset.originalFilename || '';
    document.getElementById('edit-description').value = metadata.description || '';
    document.getElementById('edit-crs').value = metadata.coordinateReferenceSystem || 'EPSG:4326';
    document.getElementById('edit-owner').value = metadata.owner || '';
    document.getElementById('edit-source').value = metadata.source || '';
    editDialog.showModal();
}

datasetList.addEventListener('click', async (event) => {
    const editId = event.target.dataset.edit;
    const removeId = event.target.dataset.remove;
    if (editId) openEditor(datasets.find((dataset) => dataset.id === editId));
    if (removeId) {
        const dataset = datasets.find((item) => item.id === removeId);
        if (!dataset || !window.confirm(`Remove dataset "${dataset.name}"?`)) return;
        const response = await fetch(`${API_BASE}/api/datasets/${removeId}`, { method: 'DELETE' });
        if (!response.ok) { showFeedback('Dataset removal failed.'); return; }
        datasets = datasets.filter((item) => item.id !== removeId);
        renderDatasets();
        showFeedback('Dataset removed.');
    }
});

datasetSearch.addEventListener('input', renderDatasets);

document.getElementById('edit-cancel').addEventListener('click', () => editDialog.close());
editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const metadata = {
        description: document.getElementById('edit-description').value.trim(),
        coordinateReferenceSystem: document.getElementById('edit-crs').value.trim() || 'EPSG:4326',
        owner: document.getElementById('edit-owner').value.trim(),
        source: document.getElementById('edit-source').value.trim()
    };
    const name = document.getElementById('edit-name').value.trim();
    const response = await fetch(`${API_BASE}/api/datasets/${editingDataset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, metadata }) });
    if (!response.ok) { showFeedback('Dataset update failed.'); return; }
    const result = await response.json();
    editingDataset.name = name || editingDataset.name;
    editingDataset.metadata = result.metadata;
    editDialog.close();
    renderDatasets();
    showFeedback('Dataset updated.');
});

loadDatasets();
