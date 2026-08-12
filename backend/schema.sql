-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Regions table with MultiPolygon geometry (WGS 84 / SRID 4326) and JSONB properties
CREATE TABLE IF NOT EXISTS regions (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    geom GEOMETRY(MultiPolygon, 4326)
);

-- 2. Cities table with Point geometry (WGS 84 / SRID 4326) and JSONB properties
CREATE TABLE IF NOT EXISTS cities (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    geom GEOMETRY(Point, 4326)
);

-- 3. Corridors table with LineString geometry (WGS 84 / SRID 4326) and JSONB properties
CREATE TABLE IF NOT EXISTS corridors (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    geom GEOMETRY(LineString, 4326)
);

-- Create spatial indexes on geometry columns to optimize spatial lookup queries
CREATE INDEX IF NOT EXISTS regions_geom_idx ON regions USING GIST (geom);
CREATE INDEX IF NOT EXISTS cities_geom_idx ON cities USING GIST (geom);
CREATE INDEX IF NOT EXISTS corridors_geom_idx ON corridors USING GIST (geom);

-- Enable UUID generation for dataset identifiers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store one record for every uploaded GeoJSON document.
CREATE TABLE IF NOT EXISTS datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL DEFAULT 'application/geo+json',
    feature_count INTEGER NOT NULL DEFAULT 0,
    geojson JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Store each GeoJSON feature separately for spatial queries and indexing.
CREATE TABLE IF NOT EXISTS dataset_features (
    id BIGSERIAL PRIMARY KEY,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    feature_index INTEGER NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom GEOMETRY(Geometry, 4326) NOT NULL,
    UNIQUE (dataset_id, feature_index)
);

-- Speed up spatial intersection, distance, and containment queries.
CREATE INDEX IF NOT EXISTS dataset_features_geom_idx
    ON dataset_features USING GIST (geom);

-- Speed up loading the most recently uploaded datasets.
CREATE INDEX IF NOT EXISTS datasets_created_at_idx
    ON datasets (created_at DESC);

-- Migration: Add metadata column to datasets if it doesn't exist
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- AUTH: Users and Activity Logging
-- ============================================================

-- Users: staff accounts (role = 'admin' | 'user')
CREATE TABLE IF NOT EXISTS users (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(100) UNIQUE NOT NULL,
  email            VARCHAR(255) UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  role             VARCHAR(20) NOT NULL DEFAULT 'user',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- Activity logs: one row per user action
CREATE TABLE IF NOT EXISTS activity_logs (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID  REFERENCES users(id) ON DELETE SET NULL,
  username      TEXT,                  -- denormalized: preserved if user deleted
  action        VARCHAR(100) NOT NULL, -- login | logout | upload | edit | delete | create_user | deactivate_user
  resource_type VARCHAR(50),           -- dataset | user | session
  resource_id   TEXT,
  resource_name TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx    ON activity_logs (user_id);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx     ON activity_logs (action);
