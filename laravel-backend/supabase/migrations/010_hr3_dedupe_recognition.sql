-- 010_hr3_dedupe_recognition.sql — HR3 push hardening (2026-10-20)
-- 1) evaluation_id dedupe for /api/integration/performance
-- 2) inbound recognition awards: /api/integration/recognition stores HR3 identity + points/tier

ALTER TABLE public.performance_ratings
  ADD COLUMN IF NOT EXISTS evaluation_ref INT;

CREATE UNIQUE INDEX IF NOT EXISTS perf_ratings_eval_ref_uq
  ON public.performance_ratings (evaluation_ref)
  WHERE evaluation_ref IS NOT NULL;

ALTER TABLE public.recognition_awards
  ADD COLUMN IF NOT EXISTS recognition_ref INT,
  ADD COLUMN IF NOT EXISTS tier VARCHAR(30),
  ADD COLUMN IF NOT EXISTS points NUMERIC(10,2);

CREATE UNIQUE INDEX IF NOT EXISTS recog_awards_rec_ref_uq
  ON public.recognition_awards (recognition_ref)
  WHERE recognition_ref IS NOT NULL;
