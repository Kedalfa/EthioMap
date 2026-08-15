/* Controls the side-panel collapse state. */
const sidePanel = document.querySelector('.side-panel');
const panelToggle = document.querySelector('.panel-toggle');

/* Toggle the panel width and update accessibility text for the preview control. */
panelToggle.addEventListener('click', () => {
  const isCollapsed = sidePanel.classList.toggle('collapsed');
  panelToggle.textContent = isCollapsed ? '|>' : '<|';
  panelToggle.setAttribute('aria-expanded', String(!isCollapsed));
  panelToggle.setAttribute('aria-label', isCollapsed ? 'Expand side panel' : 'Collapse side panel');
});

// Create the map
const map = L.map('map', {
    zoomControl: false,
    doubleClickZoom: true
}).setView([9.03, 38.74], 6);

const HOME_COORDINATES = [8.9630278, 38.7687222];
const homeIcon = L.divIcon({
    className: 'home-marker-icon',
    html: `<div style="width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#087d6d;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style="transform:rotate(45deg);fill:none;stroke:#ffffff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
});
const homeMarker = L.marker(HOME_COORDINATES, { icon: homeIcon })
    .addTo(map)
    .bindPopup('<strong>Home</strong><br>8°57\'46.9"N, 38°46\'07.4"E');

// Keep basemaps in their own layer so switching imagery never removes data,
// measurement, or search-result overlays already drawn on the map.
const basemapSelect = document.getElementById('basemap-select');
const basemaps = {
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    })
};
let activeBasemap = basemaps.street.addTo(map);

basemapSelect.addEventListener('change', () => {
    const selectedBasemap = basemaps[basemapSelect.value] || basemaps.street;
    if (selectedBasemap === activeBasemap) return;
    map.removeLayer(activeBasemap);
    activeBasemap = selectedBasemap.addTo(map);
});

const layerRegistry = {};
// Keeps references to saved database layers so search results can zoom to them.
const savedDatasetLayers = new Map();
const activeLayerCount = document.getElementById('active-layer-count');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function featurePopup(feature) {
    const properties = feature.properties || {};
    const rows = Object.entries(properties).slice(0, 6).map(([key, value]) => `<strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}`);
    return rows.length ? rows.join('<br>') : 'GeoJSON feature';
}

function createGeoJsonLayer(geojson, color) {
    return L.geoJSON(geojson, {
        style: { color, weight: 2, fillColor: color, fillOpacity: .2 },
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, color, fillColor: color, fillOpacity: .8 }),
        onEachFeature: (feature, layer) => layer.bindPopup(featurePopup(feature))
    });
}

function updateActiveLayerCount() {
    const activeCount = Object.values(layerRegistry).filter((entry) => entry.active).length;
    activeLayerCount.textContent = `${activeCount} active`;
}

// Dataset names loaded from the datasets table are searchable.
// Home: 8°57'46.9"N, 38°46'07.4"E converted to decimal degrees.
const databaseLocations = [
    { name: 'Home', type: 'Saved place', coordinates: HOME_COORDINATES }
];

// Remove file extensions only from names displayed in search suggestions.
function datasetDisplayName(name) {
    return String(name || '').replace(/\.(geojson|json)$/i, '');
}

const searchInput = document.getElementById('map-search');
const searchButton = document.querySelector('.search-btn');
const searchResults = document.getElementById('search-results');
let searchMarker;
if (searchButton) searchButton.disabled = false;

function showSearchResults(matches) {
    if (!searchResults) return;
    searchResults.innerHTML = '';
    matches.forEach((location) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'search-result';
        const source = location.datasetName ? ` · ${escapeHtml(location.datasetName)}` : '';
        option.innerHTML = `<strong>${escapeHtml(location.name)}</strong><span>${escapeHtml(location.type)}${source}</span>`;
        option.addEventListener('click', () => selectLocation(location));
        searchResults.appendChild(option);
    });
    searchResults.hidden = matches.length === 0;
}

async function selectLocation(location) {
    if (location.name === 'Home') {
        map.setView(HOME_COORDINATES, 19);
        homeMarker.openPopup();
        searchInput.value = 'Home';
        searchResults.hidden = true;
        return;
    }
    if (location.datasetId) {
        let savedLayer = savedDatasetLayers.get(location.datasetId);
        if (!savedLayer) {
            try {
                const response = await fetch(`${API_BASE}/api/datasets/${location.datasetId}`);
                if (!response.ok) throw new Error('Dataset could not be loaded.');
                addUploadedLayer({ name: location.name }, await response.json(), location.datasetId);
                savedLayer = savedDatasetLayers.get(location.datasetId);
            } catch (error) {
                showFeedback(`Could not open ${location.name}: ${error.message}`);
                return;
            }
        }
        const featureLayer = location.featureIndex === undefined
            ? savedLayer.layer
            : savedLayer.layer.getLayers()[location.featureIndex];
        const bounds = featureLayer?.getBounds ? featureLayer.getBounds() : savedLayer.layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(.1));
        searchInput.value = location.name;
        searchResults.hidden = true;
        if (featureLayer?.openPopup) featureLayer.openPopup();
        showFeedback(`Showing dataset "${location.name}".`);
        return;
    }
    map.setView(location.coordinates, location.type === 'Region' ? 8 : 12);
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker(location.coordinates).addTo(map)
        .bindPopup(`<strong>${location.name}</strong><br>${location.type}`).openPopup();
    searchInput.value = location.name;
    searchResults.hidden = true;
}

function runSearch() {
    const query = searchInput.value.trim();
    if (!query) return (searchResults.hidden = true);
    const match = databaseLocations.find((location) => location.name.toLowerCase() === query.toLowerCase());
    if (match) return selectLocation(match);
    showSearchResults(databaseLocations.filter((location) => location.name.toLowerCase().includes(query.toLowerCase())));
}

searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
        searchResults.hidden = true;
        map.setView([9.03, 38.74], 6);
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
        }
        return;
    }
    showSearchResults(databaseLocations.filter((location) => location.name.toLowerCase().includes(query)).slice(0, 6));
});
searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
    if (event.key === 'Escape') searchResults.hidden = true;
});
searchButton?.addEventListener('click', runSearch);
document.addEventListener('click', (event) => {
    if (searchResults && !event.target.closest('.search-wrap')) searchResults.hidden = true;
});


// connecting the map tools 
// Zoom In
document.getElementById("zoom-in").addEventListener("click", () => {
    map.zoomIn();
});

// Zoom Out
document.getElementById("zoom-out").addEventListener("click", () => {
    map.zoomOut();
});

// Reset View
document.getElementById("reset-view").addEventListener("click", () => {
    map.setView([9.03, 38.74], 6);
});

const fullscreenMapButton = document.getElementById('fullscreen-map');
const appShell = document.querySelector('.app');
const enterFullscreenIcon = '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />';
const exitFullscreenIcon = '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />';

function updateFullscreenControl() {
    const isFullscreen = document.fullscreenElement === appShell;
    fullscreenMapButton.setAttribute('aria-pressed', String(isFullscreen));
    fullscreenMapButton.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen map' : 'Enter fullscreen map');
    fullscreenMapButton.title = isFullscreen ? 'Exit fullscreen map' : 'Enter fullscreen map';
    fullscreenMapButton.innerHTML = `<svg class="fullscreen-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${isFullscreen ? exitFullscreenIcon : enterFullscreenIcon}</svg>`;
    setTimeout(() => map.invalidateSize(), 0);
}

fullscreenMapButton.addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await appShell.requestFullscreen();
    } catch (error) {
        showFeedback(`Fullscreen mode is unavailable: ${error.message}`);
    }
});
document.addEventListener('fullscreenchange', updateFullscreenControl);

// FR-5 and FR-6: reverse geocoding and on-map measurement tools.
const feedback = document.getElementById('map-feedback');
const distanceButton = document.getElementById('measure-distance');
const areaButton = document.getElementById('measure-area');
const clearMeasurementButton = document.getElementById('clear-measurement');
let mapMode = null;
let measurementPoints = [];
let measurementLine;
let measurementShape;
let measurementMarkers = [];
let reverseMarker;

function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = false;
}

function clearMeasurement() {
    if (measurementLine) map.removeLayer(measurementLine);
    if (measurementShape) map.removeLayer(measurementShape);
    measurementMarkers.forEach((marker) => map.removeLayer(marker));
    measurementLine = null;
    measurementShape = null;
    measurementMarkers = [];
    measurementPoints = [];
    showFeedback('Measurement cleared.');
}

function setMapMode(mode) {
    mapMode = mapMode === mode ? null : mode;
    measurementPoints = [];
    if (measurementLine) map.removeLayer(measurementLine);
    if (measurementShape) map.removeLayer(measurementShape);
    measurementLine = null;
    measurementShape = null;
    measurementMarkers.forEach((marker) => map.removeLayer(marker));
    measurementMarkers = [];
    [distanceButton, areaButton].forEach((button) => button.classList.remove('active'));
    if (mapMode === 'distance') {
        distanceButton.classList.add('active');
        map.doubleClickZoom.disable();
        showFeedback('Click two or more points to measure distance.');
    } else if (mapMode === 'area') {
        areaButton.classList.add('active');
        map.doubleClickZoom.disable();
        showFeedback('Click three or more points to measure area.');
    } else {
        map.doubleClickZoom.enable();
        feedback.hidden = true;
    }
}

function distanceBetween(a, b) {
    const earthRadius = 6371008.8;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lng - a.lng) * Math.PI / 180;
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDistance(meters) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function polygonArea(points) {
    const earthRadius = 6371008.8;
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        area += (next.lng - current.lng) * Math.PI / 180 *
            (2 + Math.sin(current.lat * Math.PI / 180) + Math.sin(next.lat * Math.PI / 180));
    }
    return Math.abs(area * earthRadius ** 2 / 2);
}

function addMeasurementPoint(latlng) {
    measurementPoints.push(latlng);
    measurementMarkers.push(L.circleMarker(latlng, { radius: 5, color: '#087d6d', fillColor: '#55d8c0', fillOpacity: 1 }).addTo(map));
    if (mapMode === 'distance') {
        if (measurementLine) map.removeLayer(measurementLine);
        measurementLine = L.polyline(measurementPoints, { color: '#087d6d', weight: 4 }).addTo(map);
        const total = measurementPoints.slice(1).reduce((sum, point, index) => sum + distanceBetween(measurementPoints[index], point), 0);
        showFeedback(`Distance: ${formatDistance(total)} (${measurementPoints.length} points).`);
    }
    if (mapMode === 'area' && measurementPoints.length >= 3) {
        if (measurementShape) map.removeLayer(measurementShape);
        measurementShape = L.polygon(measurementPoints, { color: '#087d6d', fillColor: '#55d8c0', fillOpacity: .25 }).addTo(map);
        const area = polygonArea(measurementPoints);
        showFeedback(`Area: ${area >= 1000000 ? `${(area / 1000000).toFixed(2)} km²` : `${Math.round(area)} m²`} (${measurementPoints.length} points).`);
    }
}

async function reverseGeocode(latlng) {
    if (reverseMarker) map.removeLayer(reverseMarker);
    reverseMarker = L.marker(latlng).addTo(map);
    showFeedback('Looking up location information...');
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latlng.lat}&lon=${latlng.lng}`, {
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`Reverse geocoding failed with status ${response.status}`);
        const result = await response.json();
        const address = result.display_name || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        reverseMarker.bindPopup(`<strong>Location information</strong><br>${address}`).openPopup();
        showFeedback(`${address} (${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)})`);
    } catch (error) {
        const coordinates = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        reverseMarker.bindPopup(`<strong>Coordinates</strong><br>${coordinates}<br><small>Address lookup unavailable.</small>`).openPopup();
        showFeedback(`Address lookup unavailable. Coordinates: ${coordinates}`);
    }
}

distanceButton.addEventListener('click', () => setMapMode('distance'));
areaButton.addEventListener('click', () => setMapMode('area'));
clearMeasurementButton.addEventListener('click', clearMeasurement);
map.on('click', (event) => {
    if (mapMode === 'distance' || mapMode === 'area') addMeasurementPoint(event.latlng);
    else reverseGeocode(event.latlng);
});

// Public GeoJSON upload: no authentication redirect is required.
const uploadBtn = document.getElementById('uploadDatasetBtn');
const geojsonFileInput = document.getElementById('geojsonFileInput');
const uploadedLayers = document.getElementById('uploaded-layers');
const API_BASE = window.ETHIOMAP_API_BASE || 'http://localhost:5000';

function addUploadedLayer(file, geojson, datasetId = null, fitToLayer = true) {
    const key = `upload-${Date.now()}`;
    const color = '#7257a5';
    const layer = createGeoJsonLayer(geojson, color).addTo(map);
    layerRegistry[key] = { layer, active: true, name: file.name, datasetId, metadata: file.metadata || { description: '', coordinateReferenceSystem: 'EPSG:4326', owner: '', source: '' } };
    if (datasetId) savedDatasetLayers.set(datasetId, layerRegistry[key]);

    const row = document.createElement('div');
    row.className = 'layer-row uploaded-layer-row';
    row.innerHTML = `<span class="layer-color" style="background:${color}"></span><div class="layer-info"><strong class="dataset-title">${escapeHtml(file.name)}</strong><span class="dataset-subtitle">Uploaded GeoJSON</span></div><div class="dataset-actions"><button type="button" class="dataset-edit">Edit</button><button type="button" class="dataset-remove">Remove</button><div class="form-check form-switch m-0"><input class="form-check-input layer-toggle" type="checkbox" checked></div></div>`;
    layerRegistry[key].row = row;
    const toggle = row.querySelector('.layer-toggle');
    toggle.addEventListener('change', () => {
        layerRegistry[key].active = toggle.checked;
        if (toggle.checked) layer.addTo(map);
        else map.removeLayer(layer);
        updateActiveLayerCount();
    });
    row.querySelector('.dataset-edit').addEventListener('click', () => openMetadataEditor(key));
    row.querySelector('.dataset-remove').addEventListener('click', () => removeDataset(key));
    uploadedLayers.appendChild(row);
    updateActiveLayerCount();

    // Saved datasets are loaded silently at startup so the default Ethiopia
    // view remains visible until the user explicitly selects a dataset.
    if (fitToLayer) {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(.1));
    }
    return key;
}

async function saveDatasetToDatabase(file, geojson) {
    let response;
    try {
        response = await fetch(`${API_BASE}/api/datasets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.originalName || file.name, name: file.name, geojson, metadata: file.metadata })
        });
    } catch {
        throw new Error(`Cannot reach the API at ${API_BASE}. Keep the backend terminal running and try again.`);
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The database rejected the dataset.');
    return result;
}

const metadataDialog = document.getElementById('metadata-dialog');
const metadataForm = document.getElementById('metadata-form');
let metadataKey;
let pendingUpload;
function openMetadataEditor(key) {
    metadataKey = key;
    pendingUpload = null;
    const entry = layerRegistry[key];
    const metadata = entry.metadata || {};
    document.getElementById('metadata-name').value = entry.name || '';
    document.getElementById('metadata-description').value = metadata.description || '';
    document.getElementById('metadata-crs').value = metadata.coordinateReferenceSystem || 'EPSG:4326';
    document.getElementById('metadata-owner').value = metadata.owner || '';
    document.getElementById('metadata-source').value = metadata.source || '';
    metadataDialog.showModal();
}
document.getElementById('metadata-cancel').addEventListener('click', () => {
    metadataKey = null;
    pendingUpload = null;
    metadataDialog.close();
});
metadataForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const metadata = { description: document.getElementById('metadata-description').value.trim(), coordinateReferenceSystem: document.getElementById('metadata-crs').value.trim() || 'EPSG:4326', owner: document.getElementById('metadata-owner').value.trim(), source: document.getElementById('metadata-source').value.trim() };
    const name = document.getElementById('metadata-name').value.trim();
    try {
        if (pendingUpload) {
            const { file, geojson } = pendingUpload;
            const uploadFile = { name: name || file.name, originalName: file.name, metadata };
            const layerKey = addUploadedLayer(uploadFile, geojson);
            saveDatasetToDatabase(uploadFile, geojson)
                .then((dataset) => {
                    layerRegistry[layerKey].datasetId = dataset.id;
                    layerRegistry[layerKey].metadata = dataset.metadata;
                    savedDatasetLayers.set(dataset.id, layerRegistry[layerKey]);
                    databaseLocations.unshift({ name: datasetDisplayName(dataset.name), type: 'Dataset', datasetName: datasetDisplayName(dataset.name), datasetId: dataset.id });
                    showFeedback(`${file.name} uploaded and saved to PostgreSQL.`);
                })
                .catch((error) => showFeedback(`${file.name} drawn, but not saved: ${error.message}`));
            pendingUpload = null;
            metadataDialog.close();
            return;
        }
        const entry = layerRegistry[metadataKey];
        if (entry.datasetId) {
            const response = await fetch(`${API_BASE}/api/datasets/${entry.datasetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, metadata }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Metadata update failed.');
            entry.metadata = result.metadata;
        }
        entry.name = name || entry.name;
        entry.row.querySelector('.dataset-title').textContent = entry.name;
        metadataKey = null;
        metadataDialog.close();
        showFeedback(`Metadata updated for "${entry.name}".`);
    } catch (error) { showFeedback(error.message); }
});

async function removeDataset(key) {
    const entry = layerRegistry[key];
    if (!entry || !window.confirm(`Remove dataset "${entry.name}"?`)) return;
    try {
        if (entry.datasetId) {
            const response = await fetch(`${API_BASE}/api/datasets/${entry.datasetId}`, { method: 'DELETE' });
            if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Dataset removal failed.'); }
            savedDatasetLayers.delete(entry.datasetId);
        }
        map.removeLayer(entry.layer); entry.row.remove(); delete layerRegistry[key]; updateActiveLayerCount();
        showFeedback(`Dataset "${entry.name}" removed.`);
    } catch (error) { showFeedback(error.message); }
}

async function loadSavedDatasets() {
    try {
        const response = await fetch(`${API_BASE}/api/datasets`);
        if (!response.ok) return;
        const datasets = await response.json();
        for (const dataset of datasets) {
            const geojsonResponse = await fetch(`${API_BASE}/api/datasets/${dataset.id}`);
            if (!geojsonResponse.ok) continue;
            const geojson = await geojsonResponse.json();
            addUploadedLayer({ name: dataset.originalFilename, metadata: dataset.metadata }, geojson, dataset.id, false);
            databaseLocations.push({
                name: datasetDisplayName(dataset.name || dataset.originalFilename),
                type: 'Dataset',
                datasetName: datasetDisplayName(dataset.name || dataset.originalFilename),
                datasetId: dataset.id
            });
        }
        if (datasets.length) showFeedback(`${datasets.length} saved dataset(s) loaded.`);
    } catch {
        // The map remains usable when the API is not running.
    }
}

uploadBtn.addEventListener('click', () => geojsonFileInput.click());
geojsonFileInput.addEventListener('change', () => {
    const file = geojsonFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (!['FeatureCollection', 'Feature'].includes(parsed.type)) throw new Error('The file must be a GeoJSON Feature or FeatureCollection.');
            pendingUpload = { file, geojson: parsed };
            metadataKey = null;
            document.getElementById('metadata-name').value = file.name;
            document.getElementById('metadata-description').value = '';
            document.getElementById('metadata-crs').value = 'EPSG:4326';
            document.getElementById('metadata-owner').value = '';
            document.getElementById('metadata-source').value = '';
            metadataDialog.showModal();
        } catch (error) {
            showFeedback(`Upload failed: ${error.message}`);
        } finally {
            geojsonFileInput.value = '';
        }
    });
    reader.addEventListener('error', () => {
        showFeedback('Upload failed: the file could not be read.');
        geojsonFileInput.value = '';
    });
    reader.readAsText(file);
});

loadSavedDatasets();
