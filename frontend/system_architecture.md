# System Architecture — HRMS / HCM Suite (Payroll & Benefits Focus)

Company: **TRI-M GLOBAL LOGISTICS & TRADING INC.**
Stack: **PHP 8 (procedural, no framework) + MySQL/MariaDB (PDO) + vanilla JS + hand-written CSS**, served by Apache (XAMPP).

---

## 1. Suite Overview

This application implements an **HRMS/HCM suite with a Financial Management transaction
core**, organized into the modules below. The codebase's center of gravity is the
**Payroll & Benefits** module; the other HRMS modules are implemented as data sources and
read-mostly views that payroll consumes.

| Module | Status in this codebase |
|---|---|
| **Recruitment & Onboarding** | Partial — `recruitment_pipeline` table + dashboard analytics only; no dedicated page or mutation API. |
| **Core HR** | Read-mostly — employee directory, 360° profile, HR user self-registration. Employee master records are **owned by an external Core HRMS**; the write API is a disabled stub. |
| **Workforce Management** | Read-mostly — daily attendance view, shift display, leave balances. Attendance is **owned by an external Time & Attendance module**; the write API is a disabled stub. Data feeds payroll. |
| **Performance & Development** | Data source — ratings/competency/training/recognition records; surfaced on profiles/dashboard; feeds payroll bonuses. No dedicated page. |
| **Payroll & Benefits** | **Fully implemented** — the core of this application (§6). |
| **Financial Management System (transaction core)** | Implemented at the payroll boundary — finance approvals, GL posting, disbursement, budget & cash checks (§7). |

> Architectural stance: this app **consumes** HRMS master/transactional data and **owns**
> payroll computation, claims, benefits, and the finance approval workflow. Several write
> endpoints are intentionally neutered stubs — e.g. `api/employees.php` and
> `api/attendance.php` immediately redirect with `error=readonly` (the CRUD code below the
> redirect is dead), with comments stating the data belongs to the source system.

---

## 2. Request Lifecycle

Every request flows through a single front controller (`index.php`):

```
Browser
  │  GET/POST  /index.php?page=<slug>
  ▼
index.php  (front controller)
  │  1. require includes/config.php  → session_start(), constants, PDO, helpers
  │  2. sanitize `page` to [a-z0-9_]           (blocks path traversal)
  │  3. if page not public → requireLogin()    (redirect to login)
  │  4. if POST and api/<page>.php exists → require it; exit
  │  5. else include pages/<page>.php          (fall back to dashboard)
  ▼
pages/<slug>.php  (server-rendered view)
  │  includes/header.php + sidebar.php + topbar.php + footer.php
  │  queries DB directly with getDB(), renders HTML
  ▼
HTML → Browser → assets/js/app.js (progressive enhancement)
```

Key points:

- **Routing is file-based.** `?page=attendance` maps to `pages/attendance.php` and, for
  POST, to `api/attendance.php`. The whitelist regex in `index.php` is the primary
  traversal guard.
- **GET renders, POST mutates.** Pages do reads and render forms; `api/*.php` scripts handle
  submissions, then `header('Location: ...')` redirect back (Post/Redirect/Get) with a
  `&msg=` / `&error=` param.
- **No REST/JSON API** in general — API scripts return redirects. A few endpoints
  (`payroll_run` `toggle_include`, `notifications`) return JSON for `fetch()` calls.

### Directory map

```
payrollandbenefits_php/
├── index.php               Front controller / router
├── schema.sql              Full database schema + seed data
├── includes/
│   ├── config.php          DB connection, auth, CSRF, payroll math, schema bootstrap
│   ├── header.php          <head>, opens .app-layout
│   ├── sidebar.php         Role-aware navigation (Finance section gated)
│   ├── topbar.php          Top bar + notifications
│   ├── footer.php          Closes layout, loads app.js
│   └── claim_upload.php    Receipt upload/validation helper
├── pages/                  Server-rendered views (one per nav item)
├── api/                    POST handlers (same name as page slug)
├── assets/
│   ├── css/style.css       Single global stylesheet
│   └── js/app.js           Single global vanilla-JS bundle
├── storage/receipts/       Claim receipts (`.htaccess` blocks direct web access)
└── migrations/, scratch/   Seed SQL + dev/debug scripts (not runtime)
```

---

## 3. Data Layer

### Connection
- `getDB()` in `config.php` returns a **static singleton PDO** with `ERRMODE_EXCEPTION`,
  `FETCH_ASSOC`, and `EMULATE_PREPARES=false` (real prepared statements).
- Credentials are hardcoded constants (`localhost` / `root` / empty password) — local XAMPP
  dev setup, not production config.

### Tables by module

| Module | Tables |
|---|---|
| Identity & access | `users`, `audit_log`, `notifications` |
| Core HR | `employees`, `departments`, `salary_history` |
| Workforce Management | `attendance_logs`, `shift_schedules`, `timesheets`, `leave_requests`, `leave_balances` |
| Performance & Development | `performance_ratings`, `competency_assessments`, `training_records`, `recognition_awards` |
| Recruitment & Onboarding | `recruitment_pipeline` |
| Payroll & Benefits | `payroll_runs`, `payroll_items`, `allowances`, `loans`, `claims`, `claim_categories`, `benefit_plans`, `benefit_enrollments`, `leave_conversions`, `thirteenth_month`, `ewallet_providers` |
| Financial Management (transaction core) | `finance_approvals`, `disbursement_records`, `general_ledger_entries`, `budget_allocations`, `cash_positions` |

Notable relationships:
- `payroll_items.payroll_run_id → payroll_runs.id` and `.employee_id → employees.id`
  — both `ON DELETE CASCADE`.
- `claims.employee_id → employees.id ON DELETE SET NULL`.
- Finance tables cascade from `payroll_runs`.
- `employees.id` is a `VARCHAR(20)` natural key (e.g. `emp-001`) referenced across modules.

### Runtime schema bootstrap
Schema evolution is **not** managed by versioned migrations. `config.php` defines idempotent
functions called on page/API load:

- `ensureFinanceApprovalSchema()` — creates the five finance tables, widens `payroll_runs` /
  `payroll_items` `status` ENUMs, seeds a default budget & cash row.
- `ensureHrmsIntegrationSchema()` — creates Workforce/Performance/Recruitment tables, adds
  `attendance_logs` / `payroll_items` columns via `SHOW COLUMNS`-guarded `ALTER TABLE`, then
  seeds sample rows when empty (`seedHrmsSampleData()`).
- `ensureManualClaimsSchema()` — collapses legacy `AI Review` claims to `Pending`.

Each uses a `static $ready` guard (runs at most once per request). The live schema can drift
from `schema.sql` and is reconciled lazily at runtime.

---

## 4. Authentication & Authorization

- **Session-based auth.** `loginUser()` verifies `users` via `password_verify()` (bcrypt);
  on success a minimal user array (`id, email, name, role, initials`) is stored in
  `$_SESSION['user']`.
- **Demo fallback:** if the hash check fails but the password is `password123`, login is
  accepted — a dev convenience that must be removed before production.
- **Gates:**
  - `requireLogin()` — enforced by `index.php` for all non-public pages (`login`, `register`
    are public).
  - `canApproveFinance()` / `requireFinanceApprovalAccess()` — finance roles (`Admin`,
    `Finance`, `Finance Officer`) only; protects finance actions and gates the "Finance
    Control" sidebar section.
- **CSRF:** per-session token; `verifyCsrf()` (timing-safe `hash_equals`) runs at the top of
  every POST handler.
- **Audit:** `auditLog(action, details)` writes user + IP to `audit_log`; failures are
  swallowed so logging never breaks a request.

> Role checks are applied at sensitive endpoints, not by universal middleware — most pages
> require *authentication* only, not a specific *role*.

---

## 5. HRMS Modules

### 5.1 Recruitment & Onboarding

- **Data:** `recruitment_pipeline` — candidates with `stage`
  (`Applied/Screening/Interview/Offered/Hired/Rejected`), `position_applied`, `department`,
  `applied_date`, `notes`. Seeded by `seedHrmsSampleData()`.
- **UI:** no dedicated page; the dashboard renders per-stage counts and candidate totals as
  an analytics widget.
- **Gaps:** no applicant CRUD, no onboarding workflow — this module is analytics-only.

### 5.2 Core HR

- **Data:** `employees` (master record: personal info, `department`, `position`,
  `employment_type`, `hire_date`, `basic_salary`, `status`, government IDs SSS/PhilHealth/
  Pag-IBIG/TIN, e-wallet payout fields), `departments`, `salary_history`.
- **Pages:**
  - `employees` — directory with search + department/status filters and headcount stats.
  - `employee_profile` — 360° view: current-month attendance days/OT, leave balance, latest
    performance rating, active allowances, loan balances, plus detailed rating history.
  - `register` / `api/register` — HR user self-registration into `users` (bcrypt-hashed).
- **Boundary:** `api/employees.php` is a **disabled stub** — it redirects with
  `error=readonly` ("Employee records are managed in Payroll & Benefits" / owned by Core
  HRMS). Create/update/delete employee master data is intentionally not available here.

### 5.3 Workforce Management

- **Data:** `attendance_logs` (per-employee daily `status` P/A/H/OT, `time_in/out`,
  `total_hours`, `late_minutes`, `undertime_minutes`, `ot_hours`), `shift_schedules`
  (`shift_type` Day/Mid/Night/Rest Day/Holiday, `night_diff_hours`, `holiday_hours`),
  `timesheets` (Draft/Submitted/Approved/Rejected), `leave_requests` (paid/unpaid, by type),
  `leave_balances`.
- **Pages:**
  - `attendance` — daily register for active employees with present/absent/OT stats, plus
    the day's shift assignments.
  - `leave_balance` — accrued/used/available credits by leave type.
  - Workforce analytics feed the dashboard (present/half/absent/OT days, OT hours).
- **Boundary:** `api/attendance.php` is a **disabled stub** (attendance is owned by the Time
  and Attendance module; the save logic below the redirect is dead code).
- **Payroll coupling:** `days_worked`/`ot_hours` come from `attendance_logs`;
  `shift_schedules` drive night-differential and holiday pay; **timesheets gate payroll
  eligibility** (submitted-but-not-approved ⇒ zero hours); unpaid `leave_requests` become a
  payroll deduction.

### 5.4 Performance & Development

- **Data:** `performance_ratings` (`rating`, `bonus_amount`), `competency_assessments`
  (`allowance_amount`), `training_records` (`incentive_amount`), `recognition_awards`
  (`bonus_amount`).
- **UI:** no dedicated page; latest rating + history surface on `employee_profile`, and
  rating distribution on the dashboard.
- **Payroll coupling:** in-period amounts from all four tables are earnings components in
  the payroll computation (performance bonus, competency allowance, training incentive,
  recognition bonus).
- **Gaps:** no competency/learning/succession workflows; data is sample-seeded.

---

## 6. Payroll & Benefits Module (core)

Sub-modules → implementation mapping:

| Sub-module | Pages | API handlers | Core tables |
|---|---|---|---|
| **Payroll Management** | `payroll_run`, `payslips`, `payslips_viewer`, `attendance` | `payroll_run`, `payslips_viewer`, `attendance` | `payroll_runs`, `payroll_items`, `leave_conversions` |
| **Compensation Management** | `compensation`, `tax`, `thirteenth_month` | `compensation`, `thirteenth_month` | `employees`, `salary_history`, `allowances`, `loans`, `thirteenth_month` |
| **Claims & Reimbursement** | `claims`, `submit_claim`, `claim_tracker` | `claims`, `submit_claim` | `claims`, `claim_categories` |
| **HMO & Benefits Administration** | `my_benefits`, `benefit_plans`, `leave_balance` | `my_benefits`, `benefit_plans` | `benefit_plans`, `benefit_enrollments`, `leave_balances` |
| **HR Analytics Dashboard** | `dashboard` | `notifications` | aggregates across modules |

### 6.1 Computation
Payroll math lives in `config.php` (server) and is **mirrored client-side** in `app.js` for
instant preview. The authoritative calc runs in `api/payroll_run.php` inside a DB transaction
on `recompute` / `submit_finance`.

**Earnings per employee (per period):**
1. Attendance → `days_worked` (P=1, OT=1, H=0.5) + `ot_hours`; approved timesheets gate
   eligibility (submitted-but-not-approved ⇒ zero hours).
2. `basic_pay = (basic_salary / 22) × days_worked`; `hourly = basic_salary / 22 / 8`.
3. `overtime_pay = hourly × 1.25 × ot_hours`.
4. `night_differential = hourly × 0.10 × night_hours`; `holiday_pay = hourly × 2 × holiday_hours`.
5. Active monthly **allowances**.
6. Approved **claims** + approved **leave conversions** in period.
7. **Performance / competency / training / recognition** bonuses (§5.4).

**Deductions:**
- Statutory EE share: `computeSSS`, `computePhilHealth` (2% of capped base), `computePagIBIG`.
- `computeWithholdingTax(gross, EE contributions)` — annualizes, applies Philippine TRAIN
  brackets, returns the monthly figure.
- **Loans** (monthly deduction), **unpaid leave** (prorated), **HMO** employee share from
  active `benefit_enrollments`.

`net_pay = gross_pay − total_deductions`. Run totals are recomputed with correlated `SUM()`
subqueries over included items.

### 6.2 State machine & finance controls
`payroll_runs.status` ENUM:

```
Draft → Pending Finance Approval → Approved → Paid → Closed
                 │                     │
                 ├── On Hold ──────────┤
                 └── Rejected ─────────┘   (On Hold / Rejected → return_to_draft)
```

Actions in `api/payroll_run.php` (all validated against current status):

- `toggle_include`, `recompute`, `set_pay_date`, `cancel_run` — Draft only.
- `submit_finance` — recomputes, sets `Pending Finance Approval`, upserts a
  `finance_approvals` row.
- `finance_decision` (finance role) — **Approved / Rejected / On Hold**. Approval is blocked
  unless `getPayrollFundingSnapshot()` confirms budget remaining ≥ gross **and** cash ≥
  net (reads `budget_allocations` + `cash_positions`).
- On **approval**: budget is committed, and **GL accrual** posts (§7).
- `mark_paid` (finance role) — requires `Approved`; locks latest `cash_positions` row
  `FOR UPDATE`, re-checks cash, writes a `disbursement_records` entry (ref `DISB-...`),
  decrements cash, posts GL settlement (§7).
- `close_payroll` (finance role) — `Paid → Closed`.

Multi-step writes run in transactions with rollback; errors surface via `?error=` redirect.

### 6.3 Payslips
`payslips` / `payslips_viewer` read `payroll_items` (included only) joined to `payroll_runs`,
with employee/period filters and a printable preview (print via `app.js`). Payout targets the
employee's `ewallet_provider` / `ewallet_account` on `employees`.

### 6.4 Compensation Management
- `compensation` — per-employee basic salary, effective-dated `salary_history`, active
  `allowances`, `loans` with monthly totals.
- **Incentives** — `incentive_structures` (8 types: Performance, Sales, Attendance,
  Productivity, Referral, Retention, Spot, Team; Fixed/Percentage rate; Monthly/Quarterly/
  Annual/One-Time frequency; optional target & eligibility) produce `incentive_earnings`
  per `YYYY-MM` period. Performance/Attendance/Retention auto-evaluate from
  `performance_ratings` / `attendance_logs` / `hire_date` via
  `POST /api/incentives/compute`; Sales/Productivity/Referral/Spot/Team are recorded from
  HR-entered actuals via `POST /api/incentives/metric` (Team splits the pot across the
  department). Earned amounts are claimed by the payroll run into
  `payroll_items.incentives`, included in gross (so withholding and SSS/PhilHealth/Pag-IBIG
  recompute), shown as a separate Earnings line on the payslip, marked Paid on
  disbursement, and released back on return-to-draft. Analytics via
  `GET /api/incentives/summary` (totals, by type/department, top earners, monthly trend).
- `tax` — projects SSS/PhilHealth/Pag-IBIG (EE & ER) and withholding tax per active employee
  using the same `compute*` helpers.
- `thirteenth_month` — annual pro-rated 13th-month computation with
  `Pending → Approved → Paid` lifecycle.
- Rate derivation (`daily = salary / 22`, `hourly = daily / 8`) is shared between server
  helpers and `app.js` (`computeRates`).

### 6.5 Claims & Reimbursement
Submission via `submit_claim` → `api/submit_claim.php`:
1. Validate category against `claim_categories.max_amount`; verify an active employee.
2. Store receipt via `claim_upload.php` into `storage/receipts/` (web access blocked by
   `.htaccess`).
3. Generate a unique `CLM<date><rand>` number; insert as `Pending`; audit-log.

Claims move `Pending → Approved/Rejected → Paid` through manual review (`claims`,
`claim_tracker`). **Approved claims are pulled into payroll as earnings.**

> `app.js` contains a legacy client-side `runClaimAI()` "auto-approval" simulation. The
> authoritative path is manual review; the `AI Review` status was migrated away.

### 6.6 HMO & Benefits Administration
- `benefit_plans` define premiums and employer/employee share; `benefit_plans` view manages
  the catalog.
- `benefit_enrollments` (view `my_benefits`) track per-employee active coverage; the
  **employee share** becomes the `hmo_deduction` in payroll.
- `leave_balance` (Workforce Management) shows leave credits. Cash conversions of leave are
  owned by Workforce Management; approved rows in `leave_conversions` still feed payroll as
  earnings, but there is no dedicated conversion page in this module.

### 6.7 HR Analytics Dashboard
`dashboard` aggregates across the suite in one server-rendered view:
- Headcount (total / active / on leave / resigned).
- Latest payroll run totals + employee contributions (SSS/PhilHealth/Pag-IBIG/tax).
- Payroll runs awaiting finance approval (count + net amount).
- Attendance summary, performance rating distribution, recruitment pipeline counts.

---

## 7. Financial Management System (transaction core)

Implemented at the payroll boundary; this module does not own these ledgers, it posts to and
checks them.

| Sub-module | Implementation |
|---|---|
| **Budget Management** | `budget_allocations` — read remaining (`allocated − committed`) before approval; commit gross pay on approval. |
| **Cash Management** | `cash_positions` — verify cash ≥ net before approval and before disbursement; decrement on payout (row locked `FOR UPDATE`). |
| **General Ledger** | `general_ledger_entries` — accrual on approval: debit `5010 Salaries & Wages Expense`; credit `2020 Withholding Tax Payable (BIR)`, `2030 SSS`, `2040 PhilHealth`, `2050 Pag-IBIG`, `2060 HMO` payables, `1080 Employee Loans Receivable`, and `2010 Payroll Payable (AP)` for net. Settlement on disbursement: debit `2010`, credit `1010 Cash in Bank - E-Wallet Disbursement Account`. |
| **Disbursement Management** | `disbursement_records` — one per run (`DISB-<runId>-<timestamp>`), `Processed/Failed`. |
| **Accounts Payable** | Represented by the `2010 Payroll Payable` liability lifecycle (accrue → settle). |
| **Accounts Receivable** | Represented by `1080 Employee Loans Receivable` (loan deductions recovered via payroll). |
| **Tax Management** | Withholding tax computed per TRAIN brackets; credited to `2020 Withholding Tax Payable (BIR)`; projected in the `tax` view. |
| **Collection Management** | Not implemented. |
| **Financial Reporting & Analytics** | Partial — the dashboard surfaces per-status finance approval counts/amounts; GL entries exist but no report views. |

**Finance approvals workflow:** `finance_approvals` tracks `submitted_by/at → reviewed_by/at
→ decision_notes` per run. The payroll run detail page (finance role only) shows the funding
snapshot (budget + cash sufficiency) and exposes the Approve / Reject / On Hold decision
actions; there is no standalone approvals queue page.

---

## 8. Frontend

- **Server-rendered HTML** with shared includes (`header`/`sidebar`/`topbar`/`footer`).
- One global stylesheet and one global script — no modules/bundler/framework.
- `app.js` is progressive enhancement only: toasts, modals, tabs, client-side table
  search/filter, e-wallet account validation, payslip printing, and **client-side mirrors**
  of payroll formulas for instant previews. All real writes go through the PHP API.

---

## 9. Cross-Cutting Concerns & Risks

- **Security:** prepared statements; routing whitelist; CSRF; bcrypt; receipts isolated from
  web root; output escaped with `htmlspecialchars`.
- **Observability:** `audit_log` records sensitive actions (user + IP).
- **Dev-only risks:**
  - Hardcoded DB credentials and the `password123` plaintext login bypass — remove before
    production.
  - Schema is mutated at request time via `ensure*Schema()` rather than versioned migrations,
    so `schema.sql` and the live DB can drift.
  - Dead CRUD code below the `readonly` redirects in `api/employees.php` / `api/attendance.php`
    — unreachable, but confusing; remove or restore intentionally.
  - A few status-update queries interpolate `$runId` directly into SQL (it originates from a
    DB lookup, but parameterization would be safer/consistent).
  - Authorization is enforced per-endpoint rather than centrally; a new sensitive page must
    remember to gate itself.
- **Module gaps vs. the target suite:** Recruitment, Learning/Succession, and Collections
  are stubs or absent; several HRMS tables hold sample-seeded data only.

---

## 10. Integration Readiness (implemented in the PHP JSON API)

The Payroll & Benefits module connects to the other suite modules through a dedicated
integration layer, so external systems can push data in and pull results out without
touching the human UI.

### 10.1 Machine-to-machine auth
- `integration_keys` table stores only the **SHA-256 hash** of each key; callers send the
  plaintext in an `X-Api-Key` header.
- Keys carry **scopes** (`core-hr:write`, `workforce:write`, `performance:write`,
  `finance:read`, or `*`); every integration route checks its scope
  (`src/IntegrationAuth.php`).
- Issuance: Admin-only REST (`POST /api/integration/keys`, plaintext shown once) or
  `scripts/create-integration-key.php` CLI. Revocation flips `is_active`; `last_used_at`
  gives per-key activity visibility. A dev/demo key (`demo-core-hr`) is seeded by
  migration `005_integration.sql`.

### 10.2 Inbound contracts (this system consumes)
| Source module | Endpoint | Payload | Conflict handling |
|---|---|---|---|
| Core HR | `POST /api/integration/employees` | `{employees:[{code, first_name, last_name, …}]}` | upsert by unique `code`; new rows get id `hris-<code>` |
| Workforce Management | `POST /api/integration/attendance` | `{logs:[{employee_id, log_date, status, actual_hours, ot_hours, nd_hours, holiday_hours, late_minutes}]}` | upsert on `(employee_id, log_date)` |
| Workforce Management | `POST /api/integration/leave` | `{requests:[{employee_id, leave_type, start_date, end_date, days, is_paid, status}]}` | insert |
| Performance & Development | `POST /api/integration/performance` | `{ratings:[{employee_id, review_date, rating, bonus_amount}]}` | insert |

Pushed data feeds payroll directly: attendance drives `days_worked`/OT/late deductions,
performance bonuses become earnings components, employee master data supplies salary and
payout targets. Unknown `employee_id` is rejected with a pointer to sync Core HR first.

### 10.3 Outbound contracts (this system provides)
- **Journal export** — `GET /api/integration/journal/{runId}` (scope `finance:read`) returns
  the payroll run with its `general_ledger_entries` and `disbursement_records`, the exact
  payload a Financial Management system needs to book accruals and settlements.
- **Webhook events** — `EventService::emit()` fires on `payroll.submitted`,
  `payroll.approved`, `payroll.rejected`, `payroll.paid`. Each registered
  `webhook_endpoints` row receives a JSON POST signed with
  `X-Signature: sha256=HMAC(body, secret)` and labeled `X-Event`. Delivery is best-effort
  (3 s timeout) and every event is persisted to `integration_events_log` for replay/debug.
- **Discovery** — `GET /api/integration/capabilities` (public) is a machine-readable
  manifest of everything above: consumed endpoints + required scopes, provided endpoints +
  event catalogue + auth model.

### 10.4 Readiness verdict per connected module
| Module | Connected via | Status |
|---|---|---|
| Core HR | employees push (in) | Ready — write API exists behind `X-Api-Key`; UI stays read-only by design |
| Workforce Management | attendance + leave push (in) | Ready |
| Performance & Development | ratings push (in) | Ready |
| Financial Management | journal pull + payroll webhooks (out) | Ready — GL/disbursement export and signed events |

Remaining gaps (acceptable for the current scope): no OAuth2/mTLS, no per-key rate limits,
webhook delivery has no automatic retry queue (events are logged for manual replay), and
Recruitment remains analytics-only.
