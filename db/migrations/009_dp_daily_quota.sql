-- MealFlow-style daily meal quota per distribution point (NULL = no quota set).
ALTER TABLE distribution_points ADD COLUMN IF NOT EXISTS daily_quota INTEGER CHECK (daily_quota IS NULL OR daily_quota >= 0);
