-- =====================================================
-- SYSTEM REVISIONS (Oct 2026)
-- 1. Two user roles only: HR Admin ('HR') + Employee.
--    Admin/Payroll/Finance logins collapse into HR; the Finance
--    approval step is handled outside this system.
-- 2. Employee logins link to their employees row (self-service).
-- 3. Cut-off-based attendance: attendance_cutoffs replaces daily
--    recording; attendance_adjustments covers off-site workers.
-- 4. payroll_items.statutory_basis stores the SSS/PhilHealth/Pag-IBIG
--    bracket + rate evidence shown on the computation screen.
-- Idempotent: safe to re-run in Supabase Studio.
-- =====================================================

-- ── App users: two roles + employee link ──
UPDATE public.app_users SET role = 'HR' WHERE role NOT IN ('HR', 'Employee');
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('HR','Employee'));

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(20) REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_employee ON public.app_users (employee_id) WHERE employee_id IS NOT NULL;

-- ── Statutory deduction basis snapshot per payroll line ──
ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS statutory_basis TEXT;

-- ── Attendance recorded per cut-off period (1st–15th / 16th–month end) ──
CREATE TABLE IF NOT EXISTS public.attendance_cutoffs (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id   VARCHAR(20) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  cutoff_start  DATE NOT NULL,
  cutoff_end    DATE NOT NULL,
  present_days  INT NOT NULL DEFAULT 0 CHECK (present_days >= 0),
  half_days     INT NOT NULL DEFAULT 0 CHECK (half_days >= 0),
  absent_days   INT NOT NULL DEFAULT 0 CHECK (absent_days >= 0),
  ot_days       INT NOT NULL DEFAULT 0 CHECK (ot_days >= 0),
  ot_hours      NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (ot_hours >= 0),
  remarks       TEXT NOT NULL DEFAULT '',
  updated_by    INT REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, cutoff_start, cutoff_end)
);
DO $$ BEGIN
  CREATE TRIGGER trg_attendance_cutoffs_touch BEFORE UPDATE ON public.attendance_cutoffs
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_attendance_cutoffs_period ON public.attendance_cutoffs (cutoff_start, cutoff_end);

-- ── Adjustment requests for off-site / missed attendance ──
CREATE TABLE IF NOT EXISTS public.attendance_adjustments (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id       VARCHAR(20) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  cutoff_start      DATE NOT NULL,
  cutoff_end        DATE NOT NULL,
  details           TEXT NOT NULL,
  location          TEXT NOT NULL DEFAULT '',
  add_present_days  INT NOT NULL DEFAULT 0 CHECK (add_present_days >= 0),
  add_half_days     INT NOT NULL DEFAULT 0 CHECK (add_half_days >= 0),
  remove_absent_days INT NOT NULL DEFAULT 0 CHECK (remove_absent_days >= 0),
  add_ot_hours      NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (add_ot_hours >= 0),
  status            TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
  requested_by      VARCHAR(100) NOT NULL DEFAULT 'Employee',
  requested_by_user INT REFERENCES public.app_users(id) ON DELETE SET NULL,
  reviewed_by       INT REFERENCES public.app_users(id) ON DELETE SET NULL,
  review_notes      TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_adjustments_status ON public.attendance_adjustments (status, created_at DESC);

-- Backfill cut-off rows from existing daily logs so history + payroll
-- preview keep working after the switch to cut-off recording.
INSERT INTO public.attendance_cutoffs
  (employee_id, cutoff_start, cutoff_end, present_days, half_days, absent_days, ot_days, ot_hours, remarks)
SELECT employee_id,
       CASE WHEN EXTRACT(DAY FROM log_date) <= 15
            THEN date_trunc('month', log_date)::date
            ELSE (date_trunc('month', log_date) + interval '15 days')::date END,
       CASE WHEN EXTRACT(DAY FROM log_date) <= 15
            THEN (date_trunc('month', log_date) + interval '14 days')::date
            ELSE (date_trunc('month', log_date) + interval '1 month' - interval '1 day')::date END,
       COUNT(*) FILTER (WHERE status = 'P')::int,
       COUNT(*) FILTER (WHERE status = 'H')::int,
       COUNT(*) FILTER (WHERE status = 'A')::int,
       COUNT(*) FILTER (WHERE status = 'OT')::int,
       COALESCE(SUM(ot_hours), 0)::numeric(6,2),
       'Backfilled from daily logs'
  FROM public.attendance_logs
 GROUP BY employee_id,
          CASE WHEN EXTRACT(DAY FROM log_date) <= 15
               THEN date_trunc('month', log_date)::date
               ELSE (date_trunc('month', log_date) + interval '15 days')::date END,
          CASE WHEN EXTRACT(DAY FROM log_date) <= 15
               THEN (date_trunc('month', log_date) + interval '14 days')::date
               ELSE (date_trunc('month', log_date) + interval '1 month' - interval '1 day')::date END
ON CONFLICT (employee_id, cutoff_start, cutoff_end) DO NOTHING;

-- ── Minimum wage setting (DOLE regional minimum, monthly basis) ──
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES ('minimum_wage_monthly', '15796')
ON CONFLICT (setting_key) DO NOTHING;
