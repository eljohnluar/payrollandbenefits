# HR2 ↔ HR4 Integration — What HR4 Needs from HR2 (Workforce Management)

Prepared: 2026-10-22 · HR4 = Payroll & Benefits (this system) · HR2 = Time & Attendance, Scheduling, Leave
Basis: exact queries in HR4's payroll engine (`laravel-backend/app/PayrollService.php:246-298, 381-411, 466-473`).

---

## 1. HR4 connection details (for HR2 to push into HR4)

| Item | Value |
|---|---|
| Base URL (production) | `https://payrollandbenefits-backend.onrender.com` |
| Auth header | `X-Api-Key: 805fde94d400182c8f4961bab4c9aeec6540533459fe67d3` |
| Key name / scope | `hr2-workforce` / `workforce:write` (attendance + leave endpoints only) |
| Discovery (no auth) | `GET /api/integration/capabilities` |
| Errors | JSON `{"error":"..."}` with 401 (missing/bad key), 403 (wrong scope), 422 (validation / unknown employee), 404 |

Share the key privately (same rule as HR1/HR3 — not in group threads). Revocation is instant on our side if it leaks.

**Employee ID convention:** `employee_id` = `hris-` + **lowercase** HR1 employee number. HR1 number `E075` → push `hris-E075`. Records unknown to HR4 return 422 — HR1's roster is already synced to HR4 (73 active), new hires must sync via HR1 first.

**Pay calendar:** semi-monthly cut-offs, paydays the 15th and month-end (never Sunday). Push a batch within ~2 days after each cut-off closes; daily pushes also work.

## 2. Live endpoints (work today)

### 2.1 Daily attendance — `POST /api/integration/attendance`
```json
{"logs":[
  {"employee_id":"hris-e075","log_date":"2026-10-01","status":"P",
   "actual_hours":8,"ot_hours":2.5,"nd_hours":0,"holiday_hours":0,"late_minutes":15}
]}
```
- Upsert on `(employee_id, log_date)` — re-pushing a day corrects it. Safe to resend.
- `status`: `P` Present, `H` Half-day, `A` Absent, `OT` Overtime-day. P/L/OT count as 1 day worked, H as 0.5 (`PayrollService.php:269`).
- `ot_hours` → overtime pay. `late_minutes` → tardiness deduction (**always read from daily logs**, even when cut-off summaries also exist).
- Response: `{"ok":true,"saved":N}`

### 2.2 Approved leave — `POST /api/integration/leave`
```json
{"requests":[
  {"employee_id":"hris-e075","leave_type":"Sick Leave","start_date":"2026-10-10",
   "end_date":"2026-10-11","days":2,"is_paid":true,"status":"Approved"}
]}
```
- INSERT only — **send each leave once**; re-pushes create duplicates (no dedupe key yet).
- `is_paid` is the payroll-critical flag: unpaid days × daily rate = `unpaid_leave_deduction`.
- Send only approved requests; pending ones shouldn't leave HR2.
- Response: `{"ok":true,"saved":N}`

## 3. Data HR4 needs — priority list

| # | Data | Fields | Feeds | Status |
|---|---|---|---|---|
| 1 | **Daily attendance** | per §2.1 | `days_worked`, overtime pay, tardiness | ✅ endpoint live |
| 2 | **Approved leaves** | per §2.2 | unpaid-leave deduction | ✅ endpoint live |
| 3 | **Per-cut-off attendance summary** (preferred over daily if HR2 aggregates) | `employee_id, cutoff_start, cutoff_end, present_days, ot_days, half_days, ot_hours` | primary `days_worked` source (`attendance_cutoffs`) | ⚠️ no M2M endpoint yet — HR-admin entry only. Ask us to add `POST /api/integration/attendance-cutoffs` (~1 route block) |
| 4 | **Night differential & holiday hours** | `employee_id, schedule_date, night_diff_hours, holiday_hours` | night diff pay; holiday pay (hourly × 2) | ⚠️ compute reads `shift_schedules`, no M2M endpoint yet. Daily-log `nd_hours`/`holiday_hours` are stored today but **not** used for pay — needs a small code change on our side. Do not assume they're paid until we confirm |
| 5 | Approved timesheets | `employee_id, period_start, period_end, status` | override signal for external workforce systems | optional — only if HR2 runs formal timesheet approval |
| 6 | Shift schedules (display) | roster data | HR4 screens only | optional, not payroll-critical |

**Not needed from HR2:** performance ratings/recognition (HR3 already pushes to HR4), salaries/positions/emails (HR1), claims receipts (employees file in HR4), leave *balances* (payroll uses requests, not balances), OT premium rates (statutory, computed in HR4).

## 4. Known HR4-side gaps (agreed before go-live)
1. Cut-off summary push endpoint — to build on request (see row 3).
2. ND/holiday ingestion path — to build on request (see row 4). Until then HR2 should send `nd_hours`/`holiday_hours` in daily logs *anyway* so the data is ready when we switch the compute over.
3. Leave dedupe key — if HR2 needs replay safety, ask and we'll add a reference-based unique key like we did for HR3 ratings.

## 5. Questions for HR2
1. Can you push per cut-off (15th & month-end), or is a daily sync easier? Either works; cut-off batches reduce validation load.
2. Do you already aggregate `present_days / ot_days / half_days` per cut-off, or only raw daily logs? Decides whether we build gap #1 first.
3. Where do night-shift and holiday work come from in your system — schedules, actuals, or both? Which number should HR4 pay (actual hours worked at night vs scheduled)?
4. Tardiness policy: do you send raw `late_minutes`, or rounded grace-period minutes? (HR4 deducts on the raw total today.)
5. Absences: is `A` in daily logs enough, or does HR2 expect unpaid absences to arrive as leave requests instead? (Avoid double-deducting: HR4 prorates basic pay on days worked AND deducts unpaid leave — we need one source of truth per situation.)
6. Amendments: after a cut-off closes, how do you send corrections — re-push the same employee+date (we upsert, fine) or a separate revised record?
7. Who flags holiday pay for the 15th/month-end itself (special non-working holidays etc.) — your `holiday_hours` or HR4's holiday calendar?
8. Do you want confirmation back per batch (we return `{saved}`; optionally we can emit a webhook when a payroll run using your data is submitted — HR4 already supports signed webhooks)?

## 6. To-do checklist
- HR2: confirm answers §5, store the key, build one push per cut-off (start with daily logs + leave)
- HR4: build cut-off & ND/holiday endpoints on request; leave-dedupe if needed
- Joint test: one employee's half-month attendance + one unpaid leave, run a payroll preview on our side, verify `days_worked`, OT, tardiness, unpaid deduction figures match HR2's expectations
- Then: schedule sync + production payroll run on HR2-fed data

## 7. HR2 responses logged 2026-10-22
- Cadence: **daily** pushes (manual trigger for now; per-cut-off batching available). Only raw daily logs exist → no cut-off-summary endpoint needed for now.
- ND/holiday: no HR2 source; will push 0. HR4 holiday pay stays on HR4's calendar/shift data until a source exists.
- Tardiness: raw `late_minutes` only for post-grace days (>15 min), grace days sent as 0. ✅ compatible.
- Absences: `status=A` in logs only; approved leave via /leave only; on-leave days excluded from attendance → no double deduction. ✅ agreed.
- Amendments: re-push same employee_id+log_date (upsert). ✅
- ID casing: **lowercase is correct — `hris-e075`**. §2 examples fixed.
- Leave dedupe (HR4 action, queued with next deploy): add reference/unique key to `/api/integration/leave`.
- Spanning leave: send as ONE record — HR4 clips per period (`PayrollService.php:466-473` counts only in-period days).
- Roster: HR1 feed currently has 50 active; all present in HR4 (0 missing). HR2's "75 active" doesn't match HR1's feed — HR2 to share their list for reconciliation.
- 422 caution: a 422 mid-batch means rows before the offender were already saved; treat batches as partially applied and reconcile by employee_id+log_date upserts.

## 8. Joint test E056 — PASSED 2026-10-22 + statutory hold
- E056 result: gross ₱10,948.44, net ₱8,447.01 (basic flat-15 10,725 + OT 223.44; deductions: SSS 675, PhilHealth 214.50, Pag-IBIG 100, unpaid leave 1,430, tardiness 81.93). HR2 reconciled all lines ✅.
- Prod bug found & fixed locally: `is_paid:false` boolean binding (500/503 on unpaid leave pushes). Record inserted manually (leave id 14). HR2 waits for deploy before pushing unpaid leaves; attendance pushes go scheduled (upsert-only).
- Policies confirmed to HR2: flat-15 days per cut-off (absence ≠ basic-pay reduction); NO tardiness grace, raw minutes charged.
- ⚠️ **HR4 real payroll runs ON HOLD (task #3)** — HR2 rejected per-cut-off statutory computation (~2× monthly contributions over-collects). HR2 payroll lead to send official SSS/PhilHealth/Pag-IBIG tables + filing convention → adapt `TaxService` to monthly basis split per cut-off.叠加 with existing salary freeze (71 zeroed salaries).
- E195 still absent from HR4/HR1 rosters; HR1 feed shows 50 vs earlier 74 — both unresolved.
