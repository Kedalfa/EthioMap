import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
// Helper to query dataset features from datasets & dataset_features tables
async function getDatasetLayerGeoJSON(datasetNameKeyword) {
    const query = `
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(
        json_agg(
          json_build_object(
            'type', 'Feature',
            'id', f.id,
            'properties', f.properties,
            'geometry', ST_AsGeoJSON(ST_Transform(f.geom, 4326))::json
          )
          ORDER BY f.feature_index ASC
        ),
        '[]'::json
      )
    ) AS geojson
    FROM dataset_features f
    JOIN datasets d ON f.dataset_id = d.id
    WHERE d.name ILIKE $1;
  `;
    const result = await pool.query(query, [`%${datasetNameKeyword}%`]);
    return result.rows[0]?.geojson || { type: 'FeatureCollection', features: [] };
}
// 1. GET /api/layers/regions
router.get('/regions', async (req, res) => {
    try {
        const geojson = await getDatasetLayerGeoJSON('Regions');
        res.json(geojson);
    }
    catch (error) {
        console.error('Error fetching regions layer:', error);
        res.status(500).json({ error: 'Internal database error', details: error.message });
    }
});
// 2. GET /api/layers/cities
router.get('/cities', async (req, res) => {
    try {
        const geojson = await getDatasetLayerGeoJSON('Cities');
        res.json(geojson);
    }
    catch (error) {
        console.error('Error fetching cities layer:', error);
        res.status(500).json({ error: 'Internal database error', details: error.message });
    }
});
// 3. GET /api/layers/corridors
router.get('/corridors', async (req, res) => {
    try {
        const geojson = await getDatasetLayerGeoJSON('Corridors');
        res.json(geojson);
    }
    catch (error) {
        console.error('Error fetching corridors layer:', error);
        res.status(500).json({ error: 'Internal database error', details: error.message });
    }
});
export default router;
