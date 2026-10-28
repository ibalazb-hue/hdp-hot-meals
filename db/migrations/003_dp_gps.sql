-- Per-point GPS fence. Scans always store tablet lat/lng when available.
-- Enforcement runs only when gps_check_active is TRUE.

ALTER TABLE distribution_points ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE distribution_points ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE distribution_points ADD COLUMN gps_radius_m DOUBLE PRECISION NOT NULL DEFAULT 150;
ALTER TABLE distribution_points ADD COLUMN gps_check_active BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE distribution_points ADD CONSTRAINT distribution_points_latitude_range
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
ALTER TABLE distribution_points ADD CONSTRAINT distribution_points_longitude_range
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
ALTER TABLE distribution_points ADD CONSTRAINT distribution_points_gps_radius_range
  CHECK (gps_radius_m >= 10 AND gps_radius_m <= 5000);
ALTER TABLE distribution_points ADD CONSTRAINT distribution_points_gps_pair
  CHECK ((latitude IS NULL) = (longitude IS NULL));

ALTER TABLE meal_scans DROP CONSTRAINT IF EXISTS meal_scans_block_reason_check;
ALTER TABLE meal_scans ADD CONSTRAINT meal_scans_block_reason_check
  CHECK (
    block_reason IS NULL OR block_reason IN (
      'already_served',
      'voided',
      'wrong_dp',
      'unknown',
      'inactive',
      'no_card',
      'duplicate_conflict',
      'out_of_geofence',
      'location_required'
    )
  );
