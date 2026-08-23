/* Controls the side-panel collapse state. */
const sidePanel = document.querySelector('.side-panel');
const panelToggle = document.querySelector('.panel-toggle');
const expandPanelIcon = '<svg class="panel-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>';
const collapsePanelIcon = '<svg class="panel-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"></path></svg>';

/* Toggle the panel width and update accessibility text for the preview control. */
panelToggle.addEventListener('click', () => {
  const isCollapsed = sidePanel.classList.toggle('collapsed');
  panelToggle.innerHTML = isCollapsed ? expandPanelIcon : collapsePanelIcon;
  panelToggle.setAttribute('aria-expanded', String(!isCollapsed));
  panelToggle.setAttribute('aria-label', isCollapsed ? 'Expand side panel' : 'Collapse side panel');
});

// Create the map
const map = L.map('map', {
    zoomControl: false,
    doubleClickZoom: true
}).setView([9.03, 38.74], 6);
window.map = map;

// Keep basemaps in their own layer so switching imagery never removes data,
// measurement, or search-result overlays already drawn on the map.
const basemapSelect = document.getElementById('basemap-select');
const mapTools = document.querySelector('.map-tools');
const basemaps = {
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        crossOrigin: true
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        crossOrigin: true
    })
};
let activeBasemap = basemaps.street.addTo(map);

basemapSelect?.addEventListener('change', () => {
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

const locationSidebar = document.getElementById('location-sidebar');
const locationSidebarContent = document.getElementById('location-sidebar-content');
const closeLocationSidebar = document.getElementById('close-location-sidebar');

function showLocationSidebar({ title = 'Selected place', coordinates, details = '' }) {
    locationSidebarContent.innerHTML = `<div class="location-card"><h3>${escapeHtml(title)}</h3><div class="location-field"><span>Coordinates</span><strong>${escapeHtml(coordinates)}</strong></div>${details ? `<div class="location-details"><span>Location information</span><div>${details}</div></div>` : ''}</div>`;
    locationSidebar.hidden = false;
}

function mostSpecificOsmName(result) {
    const address = result.address || {};
    if (result.name) return result.name;
    if (address.amenity) return address.amenity;
    if (address.shop) return address.shop;
    if (address.tourism) return address.tourism;
    if (address.building) return address.building;
    if (address.house_number && address.road) return `${address.house_number} ${address.road}`;
    return address.road || address.neighbourhood || address.suburb || address.village ||
        address.town || address.city || address.county || address.state || address.country ||
        'Selected place';
}

closeLocationSidebar.addEventListener('click', () => {
    locationSidebar.hidden = true;
    if (reverseMarker) {
        map.removeLayer(reverseMarker);
        reverseMarker = null;
    }
    map.closePopup();
});

function createGeoJsonLayer(geojson, color) {
    return L.geoJSON(geojson, {
        style: { color, weight: 2, fillColor: color, fillOpacity: .2 },
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, color, fillColor: color, fillOpacity: .8 }),
        onEachFeature: (feature, layer) => {
            layer.on('click', (event) => {
                if (mapMode === 'distance' || mapMode === 'area') {
                    L.DomEvent.stopPropagation(event);
                    addMeasurementPoint(event.latlng);
                    return;
                }
                L.DomEvent.stopPropagation(event);
                reverseGeocode(event.latlng);
            });
        }
    });
}

function updateActiveLayerCount() {
    if (!activeLayerCount) return;
    const activeCount = Object.values(layerRegistry).filter((entry) => entry.active).length;
    activeLayerCount.textContent = `${activeCount} active`;
}

function setLayerVisibility(entry, visible) {
    entry.active = visible;
    const toggle = entry.row?.querySelector('.layer-toggle');
    if (toggle) toggle.checked = visible;
    if (visible) entry.layer.addTo(map);
    else map.removeLayer(entry.layer);
}

function showAllDatasetLayers() {
    Object.values(layerRegistry).forEach((entry) => setLayerVisibility(entry, true));
    updateActiveLayerCount();
}

function showOnlyDatasetLayer(location) {
    Object.values(layerRegistry).forEach((entry) => {
        const sameDataset = location.datasetId && entry.datasetId === location.datasetId;
        const sameName = !location.datasetId
            && datasetDisplayName(entry.name).toLowerCase() === datasetDisplayName(location.name).toLowerCase();
        setLayerVisibility(entry, Boolean(sameDataset || sameName));
    });
    updateActiveLayerCount();
}

// Dataset names loaded from the datasets table are searchable.
const databaseLocations = [];

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
        showOnlyDatasetLayer(location);
        const layersList = savedLayer.layer?.getLayers ? savedLayer.layer.getLayers() : [];
        const featureLayer = (location.featureIndex !== undefined && layersList[location.featureIndex])
            ? layersList[location.featureIndex]
            : savedLayer.layer;

        if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
            map.setView(location.coordinates, 13);
        } else {
            const bounds = featureLayer?.getBounds ? featureLayer.getBounds() : savedLayer.layer.getBounds();
            if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(.1));
        }

        searchInput.value = location.name;
        searchResults.hidden = true;
        if (featureLayer?.openPopup) featureLayer.openPopup();

        // Display details in location sidebar
        const propsDetail = location.properties
            ? Object.entries(location.properties).map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join('<br>')
            : `Dataset: ${escapeHtml(location.datasetName || location.name)}`;
        const coordsText = (location.coordinates && location.coordinates[0])
            ? `${location.coordinates[0].toFixed(5)}, ${location.coordinates[1].toFixed(5)}`
            : 'Geospatial Dataset';

        showLocationSidebar({
            title: location.name,
            coordinates: coordsText,
            details: propsDetail
        });

        showFeedback(`Showing ${location.type || 'Dataset'}: "${location.name}".`);
        return;
    }

    if (location.coordinates && location.coordinates.length === 2) {
        const zoomLevel = location.type === 'Region' ? 8 : (location.type === 'Corridor' ? 9 : 12);
        map.setView(location.coordinates, zoomLevel);
        if (searchMarker) map.removeLayer(searchMarker);
        searchMarker = L.marker(location.coordinates).addTo(map)
            .bindPopup(`<strong>${escapeHtml(location.name)}</strong><br>${escapeHtml(location.type || 'Location')}`).openPopup();
        
        const propsDetail = location.properties
            ? Object.entries(location.properties).map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join('<br>')
            : '';

        showLocationSidebar({
            title: location.name,
            coordinates: `${location.coordinates[0].toFixed(5)}, ${location.coordinates[1].toFixed(5)}`,
            details: propsDetail
        });
    }
    
    searchInput.value = location.name;
    searchResults.hidden = true;
}

let searchDebounceTimer;
async function performLiveSearch(query) {
    const staticMatches = databaseLocations.filter((location) =>
        location.name.toLowerCase().includes(query.toLowerCase())
    );
    if (!query.trim()) return staticMatches;

    try {
        const response = await fetch(`${API_BASE}/api/datasets/search?q=${encodeURIComponent(query.trim())}`);
        if (response.ok) {
            const data = await response.json();
            const apiResults = data.results || [];
            
            const combined = [...apiResults, ...staticMatches];
            const unique = [];
            const seenKeys = new Set();
            for (const item of combined) {
                const key = `${item.name}-${item.type}-${item.datasetId || ''}-${item.featureIndex || ''}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    unique.push(item);
                }
            }
            return unique;
        }
    } catch (err) {
        console.warn('Live search fallback to local records:', err);
    }
    return staticMatches;
}

async function runSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        showAllDatasetLayers();
        return (searchResults.hidden = true);
    }
    const matches = await performLiveSearch(query);
    if (matches.length > 0) {
        selectLocation(matches[0]);
    } else {
        showFeedback(`No location or dataset found for "${query}".`);
    }
}

async function showSearchSuggestions() {
    const query = searchInput.value.trim();
    const matches = await performLiveSearch(query);
    showSearchResults(matches.slice(0, 8));
}

searchInput?.addEventListener('focus', showSearchSuggestions);
searchInput?.addEventListener('click', showSearchSuggestions);
searchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const query = searchInput.value.trim();
    if (!query) {
        showSearchSuggestions();
        showAllDatasetLayers();
        map.setView([9.03, 38.74], 6);
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
        }
        return;
    }
    searchDebounceTimer = setTimeout(async () => {
        const matches = await performLiveSearch(query);
        showSearchResults(matches.slice(0, 8));
    }, 200);
});
searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
    if (event.key === 'Escape') searchResults.hidden = true;
});
searchButton?.addEventListener('click', runSearch);
document.addEventListener('click', (event) => {
    if (searchResults && !event.target.closest('.search-wrap')) searchResults.hidden = true;
});


// Connecting map control tools 
// Zoom In
document.getElementById("zoom-in")?.addEventListener("click", () => {
    map.zoomIn();
});

// Zoom Out
document.getElementById("zoom-out")?.addEventListener("click", () => {
    map.zoomOut();
});

// 1. Reset View / Locate Ethiopia Button (#reset-view)
document.getElementById("reset-view")?.addEventListener("click", () => {
    map.setView([9.03, 38.74], 6);
    map.closePopup();
    if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
    }
    if (searchResults) searchResults.hidden = true;
    if (searchInput) searchInput.value = '';
    if (locationSidebar) locationSidebar.hidden = true;
    showAllDatasetLayers();
    setTimeout(() => map.invalidateSize(), 0);
    showFeedback("Map view reset to Ethiopia.");
});

// 3. Fullscreen Map Button (#fullscreen-map)
const fullscreenMapButton = document.getElementById('fullscreen-map');
const appShell = document.querySelector('.app');
const enterFullscreenIcon = '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />';
const exitFullscreenIcon = '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />';

function isAppFullscreen() {
    const nativeFS = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    return nativeFS === appShell || nativeFS === document.documentElement || Boolean(appShell?.classList.contains('fullscreen-mode'));
}

function updateFullscreenControl() {
    const isFS = isAppFullscreen();
    if (fullscreenMapButton) {
        // Fullscreen changes the icon only; keep the control's standard color.
        fullscreenMapButton.classList.remove('active');
        fullscreenMapButton.setAttribute('aria-pressed', String(isFS));
        fullscreenMapButton.setAttribute('aria-label', isFS ? 'Exit fullscreen map' : 'Enter fullscreen map');
        fullscreenMapButton.title = isFS ? 'Exit fullscreen map' : 'Enter fullscreen map';
        fullscreenMapButton.innerHTML = `<svg class="fullscreen-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${isFS ? exitFullscreenIcon : enterFullscreenIcon}</svg>`;
    }
    setTimeout(() => map.invalidateSize(), 50);
}

if (fullscreenMapButton && appShell) {
    fullscreenMapButton.addEventListener('click', async () => {
        try {
            if (isAppFullscreen()) {
                if (document.exitFullscreen) await document.exitFullscreen();
                else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
                else if (document.mozCancelFullScreen) await document.mozCancelFullScreen();
                else if (document.msExitFullscreen) await document.msExitFullscreen();
                appShell.classList.remove('fullscreen-mode');
            } else {
                if (appShell.requestFullscreen) await appShell.requestFullscreen();
                else if (appShell.webkitRequestFullscreen) await appShell.webkitRequestFullscreen();
                else if (appShell.mozRequestFullScreen) await appShell.mozRequestFullScreen();
                else if (appShell.msRequestFullscreen) await appShell.msRequestFullscreen();
                else appShell.classList.add('fullscreen-mode');
            }
        } catch (error) {
            appShell.classList.toggle('fullscreen-mode');
        }
        updateFullscreenControl();
    });

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
        document.addEventListener(evt, updateFullscreenControl);
    });
}

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
    const coordinates = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    showLocationSidebar({ title: 'Loading location...', coordinates, details: 'Looking up location information...' });
    showFeedback('Looking up location information...');
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latlng.lat}&lon=${latlng.lng}`, {
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`Reverse geocoding failed with status ${response.status}`);
        const result = await response.json();
        const address = result.display_name || coordinates;
        showLocationSidebar({ title: mostSpecificOsmName(result), coordinates, details: escapeHtml(address) });
        showFeedback(`${address} (${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)})`);
    } catch (error) {
        showLocationSidebar({ title: 'Selected place', coordinates, details: 'Address lookup unavailable.' });
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

// The map can preview saved datasets publicly; mutations require the same JWT
// used by the protected dashboard and dataset-management pages.
const uploadBtn = document.getElementById('uploadDatasetBtn');
const geojsonFileInput = document.getElementById('geojsonFileInput');
const uploadedLayers = document.getElementById('uploaded-layers');
const API_BASE = window.ETHIOMAP_API_BASE || 'http://localhost:4000';

function addUploadedLayer(file, geojson, datasetId = null, fitToLayer = true) {
    const key = `upload-${Date.now()}`;
    const color = '#7257a5';
    const layer = createGeoJsonLayer(geojson, color).addTo(map);
    layerRegistry[key] = { layer, active: true, name: file.name, datasetId, metadata: file.metadata || { description: '', coordinateReferenceSystem: 'EPSG:4326', owner: '', source: '' } };
    if (datasetId) savedDatasetLayers.set(datasetId, layerRegistry[key]);

    if (uploadedLayers) {
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
    }
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
        const token = localStorage.getItem('ethiomap_token');
        if (!token) throw new Error('Please sign in before uploading a dataset.');
        response = await fetch(`${API_BASE}/api/datasets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ filename: file.originalName || file.name, name: file.name, geojson, metadata: file.metadata })
        });
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('Please sign in')) throw error;
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
    if (!metadataDialog || !metadataForm) {
        showFeedback('Dataset editing is available from Dataset Management after signing in.');
        return;
    }
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
document.getElementById('metadata-cancel')?.addEventListener('click', () => {
    metadataKey = null;
    pendingUpload = null;
    metadataDialog.close();
});
metadataForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const metadata = { description: document.getElementById('metadata-description').value.trim(), coordinateReferenceSystem: document.getElementById('metadata-crs').value.trim() || 'EPSG:4326', owner: document.getElementById('metadata-owner').value.trim(), source: document.getElementById('metadata-source').value.trim() };
    const name = document.getElementById('metadata-name').value.trim();
    try {
        if (pendingUpload) {
            const { file, geojson } = pendingUpload;
            const uploadFile = { name: name || file.name, originalName: file.name, metadata };
            saveDatasetToDatabase(uploadFile, geojson)
                .then(async (dataset) => {
                    let displayGeojson = geojson;
                    try {
                        const response = await fetch(`${API_BASE}/api/datasets/${dataset.id}`);
                        if (response.ok) displayGeojson = await response.json();
                    } catch (e) { console.warn('Using raw upload geojson fallback:', e); }

                    const layerKey = addUploadedLayer(uploadFile, displayGeojson, dataset.id, true);
                    layerRegistry[layerKey].metadata = dataset.metadata;
                    databaseLocations.unshift({ name: datasetDisplayName(dataset.name), type: 'Dataset', datasetName: datasetDisplayName(dataset.name), datasetId: dataset.id });
                    showFeedback(`${file.name} uploaded and saved to PostgreSQL.`);
                })
                .catch((error) => showFeedback(`Upload failed: ${error.message}`));
            pendingUpload = null;
            metadataDialog.close();
            return;
        }
        const entry = layerRegistry[metadataKey];
        if (entry.datasetId) {
            const token = localStorage.getItem('ethiomap_token');
            if (!token) throw new Error('Please sign in before editing a dataset.');
            const response = await fetch(`${API_BASE}/api/datasets/${entry.datasetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, metadata }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Metadata update failed.');
            entry.metadata = result.metadata;
        }
        entry.name = name || entry.name;
        if (entry.row) entry.row.querySelector('.dataset-title').textContent = entry.name;
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
            const token = localStorage.getItem('ethiomap_token');
            if (!token) throw new Error('Please sign in before removing a dataset.');
            const response = await fetch(`${API_BASE}/api/datasets/${entry.datasetId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Dataset removal failed.'); }
            savedDatasetLayers.delete(entry.datasetId);
        }
        map.removeLayer(entry.layer); if (entry.row) entry.row.remove(); delete layerRegistry[key]; updateActiveLayerCount();
        showFeedback(`Dataset "${entry.name}" removed.`);
    } catch (error) { showFeedback(error.message); }
}

async function loadBaseSpatialLayers() {
    try {
        const layers = ['regions', 'cities', 'corridors'];
        for (const layerName of layers) {
            const res = await fetch(`${API_BASE}/api/layers/${layerName}`);
            if (!res.ok) continue;
            const geojson = await res.json();
            if (!geojson.features || !geojson.features.length) continue;

            const colorMap = { regions: '#087d6d', cities: '#e76f51', corridors: '#2a9d8f' };
            const color = colorMap[layerName] || '#087d6d';
            
            const layerObj = L.geoJSON(geojson, {
                style: { color, weight: 2, fillColor: color, fillOpacity: .2 },
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 7, color, fillColor: color, fillOpacity: .85 }),
                onEachFeature: (feature, layer) => {
                    const name = feature.properties?.name || feature.id || layerName;
                    layer.bindPopup(`<strong>${escapeHtml(name)}</strong><br><em>${escapeHtml(layerName.toUpperCase())}</em>`);
                }
            }).addTo(map);

            const key = `base-${layerName}`;
            layerRegistry[key] = { layer: layerObj, active: true, name: `Base ${layerName.toUpperCase()}`, datasetId: null };

            geojson.features.forEach((feat) => {
                const name = feat.properties?.name || feat.id;
                if (!name) return;
                let coords;
                if (feat.geometry?.type === 'Point') {
                    coords = [feat.geometry.coordinates[1], feat.geometry.coordinates[0]];
                } else if (feat.geometry?.coordinates) {
                    // Primitive center approximation for multi/polygon/line
                    const c = feat.geometry.coordinates;
                    const flat = Array.isArray(c[0]) ? (Array.isArray(c[0][0]) ? c[0][0] : c[0]) : c;
                    if (flat && flat.length >= 2) coords = [flat[1], flat[0]];
                }
                if (coords) {
                    databaseLocations.push({
                        name: name,
                        type: layerName.slice(0, -1).toUpperCase(),
                        coordinates: coords,
                        properties: feat.properties
                    });
                }
            });
        }
    } catch (e) {
        console.warn('Base spatial layers could not be loaded from API:', e);
    }
}

async function loadSavedDatasets() {
    await loadBaseSpatialLayers();
    try {
        const response = await fetch(`${API_BASE}/api/datasets`);
        if (!response.ok) return;
        const datasets = await response.json();
        for (const dataset of datasets) {
            const geojsonResponse = await fetch(`${API_BASE}/api/datasets/${dataset.id}`);
            if (!geojsonResponse.ok) continue;
            const geojson = await geojsonResponse.json();
            addUploadedLayer({ name: dataset.name || dataset.originalFilename, metadata: dataset.metadata }, geojson, dataset.id, false);
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

uploadBtn?.addEventListener('click', () => geojsonFileInput?.click());
geojsonFileInput?.addEventListener('change', () => {
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
            metadataDialog?.showModal();
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
