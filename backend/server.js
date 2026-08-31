import express from 'express';
import cors from 'cors';
import { pool, port, corsOrigin } from './config/database.js';

// Create and configure the API server.
const app = express();

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '25mb' }));

// Normalize uploaded GeoJSON into a FeatureCollection.
function normalizeGeoJSON(input) {
  if (!input || !['Feature', 'FeatureCollection'].includes(input.type)) {
    throw new Error('The uploaded file must be a GeoJSON Feature or FeatureCollection.');
  }
  const features = input.type === 'FeatureCollection' ? input.features : [input];
  if (!Array.isArray(features) || features.length === 0) throw new Error('The GeoJSON file contains no features.');
  features.forEach((feature) => {
    if (feature?.type !== 'Feature' || !feature.geometry) throw new Error('Every GeoJSON feature must contain geometry.');
  });
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => ({ type: 'Feature', properties: feature.properties || {}, geometry: feature.geometry }))
  };
}

// Return only the dataset fields needed by the frontend.
function datasetSummary(row) {
  return { id: row.id, name: row.name, originalFilename: row.original_filename, featureCount: row.feature_count, createdAt: row.created_at };
}

// Check the API and database connection.
app.get('/api/health', async (_request, response) => {
  try { await pool.query('SELECT 1'); response.json({ ok: true, database: 'connected' }); }
  catch (error) {
    console.error('Database health check failed:', error.message);
    response.status(503).json({ ok: false, error: 'Database unavailable.', detail: error.message });
  }
});

// Return saved dataset metadata.
app.get('/api/datasets', async (_request, response) => {
  try {
    const result = await pool.query('SELECT id, name, original_filename, feature_count, created_at FROM datasets ORDER BY created_at DESC');
    response.json(result.rows.map(datasetSummary));
  } catch { response.status(500).json({ error: 'Could not load datasets.' }); }
});

// Search saved datasets only.
app.get('/api/datasets/search', async (request, response) => {
  const queryParam = String(request.query.q || '').trim();
  if (!queryParam) {
    return response.json({ results: [] });
  }

  const searchTerm = `%${queryParam}%`;

  try {
    const results = [];

    // 1. Search datasets table
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

    response.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    response.status(500).json({ error: 'Search failed in database.' });
  }
});

// Return one complete saved GeoJSON dataset.
app.get('/api/datasets/:id', async (request, response) => {
  try {
    const result = await pool.query('SELECT geojson FROM datasets WHERE id = $1', [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ error: 'Dataset not found.' });
    response.json(result.rows[0].geojson);
  } catch { response.status(500).json({ error: 'Could not load the dataset.' }); }
});

// Validate and save a GeoJSON dataset and its features.
app.post('/api/datasets', async (request, response) => {
  let client;
  try {
    const geojson = normalizeGeoJSON(request.body.geojson);
    const filename = String(request.body.filename || 'uploaded.geojson').slice(0, 255);
    const name = String(request.body.name || filename).slice(0, 255);
    client = await pool.connect();
    await client.query('BEGIN');
    const datasetResult = await client.query(`
      INSERT INTO datasets (name, original_filename, content_type, feature_count, geojson)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, name, original_filename, feature_count, created_at
    `, [name, filename, 'application/geo+json', geojson.features.length, JSON.stringify(geojson)]);
    const dataset = datasetResult.rows[0];
    for (const [featureIndex, feature] of geojson.features.entries()) {
      await client.query(`
        INSERT INTO dataset_features (dataset_id, feature_index, properties, geom)
        VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
      `, [dataset.id, featureIndex, JSON.stringify(feature.properties || {}), JSON.stringify(feature.geometry)]);
    }
    await client.query('COMMIT');
    response.status(201).json(datasetSummary(dataset));
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    response.status(400).json({ error: error.message || 'Could not save the dataset.' });
  } finally {
    client?.release();
  }
});

// Delete a dataset and its related features.
app.delete('/api/datasets/:id', async (request, response) => {
  try {
    const result = await pool.query('DELETE FROM datasets WHERE id = $1 RETURNING id', [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ error: 'Dataset not found.' });
    response.status(204).end();
  } catch { response.status(500).json({ error: 'Could not delete the dataset.' }); }
});

// Start the API server.
app.listen(port, () => console.log(`EthioMap API listening on http://localhost:${port}`));
