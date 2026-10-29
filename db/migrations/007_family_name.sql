-- Family name (اسم الأسرة) shown on the entitlement card.
ALTER TABLE households ADD COLUMN IF NOT EXISTS family_name TEXT;
