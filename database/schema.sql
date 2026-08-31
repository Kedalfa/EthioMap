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
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    description TEXT NOT NULL DEFAULT '',
    coordinate_reference_system TEXT NOT NULL DEFAULT 'EPSG:4326',
    owner TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE datasets ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS coordinate_reference_system TEXT NOT NULL DEFAULT 'EPSG:4326';
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT '';
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '';
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

-- Application accounts used for authentication and dashboard administration.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auditable history for authentication, dataset, and user-management actions.
CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    username TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    resource_name TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
    ON activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_username_idx
    ON activity_logs (username);
