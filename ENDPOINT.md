# API Endpoints

All endpoints are served by the Laravel backend (`laravel-backend/routes/api.php`) under the `/api` prefix.

## Base URL

| Environment | Base URL | Notes |
|---|---|---|
| Production | `https://payroll.mms-tmglt.com` | Official production domain for HR4 (Payroll & Benefits) hosted on HostForge. |
| Local dev (Laravel) | `http://127.0.0.1:8090` | `php artisan serve` (current dev setup); the frontend proxies via `VITE_API_PROXY` in `frontend/.env.local` |
| Local dev (legacy php -S) | `http://127.0.0.1:8080` | Old `frontend/.env` `VITE_API_PROXY`; note the 120 s timeout of `php -S` when running payroll compute |

Example full URL: `{BASE}/api/integration/employees` → `http://127.0.0.1:8090/api/integration/employees` in dev.

Exception: the framework health probe `GET /up` is served at the domain root (no `/api` prefix).

Error contract: every failure returns JSON `{"error": "message", ...extra}` with the appropriate HTTP status (401/403/404/405/422/500/503).

## Authentication models

| Model | Header | Used by |
|---|---|---|
| None | — | Public endpoints |
| User JWT | `Authorization: Bearer <jwt>` (minted via `/api/auth/*`) | HR Admin + employee portal routes |
| Integration key | `X-Api-Key: <plaintext key>` (SHA-256 hashed at rest, scoped) | Machine-to-machine `/api/integration/*` pushes |

Roles: `HR` (HR Admin, `Auth::requireHrAdmin()`) and `Employee` (self-service, must have a linked employee record via `Auth::requireLinkedEmployeeId()`).

Integration scopes: `core-hr:write`, `workforce:write`, `performance:write`, `finance:read`, `payroll:read`, or `*`.

---

## 1. Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | DB connectivity + config health check (`status`, `database`, `pdo_drivers`, `supabase.*`) |
| GET | `/api/branding` | `{company_name}` |
| GET | `/api/integration/capabilities` | Machine-readable integration manifest (auth model, consumed/provided endpoints, event catalogue) |
| POST | `/api/auth/login` | Body `{email, password}` → JWT + user, or `{otp_required: true}` challenge (email 2FA code) |
| POST | `/api/auth/register` | Body `{email, username, password, registration_code, account_type, employee_code}` → 201 |
| POST | `/api/auth/supabase` | Body `{access_token, ...}` — exchange a Supabase (Gmail OTP) token for an app JWT |
| GET | `/up` | Laravel framework health probe (no `/api` prefix) |

## 2. Authenticated — any logged-in user

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/logout` | Audit the logout |
| GET | `/api/auth/me` | Current user |
| GET | `/api/notifications` | Latest 10 notifications + `unread` count |
| POST | `/api/notifications/read-all` | Mark all read |
| GET | `/api/claims/categories` | Claim category list |
| GET | `/api/claims/ocr-usage` | Receipt OCR provider + monthly usage vs free tier |

## 3. Employee self-service portal (`/api/me/*`, requires linked employee account)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/me/profile` | Own profile (SSS/PhilHealth/Pag-IBIG/TIN stripped) |
| GET | `/api/me/attendance?cutoff_start=&cutoff_end=` | Own cutoff summary + adjustment requests |
| POST | `/api/me/attendance/adjustments` | Request an attendance correction |
| GET | `/api/me/attendance/recent` | Last 5 attendance logs |
| GET | `/api/me/leave` | Own leave balances + requests (current year) |
| POST | `/api/me/leave/requests` | File a leave request |
| GET | `/api/me/announcements` | Latest announcement |
| POST | `/api/me/photo` | Body `{photo_base64, photo_mime}` — update profile photo |
| GET | `/api/me/claims` | Own claims list |
| POST | `/api/me/claims` | Body `{category, amount, claim_date, description?, receipt_base64?, receipt_mime?}` (receipt ≤ ~4 MB) |
| GET | `/api/me/benefits` | Available plans + own enrollments |
| POST | `/api/me/benefits/enroll` | Body `{plan_id, dependents?}` — enrolls as Pending |
| GET | `/api/me/payroll-summary` | Last 24 included, non-archived payslips |

## 4. HR Admin — audit, archive, settings, dashboard, announcements

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/audit` | Paginated/filterable audit log |
| POST | `/api/audit/reset` | Body `{password}` (confirm) — deletes all audit rows |
| GET | `/api/announcements` | Latest 50 |
| POST | `/api/announcements` | Body `{title, body}` |
| GET | `/api/archive` | Archived-record list |
| POST | `/api/archive/{id}/restore` | Restore one archived record |
| GET | `/api/settings` | All settings |
| PUT | `/api/settings` | Body `{...keys, password}` (confirm required) |
| GET | `/api/dashboard/summary` | Dashboard KPIs |

## 5. HR Admin — employees & master data

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/employees` | Employee directory |
| GET | `/api/employees/{id}` | One employee |
| GET | `/api/employees/{id}/profile` | 360° profile |
| POST | `/api/employees` | Create employee (201) |
| PATCH | `/api/employees/{id}` | Partial update |
| DELETE | `/api/employees/{id}` | Soft-archive (restorable via `/api/archive`) |
| POST | `/api/employees/{id}/salary` | Update salary (writes `salary_history`) |
| POST | `/api/employees/{id}/allowances` | Add allowance (201) |
| PATCH | `/api/allowances/{id}` | Update allowance |
| DELETE | `/api/allowances/{id}` | Delete allowance |
| POST | `/api/employees/{id}/loans` | Add loan (201) |
| PUT | `/api/loans/{id}` | Update loan |
| DELETE | `/api/loans/{id}` | Delete loan |
| GET | `/api/salary-history` | Last 200 salary changes |

## 6. HR Admin — incentives (compensation)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/incentives?employee_id=&period=&status=` | Structures + earnings + types/frequencies |
| POST | `/api/incentives` | Create incentive structure (201) |
| PUT | `/api/incentives/{id}` | Update structure |
| DELETE | `/api/incentives/{id}` | Delete structure |
| POST | `/api/incentives/compute` | Body `{period_start, period_end}` — compute earnings for period |
| POST | `/api/incentives/metric` | Body `{incentive_structure_id, period, value, note?}` — record metric |
| GET | `/api/incentives/summary` | Incentives summary |

## 7. HR Admin — payroll

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/payroll/runs` | List runs |
| GET | `/api/payroll/runs/{id}` | Run detail with items |
| POST | `/api/payroll/process` | Body `{period_start, period_end, reseed?, compute?, submit_to_finance?}` — open/compute/submit in one call (201). Compute takes ~3 min (run via CLI-friendly client) |
| POST | `/api/payroll/runs/{id}/compute` | Compute a run |
| POST | `/api/payroll/runs/{id}/preview` | Non-persisting compute preview |
| POST | `/api/payroll/runs/{id}/submit-to-finance` | Submit; emits `payroll.submitted` webhook |
| POST | `/api/payroll/runs/{id}/return-to-draft` | Return submitted run to draft |
| POST | `/api/payroll/runs/{id}/pay-date` | Body `{pay_date}` |
| POST | `/api/payroll/runs/{id}/import` | Body `{rows: [...]}` — bulk-import payroll items |
| POST | `/api/payroll/items/{id}/include` | Body `{payroll_run_id, is_included}` — toggle an item |
| GET | `/api/payroll/trend?range=30d` | Cost trend series |

## 8. HR Admin — claims

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/claims?employee_id=&status=` | Filtered list |
| GET | `/api/claims/{id}` | Claim detail |
| POST | `/api/claims/submit` | Body `{employee_id, category, amount, claim_date, description?, receipt_base64?, receipt_mime?}` (201; OCR on receipt) |
| POST | `/api/claims/{id}/decision` | Body `{status}` — approve/reject |
| DELETE | `/api/claims/{id}` | Soft-archive |

## 9. HR Admin — benefits

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/benefit-plans` | Active plans |
| GET | `/api/benefit-plans/all` | All plans incl. inactive |
| POST | `/api/benefit-plans` | Create plan (201) |
| PATCH | `/api/benefit-plans/{id}` | Update plan |
| DELETE | `/api/benefit-plans/{id}` | Delete plan |
| GET | `/api/benefits/enrollments?employee_id=` | Enrollment list |
| POST | `/api/benefits/enroll` | Body `{employee_id, plan_id, dependents?}` (201) |
| POST | `/api/benefits/enrollments/{id}/cancel` | Cancel enrollment |
| POST | `/api/benefits/enrollments/{id}/activate` | Approve a Pending application |
| DELETE | `/api/benefits/enrollments/{id}` | Soft-archive |

## 10. HR Admin — attendance

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/attendance/logs?employee_id=&start=&end=` | Daily logs |
| POST | `/api/attendance/logs` | Create/edit a log (HR-editable per cut-off) |
| DELETE | `/api/attendance/logs/{id}` | Delete a log |
| GET | `/api/attendance/timesheets?employee_id=&start=&end=` | Timesheets |
| POST | `/api/attendance/timesheets` | Save timesheet (201) |
| GET | `/api/attendance/daily?date=` | Attendance snapshot for one day |
| GET | `/api/attendance/summary?month=` | Monthly summary |
| GET | `/api/attendance/shifts?employee_id=&start=&end=` | Shift schedules |
| POST | `/api/attendance/shifts` | Save shift (201) |
| GET | `/api/attendance/cutoffs?cutoff_start=&cutoff_end=&employee_id=` | Cut-off computed attendance |
| POST | `/api/attendance/cutoffs` | Save cut-off |
| GET | `/api/attendance/adjustments?status=&employee_id=` | Adjustment requests |
| POST | `/api/attendance/adjustments` | Create adjustment request (201) |
| POST | `/api/attendance/adjustments/{id}/decision` | Body `{status, notes?}` |

## 11. HR Admin — leave

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/leave/balances?year=` | All balances |
| GET | `/api/leave/requests?year=` | All requests |
| POST | `/api/leave/requests` | File on behalf of employee (201) |
| POST | `/api/leave/requests/{id}/decision` | Body `{status}` |

## 12. HR Admin — employee login accounts

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/employee-accounts` | List login accounts |
| POST | `/api/employees/{id}/account` | Create login for employee (201) |
| PUT | `/api/employees/{id}/account` | Update account |
| DELETE | `/api/employees/{id}/account` | Deactivate account |

## 13. HR Admin — thirteenth month

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/thirteenth-month?year=` | List computations |
| POST | `/api/thirteenth-month/generate` | Body `{year?}` — generate (201) |
| POST | `/api/thirteenth-month/{id}/status` | Body `{status}` |

## 14. Integration — machine-to-machine (`X-Api-Key`, scoped)

| Method | Path | Scope | Batch key | Notes |
|---|---|---|---|---|
| POST | `/api/integration/employees` | `core-hr:write` | `{"employees":[...]}` | Upsert by unique `code`; new rows get id `hris-<code>`. Required per record: `code`, `first_name`, `last_name`. Optional: `middle_name, suffix, email, mobile, birth_date, gender, department, position, employment_type, hire_date, basic_salary, status, sss, philhealth, pagibig, tin, ewallet_provider, ewallet_account, ewallet_name`. Response `{ok, pushed, created}` |
| POST | `/api/integration/attendance` | `workforce:write` | `{"logs":[...]}` | Upsert on `(employee_id, log_date)`. Fields: `employee_id, log_date, status (P/H/A/OT), actual_hours, ot_hours, nd_hours, holiday_hours, late_minutes`. Unknown `employee_id` → 422. Response `{ok, saved}` |
| POST | `/api/integration/leave` | `workforce:write` | `{"requests":[...]}` | Insert. Fields: `employee_id, leave_type, start_date, end_date?, days?, is_paid? (default true), status? (Pending/Approved/Rejected, default Approved)`. Response `{ok, saved}` |
| POST | `/api/integration/performance` | `performance:write` | `{"ratings":[...]}` | Insert. Fields: `employee_id, review_date, rating?, bonus_amount?, evaluation_id?` (dedupe key). Response `{ok, saved, skipped_duplicates}` |
| POST | `/api/integration/recognition` | `performance:write` | `{"awards":[...]}` | Insert. Fields: `employee_id, award, basis?, tier?, points?, approved_at` (or `award_date`) `YYYY-MM-DD, recognition_id?` (dedupe key). Response `{ok, saved, skipped_duplicates}` |
| POST | `/api/integration/promotions` | `performance:write` | `{"promotions":[...]}` | Insert. Required: `employee_id, to_position, approved_at` (`YYYY-MM-DD`). Optional: `from_position, readiness, effective_date` (nullable), `promotion_id` (dedupe key = HR3 succession-plan id). Unknown `employee_id` → 422. Response `{ok, saved, skipped_duplicates}` |
| GET | `/api/integration/journal/{runId}` | `finance:read` | — | Payroll run + `journal_entries` (GL) + `disbursements` for Financial Management |
| GET | `/api/integration/payslips/{employeeCode}` | `payroll:read` | — | Per-employee payslips (only post-submission runs: `Pending Finance Approval`/`Approved`/`Paid`/`Closed`); query `limit` (default/max 24), `period_start`. Response `{employee:{id, code, name, department, position, status, basic_salary}, payslips:[...]}` with the same field names as `/api/me/payroll-summary`. 404 unknown code |
| POST | `/api/integration/payslips/batch` | `payroll:read` | `{"codes":["E001",...],"limit?","period_start?"}` | Same payload for up to 100 codes; returns `{ok, employees:[...], not_found:[...]}` |

### Outbound webhooks (HR4 → external systems)
- Events: `payroll.submitted`, `payroll.approved`, `payroll.rejected`, `payroll.paid`.
- Delivery: JSON POST to each matching `webhook_endpoints` row, headers `X-Event: <event>` and `X-Signature: sha256=HMAC(body, secret)`; best-effort (3 s timeout), every event persisted to `integration_events_log` for manual replay.

## 15. Integration admin (HR Admin, Bearer JWT)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/integration/keys` | List keys (name, scopes, active, last used) |
| POST | `/api/integration/keys` | Body `{name, scopes?}` → plaintext key shown ONCE (201) |
| DELETE | `/api/integration/keys/{id}` | Revoke (sets `is_active = FALSE`) |
| GET | `/api/integration/webhooks` | List webhook endpoints |
| POST | `/api/integration/webhooks` | Body `{name, event?, url, secret?}` — upsert by name, reactivates |
| DELETE | `/api/integration/webhooks/{id}` | Deactivate |

CLI alternative for key issuance: `php laravel-backend/scripts/create-integration-key.php <name> "[scopes]"`.

## Known gaps
- No scheduled pull-sync job exists (the `SYSTEM_DESIGN.md` daily HR1/HR3 sync is not implemented); integration is push-only.
- No OAuth2/mTLS, no per-key rate limits, no automatic webhook retry queue.
- `recruitment_pipeline` (HR3 analytics) is dashboard-only — no applicant CRUD API.
