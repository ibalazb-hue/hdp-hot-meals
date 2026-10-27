-- HDP hot-meal verification (Taiz). The calendar day is Asia/Aden and is
-- stored in scan_date by the application. Do not derive the meal day from
-- the database server timezone.

CREATE TABLE distribution_points (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  district TEXT NOT NULL CHECK (district IN ('Al-Mudhaffar', 'Al-Qahira')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('dp_focal', 'meal', 'supervisor', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_dps (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dp_code TEXT NOT NULL REFERENCES distribution_points(code),
  PRIMARY KEY (user_id, dp_code)
);

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  last_user_id TEXT REFERENCES users(id),
  last_seen_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE households (
  hh_code TEXT PRIMARY KEY,
  dp_code TEXT NOT NULL REFERENCES distribution_points(code),
  beneficiary_count INTEGER NOT NULL CHECK (beneficiary_count BETWEEN 1 AND 30),
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  active_card_code TEXT UNIQUE,
  registered_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hh_code_format CHECK (hh_code ~ '^TZ-[A-Z0-9]{2,8}-[0-9]{6}$')
);

CREATE TABLE hh_counters (
  dp_code TEXT PRIMARY KEY REFERENCES distribution_points(code),
  last_number INTEGER NOT NULL CHECK (last_number >= 0)
);

CREATE TABLE card_issuance (
  id TEXT PRIMARY KEY,
  hh_code TEXT NOT NULL REFERENCES households(hh_code),
  card_code TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('issue', 'void', 'reissue')),
  reason TEXT,
  previous_card_code TEXT,
  operator_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX card_issuance_card_idx ON card_issuance (card_code);
CREATE INDEX card_issuance_hh_idx ON card_issuance (hh_code, created_at DESC);

CREATE TABLE meal_scans (
  id TEXT PRIMARY KEY,
  hh_code TEXT,
  card_code TEXT,
  dp_code TEXT NOT NULL,
  scan_date TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('card', 'manual')),
  client_result TEXT NOT NULL CHECK (client_result IN ('Served', 'Blocked', 'Override', 'ManualException')),
  result TEXT NOT NULL CHECK (result IN ('Served', 'Blocked', 'Override', 'ManualException')),
  block_reason TEXT CHECK (
    block_reason IS NULL OR block_reason IN (
      'already_served', 'voided', 'wrong_dp', 'unknown', 'inactive', 'no_card', 'duplicate_conflict'
    )
  ),
  counts_as_distributed BOOLEAN NOT NULL,
  operator_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  offline_flag BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  supervisor_id TEXT REFERENCES users(id),
  scanned_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ,
  conflict_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One counting distribution (Served, Override, or ManualException) per household per Aden day.
CREATE UNIQUE INDEX one_distribution_per_hh_day
  ON meal_scans (hh_code, scan_date)
  WHERE counts_as_distributed = TRUE;

CREATE INDEX meal_scans_dp_date_idx ON meal_scans (dp_code, scan_date);
CREATE INDEX meal_scans_hh_date_idx ON meal_scans (hh_code, scan_date);

CREATE TABLE daily_production (
  dp_code TEXT NOT NULL REFERENCES distribution_points(code),
  production_date TEXT NOT NULL,
  meals_prepared INTEGER NOT NULL CHECK (meals_prepared >= 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dp_code, production_date)
);

CREATE TABLE spot_checks (
  id TEXT PRIMARY KEY,
  dp_code TEXT NOT NULL REFERENCES distribution_points(code),
  check_date TEXT NOT NULL,
  supervisor_id TEXT NOT NULL REFERENCES users(id),
  hh_code TEXT,
  finding TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sync_log (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  operator_id TEXT REFERENCES users(id),
  accepted_count INTEGER NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
