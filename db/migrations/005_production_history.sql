-- Append-only history whenever meals prepared is entered or adjusted (MEAL role).
CREATE TABLE IF NOT EXISTS daily_production_history (
  id TEXT PRIMARY KEY,
  dp_code TEXT NOT NULL REFERENCES distribution_points(code),
  production_date TEXT NOT NULL,
  meals_prepared INTEGER NOT NULL CHECK (meals_prepared >= 0),
  previous_meals_prepared INTEGER CHECK (previous_meals_prepared IS NULL OR previous_meals_prepared >= 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_production_history_dp_date_idx
  ON daily_production_history (dp_code, production_date, created_at DESC);
