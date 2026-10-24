<?php
declare(strict_types=1);

namespace App;

use PDO;
use RuntimeException;

/**
 * Payroll lifecycle: open a period, seed its line items, compute statutory pay,
 * and move the run through the Finance approval workflow.
 *
 * The computation mirrors the legacy PHP app exactly (same tables, same rates)
 * so figures reconcile across the two systems during migration.
 */
final class PayrollService
{
    public function __construct(private readonly PDO $pdo) {}

    public function listRuns(int $limit = 25): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM payroll_runs ORDER BY period_start DESC LIMIT ?');
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function findRun(int $runId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM payroll_runs WHERE id = ?');
        $stmt->execute([$runId]);
        $run = $stmt->fetch();
        $stmt->closeCursor();
        if ($run === false) {
            throw new RuntimeException("Payroll run {$runId} does not exist.", 404);
        }
        return $run;
    }

    /** Number of days salary must wait after Finance approval (company policy: 3). */
    public static function leadTimeDays(): int
    {
        return (int) SettingsService::num('payslip_lead_days', 3);
    }

    /** Earliest legal pay date for a run: Finance approval + the mandatory lead time. */
    public function earliestPayDate(array $run): ?string
    {
        if ($run['finance_approved_at'] === null) {
            return null;
        }
        return date('Y-m-d', strtotime((string) $run['finance_approved_at']) + self::leadTimeDays() * 86400);
    }

    /** Semi-monthly payday: the 15th or month-end, never a Sunday — moved to the day before. */
    public static function adjustedPayDate(string $nominal): string
    {
        $d = $nominal;
        while (date('w', strtotime($d)) === '0') {
            $d = date('Y-m-d', strtotime($d . ' -1 day'));
        }
        return $d;
    }

    /** Period label: whole month stays "October 2026"; halves get a First/Second Half suffix. */
    public static function periodLabel(string $start, string $end): string
    {
        $month = date('F Y', strtotime($start));
        if ((int) date('j', strtotime($start)) === 1 && $end === date('Y-m-t', strtotime($start))) {
            return $month;
        }
        return $month . ((int) date('j', strtotime($end)) <= 15 ? ' – First Half' : ' – Second Half');
    }

    public function getRun(int $runId): array
    {
        $run = $this->findRun($runId);
        $items = $this->pdo->prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? AND is_archived = FALSE ORDER BY department, employee_name');
        $items->execute([$runId]);
        $run['items'] = $items->fetchAll();
        $items->closeCursor();
        $run['earliest_pay_date'] = $this->earliestPayDate($run);

        $stmt = $this->pdo->prepare(
            'SELECT fa.*, u1.name AS submitter_name, u2.name AS reviewer_name
               FROM finance_approvals fa
               LEFT JOIN app_users u1 ON u1.id = fa.submitted_by
               LEFT JOIN app_users u2 ON u2.id = fa.reviewed_by
              WHERE fa.payroll_run_id = ?'
        );
        $stmt->execute([$runId]);
        $run['finance_approval'] = $stmt->fetch() ?: null;
        $stmt->closeCursor();

        $run['funding_snapshot'] = $this->fundingSnapshot($run);

        $stmt = $this->pdo->prepare('SELECT * FROM general_ledger_entries WHERE payroll_run_id = ? ORDER BY debit DESC, credit ASC');
        $stmt->execute([$runId]);
        $run['gl_entries'] = $stmt->fetchAll();
        $stmt->closeCursor();

        $stmt = $this->pdo->prepare(
            'SELECT reference_no, COUNT(*) AS lines, COALESCE(SUM(amount), 0) AS amount, MAX(disbursed_at) AS processed_at
               FROM disbursement_records WHERE payroll_run_id = ? GROUP BY reference_no
              ORDER BY processed_at DESC LIMIT 1'
        );
        $stmt->execute([$runId]);
        $run['disbursement'] = $stmt->fetch() ?: null;
        $stmt->closeCursor();

        return $run;
    }

    /** Mirrors getPayrollFundingSnapshot() in the legacy app's config.php. */
    public function fundingSnapshot(array $run): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT allocated_amount, committed_amount FROM budget_allocations
              WHERE department = 'ALL' AND period_start <= ? AND period_end >= ?
              ORDER BY period_end DESC LIMIT 1"
        );
        $stmt->execute([(string) $run['period_start'], (string) $run['period_end']]);
        $budget = $stmt->fetch() ?: ['allocated_amount' => 0, 'committed_amount' => 0];
        $stmt->closeCursor();

        $cash = $this->pdo->query('SELECT available_amount, as_of_date FROM cash_positions ORDER BY as_of_date DESC, id DESC LIMIT 1')->fetch()
            ?: ['available_amount' => 0, 'as_of_date' => null];

        $budgetRemaining = max(0.0, (float) $budget['allocated_amount'] - (float) $budget['committed_amount']);
        $cashAvailable = (float) $cash['available_amount'];

        return [
            'budget_allocated' => (float) $budget['allocated_amount'],
            'budget_committed' => (float) $budget['committed_amount'],
            'budget_remaining' => $budgetRemaining,
            'cash_available'   => $cashAvailable,
            'cash_as_of'       => $cash['as_of_date'],
            'budget_required'  => (float) ($run['total_gross'] ?? 0),
            'cash_required'    => (float) ($run['total_net'] ?? 0),
            'budget_sufficient' => $budgetRemaining >= (float) ($run['total_gross'] ?? 0),
            'cash_sufficient'   => $cashAvailable >= (float) ($run['total_net'] ?? 0),
        ];
    }

    /** Runs in the trailing window, for the payroll cost trend chart. */
    public function trend(string $range = '30d'): array
    {
        $modify = ['30d' => '-30 days', '3m' => '-3 months', '1y' => '-1 year'][$range] ?? '-30 days';
        $stmt = $this->pdo->prepare(
            'SELECT period, period_start, period_end, total_gross, total_deductions, total_net, status
               FROM payroll_runs WHERE period_end >= ? ORDER BY period_end ASC'
        );
        $stmt->execute([date('Y-m-d', strtotime($modify))]);
        return $stmt->fetchAll();
    }

    /** Opens (or resumes) a run for the period and seeds one line per active employee. */
    public function openRun(string $periodStart, string $periodEnd, bool $reseed = false): array
    {
        $this->assertDate($periodStart, 'period_start');
        $this->assertDate($periodEnd, 'period_end');
        if ($periodStart > $periodEnd) {
            throw new RuntimeException('period_start must be on or before period_end.');
        }

        $stmt = $this->pdo->prepare('SELECT * FROM payroll_runs WHERE period_start = ? AND period_end = ?');
        $stmt->execute([$periodStart, $periodEnd]);
        $run = $stmt->fetch();
        $stmt->closeCursor();

        $this->pdo->beginTransaction();
        try {
            if ($run === false) {
                $insert = $this->pdo->prepare(
                    'INSERT INTO payroll_runs (period, period_start, period_end, pay_date, status) VALUES (?, ?, ?, ?, \'Draft\') RETURNING *'
                );
                $insert->execute([
                    self::periodLabel($periodStart, $periodEnd), $periodStart, $periodEnd,
                    self::adjustedPayDate($periodEnd),
                ]);
                $run = $insert->fetch();
                $insert->closeCursor();
            } elseif ($reseed && $run['status'] !== 'Draft') {
                throw new RuntimeException('Only draft payroll runs can be reseeded.');
            }

            if ($reseed) {
                $this->pdo->prepare('DELETE FROM payroll_items WHERE payroll_run_id = ?')->execute([$run['id']]);
            }

            $seeded = $this->seedItems((int) $run['id'], $periodStart, $periodEnd);
            $this->recalculateTotals((int) $run['id']);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        AuditService::log('Payroll Run Opened', 'Payroll', null, [
            'run_id' => $run['id'], 'period' => "{$periodStart}..{$periodEnd}", 'seeded' => $seeded,
        ]);

        return $this->getRun((int) $run['id']);
    }

    private function seedItems(int $runId, string $start, string $end): int
    {
        $employees = $this->pdo->query(
            "SELECT id, first_name, last_name, department, basic_salary, ewallet_provider
               FROM employees WHERE status IN ('Active','On Leave') AND is_archived = FALSE ORDER BY department, last_name"
        )->fetchAll();

        // Resolved before inserting so no read cursor is open across the writes.
        $attendance = [];
        foreach ($employees as $emp) {
            $attendance[$emp['id']] = $this->attendanceFor((string) $emp['id'], $start, $end);
        }

        $exists = $this->pdo->prepare('SELECT 1 FROM payroll_items WHERE payroll_run_id = ? AND employee_id = ?');
        $insert = $this->pdo->prepare(
            'INSERT INTO payroll_items
                (payroll_run_id, employee_id, employee_name, department, days_worked, ot_hours,
                 ewallet_provider, status, is_included, pay_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, \'Draft\', TRUE, ?)'
        );

        $count = 0;
        foreach ($employees as $emp) {
            $exists->execute([$runId, $emp['id']]);
            $alreadyThere = (bool) $exists->fetchColumn();
            $exists->closeCursor();
            if ($alreadyThere) {
                continue;
            }
            [$days, $ot] = $attendance[$emp['id']];
            $insert->execute([
                $runId, $emp['id'], trim($emp['first_name'] . ' ' . $emp['last_name']),
                $emp['department'], $days, $ot, $emp['ewallet_provider'], self::adjustedPayDate($end),
            ]);
            $count++;
        }
        return $count;
    }

    /** @return array{0:float,1:float,2:float} days worked, OT hours and late minutes */
    private function attendanceFor(string $employeeId, string $start, string $end): array
    {
        // Cut-off based recording is the primary source: sum every cut-off row
        // that falls entirely inside the payroll period.
        $stmt = $this->pdo->prepare(
            'SELECT COALESCE(SUM(present_days + ot_days + half_days * 0.5), 0) AS days,
                    COALESCE(SUM(ot_hours), 0) AS ot,
                    COUNT(*) AS rows
               FROM attendance_cutoffs
              WHERE employee_id = ? AND cutoff_start >= ? AND cutoff_end <= ?'
        );
        $stmt->execute([$employeeId, $start, $end]);
        $cutoff = $stmt->fetch();
        $stmt->closeCursor();

        $late = $this->lateMinutes($employeeId, $start, $end);
        if ((int) ($cutoff['rows'] ?? 0) > 0) {
            $days = (float) ($cutoff['days'] ?? 0);
            return [$days, (float) ($cutoff['ot'] ?? 0), $late];
        }

        // Legacy daily logs (pre-revision history and external syncs).
        $stmt = $this->pdo->prepare(
            "SELECT COALESCE(SUM(CASE WHEN status IN ('P','L','OT') THEN 1 WHEN status = 'H' THEN 0.5 ELSE 0 END), 0) AS days,
                    COALESCE(SUM(ot_hours), 0) AS ot
               FROM attendance_logs WHERE employee_id = ? AND log_date BETWEEN ? AND ?"
        );
        $stmt->execute([$employeeId, $start, $end]);
        $row = $stmt->fetch();
        $stmt->closeCursor();
        $days = (float) ($row['days'] ?? 0);
        if ($days > 0) {
            return [$days, (float) ($row['ot'] ?? 0), $late];
        }
        // No attendance evidence: default to the month's work days prorated to
        // this period's length, so a half-month cut-off pays ~11 days, not 22.
        $span = (int) ceil((strtotime($end) - strtotime($start)) / 86400) + 1;
        $monthDays = max(1, (int) date('t', strtotime($start)));
        $default = round(SettingsService::num('work_days_per_month', 15) * min(1, $span / $monthDays), 1);
        return [$default, 0.0, 0.0];
    }

    private function lateMinutes(string $employeeId, string $start, string $end): float
    {
        $stmt = $this->pdo->prepare(
            'SELECT COALESCE(SUM(late_minutes), 0) FROM attendance_logs
              WHERE employee_id = ? AND log_date BETWEEN ? AND ?'
        );
        $stmt->execute([$employeeId, $start, $end]);
        $value = (float) $stmt->fetchColumn();
        $stmt->closeCursor();
        return $value;
    }

    /**
     * Recomputes every included line of a draft run.
     * When $persist is false the figures are returned but nothing is written,
     * which is what the React page uses for its "preview before running" step.
     */
    public function process(int $runId, bool $persist = true): array
    {
        $run = $this->findRun($runId);
        if ($persist && $run['status'] !== 'Draft') {
            throw new RuntimeException("Only draft payroll runs can be recomputed (current status: {$run['status']}).");
        }

        $stmt = $this->pdo->prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? ORDER BY department, employee_name');
        $stmt->execute([$runId]);

        $computed = [];
        $allItems = $stmt->fetchAll();
        $stmt->closeCursor();
        if ($persist) {
            $this->pdo->beginTransaction();
        }
        try {
            foreach ($allItems as $item) {
                if (!$item['is_included']) {
                    $computed[] = $item;
                    continue;
                }
                $line = $this->computeLine($item, (string) $run['period_start'], (string) $run['period_end']);
                if ($persist) {
                    $this->writeLine((int) $item['id'], $line, 'Draft');
                    // Claim this run's earned incentives so a recompute keeps them.
                    $claim = $this->pdo->prepare(
                        "UPDATE incentive_earnings SET payroll_run_id = ?
                          WHERE employee_id = ? AND status = 'Earned' AND payroll_run_id IS NULL AND period = ?"
                    );
                    $claim->execute([$runId, (string) $item['employee_id'], date('Y-m', strtotime((string) $run['period_start']))]);
                }
                $computed[] = array_merge($item, $line);
            }
            if ($persist) {
                $this->recalculateTotals($runId);
                $this->pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($persist) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        AuditService::log('Payroll Computed', 'Payroll', null, ['run_id' => $runId, 'persisted' => $persist]);
        return ['run' => $this->findRun($runId), 'items' => $computed];
    }

    /** @return array<string,float> every payable, deduction and net figure for one employee */
    private function computeLine(array $item, string $start, string $end): array
    {
        $empId = (string) $item['employee_id'];
        $scalar = function (string $sql, array $params): float {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $value = $stmt->fetchColumn();
            $stmt->closeCursor();
            return (float) ($value ?: 0);
        };

        $salary = $scalar('SELECT basic_salary FROM employees WHERE id = ?', [$empId]);
        $workDays  = SettingsService::num('work_days_per_month', 15);
        $workHours = SettingsService::num('work_hours_per_day', 8);
        $dailyRate  = $salary / $workDays;
        $hourlyRate = $dailyRate / $workHours;

        [$daysWorked, $otHours, $lateMinutes] = $this->attendanceFor($empId, $start, $end);

        // Company schedule (2026-10): each 1st–15th / 16th–month-end cut-off pays a
        // flat 15 days at the daily rate, regardless of the attendance-day count.
        $isFullMonth = (int) date('j', strtotime($start)) === 1 && $end === date('Y-m-t', strtotime($start));
        if (!$isFullMonth) {
            $daysWorked = 15.0;
        }

        // An external workforce system that has filed timesheets but approved
        // none of them holds the pay back for that period.
        $ts = $this->pdo->prepare(
            'SELECT COUNT(*) AS submitted, COALESCE(SUM(CASE WHEN status = \'Approved\' THEN 1 ELSE 0 END), 0) AS approved
               FROM timesheets WHERE employee_id = ? AND period_start <= ? AND period_end >= ?'
        );
        $ts->execute([$empId, $end, $start]);
        $timesheet = $ts->fetch();
        $ts->closeCursor();
        if ((int) ($timesheet['submitted'] ?? 0) > 0 && (float) ($timesheet['approved'] ?? 0) === 0.0) {
            $daysWorked = 0.0;
            $otHours = 0.0;
            $lateMinutes = 0.0;
        }

        $shift = $this->pdo->prepare(
            'SELECT COALESCE(SUM(night_diff_hours),0) AS night_hours, COALESCE(SUM(holiday_hours),0) AS holiday_hours
               FROM shift_schedules WHERE employee_id = ? AND schedule_date BETWEEN ? AND ?'
        );
        $shift->execute([$empId, $start, $end]);
        $shiftRow = $shift->fetch();
        $shift->closeCursor();

        $period = [$empId, $start, $end];
        $line = [
            'days_worked'          => $daysWorked,
            'ot_hours'             => $otHours,
            'basic_pay'            => round($dailyRate * $daysWorked, 2),
            'overtime_pay'         => round($hourlyRate * 1.25 * $otHours, 2),
            'night_differential'   => round($hourlyRate * 0.10 * (float) $shiftRow['night_hours'], 2),
            'holiday_pay'          => round($hourlyRate * 2 * (float) $shiftRow['holiday_hours'], 2),
            'allowances'           => $scalar(
                "SELECT COALESCE(SUM(amount),0) FROM allowances
                  WHERE employee_id = ? AND is_active = TRUE AND frequency = 'Monthly'
                    AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)",
                [$empId, $end, $start]
            ),
            'claims_amount'        => $scalar(
                "SELECT COALESCE(SUM(amount),0) FROM claims
                  WHERE (employee_id = ? OR (employee_id IS NULL AND employee_name = ?))
                    AND is_archived = FALSE
                    AND claim_date BETWEEN ? AND ? AND status = 'Approved'",
                [$empId, $item['employee_name'], $start, $end]
            ),
            'leave_conversion'     => $scalar(
                "SELECT COALESCE(SUM(amount),0) FROM leave_conversions
                  WHERE employee_id = ? AND conv_date BETWEEN ? AND ? AND status IN ('Approved','Completed')",
                $period
            ),
            'performance_bonus'    => $scalar(
                'SELECT COALESCE(SUM(bonus_amount),0) FROM performance_ratings WHERE employee_id = ? AND review_date BETWEEN ? AND ?',
                $period
            ),
            'competency_allowance' => $scalar(
                'SELECT COALESCE(SUM(allowance_amount),0) FROM competency_assessments WHERE employee_id = ? AND assessment_date BETWEEN ? AND ?',
                $period
            ),
            'training_incentive'   => $scalar(
                'SELECT COALESCE(SUM(incentive_amount),0) FROM training_records WHERE employee_id = ? AND completed_date BETWEEN ? AND ?',
                $period
            ),
            'recognition_bonus'    => $scalar(
                'SELECT COALESCE(SUM(bonus_amount),0) FROM recognition_awards WHERE employee_id = ? AND award_date BETWEEN ? AND ?',
                $period
            ),
            'incentives'           => $scalar(
                "SELECT COALESCE(SUM(amount),0) FROM incentive_earnings
                  WHERE employee_id = ? AND status = 'Earned'
                    AND (payroll_run_id IS NULL OR payroll_run_id = ?) AND period = ?",
                [$empId, (int) $item['payroll_run_id'], date('Y-m', strtotime($start))]
            ),
            'loans_deduction'      => $scalar(
                'SELECT COALESCE(SUM(monthly_deduction),0) FROM loans WHERE employee_id = ? AND status = \'Active\'',
                [$empId]
            ),
            'hmo_deduction'        => $scalar(
                "SELECT COALESCE(SUM(monthly_premium * employee_share / 100),0) FROM benefit_enrollments
                  WHERE employee_id = ? AND status = 'Active'",
                [$empId]
            ),
        ];

        // Postgres needs the bind cast so the date arithmetic below resolves to
        // a date subtraction; other engines compare the ISO strings directly.
        $cast = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql' ? '::date' : '';
        $unpaidDays = $scalar(
            "SELECT COALESCE(SUM(LEAST(end_date, ?{$cast}) - GREATEST(start_date, ?{$cast}) + 1), 0)
               FROM leave_requests
              WHERE employee_id = ? AND status = 'Approved' AND is_paid = FALSE
                AND start_date <= ?{$cast} AND end_date >= ?{$cast}",
            [$end, $start, $empId, $end, $start]
        );
        $line['unpaid_leave_deduction'] = round($dailyRate * max(0.0, $unpaidDays), 2);

        // Attendance auto-deduct: absences are unpaid via the prorated daily basic
        // pay above; logged lateness is deducted per minute against the hourly rate.
        $line['attendance_deduction'] = round($hourlyRate * ($lateMinutes / 60), 2);

        $line['gross_pay'] = round(array_sum(array_intersect_key($line, array_flip([
            'basic_pay', 'overtime_pay', 'night_differential', 'holiday_pay', 'allowances',
            'claims_amount', 'leave_conversion', 'performance_bonus', 'competency_allowance',
            'training_incentive', 'recognition_bonus', 'incentives',
        ]))), 2);

        $sss     = TaxService::sss($salary);
        $ph      = TaxService::philHealth($salary);
        $pagibig = TaxService::pagIbig($salary);
        $employeeContributions = $sss['ee'] + $ph['ee'] + $pagibig['ee'];

        $line['sss_ee']        = round($sss['ee'], 2);
        $line['sss_er']        = round($sss['er'], 2);
        $line['philhealth_ee'] = round($ph['ee'], 2);
        $line['philhealth_er'] = round($ph['er'], 2);
        $line['pagibig_ee']    = round($pagibig['ee'], 2);
        $line['pagibig_er']    = round($pagibig['er'], 2);
        $line['withholding_tax'] = TaxService::withholdingTax($line['gross_pay'], $employeeContributions);
        $line['statutory_basis'] = json_encode(TaxService::basis($salary, $sss, $ph, $pagibig));

        $line['total_deductions'] = round(
            $employeeContributions + $line['withholding_tax'] + $line['loans_deduction']
            + $line['unpaid_leave_deduction'] + $line['hmo_deduction'] + $line['attendance_deduction'],
            2
        );
        $line['net_pay'] = round($line['gross_pay'] - $line['total_deductions'], 2);

        return $line;
    }

    private function writeLine(int $itemId, array $line, string $status): void
    {
        $columns = array_keys($line);
        $assignments = implode(', ', array_map(static fn ($c) => "{$c} = ?", $columns));
        $sql = "UPDATE payroll_items SET {$assignments}, status = ? WHERE id = ?";
        $this->pdo->prepare($sql)->execute([...array_values($line), $status, $itemId]);
    }

    public function toggleIncluded(int $runId, int $itemId, bool $included): void
    {
        $run = $this->findRun($runId);
        if ($run['status'] !== 'Draft') {
            throw new RuntimeException('Only draft payroll runs can be changed.');
        }
        $stmt = $this->pdo->prepare('UPDATE payroll_items SET is_included = ? WHERE id = ? AND payroll_run_id = ?');
        $stmt->execute([$included, $itemId, $runId]);
        $this->recalculateTotals($runId);
    }

    public function submitToFinance(int $runId, int $userId): array
    {
        $run = $this->findRun($runId);
        if ($run['status'] !== 'Draft') {
            throw new RuntimeException("Only draft payroll runs can be submitted (current status: {$run['status']}).");
        }

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare("UPDATE payroll_items SET status = 'Pending Finance Approval' WHERE payroll_run_id = ? AND is_included = TRUE")
                ->execute([$runId]);
            $this->pdo->prepare("UPDATE payroll_runs SET status = 'Pending Finance Approval', run_date = now() WHERE id = ?")
                ->execute([$runId]);
            $this->pdo->prepare(
                'INSERT INTO finance_approvals (payroll_run_id, status, submitted_by)
                 VALUES (?, \'Pending\', ?)
                 ON CONFLICT (payroll_run_id) DO UPDATE SET status = \'Pending\', submitted_by = EXCLUDED.submitted_by, submitted_at = now()'
            )->execute([$runId, $userId]);
            $this->pdo->prepare("INSERT INTO notifications (user_name, title, message) VALUES ('Finance', 'Payroll awaiting approval', ?)")
                ->execute(["Run {$run['period']} is ready for review."]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        AuditService::log('Payroll Submitted To Finance', 'Payroll', $userId, ['run_id' => $runId]);
        return $this->getRun($runId);
    }

    public function setPayDate(int $runId, string $payDate): array
    {
        $run = $this->findRun($runId);
        if (!in_array($run['status'], ['Draft', 'Approved'], true)) {
            throw new RuntimeException('Pay date can only be set on Draft or approved payroll runs.');
        }
        $this->assertDate($payDate, 'pay_date');
        if (date('w', strtotime($payDate)) === '0') {
            throw new RuntimeException(
                'Pay date may not fall on a Sunday — paydays land on the 15th or month-end and are moved to the preceding workday when that day is a Sunday.', 422);
        }
        $earliest = $this->earliestPayDate($run);
        if ($earliest !== null && $payDate < $earliest) {
            throw new RuntimeException("Salary may not be released before {$earliest}: Finance approval requires a " . self::leadTimeDays() . '-day lead time.', 422);
        }
        $this->pdo->prepare('UPDATE payroll_runs SET pay_date = ? WHERE id = ?')->execute([$payDate, $runId]);
        $this->pdo->prepare('UPDATE payroll_items SET pay_date = ? WHERE payroll_run_id = ?')->execute([$payDate, $runId]);
        AuditService::log('Payroll Pay Date Set', 'Payroll', null, ['run_id' => $runId, 'pay_date' => $payDate]);
        return $this->getRun($runId);
    }

    public function returnToDraft(int $runId, int $userId): array
    {
        $run = $this->findRun($runId);
        if (!in_array($run['status'], ['On Hold', 'Rejected'], true)) {
            throw new RuntimeException('Only held or rejected payroll runs can be reopened.');
        }
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare("UPDATE payroll_runs SET status = 'Draft' WHERE id = ?")->execute([$runId]);
            $this->pdo->prepare("UPDATE payroll_items SET status = 'Draft' WHERE payroll_run_id = ? AND is_included = TRUE")->execute([$runId]);
            $this->pdo->prepare('UPDATE incentive_earnings SET payroll_run_id = NULL WHERE payroll_run_id = ? AND status = \'Earned\'')->execute([$runId]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        AuditService::log('Payroll Reopened', 'Payroll', $userId, ['run_id' => $runId]);
        return $this->getRun($runId);
    }

    /**
     * Adds payroll lines from parsed CSV rows: [employee code or id, days?, ot?].
     * New employees are appended to a draft run; existing lines are skipped.
     *
     * @param array<int, array<int, string|null>> $rows
     */
    public function importItems(int $runId, array $rows): array
    {
        $run = $this->findRun($runId);
        if ($run['status'] !== 'Draft') {
            throw new RuntimeException('Only draft payroll runs can be imported.');
        }

        $inserted = 0;
        $skipped = 0;
        $notFound = [];
        $this->pdo->beginTransaction();
        try {
            $findEmp = $this->pdo->prepare('SELECT id, first_name, last_name, department, ewallet_provider FROM employees WHERE code = ? OR id = ?');
            $exists  = $this->pdo->prepare('SELECT 1 FROM payroll_items WHERE payroll_run_id = ? AND employee_id = ?');
            $ins     = $this->pdo->prepare(
                "INSERT INTO payroll_items (payroll_run_id, employee_id, employee_name, department, days_worked, ot_hours, ewallet_provider, status, is_included)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', TRUE)"
            );
            foreach ($rows as $row) {
                $code = trim((string) ($row[0] ?? ''));
                if ($code === '') {
                    continue;
                }
                $findEmp->execute([$code, $code]);
                $emp = $findEmp->fetch();
                $findEmp->closeCursor();
                if (!$emp) {
                    $notFound[] = $code;
                    continue;
                }
                $exists->execute([$runId, $emp['id']]);
                $there = (bool) $exists->fetchColumn();
                $exists->closeCursor();
                if ($there) {
                    $skipped++;
                    continue;
                }
                $days = isset($row[1]) && is_numeric($row[1]) ? (float) $row[1] : 22.0;
                $ot   = isset($row[2]) && is_numeric($row[2]) ? (float) $row[2] : 0.0;
                $ins->execute([
                    $runId, $emp['id'], trim($emp['first_name'] . ' ' . $emp['last_name']),
                    $emp['department'], $days, $ot, $emp['ewallet_provider'],
                ]);
                $inserted++;
            }
            if ($inserted > 0) {
                $this->recalculateTotals($runId);
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        AuditService::log('Payroll Items Imported', 'Payroll', null, ['run_id' => $runId, 'inserted' => $inserted, 'skipped' => $skipped]);
        return ['inserted' => $inserted, 'skipped' => $skipped, 'not_found' => $notFound];
    }

    public function recalculateTotals(int $runId): void
    {
        $this->pdo->prepare(
            'UPDATE payroll_runs
                SET total_gross = COALESCE((SELECT SUM(gross_pay) FROM payroll_items WHERE payroll_run_id = payroll_runs.id AND is_included), 0),
                    total_deductions = COALESCE((SELECT SUM(total_deductions) FROM payroll_items WHERE payroll_run_id = payroll_runs.id AND is_included), 0),
                    total_net = COALESCE((SELECT SUM(net_pay) FROM payroll_items WHERE payroll_run_id = payroll_runs.id AND is_included), 0)
              WHERE id = ?'
        )->execute([$runId]);
    }

    private function assertDate(string $value, string $field): void
    {
        if (\DateTime::createFromFormat('Y-m-d', $value) === false) {
            throw new RuntimeException("Field '{$field}' must be an ISO date (YYYY-MM-DD).");
        }
    }
}
