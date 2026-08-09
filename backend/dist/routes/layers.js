import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
// Helper to query layer from database and return as a GeoJSON FeatureCollection
async function getLayerGeoJSON(tableName) {
    // Strict whitelist check to prevent SQL injection when interpolating the table name
    const allowedTables = ['regions', 'cities', 'corridors'];
    if (!allowedTables.includes(tableName)) {
        throw new Error(`Invalid table name requested: ${tableName}`);
    }
    // Construct query to convert geometry to GeoJSON and aggregate rows into a single FeatureCollection
    const query = `
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(
        json_agg(
          json_build_object(
            'type', 'Feature',
            'id', id,
            'properties', properties || jsonb_build_object('name', name),
            'geometry', ST_AsGeoJSON(geom)::json
          )
        ),
        '[]'::json
      )
    ) AS geojson
    FROM ${tableName};
  `;
    const result = await pool.query(query);
    return result.rows[0]?.geojson || { type: 'FeatureCollection', features: [] };
}
// 1. GET /api/layers/regions
router.get('/regions', async (req, res) => {
    try {
        const geojson = await getLayerGeoJSON('regions');
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
        const geojson = await getLayerGeoJSON('cities');
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
        const geojson = await getLayerGeoJSON('corridors');
        res.json(geojson);
    }
    catch (error) {
        console.error('Error fetching corridors layer:', error);
        res.status(500).json({ error: 'Internal database error', details: error.message });
    }
});
// 4. GET /api/layers/lakes
router.get('/lakes', async (req, res) => {
    try {
        const query = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
          json_agg(
            json_build_object(
              'type', 'Feature',
              'id', 'lake-' || ogc_fid,
              'properties', jsonb_build_object(
                'name', 'Lake ' || ogc_fid,
                'area', area,
                'perimeter', perimeter
              ),
              'geometry', ST_AsGeoJSON(ST_Transform(ST_SetSRID(wkb_geometry, 32637), 4326))::json
            )
          ),
          '[]'::json
        )
      ) AS geojson
      FROM eth_lakes;
    `;
        const result = await pool.query(query);
        const geojson = result.rows[0]?.geojson || { type: 'FeatureCollection', features: [] };
        res.json(geojson);
    }
    catch (error) {
        console.error('Error fetching lakes layer:', error);
        res.status(500).json({ error: 'Internal database error', details: error.message });
    }
});
export default router;
