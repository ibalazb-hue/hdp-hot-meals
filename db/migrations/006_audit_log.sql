-- Append-only admin / operations audit trail.
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
