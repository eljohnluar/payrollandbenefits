-- 011_promotion_records.sql — HR3 succession/promotion push intake (2026-10-23)
-- Store-only evidence record for Compensation Planning; does not mutate the employee master.
CREATE TABLE IF NOT EXISTS public.promotion_records (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     VARCHAR(20) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_position   VARCHAR(100),
  to_position     VARCHAR(100) NOT NULL,
  readiness       VARCHAR(50),
  effective_date  DATE,
  approved_at     DATE NOT NULL,
  promotion_ref   INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_records_ref_uq
  ON public.promotion_records (promotion_ref)
  WHERE promotion_ref IS NOT NULL;
