# HR1 Integration — Notes & JSON Contracts (HR4 Payroll & Benefits side)

Prepared: 2026-10-18
Status: **BLOCKED on HR1 API key** — see §1.

---

## 1. Test result of the HR1 endpoint (as provided by the HR1 team)

**Endpoint under test**

```
GET https://recruitment.mms-tmglt.com/api/v1/employees
Header: X-API-Key: hr1_KXsgG1ju...JwE   (full key held out of this file on purpose)
```

**Result: HTTP 401 Unauthorized** — the server is reachable and the endpoint exists, but the key is rejected.

```json
{"success": false, "message": "Invalid or rejected API key.", "errors": {}}
```

Auth header variants tested (all from our side, 2026-10-18):

| Header tried | Response |
|---|---|
| `X-API-Key: <key>` (as documented) | 401 `Invalid or rejected API key.` |
| `x-api-key` / `X-Api-Key` / `X-API-KEY` (case variants) | 401 same — header IS recognized, key is not |
| `Authorization: Bearer <key>` | 401 `Invalid or expired API token.` (endpoint also supports bearer tokens) |
| `Authorization: ApiKey <key>` | 401 `Authentication required.` |

**Conclusion for the HR1 team:** the `X-API-Key` header name is correct; the key itself is invalid, expired, or issued for another environment. Please re-issue/activate the key and confirm the environment. Also note the response advertises `www-authenticate: Bearer realm="HR1 API"` — if a Bearer token is the intended mechanism, send updated docs.

Server fingerprint: Cloudflare-fronted, `x-powered-by: PHP/8.2.34`, HostForge routing.

---

## 2. HR1 → HR4: Employee JSON (their response format, as documented)

```json
{
  "success": true,
  "message": "Employees retrieved successfully.",
  "data": [
    {
      "id": 18,
      "employee_no": "E001",
      "first_name": "Maria",
      "last_name": "Santos",
      "full_name": "Maria Santos",
      "email": "e001@hr1.local",
      "department_id": 10,
      "position_id": 8,
      "position_name": "Merchandiser",
      "job_title": "Merchandiser",
      "employment_type": "regular",
      "hire_date": "2021-06-24",
      "status": "active"
    }
  ]
}
```

`employee_no` is the unique identifier we will map to HR4's `employees.code` (upsert key; new records get internal id `hris-<code>`).

### Field mapping (HR1 → HR4)

| HR1 field | HR4 field | Notes |
|---|---|---|
| `employee_no` | `code` | **Required.** Unique upsert key |
| `first_name` | `first_name` | **Required** |
| `last_name` | `last_name` | **Required** |
| `full_name` | — | Ignored; HR4 composes it |
| `email` | `email` | Optional |
| `department_id` | `department` | ⚠️ HR4 stores the department **name** (e.g. `Operations`), not an id. HR1 must send a department name — please expose `department_name` or an id→name map |
| `position_name` / `job_title` | `position` | Use `position_name` |
| `employment_type` | `employment_type` | HR4 values: `Regular`, `Probationary` (Title-case) |
| `hire_date` | `hire_date` | `YYYY-MM-DD` |
| `status` | `status` | HR4 values: `Active`, `Probationary`, `On Leave`, `Resigned` (Title-case). Payroll includes `Active` employees |
| `id` | — | Ignored (HR1-internal) |

### Not supplied by HR1's current payload — required for payroll, needed from HR1 (or Core HR flow)

- **Compensation** — see §3 (`basic_salary`)
- Government IDs: `sss`, `philhealth`, `pagibig`, `tin`
- Payout: `ewallet_provider`, `ewallet_account`, `ewallet_name` (or bank account)
- Extras: `middle_name`, `suffix`, `mobile`, `birth_date`, `gender`

---

## 3. HR4 inbound contract: Employee + Employee Compensation payload

HR1 pushes into HR4 (this is the integration path that already exists on our side).

```
POST {HR4_BASE}/api/integration/employees
Header: X-Api-Key: <key issued by HR4 admin>     # separate from the HR1 key
Header: Content-Type: application/json
```

Combined employee master + compensation record shape (per record):

```json
{
  "employees": [
    {
      "code": "E001",
      "first_name": "Maria",
      "middle_name": "Lourdes",
      "last_name": "Santos",
      "suffix": null,
      "email": "maria.santos@trilogistics.com",
      "mobile": "09171234501",
      "birth_date": "1990-04-12",
      "gender": "Female",
      "department": "Operations",
      "position": "Merchandiser",
      "employment_type": "Regular",
      "hire_date": "2021-06-24",
      "status": "Active",

      "basic_salary": 30000.00,

      "sss": "12-3456789-0",
      "philhealth": "12-345678901-2",
      "pagibig": "1234-5678-9012",
      "tin": "123-456-789-000",

      "ewallet_provider": "GCash",
      "ewallet_account": "09171234501",
      "ewallet_name": "Maria L. Santos"
    }
  ]
}
```

**Employee compensation fields:**

| Field | Type | Meaning in HR4 |
|---|---|---|
| `basic_salary` | number | Monthly basic pay. Drives the flat `15 days × daily rate (basic ÷ 21.75…)` per semi-monthly cut-off, OT/night/Holiday bases, 13th-month, and statutory computations. Upserted directly on the employee row; full history is kept in `salary_history` via our admin API |

Compensation add-ons that are **not** part of this endpoint (managed in HR4 by HR admins): allowances (`POST /api/employees/{id}/allowances`), loans (`POST /api/employees/{id}/loans`), incentive structures (`POST /api/incentives`). If HR1 has authoritative allowance/loan data, tell us and we'll agree a separate contract.

**Responses:**

- `200` → `{"ok": true, "pushed": <n>, "created": <new record count>}`
- `422` → body not `{"employees":[...]}`, or a record missing `code` / `first_name` / `last_name`
- `401` → missing/revoked `X-Api-Key`; `403` → key lacks scope `core-hr:write`

**Behaviour:** upsert by `code`. Only fields present and non-empty are updated (missing fields are left untouched), so partial pushes for compensation only (e.g. just `code`, `first_name`, `last_name`, `basic_salary`) are valid.

---

## 4. Open questions for the HR1 team

1. Re-issue the API key (current one returns 401) and confirm header (`X-API-Key`) vs Bearer token.
2. Can `GET /api/v1/employees` include `department_name`, `basic_salary` (or a `/compensation` sub-resource), government IDs, and payout details? Without `basic_salary` we cannot run payroll for HR1-sourced hires.
3. Is there incremental filtering (`?updated_since=` or `?status=active`) so we can sync deltas instead of full pulls?
4. Pagination format (`?page=`/`per_page`, or cursor)?
5. Is there a sandbox endpoint mirroring production response shape?

## 5. Our side (no code changed yet, per request)

Once HR1's key works, integration = pull from HR1 → transform per §2/§3 → `POST /api/integration/employees` with an HR4-issued key scoped `core-hr:write`. No scheduled sync job exists yet; initial load can be a one-shot script.

---

## 6. Answer to HR1: `GET /api/me/payroll-summary` is NOT available via API key (2026-10-18)

- `/api/me/*` are employee self-service routes requiring `Authorization: Bearer <user JWT>` (from `/api/auth/login` or `/api/auth/supabase`). The integration `X-Api-Key` only works on `/api/integration/*`.
- No `?employee_id=` param exists — the employee is derived from the token's linked employee record (one JWT = one employee).
- Sample response (exact field names; numbers arrive as strings; up to 24 rows):

```json
{ "data": [{
  "period": "2026-10-01 - 2026-10-15", "period_start": "2026-10-01", "period_end": "2026-10-15",
  "run_status": "Draft", "days_worked": "15.00", "ot_hours": "2.50",
  "basic_pay": "15796.00", "overtime_pay": "573.00", "night_differential": "0.00",
  "holiday_pay": "0.00", "allowances": "1000.00", "claims_amount": "0.00",
  "incentives": "0.00", "gross_pay": "17369.00",
  "sss_ee": "1000.00", "philhealth_ee": "900.00", "pagibig_ee": "450.00",
  "withholding_tax": "0.00", "loans_deduction": "0.00", "unpaid_leave_deduction": "0.00",
  "hmo_deduction": "0.00", "attendance_deduction": "0.00",
  "total_deductions": "2350.00", "net_pay": "15019.00",
  "pay_date": "2026-10-17", "statutory_basis": "semi-monthly"
}] }
```

- Per-cut-off salary field is `basic_pay` (not `basic_salary`/`monthly_basic_salary`).
- M2M alternative today: `GET /api/integration/journal/{runId}` (needs a key scoped `finance:read`) → GL entries + per-employee disbursements (`employee_id, amount, provider, reference_no, status, disbursed_at`).
- A full per-employee payslip endpoint over `X-Api-Key` does not exist yet; adding one requires an HR4 code change (to be requested/approved).

---

## 7. IMPLEMENTED 2026-10-18 — M2M payslip endpoints (live on dev; go live after Render redeploy)

HR1 answers incorporated: batch mode yes; only post-submission runs; `basic_salary` included.

```
GET  /api/integration/payslips/{employeeCode}?limit=24&period_start=YYYY-MM-DD
POST /api/integration/payslips/batch          {"codes":["E001","E002"],"limit":24,"period_start":"..."}
Header: X-Api-Key: f646174a395c15ab14fa6cd389ac64237c92bbe9e5975632   (name: hr1-ess-payslips, scope: payroll:read)
```

- `employeeCode` = your `employee_no`, matched against HR4 `employees.code`.
- Runs exposed: only `Paid` (HR1's "Submitted and Paid" — HR4's post-submission statuses are
  `Pending Finance Approval`/`Approved`/`Paid`/`Closed`; the filter includes all four, effectively
  showing employees only what has actually been released for payment).
- Response per employee:

```json
{
  "employee": { "id": "emp-001", "code": "E001", "name": "Maria Santos",
                "department": "Operations", "position": "Merchandiser",
                "status": "Active", "basic_salary": "30000.00" },
  "payslips": [ { "period": "...", "period_start": "...", "period_end": "...",
    "run_status": "Paid", "days_worked": "...", "ot_hours": "...", "basic_pay": "...",
    "overtime_pay": "...", "night_differential": "...", "holiday_pay": "...",
    "allowances": "...", "claims_amount": "...", "incentives": "...", "gross_pay": "...",
    "sss_ee": "...", "philhealth_ee": "...", "pagibig_ee": "...", "withholding_tax": "...",
    "loans_deduction": "...", "unpaid_leave_deduction": "...", "hmo_deduction": "...",
    "attendance_deduction": "...", "total_deductions": "...", "net_pay": "...",
    "pay_date": "...", "statutory_basis": "..." } ]
}
```

- Batch response: `{"ok":true,"employees":[ ...same shape... ],"not_found":["E999"]}` — max 100 codes/call.
- All numerics are **strings**. `statutory_basis` is a JSON string blob (may be ignored).
- Errors: 401 missing/invalid key, 403 key lacks `payroll:read`, 404 unknown code, 422 empty/oversized body.
- Verified 2026-10-18 against the shared dev/prod database: single, batch (incl. partial `not_found`), 404/403/401/422 all pass.
- ⚠️ Deploy note: the Render production backend serves these routes only after the next deploy of the `laravel-backend` change; the DB and both keys are already shared/live.

## 8. RESOLVED 2026-10-18 — the 404 was "unknown employee code", now live on prod

- Prod routing was fine all along: our 404 body is `{"error":"Unknown employee code E001."}` (routing 404 reads `{"error":"Unknown endpoint."}`). PowerShell surfaces both as "(404) Not Found" — read the JSON body to tell them apart.
- Root cause: E001 wasn't in our employee master. Fixed per owner decision: our Maria Santos record was re-coded `EMP-2026-002 → E001` (payslip history follows the record id, so her September payslip is now served under E001).
- Verified on `https://payrollandbenefits-backend.onrender.com/api/integration/payslips/E001` with the `payroll:read` key: **200**, `employee{...basic_salary:"10770.00"}` + one `run_status:"Paid"` payslip (gross 39,702.94 / net 33,409.35).
- For E002–E050: no name overlap with our demo roster, so those codes will be created cleanly when HR1 pushes their employee master via `POST /api/integration/employees` (their `core-hr:write` key). Their payslips will populate as payroll runs are submitted on our side.
