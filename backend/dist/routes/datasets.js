import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, logActivity, getClientIp } from '../middleware/auth.js';
const router = Router();
// Normalize uploaded GeoJSON into a FeatureCollection.
function normalizeGeoJSON(input) {
    if (!input || !['Feature', 'FeatureCollection'].includes(input.type)) {
        throw new Error('The uploaded file must be a GeoJSON Feature or FeatureCollection.');
    }
    const features = input.type === 'FeatureCollection' ? input.features : [input];
    if (!Array.isArray(features) || features.length === 0) {
        throw new Error('The GeoJSON file contains no features.');
    }
    features.forEach((feature) => {
        if (!feature || feature.type !== 'Feature' || !feature.geometry) {
            throw new Error('Every GeoJSON feature must contain geometry.');
        }
    });
    return {
        type: 'FeatureCollection',
        features: features.map((feature) => ({
            type: 'Feature',
            properties: feature.properties || {},
            geometry: feature.geometry
        }))
    };
}
/**
 * Detect if a GeoJSON geometry's first coordinate pair is outside WGS84
 * lat/lng bounds (-180..180, -90..90).  If so the data is likely in a
 * projected CRS (e.g. Ethiopian UTM EPSG:20138) and we must tell PostGIS
 * NOT to assume SRID 4326 when storing it – instead we use SRID 0 (unknown)
 * and let ST_Transform handle reprojection via the crs field if present,
 * or fall back to trying common Ethiopian projections.
 *
 * Returns the SRID to tag the geometry with when calling ST_GeomFromGeoJSON.
 * 4326  → coordinates look like standard WGS84 lat/lng.
 * 20138 → coordinates look like Ethiopian-specific UTM (Adindan / UTM zone 38N).
 * 32637 → WGS84 UTM zone 37N (also common for Ethiopia).
 * 32638 → WGS84 UTM zone 38N.
 */
function detectSRID(geojson, metadata) {
    // 1. Sample the first coordinate to check empirical value range.
    const firstFeature = geojson.features?.[0];
    const geom = firstFeature?.geometry;
    let coord;
    if (geom?.type === 'Point')
        coord = geom.coordinates;
    else if (geom?.type === 'MultiPoint')
        coord = geom.coordinates?.[0];
    else if (geom?.type === 'LineString')
        coord = geom.coordinates?.[0];
    else if (geom?.type === 'MultiLineString')
        coord = geom.coordinates?.[0]?.[0];
    else if (geom?.type === 'Polygon')
        coord = geom.coordinates?.[0]?.[0];
    else if (geom?.type === 'MultiPolygon')
        coord = geom.coordinates?.[0]?.[0]?.[0];
    else if (geom?.type === 'GeometryCollection') {
        const sub = geom.geometries?.[0];
        if (sub?.type === 'Point')
            coord = sub.coordinates;
        else
            coord = sub?.coordinates?.[0]?.[0];
    }
    // If coordinates fall in standard WGS84 lon/lat degree range [-180..180] / [-90..90]
    if (coord && coord.length >= 2) {
        const [x, y] = coord;
        if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
            return 4326; // WGS84 lon/lat degrees
        }
    }
    // 2. Coordinates are projected meters (> 180 or > 90).
    // Check if explicit non-4326 projection is specified in metadata or GeoJSON crs.
    const userCrs = String(metadata?.coordinateReferenceSystem || metadata?.crs || '').toUpperCase();
    const geojsonCrs = String(geojson?.crs?.properties?.name || '').toUpperCase();
    const combinedCrs = `${userCrs} ${geojsonCrs}`;
    if (combinedCrs.includes('20137') || combinedCrs.includes('32637') || combinedCrs.includes('37N'))
        return 32637;
    if (combinedCrs.includes('20138') || combinedCrs.includes('32638') || combinedCrs.includes('38N'))
        return 32638;
    if (combinedCrs.includes('20136') || combinedCrs.includes('32636') || combinedCrs.includes('36N'))
        return 32636;
    // 3. Projected coordinates without an explicit non-4326 SRID specified.
    // Standard default projected CRS for Ethiopian spatial datasets (towns, regions, boundaries)
    // is UTM Zone 37N (EPSG:32637 - Central Meridian 39°E).
    if (coord && coord.length >= 2) {
        const [x, y] = coord;
        if (x > 100000 && x < 1000000 && y > 100000 && y < 2000000) {
            return 32637; // Standard Ethiopian UTM Zone 37N
        }
    }
    return 32637; // Default projected fallback for Ethiopian maps
}
// Helper to convert database row to summary format
function datasetSummary(row) {
    return {
        id: row.id,
        name: row.name,
        originalFilename: row.original_filename,
        featureCount: row.feature_count,
        metadata: row.metadata,
        createdAt: row.created_at
    };
}
// 1. GET /api/datasets - Return saved dataset metadata
router.get('/', async (_req, res) => {
    try {
        const result = await pool.query('SELECT id, name, original_filename, feature_count, metadata, created_at FROM datasets ORDER BY created_at DESC');
        res.json(result.rows.map(datasetSummary));
    }
    catch (error) {
        console.error('Error fetching datasets list:', error);
        res.status(500).json({ error: 'Could not load datasets.' });
    }
});
// 1b. GET /api/datasets/search?q=query - Search exclusively across datasets and dataset_features tables
router.get('/search', async (req, res) => {
    const queryParam = String(req.query.q || '').trim();
    if (!queryParam) {
        return res.json({ results: [] });
    }
    const searchTerm = `%${queryParam}%`;
    try {
        const results = [];
        // 2. Search datasets table
        const datasetsRes = await pool.query(`
      SELECT id, name, original_filename, feature_count, metadata
      FROM datasets
      WHERE name ILIKE $1 OR original_filename ILIKE $1 OR metadata::text ILIKE $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [searchTerm]);
        for (const row of datasetsRes.rows) {
            results.push({
                id: row.id,
                datasetId: row.id,
                name: row.name,
                type: 'Dataset',
                featureCount: row.feature_count,
                metadata: row.metadata
            });
        }
        // 3. Search dataset_features table (features stored inside datasets in PostgreSQL)
        const featuresRes = await pool.query(`
      SELECT f.id, f.dataset_id, f.feature_index, f.properties, d.name as dataset_name,
             ST_Y(ST_Centroid(ST_Transform(f.geom, 4326))) as lat,
             ST_X(ST_Centroid(ST_Transform(f.geom, 4326))) as lng
      FROM dataset_features f
      JOIN datasets d ON f.dataset_id = d.id
      WHERE f.properties::text ILIKE $1
      LIMIT 15
    `, [searchTerm]);
        for (const row of featuresRes.rows) {
            const featureName = row.properties?.name || row.properties?.Name || row.properties?.title || `Feature #${row.feature_index + 1}`;
            results.push({
                id: `df-${row.id}`,
                datasetId: row.dataset_id,
                featureIndex: row.feature_index,
                datasetName: row.dataset_name,
                name: featureName,
                type: 'Dataset Feature',
                coordinates: [Number(row.lat), Number(row.lng)],
                properties: row.properties
            });
        }
        res.json({ results });
    }
    catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed in database.' });
    }
});
// 2. GET /api/datasets/:id - Return one complete saved GeoJSON dataset
// Geometry is rebuilt from dataset_features using ST_Transform(geom, 4326)
// so any projected CRS (e.g. Ethiopian UTM) is reprojected to WGS84 that
// Leaflet can render correctly.
router.get('/:id', async (req, res) => {
    try {
        // First confirm the dataset exists.
        const datasetCheck = await pool.query('SELECT id FROM datasets WHERE id = $1', [req.params.id]);
        if (!datasetCheck.rowCount) {
            return res.status(404).json({ error: 'Dataset not found.' });
        }
        // Rebuild GeoJSON from dataset_features, reprojecting to WGS84.
        const featuresResult = await pool.query(`
      SELECT
        properties,
        ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb AS geometry
      FROM dataset_features
      WHERE dataset_id = $1
      ORDER BY feature_index ASC
    `, [req.params.id]);
        const featureCollection = {
            type: 'FeatureCollection',
            features: featuresResult.rows.map((row) => ({
                type: 'Feature',
                properties: row.properties,
                geometry: row.geometry
            }))
        };
        res.json(featureCollection);
    }
    catch (error) {
        console.error(`Error fetching dataset ${req.params.id}:`, error);
        res.status(500).json({ error: 'Could not load the dataset.' });
    }
});
// 3. POST /api/datasets - Validate and save a GeoJSON dataset and its features
router.post('/', requireAuth, async (req, res) => {
    let client;
    try {
        const geojson = normalizeGeoJSON(req.body.geojson);
        const filename = String(req.body.filename || 'uploaded.geojson').slice(0, 255);
        const name = String(req.body.name || filename).slice(0, 255);
        const metadata = req.body.metadata || {};
        client = await pool.connect();
        await client.query('BEGIN');
        const datasetResult = await client.query(`
      INSERT INTO datasets (name, original_filename, content_type, feature_count, geojson, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      RETURNING id, name, original_filename, feature_count, metadata, created_at
    `, [name, filename, 'application/geo+json', geojson.features.length, JSON.stringify(geojson), JSON.stringify(metadata)]);
        const dataset = datasetResult.rows[0];
        // Detect the source CRS from coordinate values so ST_Transform works
        // correctly when reprojecting to WGS84 on retrieval.
        const sourceSRID = detectSRID(geojson, metadata);
        for (const [featureIndex, feature] of geojson.features.entries()) {
            // ST_SetSRID tags the geometry with the detected source SRID.
            // ST_Transform(geom, 4326) is applied on read (GET /:id), not here,
            // so we preserve original precision and allow correct reprojection.
            await client.query(`
        INSERT INTO dataset_features (dataset_id, feature_index, properties, geom)
        VALUES ($1, $2, $3::jsonb, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), $5), 4326))
      `, [
                dataset.id,
                featureIndex,
                JSON.stringify(feature.properties || {}),
                JSON.stringify(feature.geometry),
                sourceSRID
            ]);
        }
        await client.query('COMMIT');
        const saved = datasetSummary(dataset);
        await logActivity({
            userId: req.user?.id, username: req.user?.username,
            action: 'upload', resourceType: 'dataset',
            resourceId: saved.id, resourceName: saved.name,
            details: { featureCount: saved.featureCount, originalFilename: saved.originalFilename },
            ipAddress: getClientIp(req),
        });
        res.status(201).json(saved);
    }
    catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackErr) {
                console.error('Error rolling back transaction:', rollbackErr);
            }
        }
        console.error('Error saving dataset:', error);
        res.status(400).json({ error: error.message || 'Could not save the dataset.' });
    }
    finally {
        if (client) {
            client.release();
        }
    }
});
// 4. PUT /api/datasets/:id - Update name and metadata of a dataset
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { name, metadata } = req.body;
        const result = await pool.query(`
      UPDATE datasets
      SET name = COALESCE($1, name),
          metadata = COALESCE($2::jsonb, metadata)
      WHERE id = $3
      RETURNING id, name, original_filename, feature_count, metadata, created_at
    `, [name, metadata ? JSON.stringify(metadata) : null, req.params.id]);
        if (!result.rowCount) {
            return res.status(404).json({ error: 'Dataset not found.' });
        }
        const updated = datasetSummary(result.rows[0]);
        await logActivity({
            userId: req.user?.id, username: req.user?.username,
            action: 'edit', resourceType: 'dataset',
            resourceId: updated.id, resourceName: updated.name,
            ipAddress: getClientIp(req),
        });
        res.json(updated);
    }
    catch (error) {
        console.error(`Error updating dataset ${req.params.id}:`, error);
        res.status(500).json({ error: 'Could not update the dataset metadata.' });
    }
});
// 5. DELETE /api/datasets/:id - Delete a dataset and its related features
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM datasets WHERE id = $1 RETURNING id, name', [req.params.id]);
        if (!result.rowCount) {
            return res.status(404).json({ error: 'Dataset not found.' });
        }
        await logActivity({
            userId: req.user?.id, username: req.user?.username,
            action: 'delete', resourceType: 'dataset',
            resourceId: result.rows[0].id, resourceName: result.rows[0].name,
            ipAddress: getClientIp(req),
        });
        res.status(204).end();
    }
    catch (error) {
        console.error(`Error deleting dataset ${req.params.id}:`, error);
        res.status(500).json({ error: 'Could not delete the dataset.' });
    }
});
export default router;
