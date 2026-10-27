-- Tablet position at the moment of the scan. Null when the device has no fix.
-- This does not change who may be served.

ALTER TABLE meal_scans ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE meal_scans ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE meal_scans ADD COLUMN location_accuracy_m DOUBLE PRECISION;

ALTER TABLE meal_scans ADD CONSTRAINT meal_scans_latitude_range
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
ALTER TABLE meal_scans ADD CONSTRAINT meal_scans_longitude_range
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
