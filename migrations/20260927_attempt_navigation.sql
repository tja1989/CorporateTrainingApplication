-- Additive: historical answers and results are untouched; unknown legacy position starts at zero.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS navigation_index integer NOT NULL DEFAULT 0;
