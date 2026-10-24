<?php
declare(strict_types=1);

namespace App;

use PDO;
use RuntimeException;

/**
 * Attendance: daily logs, period timesheets and shift schedules.
 * Mirrors the legacy attendance screens' data (attendance_logs / timesheets / shift_schedules).
 */
final class AttendanceService
{
    public function __construct(private readonly PDO $pdo) {}

    private function findEmployee(string $id): void
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM employees WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) {
            throw new RuntimeException("Employee {$id} not found.", 404);
        }
    }

    public function logs(?string $employeeId, ?string $start, ?string $end, int $limit = 500): array
    {
        $sql = 'SELECT a.*, e.first_name, e.last_name, e.department
                  FROM attendance_logs a JOIN employees e ON e.id = a.employee_id
                 WHERE e.is_archived = FALSE';
        $params = [];
        if ($employeeId) { $sql .= ' AND a.employee_id = ?'; $params[] = $employeeId; }
        if ($start)      { $sql .= ' AND a.log_date >= ?';   $params[] = $start; }
        if ($end)        { $sql .= ' AND a.log_date <= ?';   $params[] = $end; }
        $sql .= ' ORDER BY a.log_date DESC, e.last_name LIMIT ?';
        $params[] = $limit;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function log(array $body): array
    {
        $employeeId = Http::requireString($body, 'employee_id');
        $this->findEmployee($employeeId);
        $date = Http::requireString($body, 'log_date');
        $status = strtoupper((string) ($body['status'] ?? 'P'));
        if (!in_array($status, ['P', 'H', 'A', 'OT', 'L'], true)) {
            throw new RuntimeException('status must be one of P, H, A, OT, L.', 422);
        }
        $lateMinutes = max(0.0, (float) ($body['late_minutes'] ?? 0));
        $stmt = $this->pdo->prepare(
            'INSERT INTO attendance_logs (employee_id, log_date, status, actual_hours, ot_hours, nd_hours, holiday_hours, late_minutes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (employee_id, log_date) DO UPDATE
               SET status = EXCLUDED.status, actual_hours = EXCLUDED.actual_hours,
                   ot_hours = EXCLUDED.ot_hours, nd_hours = EXCLUDED.nd_hours,
                   holiday_hours = EXCLUDED.holiday_hours, late_minutes = EXCLUDED.late_minutes
             RETURNING *'
        );
        $stmt->execute([
            $employeeId, $date, $status,
            (float) ($body['actual_hours'] ?? 0),
            (float) ($body['ot_hours'] ?? 0),
            (float) ($body['nd_hours'] ?? 0),
            (float) ($body['holiday_hours'] ?? 0),
            $lateMinutes,
        ]);
        $row = $stmt->fetch();
        AuditService::log('Attendance Logged', 'Attendance', null, ['employee_id' => $employeeId, 'date' => $date]);
        return $row;
    }

    public function deleteLog(int $id): array
    {
        $this->pdo->prepare('DELETE FROM attendance_logs WHERE id = ?')->execute([$id]);
        return ['deleted' => $id];
    }

    public function timesheets(?string $employeeId, ?string $start, ?string $end): array
    {
        $sql = 'SELECT t.*, e.first_name, e.last_name FROM timesheets t JOIN employees e ON e.id = t.employee_id WHERE 1=1';
        $params = [];
        if ($employeeId) { $sql .= ' AND t.employee_id = ?'; $params[] = $employeeId; }
        if ($start)      { $sql .= ' AND t.period_end >= ?'; $params[] = $start; }
        if ($end)        { $sql .= ' AND t.period_start <= ?'; $params[] = $end; }
        $sql .= ' ORDER BY t.period_start DESC, e.last_name';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function saveTimesheet(array $body): array
    {
        $employeeId = Http::requireString($body, 'employee_id');
        $this->findEmployee($employeeId);
        $start = Http::requireString($body, 'period_start');
        $end = Http::requireString($body, 'period_end');
        $status = (string) ($body['status'] ?? 'Draft');
        if (!in_array($status, ['Draft', 'Submitted', 'Approved', 'Rejected'], true)) {
            throw new RuntimeException('Invalid timesheet status.', 422);
        }
        $stmt = $this->pdo->prepare(
            'INSERT INTO timesheets (employee_id, period_start, period_end, hours, status)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (employee_id, period_start, period_end) DO UPDATE
               SET hours = EXCLUDED.hours, status = EXCLUDED.status
             RETURNING *'
        );
        $stmt->execute([$employeeId, $start, $end, (float) ($body['hours'] ?? 0), $status]);
        return $stmt->fetch();
    }

    public function shifts(?string $employeeId, ?string $start, ?string $end): array
    {
        $sql = 'SELECT s.*, e.first_name, e.last_name FROM shift_schedules s JOIN employees e ON e.id = s.employee_id WHERE 1=1';
        $params = [];
        if ($employeeId) { $sql .= ' AND s.employee_id = ?'; $params[] = $employeeId; }
        if ($start)      { $sql .= ' AND s.schedule_date >= ?'; $params[] = $start; }
        if ($end)        { $sql .= ' AND s.schedule_date <= ?'; $params[] = $end; }
        $sql .= ' ORDER BY s.schedule_date DESC, e.last_name';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function saveShift(array $body): array
    {
        $employeeId = Http::requireString($body, 'employee_id');
        $this->findEmployee($employeeId);
        $stmt = $this->pdo->prepare(
            'INSERT INTO shift_schedules (employee_id, schedule_date, shift_name, night_diff_hours, holiday_hours)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (employee_id, schedule_date) DO UPDATE
               SET shift_name = EXCLUDED.shift_name, night_diff_hours = EXCLUDED.night_diff_hours, holiday_hours = EXCLUDED.holiday_hours
             RETURNING *'
        );
        $stmt->execute([
            $employeeId,
            Http::requireString($body, 'schedule_date'),
            (string) ($body['shift_name'] ?? 'Day'),
            (float) ($body['night_diff_hours'] ?? 0),
            (float) ($body['holiday_hours'] ?? 0),
        ]);
        return $stmt->fetch();
    }

    /** Daily record: one row per active employee for a date, joined with shift + timesheet. */
    public function daily(string $date): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT e.id AS employee_id, e.first_name, e.last_name, e.department,
                    a.status, a.actual_hours, a.ot_hours, a.nd_hours, a.holiday_hours, a.late_minutes,
                    s.shift_name, s.night_diff_hours, s.holiday_hours AS shift_holiday_hours,
                    t.status AS timesheet_status, t.hours AS timesheet_hours
               FROM employees e
               LEFT JOIN attendance_logs a ON a.employee_id = e.id AND a.log_date = ?
               LEFT JOIN shift_schedules s ON s.employee_id = e.id AND s.schedule_date = ?
               LEFT JOIN timesheets t ON t.employee_id = e.id AND t.period_start <= ? AND t.period_end >= ?
              WHERE e.status IN ('Active', 'On Leave') AND e.is_archived = FALSE
              ORDER BY e.department, e.last_name, e.first_name"
        );
        $stmt->execute([$date, $date, $date, $date]);
        return $stmt->fetchAll();
    }

    /** Monthly aggregation per employee: P/H/A/OT counts, hours and days worked. */
    public function summary(string $month): array
    {
        $start = $month . '-01';
        $end = date('Y-m-t', strtotime($start));
        $stmt = $this->pdo->prepare(
            "SELECT e.id AS employee_id, e.first_name, e.last_name, e.department,
                    COUNT(a.*) FILTER (WHERE a.status = 'P')::int AS present_days,
                    COUNT(a.*) FILTER (WHERE a.status = 'H')::int AS holiday_days,
                    COUNT(a.*) FILTER (WHERE a.status = 'A')::int AS absent_days,
                    COUNT(a.*) FILTER (WHERE a.status = 'OT')::int AS ot_days,
                    COUNT(a.*) FILTER (WHERE a.status = 'L')::int AS late_days,
                    COALESCE(SUM(a.late_minutes), 0)::numeric(10,1) AS late_minutes,
                    COALESCE(SUM(a.ot_hours), 0)::numeric(10,2) AS ot_hours,
                    COALESCE(SUM(a.actual_hours), 0)::numeric(10,2) AS total_hours,
                    COUNT(a.*)::int AS days_recorded,
                    COALESCE(MAX(t.status), 'Draft') AS timesheet_status
               FROM employees e
               LEFT JOIN attendance_logs a ON a.employee_id = e.id AND a.log_date BETWEEN ? AND ?
               LEFT JOIN timesheets t ON t.employee_id = e.id AND t.period_start <= ? AND t.period_end >= ?
              WHERE e.status IN ('Active', 'On Leave') AND e.is_archived = FALSE
              GROUP BY e.id, e.first_name, e.last_name, e.department
              ORDER BY e.department, e.last_name, e.first_name"
        );
        $stmt->execute([$start, $end, $end, $start]);
        return $stmt->fetchAll();
    }

    public function leaveBalances(?int $year = null): array
    {
        $sql = 'SELECT l.*, e.first_name, e.last_name, e.department
                  FROM leave_balances l JOIN employees e ON e.id = l.employee_id';
        $params = [];
        if ($year) { $sql .= ' WHERE l.year = ?'; $params[] = $year; }
        $sql .= ' ORDER BY e.department, e.last_name, l.leave_type';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function leaveRequests(?int $year = null): array
    {
        $sql = 'SELECT r.*, e.first_name, e.last_name
                  FROM leave_requests r JOIN employees e ON e.id = r.employee_id
                 WHERE e.is_archived = FALSE';
        $params = [];
        if ($year) { $sql .= ' AND EXTRACT(YEAR FROM r.start_date)::int = ?'; $params[] = $year; }
        $sql .= ' ORDER BY r.filed_at DESC LIMIT 300';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    private static function isSil(string $leaveType): bool
    {
        $t = strtolower($leaveType);
        return str_contains($t, 'service incentive') || $t === 'sil';
    }

    public function fileLeave(array $body): array
    {
        $employeeId = Http::requireString($body, 'employee_id');
        $this->findEmployee($employeeId);
        $leaveType = Http::requireString($body, 'leave_type');
        $start = Http::requireString($body, 'start_date');
        $end = Http::requireString($body, 'end_date');
        if ($start > $end) {
            throw new RuntimeException('start_date must be on or before end_date.', 422);
        }
        $isPaid = filter_var($body['is_paid'] ?? true, FILTER_VALIDATE_BOOL);

        // Mandatory Service Incentive Leave may only be taken during April.
        if (self::isSil($leaveType)) {
            $silMonth = (int) SettingsService::num('sil_month', 4);
            $months = array_unique([(int) date('n', strtotime($start)), (int) date('n', strtotime($end))]);
            if ($months !== [$silMonth]) {
                $name = date('F', mktime(0, 0, 0, $silMonth, 1));
                throw new RuntimeException("Service Incentive Leave is restricted to {$name} only.", 422);
            }
        }

        $days = is_numeric($body['days'] ?? null)
            ? (float) $body['days']
            : max(1.0, (float) floor((strtotime($end) - strtotime($start)) / 86400) + 1);

        $stmt = $this->pdo->prepare(
            'SELECT balance FROM leave_balances
              WHERE employee_id = ? AND leave_type = ? AND year = EXTRACT(YEAR FROM ?::date)::int'
        );
        $stmt->execute([$employeeId, $leaveType, $start]);
        $balance = $stmt->fetchColumn();
        $stmt->closeCursor();
        if ($balance !== false && (float) $balance < $days) {
            throw new RuntimeException("Insufficient {$leaveType} balance: only {$balance} day(s) available.", 422);
        }

        $ins = $this->pdo->prepare(
            'INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, is_paid, status)
             VALUES (?, ?, ?, ?, ?, ?, \'Pending\') RETURNING *'
        );
        $ins->execute([$employeeId, $leaveType, $start, $end, $days, $isPaid]);
        $request = $ins->fetch();

        $this->pdo->prepare('INSERT INTO notifications (user_name, title, message) VALUES (?, ?, ?)')
            ->execute(['HR', 'Leave request filed', "{$leaveType}: {$start} to {$end} ({$days} day(s))."]);
        AuditService::log('Leave Request Filed', 'Attendance', null, [
            'employee_id' => $employeeId, 'leave_type' => $leaveType, 'request_id' => $request['id'],
        ]);
        return $request;
    }

    public function decideLeave(int $id, string $status): array
    {
        if (!in_array($status, ['Approved', 'Rejected'], true)) {
            throw new RuntimeException('status must be Approved or Rejected.', 422);
        }
        $stmt = $this->pdo->prepare('SELECT * FROM leave_requests WHERE id = ?');
        $stmt->execute([$id]);
        $request = $stmt->fetch();
        $stmt->closeCursor();
        if ($request === false) {
            throw new RuntimeException("Leave request {$id} not found.", 404);
        }
        if ($request['status'] !== 'Pending') {
            throw new RuntimeException('That request has already been decided.', 422);
        }
        $this->pdo->prepare('UPDATE leave_requests SET status = ? WHERE id = ?')->execute([$status, $id]);

        if ($status === 'Approved') {
            $upd = $this->pdo->prepare(
                'UPDATE leave_balances SET used = used + ?, balance = GREATEST(balance - ?, 0)
                  WHERE employee_id = ? AND leave_type = ? AND year = EXTRACT(YEAR FROM ?::date)::int'
            );
            $upd->execute([(float) $request['days'], (float) $request['days'], $request['employee_id'], $request['leave_type'], $request['start_date']]);
        }
        AuditService::log("Leave {$status}", 'Attendance', null, ['request_id' => $id]);

        $stmt = $this->pdo->prepare('SELECT * FROM leave_requests WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    // ── Cut-off based attendance (replaces daily recording) ──────────────

    private function assertCutoffWindow(string $start, string $end): void
    {
        foreach (['cutoff_start' => $start, 'cutoff_end' => $end] as $field => $value) {
            if (\DateTime::createFromFormat('Y-m-d', $value) === false) {
                throw new RuntimeException("Field '{$field}' must be an ISO date (YYYY-MM-DD).", 422);
            }
        }
        if ($start > $end) {
            throw new RuntimeException('cutoff_start must be on or before cutoff_end.', 422);
        }
        $firstOfMonth = date('Y-m-01', strtotime($start));
        if ($start !== $firstOfMonth && date('j', strtotime($start)) !== '16') {
            throw new RuntimeException('A cut-off period must start on the 1st or the 16th of a month.', 422);
        }
    }

    /** One row per active employee for the chosen cut-off period. */
    public function cutoffs(string $start, string $end, ?string $employeeId = null): array
    {
        $this->assertCutoffWindow($start, $end);
        $sql = "SELECT e.id AS employee_id, e.first_name, e.last_name, e.department, e.position,
                       c.id AS cutoff_id, c.present_days, c.half_days, c.absent_days, c.ot_days,
                       c.ot_hours, c.remarks, (c.id IS NOT NULL) AS recorded,
                       COALESCE(c.present_days, 0) + COALESCE(c.ot_days, 0) + COALESCE(c.half_days, 0) * 0.5 AS days_worked,
                       COALESCE(c.absent_days, 0) AS total_absences
                  FROM employees e
                  LEFT JOIN attendance_cutoffs c
                         ON c.employee_id = e.id AND c.cutoff_start = ? AND c.cutoff_end = ?
                 WHERE e.status IN ('Active', 'On Leave') AND e.is_archived = FALSE";
        $params = [$start, $end];
        if ($employeeId) { $sql .= ' AND e.id = ?'; $params[] = $employeeId; }
        $sql .= ' ORDER BY e.department, e.last_name, e.first_name';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** HR records one employee's P/H/A/OT totals for the whole cut-off period. */
    public function saveCutoff(array $body, int $userId): array
    {
        $employeeId = Http::requireString($body, 'employee_id');
        $this->findEmployee($employeeId);
        $start = Http::requireString($body, 'cutoff_start');
        $end = Http::requireString($body, 'cutoff_end');
        $this->assertCutoffWindow($start, $end);

        $int = static fn (string $key): int => max(0, (int) ($body[$key] ?? 0));
        $days = [
            'present_days' => $int('present_days'),
            'half_days'    => $int('half_days'),
            'absent_days'  => $int('absent_days'),
            'ot_days'      => $int('ot_days'),
        ];
        $otHours = max(0.0, (float) ($body['ot_hours'] ?? 0));

        $stmt = $this->pdo->prepare(
            'INSERT INTO attendance_cutoffs
                (employee_id, cutoff_start, cutoff_end, present_days, half_days, absent_days, ot_days, ot_hours, remarks, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (employee_id, cutoff_start, cutoff_end) DO UPDATE
               SET present_days = EXCLUDED.present_days, half_days = EXCLUDED.half_days,
                   absent_days = EXCLUDED.absent_days, ot_days = EXCLUDED.ot_days,
                   ot_hours = EXCLUDED.ot_hours, remarks = EXCLUDED.remarks, updated_by = EXCLUDED.updated_by
             RETURNING *'
        );
        $stmt->execute([
            $employeeId, $start, $end,
            $days['present_days'], $days['half_days'], $days['absent_days'], $days['ot_days'],
            $otHours, trim((string) ($body['remarks'] ?? '')), $userId,
        ]);
        $row = $stmt->fetch();
        AuditService::log('Attendance Cut-off Recorded', 'Attendance', null, [
            'employee_id' => $employeeId, 'cutoff' => "{$start}..{$end}",
        ]);
        return $row;
    }

    // ── Attendance adjustments (off-site / field workers) ────────────────

    public function adjustments(?string $status = null, ?string $employeeId = null): array
    {
        $sql = 'SELECT a.*, e.first_name, e.last_name, e.department
                  FROM attendance_adjustments a JOIN employees e ON e.id = a.employee_id
                 WHERE e.is_archived = FALSE';
        $params = [];
        if ($status)     { $sql .= ' AND a.status = ?'; $params[] = $status; }
        if ($employeeId) { $sql .= ' AND a.employee_id = ?'; $params[] = $employeeId; }
        $sql .= ' ORDER BY CASE a.status WHEN \'Pending\' THEN 0 ELSE 1 END, a.created_at DESC LIMIT 300';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function requestAdjustment(array $body, int $userId, string $requestedBy): array
    {
        $employeeId = Http::requireString($body, 'employee_id');
        $this->findEmployee($employeeId);
        $start = Http::requireString($body, 'cutoff_start');
        $end = Http::requireString($body, 'cutoff_end');
        $this->assertCutoffWindow($start, $end);
        $details = trim((string) ($body['details'] ?? ''));
        if ($details === '') {
            throw new RuntimeException('Describe where you were and what you did — the details are required.', 422);
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO attendance_adjustments
                (employee_id, cutoff_start, cutoff_end, details, location,
                 add_present_days, add_half_days, remove_absent_days, add_ot_hours, requested_by, requested_by_user)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *'
        );
        $stmt->execute([
            $employeeId, $start, $end, $details, trim((string) ($body['location'] ?? '')),
            max(0, (int) ($body['add_present_days'] ?? 0)),
            max(0, (int) ($body['add_half_days'] ?? 0)),
            max(0, (int) ($body['remove_absent_days'] ?? 0)),
            max(0.0, (float) ($body['add_ot_hours'] ?? 0)),
            $requestedBy, $userId,
        ]);
        $request = $stmt->fetch();

        $this->pdo->prepare('INSERT INTO notifications (user_name, title, message) VALUES (?, ?, ?)')
            ->execute(['HR', 'Attendance adjustment filed', "Cut-off {$start} to {$end}: {$details}"]);
        AuditService::log('Attendance Adjustment Filed', 'Attendance', $userId, [
            'employee_id' => $employeeId, 'request_id' => $request['id'],
        ]);
        return $request;
    }

    public function decideAdjustment(int $id, string $status, int $userId, string $notes = ''): array
    {
        if (!in_array($status, ['Approved', 'Rejected'], true)) {
            throw new RuntimeException('status must be Approved or Rejected.', 422);
        }
        $stmt = $this->pdo->prepare('SELECT * FROM attendance_adjustments WHERE id = ?');
        $stmt->execute([$id]);
        $request = $stmt->fetch();
        $stmt->closeCursor();
        if ($request === false) {
            throw new RuntimeException("Adjustment request {$id} not found.", 404);
        }
        if ($request['status'] !== 'Pending') {
            throw new RuntimeException('That adjustment has already been decided.', 422);
        }

        $this->pdo->beginTransaction();
        try {
            if ($status === 'Approved') {
                $upsert = $this->pdo->prepare(
                    'INSERT INTO attendance_cutoffs (employee_id, cutoff_start, cutoff_end, updated_by)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT (employee_id, cutoff_start, cutoff_end) DO UPDATE SET updated_by = EXCLUDED.updated_by
                     RETURNING id'
                );
                $upsert->execute([$request['employee_id'], $request['cutoff_start'], $request['cutoff_end'], $userId]);
                $upsert->closeCursor();
                $this->pdo->prepare(
                    'UPDATE attendance_cutoffs
                        SET present_days = present_days + ?,
                            half_days = half_days + ?,
                            absent_days = GREATEST(absent_days - ?, 0),
                            ot_hours = ot_hours + ?,
                            updated_by = ?
                      WHERE employee_id = ? AND cutoff_start = ? AND cutoff_end = ?'
                )->execute([
                    (int) $request['add_present_days'],
                    (int) $request['add_half_days'],
                    (int) $request['remove_absent_days'],
                    (float) $request['add_ot_hours'],
                    $userId,
                    $request['employee_id'], $request['cutoff_start'], $request['cutoff_end'],
                ]);
            }
            $this->pdo->prepare(
                'UPDATE attendance_adjustments SET status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = now() WHERE id = ?'
            )->execute([$status, $userId, $notes, $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        AuditService::log("Attendance Adjustment {$status}", 'Attendance', $userId, ['request_id' => $id]);
        $stmt = $this->pdo->prepare('SELECT * FROM attendance_adjustments WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }
}
