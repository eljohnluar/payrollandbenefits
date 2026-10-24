-- 006_expand_rating_column.sql — Support ratings with descriptions > 20 chars (e.g. '2.53 — Needs Improvement')
ALTER TABLE public.performance_ratings
  ALTER COLUMN rating TYPE VARCHAR(100);
