# HR3 ↔ HR4 Integration — HR4 Answers (Performance & Development hand-off)

Prepared: 2026-10-19 · Reply to "HR3 ↔ HR4 Integration Hand-off.docx" (Oct 15, @Jas)
Received from HR3: 5 proposed pull endpoints at `https://performance.mms-tmglt.com/api/integration/hr4/`
Status of HR3 endpoints when probed 2026-10-19: host reachable, paths return 404 (not built yet — matches HR3 to-do).

---

## HR4 connection details (for HR3 to push into HR4)

| Item | Value |
|---|---|
| Base URL (production) | `https://payroll.mms-tmglt.com` |
| Auth header | `X-Api-Key: ec4463df5ee5eea09d01ff907616caf9599b66e2d99221b2` |
| Key name / scope | `hr3-performance` / `performance:write` (payslip/journal/employees endpoints are NOT reachable with this key) |
| Content type | JSON, UTF-8 |
| Errors | `{"error":"..."}` with 401 (missing/bad key), 403 (wrong scope), 422 (validation), 404 |
| Discovery | `GET /api/integration/capabilities` (public) |

Share the key privately, same as HR1. Revocation is one click on our side; ask us if it leaks.

## Answers to HR3's 7 questions

**1. Pull or push?**
**Push.** HR4 has no scheduler to pull on a cycle; HR3 should POST each record to our existing endpoint **at the moment it is approved**:

```
POST https://payroll.mms-tmglt.com/api/integration/performance
X-Api-Key: <the key above>

{"ratings":[
  {
    "employee_id": "hris-E041",
    "review_date": "2026-10-05",
    "rating": "4.25 — Very Satisfactory",
    "bonus_amount": 0
  }
]}
→ {"ok":true,"saved":1}
```

Mapping from your `performance-ratings.php` sample:
| HR3 field | HR4 field |
|---|---|
| `employee_id` (`E041`) | `employee_id` → send as **`hris-E041`** (see Q2) |
| `approved_at` (`2026-10-05 14:30:00`) | `review_date` → date part only, `YYYY-MM-DD` |
| `final_score` + `rating_label` | `rating` (single free-text; send both together as shown) |
| — | `bonus_amount` → send `0`; peso value is HR4's decision, matching your "points not money" rule |
| `period`, `reference`, `approved_by` | ⚠️ not persisted by our current endpoint — see dedupe note below |

⚠️ **Dedupe:** our endpoint INSERTs on every push and does not store your `reference`. Push each rating once, after final approval. If you need replay safety, tell us and we'll add reference-based upsert as a small change.
ℹ️ A quarterly pull (`?period=`) would require building an HR4 cron job — happy to add later if push doesn't suit your flow.

**2. Which employee ID does HR4 use?**
Yes — we key off the HR1 ID. Our `employees.code` stores your `E041` verbatim (HR1's sync populates it; already live with HR1). Our internal row id is `hris-<CODE>` (legacy demo rows use `emp-###`). For integration, **use `hris-E041`** in the `employee_id` field. If you'd rather send plain `E041`, request it — we can add code resolution to the endpoint (small change). Note: pushes for employees HR4 doesn't have yet will fail the foreign-key check — employee master must arrive from HR1 first.

**3. Rating scale for Compensation Planning?**
Send **both** (number + label), combined into the `rating` text as above. HR4 has **no fixed rating-to-increase table**; merit increases and performance bonuses are configured per-employee in HR4 (allowances + incentive structures), so HR3 does not need to match any scale. Keep whatever internal scale you like.

**4. Are recognition awards paid in cash?**
**Yes** — HR4 pays awards through payroll (allowance/incentive lines), and HR4 sets the points→cash rate, consistent with your design. Keep the endpoint. However HR4 has **no inbound recognition endpoint yet**; when your side is built, ask us and we'll add `POST /api/integration/recognition` (would store your `reference` for dedupe). Not needed for the Q3 pilot.

**5. After a promotion, who updates position and pay grade?**
Split, matching HR1 ownership: **HR1 updates the position** in the employee master (and syncs it to HR4 via the existing employees push); **HR4 updates pay grade/salary** internally (`basic_salary`). HR3's `promotions.php` record is the trigger that HR1/HR4 act on — HR3 doesn't update either system directly.

**6. Does HR4 handle training reimbursement claims?**
**Yes** — Claims & Reimbursement in HR4 (employee self-service filing, receipt OCR, HR approval). Employees file the claim in HR4; your `training-completions.php` is useful as proof material. Nice-to-have for later: an HR3→HR4 link on the claim record. No integration needed for go-live.

**7. Which numbers does the HR4 Analytics Dashboard need from HR3?**
Not wired yet — the HR4 dashboard currently computes payroll/attendance KPIs internally. From your `analytics-summary.php` we'd want exactly what you already planned, department-level and name-free: **headcount evaluated, average score, rating distribution, promotion-ready count, training completion rate**, per quarter. Park for phase 2; we'd build an ingestion + widget then. No action needed now.

## To-do from HR4's side (updated)
- [x] Answered the 7 questions
- [x] Confirmed employee ID convention: HR1 ID in `code`; push uses `hris-<ID>`
- [x] API key issued for HR3 (`hr3-performance`, scope `performance:write`)

## 2026-10-20 status log — key rotation + live verification

- Push key rotated: `hr3-performance` (ec44…) REVOKED after HR3 deployed `hr3-performance-v2` (773c…) — HR3's Jasmine confirmed the switch on the same day.
- Pull direction: HR3 production key stored in `laravel-backend/.env` as `HR3_API_KEY` (staging key `6a60…` and its 401s superseded). All five HR3 endpoints verified **200 with live data** 2026-10-20.
- Live response shapes differ from the original proposal (recorded here so phase-2 ingestion matches reality):
  - `performance-ratings.php`: `{"data":[{evaluation_id, employee:{hr1_employee_id, employee_number, name, email, hris_employee_id}, period:"Q3 2026", department, score_raw, score_5, rating(int), rating_label, finalized_at}]}` — no `reference`; dedupe must use `evaluation_id`.
  - `promotions/recognition/training/analytics`: paginated (`page, per_page, has_more, next_since`); recognition uses `recognition_id`, points/tier; analytics is dept-level name-free with `evaluations_approved, employees_evaluated, avg_score`.
  - Employees identify with BOTH HR3-internal id (`E041`) and HR1 number (`hr1_employee_no: E075`) — HR4 always uses the HR1 one.
- HR3 push builder confirmed: sends exactly `{"ratings":[{"employee_id":"hris-E075","review_date":"<finalized date>","rating":"<score_5> — <rating_label>","bonus_amount":0}]}`; ID mapped from HR1 employee number only; their `?employee_id=` param now accepts HR1 numbers only.
- Joint test queue: HR1 syncs Kyle (→ `hris-E075`) → HR3 pushes his 2026-Q3 rating ("3.37 — Good") once → HR4 confirms ingestion + echoes stored row. HR4 offered to pre-seed Kyle's row to unblock the test before HR1's sync.

## 2026-10-20 JOINT TEST — PASSED ✅
- HR4 pre-created Kyle (option 1): `code=E075`, internal id **`hris-e075`** (integration lowercases codes — HR3 must push lowercase), `basic_salary=10770` placeholder (NOT NULL constraint; salary stays HR1↔HR4).
- HR3 pushed Kyle's 2026-Q3 rating once to `POST /api/integration/performance` with v2 key → stored row: `id=16 | hris-e075 | 2026-10-04 | "3.37 — Good" | bonus 0`. No duplicates.

## 2026-10-20 BATCH PUSH OF 10 APPROVED EVALUATIONS — VERIFIED & COMPLETED ✅
- HR3 opened push for all approved Q3 evaluations.
- Initial push ingested 7 ratings (`hris-e069`, `hris-e073`, `hris-e079`, `hris-e010`, `hris-e059`, `hris-e025`, `hris-e080`).
- Schema hotfix: PostgreSQL `performance_ratings.rating` was originally `VARCHAR(20)`. The 3 ratings with longer labels (`2.53 — Needs Improvement` [24 chars], `1.69 — Unsatisfactory` [21 chars], `2.29 — Needs Improvement` [24 chars]) exceeded 20 chars. Column altered to `VARCHAR(100)` (migration `006_expand_rating_column.sql`).
- All 10 expected ratings + Kyle (#31) are fully stored and verified in HR4:

| Stored ID | Employee ID | Employee Name | Review Date | Final Rating | Bonus | Status |
|---|---|---|---|---|---|---|
| 16 | `hris-e075` | Kyle Martinez | 2026-10-04 | 3.37 — Good | 0 | Test #31 (already sent) |
| 17 | `hris-e069` | John Reyes | 2026-10-04 | 3.70 — Good | 0 | Verified |
| 18 | `hris-e073` | Kent Cruz | 2026-10-13 | 3.55 — Good | 0 | Verified |
| 19 | `hris-e079` | Nicole Fernandez | 2026-10-13 | 3.75 — Good | 0 | Verified |
| 20 | `hris-e010` | David Fernandez | 2026-10-13 | 3.49 — Good | 0 | Verified |
| 21 | `hris-e059` | Dennis Ocampo | 2026-10-13 | 3.71 — Good | 0 | Verified |
| 22 | `hris-e025` | Christine Go | 2026-10-13 | 3.69 — Good | 0 | Verified |
| 23 | `hris-e080` | Paolo Reyes | 2026-10-13 | 4.82 — Outstanding | 0 | Verified |
| 24 | `hris-e020` | Brian Tan | 2026-10-03 | 2.53 — Needs Improvement | 0 | Verified |
| 25 | `hris-e071` | Mark Santos | 2026-10-14 | 1.69 — Unsatisfactory | 0 | Verified |
| 26 | `hris-e019` | Angela Santos | 2026-10-14 | 2.29 — Needs Improvement | 0 | Verified |

## 2026-10-20 HAND-OFF COMPLETE & NEXT STEPS
- **Performance Rating Integration Status:** COMPLETED & LIVE ✅
- **HR3 Ingestion Retry Improvement:** HR3 implemented an automatic ~24-hour retry window for rejected pushes (e.g. if an employee is newly hired and pending HR1 sync). Once HR1 syncs or HR4 pre-creates the employee, the queued evaluation lands automatically without manual re-triggering.
- **Next Phase:**
  - `POST /api/integration/recognition` — To receive approved recognition awards and bonus lines.
  - Promotions hand-off — Position updates stay with HR1; compensation adjustments handled in HR4.

## 2026-10-20 batch push result (10 ratings)
- `rating` column is VARCHAR(100) via migration `006_expand_rating_column.sql` — combined "score — label" text fits comfortably.
- Batch arrived: 13 rows for the 10 employees → **e019, e020, e071 were double-sent** despite once-per-record claims; HR4 deleted the 3 later duplicates. Steady state: 11 unique ratings (Kyle + 10), one row each, all bonus 0.
- Likely cause: HR3's new ~24h retry window re-firing rows that had actually succeeded. HR3 to audit outbox sent-marking.
- HR1 full active-roster sync requested by HR3 — hand-creation of employees ends after that.

## 2026-10-20 HR1 bulk sync landed — CRITICAL salary issue + HR3 endpoint upgrades
- HR1 synced 73 `hris-*` employees (their report: 74/0 failures; we count 73 non-archived hris rows, 91 active total incl. legacy demo rows). 49 still carry `@hr1.local` placeholder emails (HR1 to re-sync).
- ⚠️ **HR1 pushed `basic_salary` 0/missing, wiping our seeded salaries: 71 of 73 hris employees now have `basic_salary = 0.00`** (incl. Kyle 10,770 → 0). HR4 endpoint hardened: updates now ignore zero/missing salary (COALESCE keeps existing); new records default 0. **Real salaries must come from HR1 re-push or HR re-entry before any payroll run** — otherwise every synced employee computes ₱0.
- Migration `010_hr3_dedupe_recognition.sql` (applied to shared DB): `performance_ratings.evaluation_ref` + `recognition_awards.recognition_ref/tier/points`, both with partial UNIQUE indexes.
- `/api/integration/performance`: now accepts optional `evaluation_id` (dedupe: duplicate pushes return `skipped_duplicates`, unknown fields ignored), validates employee existence (422 instead of FK 500).
- New `POST /api/integration/recognition` (scope `performance:write`, same HR3 key): `{"awards":[{employee_id, award, approved_at|award_date, recognition_id?, tier?, points?, basis?, bonus_amount?(default 0)}]}` → once-per-`recognition_id` dedupe, 422 on unknown employee. Capabilities manifest updated.
- Verified locally (dev :8090, sentinel ids 990001–990004, cleaned up after; 11 real HR3 ratings untouched): push1 save → push2 skip; UTF-8 em dash payloads OK; legacy payloads without evaluation_id still save.
- ✅ Deploy status (2026-10-22): ALL live on Render prod — verified by probes: capabilities lists recognition, `/api/integration/recognition` validates (422 on empty), `evaluation_id` dedupe enforced, and HR2's `is_paid:false` leave insert now returns 200. Deploy all-clear sent to partners.



## 2026-10-23 eval-52 confirmation + promotions build + full legacy-id export
- **Evaluation 52 (emp-002 resend): STORED ✅** — row `performance_ratings.id=33`, `evaluation_ref=52`, `review_date=2026-10-23`. Your client-side identity fix (E001→emp-002 before push) landed it with no HR4 deploy needed.
- **E019 recognition award: NOT YET RECEIVED** — no `recognition_awards` rows for `hris-e019` (max award id still 24, count 22). `hris-e019` (Angela Santos) is active, so the endpoint will accept it on arrival — send it and we'll echo back the stored fields.
- **Promotions endpoint: BUILT + locally tested, awaiting deploy** — `POST /api/integration/promotions` (scope `performance:write`), body `{"promotions":[...]}`. Required `employee_id, to_position, approved_at`; optional `from_position, readiness, effective_date (nullable — matches your null effective_date), promotion_id`. `promotion_id` = your succession-plan id and our dedupe key. Migration `011_promotion_records.sql` applied to shared DB. Verified on dev :8090: insert→`saved:1`, re-send→`skipped_duplicates:1`, unknown employee→422 (sentinel 990005 + throwaway key cleaned up; no test rows left). Prod URL goes live on the next deploy — will echo a live probe before you push.
- **FULL legacy-id export (the last one):** among HR1-roster codes, the **only** code whose id is not `hris-<lowercase>` is **`E001 → emp-002`**. So your fallback map is exactly `{ "E001": "emp-002" }`; every other `E###` uses `hris-e###`. Ignore the demo `EMP-2026-0NN → emp-0NN` rows — not in your feed, never reference them. Heads-up: `emp-019` is Ronaldo Lim, NOT Angela Santos — don't route E019 awards there.

## 2026-10-23 promotions LIVE on prod + E019 recognition not received
- **Promotions endpoint is LIVE on Render prod** — verified by a real prod round-trip: POST /api/integration/promotions → `{saved:1}`, immediate re-send → `{skipped_duplicates:1}`, then the probe row (promotion_id 990099) and the temporary probe key were both deleted (0 residue; promotion_records back to 0). Prod capabilities manifest lists the endpoint. Ready for Jasmine's one-employee pilot.
- **E019 recognition NOT received** — no `recognition_awards` row for `hris-e019`, and no `Recognition Sync` audit event since 2026-10-22 01:52 (the earlier paused pilot; its rows are gone). Their "sent once" push did not reach us. Asked them to confirm HTTP status + response body and re-send.

## 2026-10-23 HR3 pilot echo-back
- **Recognition: LANDED** — 3 awards for `hris-e080` (Paolo Reyes, Finance Associate): recognition_id 20 "Top Performer" Gold/500 (2026-10-13), 21 "Perfect Attendance" Gold/100 (2026-10-13), 22 "Successor Designate" Standard/100 (2026-10-23). E019 (Angela Santos) correctly never sent (no approved award).
- **Promotions: NOT received** — promotion_records is empty; the only Promotion Sync events today were my own cleanup probe (deleted). Asked Jasmine to confirm the HTTP response and resend.

## 2026-10-23 promotions "200" but nothing stored — diagnostic
- Jasmine reported a 200 for the hris-e080 promotion (Finance Associate → Senior Finance Associate, readiness "12+ months", effective_date null), but promotion_records is empty and there is NO Promotion Sync audit event after our own probe. Endpoint confirmed live/healthy (GET→405, POST no-key→401, bad-key→401). A genuine 200 from us always returns `{"ok":true,"saved":N,"skipped_duplicates":M}` + writes a row + logs. Conclusion: their 200 did not come from a successful call to /api/integration/promotions. Asked for exact response body + URL/method.
- Recognition "all approved" batch: still only hris-e080 ids 20/21/22 in DB; broader batch not yet arrived.

## 2026-10-23 HR3 pilots COMPLETE (11:38 UTC batch landed)
- **Promotion stored:** hris-e080 Paolo Reyes, Finance Associate → Senior Finance Associate, readiness "12+ months", effective_date null, approved_at 2026-10-23, **promotion_id 56**.
- **Recognition stored (full set now 5):** e069 John Reyes Perfect Attendance Gold/100 (id 18, 2026-10-04); e075 Kyle Martinez Learning Champion Standard/50 (id 19, 2026-10-10); + Paolo's 20/21/22. Matches HR3's "5 approved awards total."
- Their pre-11:38 UTC sends never reached us; the 11:38:02–06 batch did (2 Recognition Sync + 1 Promotion Sync, all saved:1). Dedupe on ids intact.
