-- Clean up existing data to ensure idempotent runs
TRUNCATE TABLE regions CASCADE;
TRUNCATE TABLE cities CASCADE;
TRUNCATE TABLE corridors CASCADE;

-- 1. Seed regions table (wrapping Polygon GeoJSON into MultiPolygon geometries)
INSERT INTO regions (id, name, properties, geom) VALUES 
(
  'reg-central', 
  'Oromia & Addis Ababa (Simplified Sample Region)', 
  '{"description": "A mock polygon representing the central region of Ethiopia.", "density": 120}', 
  ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[37.5, 7.5],[40.5, 7.5],[41.5, 9.5],[39.5, 10.5],[37.0, 9.5],[37.5, 7.5]]]}')), 4326)
),
(
  'reg-north', 
  'Amhara & Tigray (Simplified Sample Region)', 
  '{"description": "A mock polygon representing the northern region of Ethiopia.", "density": 95}', 
  ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[36.5, 10.5],[39.5, 10.5],[40.0, 14.0],[37.0, 14.0],[36.0, 12.0],[36.5, 10.5]]]}')), 4326)
),
(
  'reg-east', 
  'Somali Region (Simplified Sample Region)', 
  '{"description": "A mock polygon representing the eastern region of Ethiopia.", "density": 45}', 
  ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[41.0, 5.0],[45.0, 5.0],[48.0, 8.0],[43.0, 11.0],[41.0, 9.0],[41.0, 5.0]]]}')), 4326)
);

-- 2. Seed cities table (Point geometries)
INSERT INTO cities (id, name, properties, geom) VALUES 
(
  'city-addis', 
  'Addis Ababa', 
  '{"type": "Capital City", "population": "Approx. 5 Million"}', 
  ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[38.74, 9.03]}'), 4326)
),
(
  'city-dire', 
  'Dire Dawa', 
  '{"type": "Chartered City", "population": "Approx. 400k"}', 
  ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[41.86, 9.60]}'), 4326)
),
(
  'city-bahir', 
  'Bahir Dar', 
  '{"type": "Regional Capital", "population": "Approx. 350k"}', 
  ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[37.39, 11.59]}'), 4326)
),
(
  'city-hawassa', 
  'Hawassa', 
  '{"type": "Regional Capital", "population": "Approx. 300k"}', 
  ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[38.48, 7.05]}'), 4326)
),
(
  'city-mekelle', 
  'Mekelle', 
  '{"type": "Regional Capital", "population": "Approx. 400k"}', 
  ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[39.47, 13.49]}'), 4326)
);

-- 3. Seed corridors table (LineString geometries)
INSERT INTO corridors (id, name, properties, geom) VALUES 
(
  'corridor-expressway', 
  'Addis Ababa - Adama Corridor (Sample Line)', 
  '{"description": "Major transport arterial link in Ethiopia."}', 
  ST_SetSRID(ST_GeomFromGeoJSON('{"type":"LineString","coordinates":[[38.74, 9.03],[38.98, 8.85],[39.12, 8.70],[39.27, 8.54]]}'), 4326)
),
(
  'corridor-djibouti', 
  'Adama - Dire Dawa Railway Link (Sample Line)', 
  '{"description": "Main standard gauge railway connection."}', 
  ST_SetSRID(ST_GeomFromGeoJSON('{"type":"LineString","coordinates":[[39.27, 8.54],[40.15, 8.90],[41.20, 9.30],[41.86, 9.60]]}'), 4326)
);
