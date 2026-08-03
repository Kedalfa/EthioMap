-- Enable PostGIS geometry support used by dataset_features.geom.
CREATE EXTENSION IF NOT EXISTS postgis;
-- Enable UUID generation for dataset identifiers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store one record for every uploaded GeoJSON document.
CREATE TABLE IF NOT EXISTS datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/geo+json',
    feature_count INTEGER NOT NULL DEFAULT 0,
    geojson JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Store each GeoJSON feature separately for spatial queries and indexing.
CREATE TABLE IF NOT EXISTS dataset_features (
    id BIGSERIAL PRIMARY KEY,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    feature_index INTEGER NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(Geometry, 4326) NOT NULL,
    UNIQUE (dataset_id, feature_index)
);

-- Speed up spatial intersection, distance, and containment queries.
CREATE INDEX IF NOT EXISTS dataset_features_geom_idx
    ON dataset_features USING GIST (geom);

-- Speed up loading the most recently uploaded datasets.
CREATE INDEX IF NOT EXISTS datasets_created_at_idx
    ON datasets (created_at DESC);
