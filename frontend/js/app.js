/* Controls the side-panel collapse state. */
const sidePanel = document.querySelector('.side-panel');
const panelToggle = document.querySelector('.panel-toggle');
const expandPanelIcon = '<svg class="panel-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>';
const collapsePanelIcon = '<svg class="panel-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"></path></svg>';

// On phones, keep the map panel out of the way until the user opens it.
if (window.matchMedia('(max-width: 520px)').matches) {
  sidePanel.classList.add('collapsed');
  panelToggle.innerHTML = expandPanelIcon;
  panelToggle.setAttribute('aria-expanded', 'false');
  panelToggle.setAttribute('aria-label', 'Expand side panel');
  panelToggle.title = 'Expand side panel';
}

/* Toggle the panel width and update accessibility text for the preview control. */
panelToggle.addEventListener('click', () => {
  const isCollapsed = sidePanel.classList.toggle('collapsed');
  panelToggle.innerHTML = isCollapsed ? expandPanelIcon : collapsePanelIcon;
  panelToggle.setAttribute('aria-expanded', String(!isCollapsed));
  panelToggle.setAttribute('aria-label', isCollapsed ? 'Expand side panel' : 'Collapse side panel');
});

// Default view parameters: mobile shows full Ethiopia at zoom 5, desktop at zoom 6
const isMobileMap = window.matchMedia('(max-width: 520px)').matches;
const defaultCenter = isMobileMap ? [9.1, 40.0] : [9.03, 38.74];
const defaultZoom = isMobileMap ? 5 : 6;

// Create the map
const map = L.map('map', {
    zoomControl: false,
    doubleClickZoom: true
}).setView(defaultCenter, defaultZoom);
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

// Mobile basemap dropdown handlers (active only on mobile devices)
const mobileBasemapBtn = document.getElementById('mobile-basemap-btn');
const mobileBasemapMenu = document.getElementById('mobile-basemap-menu');
const mobileBasemapLabel = document.getElementById('mobile-basemap-label');

if (mobileBasemapBtn && mobileBasemapMenu) {
    mobileBasemapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !mobileBasemapMenu.hidden;
        mobileBasemapMenu.hidden = isOpen;
        mobileBasemapBtn.setAttribute('aria-expanded', String(!isOpen));
    });

    mobileBasemapMenu.querySelectorAll('.mobile-basemap-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = btn.dataset.value;
            if (val && basemapSelect) {
                basemapSelect.value = val;
                basemapSelect.dispatchEvent(new Event('change'));
            }
            mobileBasemapMenu.querySelectorAll('.mobile-basemap-item').forEach(b => b.classList.toggle('active', b === btn));
            if (mobileBasemapLabel) mobileBasemapLabel.textContent = val === 'satellite' ? 'Satellite Map' : 'Street Map';
            mobileBasemapMenu.hidden = true;
            mobileBasemapBtn.setAttribute('aria-expanded', 'false');
        });
    });

    document.addEventListener('click', (e) => {
        if (!mobileBasemapBtn.contains(e.target) && !mobileBasemapMenu.contains(e.target)) {
            mobileBasemapMenu.hidden = true;
            mobileBasemapBtn.setAttribute('aria-expanded', 'false');
        }
    });
}

const layerRegistry = {};
// Keeps references to saved database layers so search results can zoom to them.
const savedDatasetLayers = new Map();
const activeLayerCount = document.getElementById('active-layer-count');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function isInternalAttribute(key) {
    return key.startsWith('_') || key === '__v';
}

function formatPropertyValue(val) {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') {
        return Number.isInteger(val) ? String(val) : val.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    if (typeof val === 'object') {
        try {
            return Array.isArray(val) ? val.join(', ') : JSON.stringify(val);
        } catch {
            return String(val);
        }
    }
    return String(val);
}

const locationSidebar = document.getElementById('location-sidebar');
const locationSidebarContent = document.getElementById('location-sidebar-content');
const closeLocationSidebar = document.getElementById('close-location-sidebar');
const downloadDatasetGeojsonButton = document.getElementById('download-dataset-geojson');
let selectedDatasetForDownload = null;
let activeDatasetKey = null;

function displayFeatureInfo(feature, datasetName = '', datasetGeojson = null) {
    if (!feature) return;
    const rawProps = feature.properties || {};

    // Use the dataset name as the card title
    const title = datasetName || 'Feature Details';

    selectedDatasetForDownload = datasetGeojson ? { name: datasetName || 'dataset', geojson: datasetGeojson } : null;
    downloadDatasetGeojsonButton?.classList.toggle('is-visible', Boolean(selectedDatasetForDownload));

    // Display all non-empty, non-internal properties from the feature
    const fieldsHtml = Object.entries(rawProps)
        .filter(([key, val]) =>
            !isInternalAttribute(key) &&
            val !== null && val !== undefined && val !== ''
        )
        .map(([key, val]) =>
            `<div class="location-field"><span>${escapeHtml(key)}</span><strong>${escapeHtml(formatPropertyValue(val))}</strong></div>`
        )
        .join('');

    locationSidebarContent.innerHTML = `<div class="location-card"><h3>${escapeHtml(title)}</h3>${fieldsHtml}</div>`;
    locationSidebar.hidden = false;
    showFeedback(`Selected: ${title}`);
}



function showLocationSidebar({ title = 'Selected place', coordinates, details = '', dataset = null }) {
    selectedDatasetForDownload = dataset;
    downloadDatasetGeojsonButton?.classList.toggle('is-visible', Boolean(dataset));
    let content = `<div class="location-card"><h3>${escapeHtml(title)}</h3>`;
    if (coordinates) {
        content += `<div class="location-field"><span>Coordinates</span><strong>${escapeHtml(coordinates)}</strong></div>`;
    }
    if (details) {
        content += `<div class="location-details"><span>Location information</span><div>${details}</div></div>`;
    }
    content += `</div>`;
    locationSidebarContent.innerHTML = content;
    locationSidebar.hidden = false;
}

downloadDatasetGeojsonButton?.addEventListener('click', () => {
    if (!selectedDatasetForDownload) return;
    const blob = new Blob([JSON.stringify(selectedDatasetForDownload.geojson, null, 2)], { type: 'application/geo+json' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${String(selectedDatasetForDownload.name || 'dataset').replace(/[^a-z0-9-_]+/gi, '_')}.geojson`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
});

closeLocationSidebar.addEventListener('click', () => {
    locationSidebar.hidden = true;
    selectedDatasetForDownload = null;
    downloadDatasetGeojsonButton?.classList.remove('is-visible');
    map.closePopup();
});

// Point-in-geometry algorithms for robust active-dataset feature identification
function pointInPolygon(pt, ring) {
    const x = pt.lng, y = pt.lat;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointInPolygonGeometry(pt, coords) {
    if (!coords || !coords.length) return false;
    if (!pointInPolygon(pt, coords[0])) return false;
    for (let i = 1; i < coords.length; i++) {
        if (pointInPolygon(pt, coords[i])) return false;
    }
    return true;
}

function pointInMultiPolygonGeometry(pt, coords) {
    if (!coords) return false;
    for (let i = 0; i < coords.length; i++) {
        if (pointInPolygonGeometry(pt, coords[i])) return true;
    }
    return false;
}

function pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return p.distanceTo(a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return p.distanceTo(L.point(a.x + t * dx, a.y + t * dy));
}

function featureContainsPoint(feature, latlng) {
    if (!feature || !feature.geometry) return false;
    const geom = feature.geometry;
    const type = geom.type;
    const coords = geom.coordinates;

    if (type === 'Polygon') {
        return pointInPolygonGeometry(latlng, coords);
    } else if (type === 'MultiPolygon') {
        return pointInMultiPolygonGeometry(latlng, coords);
    } else if (type === 'Point') {
        if (!coords || coords.length < 2) return false;
        const p1 = map.latLngToLayerPoint(latlng);
        const p2 = map.latLngToLayerPoint([coords[1], coords[0]]);
        return p1.distanceTo(p2) <= 15;
    } else if (type === 'MultiPoint') {
        if (!coords) return false;
        const p1 = map.latLngToLayerPoint(latlng);
        for (const c of coords) {
            const p2 = map.latLngToLayerPoint([c[1], c[0]]);
            if (p1.distanceTo(p2) <= 15) return true;
        }
        return false;
    } else if (type === 'LineString') {
        if (!coords || coords.length < 2) return false;
        const p = map.latLngToLayerPoint(latlng);
        const pts = coords.map(c => map.latLngToLayerPoint([c[1], c[0]]));
        for (let i = 0; i < pts.length - 1; i++) {
            if (pointToSegmentDistance(p, pts[i], pts[i + 1]) <= 10) return true;
        }
        return false;
    } else if (type === 'MultiLineString') {
        if (!coords) return false;
        const p = map.latLngToLayerPoint(latlng);
        for (const line of coords) {
            const pts = line.map(c => map.latLngToLayerPoint([c[1], c[0]]));
            for (let i = 0; i < pts.length - 1; i++) {
                if (pointToSegmentDistance(p, pts[i], pts[i + 1]) <= 10) return true;
            }
        }
        return false;
    } else if (type === 'GeometryCollection') {
        if (!geom.geometries) return false;
        for (const g of geom.geometries) {
            if (featureContainsPoint({ type: 'Feature', geometry: g }, latlng)) return true;
        }
        return false;
    }
    return false;
}

function findFeatureInDataset(entry, latlng) {
    if (!entry || !entry.active || !entry.geojson) return null;
    const geojson = entry.geojson;
    const features = geojson.type === 'FeatureCollection'
        ? geojson.features
        : (geojson.type === 'Feature' ? [geojson] : []);

    for (let i = features.length - 1; i >= 0; i--) {
        const feature = features[i];
        if (featureContainsPoint(feature, latlng)) {
            return { feature, datasetName: entry.name, geojson };
        }
    }
    return null;
}

function showDatasetSelector(matches) {
    selectedDatasetForDownload = null;
    downloadDatasetGeojsonButton?.classList.remove('is-visible');

    const listHtml = matches.map(({ match }, idx) =>
        `<button type="button" class="dataset-choice-btn" data-idx="${idx}">${escapeHtml(datasetDisplayName(match.datasetName))}</button>`
    ).join('');

    locationSidebarContent.innerHTML = `<div class="location-card"><h3>Select dataset</h3><div class="dataset-choice-list">${listHtml}</div></div>`;
    locationSidebar.hidden = false;

    locationSidebarContent.querySelectorAll('.dataset-choice-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const { match } = matches[parseInt(btn.dataset.idx, 10)];
            displayFeatureInfo(match.feature, match.datasetName, match.geojson);
        });
    });
}

function handleMapFeatureClick(latlng) {
    if (mapMode === 'distance' || mapMode === 'area') {
        addMeasurementPoint(latlng);
        return;
    }

    // Check every active dataset for a feature at the clicked location
    const matches = [];
    for (const [key, entry] of Object.entries(layerRegistry)) {
        if (!entry.active) continue;
        const match = findFeatureInDataset(entry, latlng);
        if (match) matches.push({ key, match });
    }

    if (matches.length === 0) return;          // nothing at this location
    if (matches.length === 1) {
        displayFeatureInfo(matches[0].match.feature, matches[0].match.datasetName, matches[0].match.geojson);
        return;
    }
    showDatasetSelector(matches);              // 2+ overlapping datasets
}

function createGeoJsonLayer(geojson, color, datasetName = 'Uploaded Dataset', datasetGeojson = null) {
    const rawGeojson = datasetGeojson || geojson;
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
                handleMapFeatureClick(event.latlng);
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
    activeDatasetKey = null;
    Object.values(layerRegistry).forEach((entry) => setLayerVisibility(entry, true));
    updateActiveLayerCount();
}

function showOnlyDatasetLayer(location) {
    Object.entries(layerRegistry).forEach(([key, entry]) => {
        const sameDataset = location.datasetId && entry.datasetId === location.datasetId;
        const sameName = !location.datasetId
            && datasetDisplayName(entry.name).toLowerCase() === datasetDisplayName(location.name).toLowerCase();
        const visible = Boolean(sameDataset || sameName);
        setLayerVisibility(entry, visible);
        if (visible) {
            activeDatasetKey = key;
        }
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

        // Use the same displayFeatureInfo path as a direct map click so that
        // Search and map-click always produce identical feature information.
        const savedEntry = Object.values(layerRegistry).find(
            (e) => e.datasetId === location.datasetId || datasetDisplayName(e.name).toLowerCase() === datasetDisplayName(location.name).toLowerCase()
        );
        if (savedEntry && savedEntry.geojson) {
            // Find the first feature whose geometry contains the dataset centroid,
            // or fall back to the first feature in the collection.
            const features = savedEntry.geojson.type === 'FeatureCollection'
                ? savedEntry.geojson.features
                : (savedEntry.geojson.type === 'Feature' ? [savedEntry.geojson] : []);
            const targetFeature = features[0] || null;
            if (targetFeature) {
                displayFeatureInfo(targetFeature, datasetDisplayName(savedEntry.name), savedEntry.geojson);
            }
        }

        return;
    }

    if (location.coordinates && location.coordinates.length === 2) {
        const zoomLevel = location.type === 'Region' ? 8 : (location.type === 'Corridor' ? 9 : 12);
        map.setView(location.coordinates, zoomLevel);
        if (searchMarker) map.removeLayer(searchMarker);
        searchMarker = L.marker(location.coordinates).addTo(map)
            .bindPopup(`<strong>${escapeHtml(location.name)}</strong><br>${escapeHtml(location.type || 'Location')}`).openPopup();
        
        const propsDetail = location.properties
            ? Object.entries(location.properties).slice(0, 3).map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join('<br>')
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
    const normalizedQuery = query.trim().toLowerCase();
    const uniqueDatasets = new Map();

    // Suggestions come only from the saved datasets already loaded onto the map.
    // One entry per dataset ID prevents duplicate names and feature-level matches.
    databaseLocations.forEach((location) => {
        if (!location.datasetId || uniqueDatasets.has(location.datasetId)) return;
        uniqueDatasets.set(location.datasetId, location);
    });

    return [...uniqueDatasets.values()].filter((location) =>
        !normalizedQuery || location.name.toLowerCase().includes(normalizedQuery)
    );
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
        map.setView(defaultCenter, defaultZoom);
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
    map.setView(defaultCenter, defaultZoom);
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

distanceButton.addEventListener('click', () => setMapMode('distance'));
areaButton.addEventListener('click', () => setMapMode('area'));
clearMeasurementButton.addEventListener('click', clearMeasurement);
map.on('click', (event) => {
    handleMapFeatureClick(event.latlng);
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
    const layer = createGeoJsonLayer(geojson, color, file.name, geojson).addTo(map);
    layerRegistry[key] = { layer, active: true, name: file.name, datasetId, metadata: file.metadata || { description: '', coordinateReferenceSystem: 'EPSG:4326', owner: '', source: '' }, geojson };
    if (datasetId) savedDatasetLayers.set(datasetId, layerRegistry[key]);
    if (fitToLayer) activeDatasetKey = key;

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
        if (activeDatasetKey === key) activeDatasetKey = null;
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
            const displayName = `Base ${layerName.toUpperCase()}`;
            const color = colorMap[layerName] || '#087d6d';
            const layerObj = createGeoJsonLayer(geojson, color, displayName, geojson).addTo(map);

            const key = `base-${layerName}`;
            layerRegistry[key] = { layer: layerObj, active: true, name: displayName, datasetId: null, geojson };
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
