<?php
declare(strict_types=1);

use App\ArchiveService;
use App\AttendanceService;
use App\AuditService;
use App\Auth;
use App\BenefitsService;
use App\ClaimsService;
use App\Config;
use App\DashboardService;
use App\Database;
use App\EmployeeService;
use App\EventService;
use App\Http;
use App\IncentiveService;
use App\IntegrationAuth;
use App\PayrollService;
use App\ReceiptOcrService;
use App\SettingsService;
use App\TabscannerService;
use App\ThirteenthMonthService;
use App\UserAccountService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

$employees  = static fn (): EmployeeService => new EmployeeService(Database::pdo());
$payroll    = static fn (): PayrollService => new PayrollService(Database::pdo());
$claims     = static fn (): ClaimsService => new ClaimsService(Database::pdo());
$benefits   = static fn (): BenefitsService => new BenefitsService(Database::pdo());
$dashboard  = static fn (): DashboardService => new DashboardService(Database::pdo());
$accounts   = static fn (): UserAccountService => new UserAccountService(Database::pdo());
$attendance = static fn (): AttendanceService => new AttendanceService(Database::pdo());
$thirteen   = static fn (): ThirteenthMonthService => new ThirteenthMonthService(Database::pdo());
$archiver   = static fn (): ArchiveService => new ArchiveService(Database::pdo());
$integration = static fn (): IntegrationAuth => new IntegrationAuth(Database::pdo());
$events     = static fn (): EventService => new EventService(Database::pdo());

/* ── Public ─────────────────────────────────────────── */

Route::get('/health', static function (): \Illuminate\Http\JsonResponse {
    $dbError = null;
    try {
        Database::pdo()->query('SELECT 1')->fetchColumn();
    } catch (\Throwable $e) {
        $dbError = $e->getMessage();
    }
    return Http::json([
        'status'   => $dbError === null ? 'ok' : 'degraded',
        'database' => $dbError === null,
        'db_error' => $dbError,
        'pdo_drivers' => PDO::getAvailableDrivers(),
        'supabase' => [
            'url_configured'        => Config::supabaseUrl() !== '',
            'jwt_secret_configured' => Config::jwtSecret() !== '',
            'storage_configured'    => Config::serviceRoleKey() !== '',
        ],
    ]);
});

Route::get('/branding', static function (): \Illuminate\Http\JsonResponse {
    return Http::json(['company_name' => (string) SettingsService::get('company_name', '')]);
});

Route::post('/auth/login', static function (): \Illuminate\Http\JsonResponse {
    $body = Http::body();
    $email = Http::requireString($body, 'email');
    $result = Auth::login($email, Http::requireString($body, 'password'));
    if ($result === null) {
        AuditService::log('Failed Login', 'Auth', null, ['email' => $email, 'reason' => 'bad credentials']);
        Http::error('Email or password is incorrect.', 401);
    }
    if (!empty($result['otp_required'])) {
        AuditService::log('Login Code Sent', 'Auth', null, ['email' => $result['email'], 'reason' => 'password ok, awaiting email code']);
        return Http::json($result);
    }
    AuditService::log('User Login', 'Auth', (int) $result['user']['id'], ['email' => $result['user']['email']]);
    return Http::json($result);
});

Route::post('/auth/logout', static function (): \Illuminate\Http\JsonResponse {
    $user = Auth::user();
    AuditService::log('User Logout', 'Auth', (int) $user['id'], ['email' => $user['email']]);
    return Http::json(['ok' => true]);
});

Route::post('/auth/register', static function (): \Illuminate\Http\JsonResponse {
    $body = Http::body();
    return Http::json(Auth::register(
        (string) ($body['email'] ?? ''),
        (string) ($body['username'] ?? ''),
        (string) ($body['password'] ?? ''),
        (string) ($body['registration_code'] ?? ''),
        (string) ($body['account_type'] ?? 'HR'),
        (string) ($body['employee_code'] ?? '')
    ), 201);
});

Route::post('/auth/supabase', static function (): \Illuminate\Http\JsonResponse {
    $body = Http::body();
    $result = Auth::exchangeFromSupabase(Http::requireString($body, 'access_token'), $body);
    AuditService::log('User Login', 'Auth', (int) $result['user']['id'], ['email' => $result['user']['email'], 'via' => 'supabase']);
    return Http::json($result);
});

Route::get('/auth/me', static function (): \Illuminate\Http\JsonResponse {
    return Http::json(Auth::user());
});

/* ── Audit log + announcements ──────────────────────── */

Route::get('/audit', static function (Request $request): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(AuditService::list($request->query()));
});

Route::get('/announcements', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => Database::pdo()->query(
        'SELECT id, title, body, created_by, created_at FROM announcements ORDER BY created_at DESC LIMIT 50'
    )->fetchAll()]);
});

Route::post('/announcements', static function (): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    $body = Http::body();
    $stmt = Database::pdo()->prepare(
        'INSERT INTO announcements (title, body, created_by) VALUES (?, ?, ?) RETURNING id, title, body, created_by, created_at'
    );
    $stmt->execute([
        Http::requireString($body, 'title'),
        trim((string) ($body['body'] ?? '')),
        (string) ($user['name'] ?? 'HR Admin'),
    ]);
    return Http::json($stmt->fetch(), 201);
});

Route::post('/audit/reset', static function (): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    $password = (string) (Http::body()['password'] ?? '');
    if ($password === '' || !Auth::verifyPassword($password)) {
        AuditService::log('Failed Audit Reset', 'Audit', (int) $user['id'], ['reason' => 'wrong password']);
        Http::error('Incorrect password.', 403);
    }
    $deleted = (int) Database::pdo()->exec('DELETE FROM audit_log');
    AuditService::log('Audit Log Reset', 'Audit', (int) $user['id'], ['deleted' => $deleted]);
    return Http::json(['ok' => true, 'deleted' => $deleted]);
});

/* ── Archive + notifications + settings + dashboard ─── */

Route::get('/archive', static function () use ($archiver): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $archiver()->list()]);
});

Route::post('/archive/{id}/restore', static function (string $id) use ($archiver): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    return Http::json($archiver()->restore((int) $id, (int) $user['id']));
});

Route::get('/notifications', static function (): \Illuminate\Http\JsonResponse {
    Auth::user();
    $pdo = Database::pdo();
    $rows = $pdo->query('SELECT id, title, message, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 10')->fetchAll();
    $unread = (int) $pdo->query('SELECT COUNT(*) FROM notifications WHERE is_read = FALSE')->fetchColumn();
    return Http::json(['data' => $rows, 'unread' => $unread]);
});

Route::post('/notifications/read-all', static function (): \Illuminate\Http\JsonResponse {
    Auth::user();
    Database::pdo()->exec('UPDATE notifications SET is_read = TRUE');
    return Http::json(['ok' => true]);
});

Route::get('/settings', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(SettingsService::all());
});

Route::put('/settings', static function (): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    $body = Http::body();
    $password = (string) ($body['password'] ?? '');
    unset($body['password']);
    if ($password === '' || !Auth::verifyPassword($password)) {
        AuditService::log('Failed Settings Update', 'Settings', (int) $user['id'], ['reason' => 'wrong password']);
        Http::error('Incorrect password.', 403);
    }
    $updated = SettingsService::update($body);
    AuditService::log('Settings Updated', 'Settings', (int) $user['id'], ['keys' => array_keys($body)]);
    return Http::json($updated);
});

Route::get('/dashboard/summary', static function () use ($dashboard): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($dashboard()->summary());
});

/* ── Employees ──────────────────────────────────────── */

Route::get('/employees', static function () use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $employees()->all()]);
});

Route::get('/employees/{id}', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->find($id));
});

Route::get('/employees/{id}/profile', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->profile($id));
});

Route::post('/employees', static function () use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->create(Http::body()), 201);
});

Route::patch('/employees/{id}', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->update($id, Http::body()));
});

Route::delete('/employees/{id}', static function (string $id) use ($archiver): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    return Http::json($archiver()->archive('employee', $id, (int) $user['id']));
});

Route::post('/employees/{id}/salary', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->updateSalary($id, Http::body()));
});

Route::post('/employees/{id}/allowances', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->addAllowance($id, Http::body()), 201);
});

Route::delete('/allowances/{id}', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->deleteAllowance((int) $id));
});

Route::patch('/allowances/{id}', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->updateAllowance((int) $id, Http::body()));
});

Route::put('/loans/{id}', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->updateLoan((int) $id, Http::body()));
});

Route::post('/employees/{id}/loans', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->addLoan($id, Http::body()), 201);
});

Route::delete('/loans/{id}', static function (string $id) use ($employees): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($employees()->deleteLoan((int) $id));
});

Route::get('/salary-history', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => Database::pdo()->query(
        "SELECT sh.id, sh.effective_date, sh.basic_salary, sh.reason, sh.created_at,
                e.code, e.first_name || ' ' || e.last_name AS employee_name, e.department, e.position
           FROM salary_history sh
           JOIN employees e ON e.id = sh.employee_id
          WHERE e.is_archived = FALSE
          ORDER BY sh.effective_date DESC, sh.id DESC LIMIT 200"
    )->fetchAll()]);
});

/* ── Incentives (Compensation) ────────────────────────── */

$incentives = static fn (): IncentiveService => new IncentiveService(Database::pdo());

Route::get('/incentives', static function (Request $request) use ($incentives): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json([
        'structures'  => $incentives()->structures($request->query('employee_id')),
        'earnings'    => $incentives()->earnings($request->query('employee_id'), $request->query('period'), $request->query('status')),
        'types'       => IncentiveService::TYPES,
        'frequencies' => IncentiveService::FREQUENCIES,
    ]);
});

Route::post('/incentives', static function () use ($incentives): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($incentives()->create(Http::body()), 201);
});

Route::put('/incentives/{id}', static function (string $id) use ($incentives): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($incentives()->update((int) $id, Http::body()));
});

Route::delete('/incentives/{id}', static function (string $id) use ($incentives): \Illuminate\Http\JsonResponse {
    return Http::json($incentives()->delete((int) $id));
});

Route::post('/incentives/compute', static function () use ($incentives): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    return Http::json($incentives()->computePeriod(
        Http::requireString($body, 'period_start'),
        Http::requireString($body, 'period_end')
    ));
});

Route::post('/incentives/metric', static function () use ($incentives): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    return Http::json($incentives()->recordMetric(
        (int) Http::requireString($body, 'incentive_structure_id'),
        Http::requireString($body, 'period'),
        (float) ($body['value'] ?? 0),
        trim((string) ($body['note'] ?? ''))
    ));
});

Route::get('/incentives/summary', static function () use ($incentives): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($incentives()->summary());
});

/* ── Payroll ────────────────────────────────────────── */

Route::get('/payroll/runs', static function () use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $payroll()->listRuns()]);
});

Route::get('/payroll/runs/{id}', static function (string $id) use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($payroll()->getRun((int) $id));
});

Route::post('/payroll/process', static function () use ($payroll): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    $body = Http::body();
    $service = $payroll();

    $run = $service->openRun(
        Http::requireString($body, 'period_start'),
        Http::requireString($body, 'period_end'),
        filter_var($body['reseed'] ?? false, FILTER_VALIDATE_BOOL)
    );
    if (filter_var($body['compute'] ?? true, FILTER_VALIDATE_BOOL)) {
        $service->process((int) $run['id']);
        $run = $service->getRun((int) $run['id']);
    }
    if (filter_var($body['submit_to_finance'] ?? false, FILTER_VALIDATE_BOOL)) {
        $run = $service->submitToFinance((int) $run['id'], (int) $user['id']);
    }
    return Http::json($run, 201);
});

Route::post('/payroll/runs/{id}/compute', static function (string $id) use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($payroll()->process((int) $id));
});

Route::post('/payroll/runs/{id}/preview', static function (string $id) use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($payroll()->process((int) $id, false));
});

Route::post('/payroll/runs/{id}/submit-to-finance', static function (string $id) use ($payroll, $events): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    $run = $payroll()->submitToFinance((int) $id, (int) $user['id']);
    $events()->emit('payroll.submitted', ['run_id' => $run['id'] ?? (int) $id, 'period' => $run['period'] ?? null, 'total_gross' => $run['total_gross'] ?? null]);
    return Http::json($run);
});

Route::get('/payroll/trend', static function (Request $request) use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $payroll()->trend((string) $request->query('range', '30d'))]);
});

Route::post('/payroll/runs/{id}/pay-date', static function (string $id) use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    return Http::json($payroll()->setPayDate((int) $id, Http::requireString($body, 'pay_date')));
});

Route::post('/payroll/runs/{id}/return-to-draft', static function (string $id) use ($payroll): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    return Http::json($payroll()->returnToDraft((int) $id, (int) $user['id']));
});

Route::post('/payroll/runs/{id}/import', static function (string $id) use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    $rows = is_array($body['rows'] ?? null) ? $body['rows'] : [];
    return Http::json($payroll()->importItems((int) $id, $rows));
});

Route::post('/payroll/items/{id}/include', static function (string $id) use ($payroll): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    $runId = (int) Http::requireString($body, 'payroll_run_id');
    $payroll()->toggleIncluded($runId, (int) $id, filter_var($body['is_included'] ?? true, FILTER_VALIDATE_BOOL));
    return Http::json($payroll()->getRun($runId));
});

/* ── Claims ─────────────────────────────────────────── */

Route::get('/claims', static function (Request $request) use ($claims): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $claims()->list($request->query('employee_id'), $request->query('status'))]);
});

Route::get('/claims/categories', static function () use ($claims): \Illuminate\Http\JsonResponse {
    Auth::user();
    return Http::json(['data' => $claims()->categories()]);
});

Route::get('/claims/ocr-usage', static function (): \Illuminate\Http\JsonResponse {
    Auth::user();
    $tabscanner = TabscannerService::configured();
    $vision = ReceiptOcrService::configured();
    return Http::json([
        'provider' => $tabscanner ? 'tabscanner' : ($vision ? 'google-vision' : null),
        'used' => $tabscanner ? TabscannerService::monthlyUsage() : ($vision ? ReceiptOcrService::monthlyUsage() : 0),
        'free_tier' => $tabscanner ? 200 : 1000,
        'configured' => $tabscanner || $vision,
    ]);
});

Route::get('/claims/{id}', static function (string $id) use ($claims): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($claims()->get((int) $id));
});

Route::post('/claims/submit', static function () use ($claims): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    $receipt = null;
    if (isset($body['receipt_base64']) && is_string($body['receipt_base64']) && $body['receipt_base64'] !== '') {
        if (strlen($body['receipt_base64']) > 6_000_000) {
            Http::error('Receipt image is too large (max ~4MB).', 413);
        }
        $receipt = ['base64' => $body['receipt_base64'], 'mime' => (string) ($body['receipt_mime'] ?? 'image/jpeg')];
    }
    return Http::json($claims()->submit(
        Http::requireString($body, 'employee_id'),
        Http::requireString($body, 'category'),
        Http::number($body, 'amount'),
        Http::requireString($body, 'claim_date'),
        trim((string) ($body['description'] ?? '')),
        $receipt
    ), 201);
});

Route::post('/claims/{id}/decision', static function (string $id) use ($claims): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($claims()->decide((int) $id, Http::requireString(Http::body(), 'status')));
});

Route::delete('/claims/{id}', static function (string $id) use ($archiver): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    return Http::json($archiver()->archive('claim', $id, (int) $user['id']));
});

/* ── Benefits ───────────────────────────────────────── */

Route::get('/benefit-plans', static function () use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $benefits()->plans()]);
});

Route::get('/benefit-plans/all', static function () use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $benefits()->allPlans()]);
});

Route::post('/benefit-plans', static function () use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($benefits()->createPlan(Http::body()), 201);
});

Route::patch('/benefit-plans/{id}', static function (string $id) use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($benefits()->updatePlan((int) $id, Http::body()));
});

Route::delete('/benefit-plans/{id}', static function (string $id) use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($benefits()->deletePlan((int) $id));
});

Route::get('/benefits/enrollments', static function (Request $request) use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $benefits()->enrollments($request->query('employee_id'))]);
});

Route::post('/benefits/enroll', static function () use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    return Http::json($benefits()->enroll(
        Http::requireString($body, 'employee_id'),
        (int) Http::requireString($body, 'plan_id'),
        (int) ($body['dependents'] ?? 0)
    ), 201);
});

Route::post('/benefits/enrollments/{id}/cancel', static function (string $id) use ($benefits): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($benefits()->cancel((int) $id));
});

Route::post('/benefits/enrollments/{id}/activate', static function (string $id): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $stmt = Database::pdo()->prepare("UPDATE benefit_enrollments SET status = 'Active' WHERE id = ? AND status = 'Pending' RETURNING *");
    $stmt->execute([(int) $id]);
    $row = $stmt->fetch();
    if ($row === false) {
        Http::error('No pending application with that id.', 404);
    }
    AuditService::log('Benefit Application Activated', 'Benefits', null, ['enrollment_id' => (int) $id]);
    return Http::json($row);
});

Route::delete('/benefits/enrollments/{id}', static function (string $id) use ($archiver): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    return Http::json($archiver()->archive('benefit_enrollment', $id, (int) $user['id']));
});

/* ── Attendance ─────────────────────────────────────── */

Route::get('/attendance/logs', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $attendance()->logs($request->query('employee_id'), $request->query('start'), $request->query('end'))]);
});

Route::post('/attendance/logs', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($attendance()->log(Http::body()), 201);
});

Route::delete('/attendance/logs/{id}', static function (string $id) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($attendance()->deleteLog((int) $id));
});

Route::get('/attendance/timesheets', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $attendance()->timesheets($request->query('employee_id'), $request->query('start'), $request->query('end'))]);
});

Route::post('/attendance/timesheets', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($attendance()->saveTimesheet(Http::body()), 201);
});

Route::get('/attendance/daily', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $attendance()->daily(Http::requireString($request->query(), 'date'))]);
});

Route::get('/attendance/summary', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $attendance()->summary(Http::requireString($request->query(), 'month'))]);
});

Route::get('/attendance/shifts', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $attendance()->shifts($request->query('employee_id'), $request->query('start'), $request->query('end'))]);
});

Route::post('/attendance/shifts', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($attendance()->saveShift(Http::body()), 201);
});

Route::get('/attendance/cutoffs', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $attendance()->cutoffs(
        Http::requireString($request->query(), 'cutoff_start'),
        Http::requireString($request->query(), 'cutoff_end'),
        $request->query('employee_id')
    )]);
});

Route::post('/attendance/cutoffs', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    return Http::json($attendance()->saveCutoff(Http::body(), (int) $user['id']), 201);
});

Route::get('/attendance/adjustments', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $attendance()->adjustments($request->query('status'), $request->query('employee_id'))]);
});

Route::post('/attendance/adjustments', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    return Http::json($attendance()->requestAdjustment(Http::body(), (int) $user['id'], 'HR Admin'), 201);
});

Route::post('/attendance/adjustments/{id}/decision', static function (string $id) use ($attendance): \Illuminate\Http\JsonResponse {
    $user = Auth::requireHrAdmin();
    $body = Http::body();
    return Http::json($attendance()->decideAdjustment(
        (int) $id,
        Http::requireString($body, 'status'),
        (int) $user['id'],
        trim((string) ($body['notes'] ?? ''))
    ));
});

/* ── Leave ──────────────────────────────────────────── */

Route::get('/leave/balances', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $year = $request->query('year') !== null && $request->query('year') !== '' ? (int) $request->query('year') : null;
    return Http::json(['data' => $attendance()->leaveBalances($year)]);
});

Route::get('/leave/requests', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $year = $request->query('year') !== null && $request->query('year') !== '' ? (int) $request->query('year') : null;
    return Http::json(['data' => $attendance()->leaveRequests($year)]);
});

Route::post('/leave/requests', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($attendance()->fileLeave(Http::body()), 201);
});

Route::post('/leave/requests/{id}/decision', static function (string $id) use ($attendance): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($attendance()->decideLeave((int) $id, Http::requireString(Http::body(), 'status')));
});

/* ── Employee login accounts (HR Admin only) ────────── */

Route::get('/employee-accounts', static function () use ($accounts): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => $accounts()->list()]);
});

Route::post('/employees/{id}/account', static function (string $id) use ($accounts): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($accounts()->create($id, Http::body()), 201);
});

Route::put('/employees/{id}/account', static function (string $id) use ($accounts): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($accounts()->update($id, Http::body()));
});

Route::delete('/employees/{id}/account', static function (string $id) use ($accounts): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($accounts()->deactivate($id));
});

/* ── Employee self-service portal (/api/me/*) ───────── */

Route::get('/me/profile', static function () use ($employees): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    $employee = $employees()->find($employeeId);
    unset($employee['sss'], $employee['philhealth'], $employee['pagibig'], $employee['tin']);
    return Http::json($employee);
});

Route::get('/me/attendance', static function (Request $request) use ($attendance): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    return Http::json([
        'cutoffs'     => $attendance()->cutoffs(
            Http::requireString($request->query(), 'cutoff_start'),
            Http::requireString($request->query(), 'cutoff_end'),
            $employeeId
        ),
        'adjustments' => $attendance()->adjustments(null, $employeeId),
    ]);
});

Route::post('/me/attendance/adjustments', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    $user = Auth::user();
    $employeeId = Auth::requireLinkedEmployeeId();
    return Http::json($attendance()->requestAdjustment(
        array_merge(Http::body(), ['employee_id' => $employeeId]),
        (int) $user['id'],
        'Employee'
    ), 201);
});

Route::get('/me/leave', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    $year = (int) date('Y');
    $mine = static fn (array $rows) => array_values(array_filter($rows, static fn ($r) => $r['employee_id'] === $employeeId));
    return Http::json([
        'balances' => $mine($attendance()->leaveBalances($year)),
        'requests' => $mine($attendance()->leaveRequests($year)),
    ]);
});

Route::post('/me/leave/requests', static function () use ($attendance): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    return Http::json($attendance()->fileLeave(array_merge(Http::body(), ['employee_id' => $employeeId])), 201);
});

Route::get('/me/announcements', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireLinkedEmployeeId();
    $rows = Database::pdo()->query(
        'SELECT title, body, created_by, created_at FROM announcements ORDER BY created_at DESC LIMIT 1'
    )->fetchAll();
    return Http::json(['data' => $rows]);
});

Route::get('/me/attendance/recent', static function (): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    $stmt = Database::pdo()->prepare(
        'SELECT log_date, status FROM attendance_logs WHERE employee_id = ? ORDER BY log_date DESC LIMIT 5'
    );
    $stmt->execute([$employeeId]);
    return Http::json(['data' => $stmt->fetchAll()]);
});

Route::post('/me/photo', static function () use ($employees): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    $body = Http::body();
    return Http::json($employees()->updatePhoto(
        $employeeId,
        Http::requireString($body, 'photo_base64'),
        (string) ($body['photo_mime'] ?? 'image/jpeg')
    ));
});

Route::get('/me/claims', static function () use ($claims): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    return Http::json(['data' => $claims()->list($employeeId, null)]);
});

Route::post('/me/claims', static function () use ($claims): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    $body = Http::body();
    $receipt = null;
    if (isset($body['receipt_base64']) && is_string($body['receipt_base64']) && $body['receipt_base64'] !== '') {
        if (strlen($body['receipt_base64']) > 6_000_000) {
            Http::error('Receipt image is too large (max ~4MB).', 413);
        }
        $receipt = ['base64' => $body['receipt_base64'], 'mime' => (string) ($body['receipt_mime'] ?? 'image/jpeg')];
    }
    return Http::json($claims()->submit(
        $employeeId,
        Http::requireString($body, 'category'),
        Http::number($body, 'amount'),
        Http::requireString($body, 'claim_date'),
        trim((string) ($body['description'] ?? '')),
        $receipt
    ), 201);
});

Route::get('/me/benefits', static function () use ($benefits): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    return Http::json([
        'plans'       => $benefits()->plans(),
        'enrollments' => $benefits()->enrollments($employeeId),
    ]);
});

Route::post('/me/benefits/enroll', static function () use ($benefits): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    $body = Http::body();
    return Http::json($benefits()->enroll(
        $employeeId,
        (int) Http::requireString($body, 'plan_id'),
        (int) ($body['dependents'] ?? 0),
        'Pending'
    ), 201);
});

Route::get('/me/payroll-summary', static function (): \Illuminate\Http\JsonResponse {
    $employeeId = Auth::requireLinkedEmployeeId();
    $stmt = Database::pdo()->prepare(
        "SELECT r.period, r.period_start, r.period_end, r.status AS run_status,
                i.days_worked, i.ot_hours, i.basic_pay, i.overtime_pay, i.night_differential,
                i.holiday_pay, i.allowances, i.claims_amount, i.incentives, i.gross_pay,
                i.sss_ee, i.philhealth_ee, i.pagibig_ee, i.withholding_tax,
                i.loans_deduction, i.unpaid_leave_deduction, i.hmo_deduction, i.attendance_deduction,
                i.total_deductions, i.net_pay, i.pay_date, i.statutory_basis
           FROM payroll_items i
           JOIN payroll_runs r ON r.id = i.payroll_run_id
          WHERE i.employee_id = ? AND i.is_included = TRUE AND i.is_archived = FALSE
          ORDER BY r.period_start DESC LIMIT 24"
    );
    $stmt->execute([$employeeId]);
    return Http::json(['data' => $stmt->fetchAll()]);
});

/* ── Thirteenth month ───────────────────────────────── */

Route::get('/thirteenth-month', static function (Request $request) use ($thirteen): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $year = $request->query('year') !== null && $request->query('year') !== '' ? (int) $request->query('year') : null;
    return Http::json(['data' => $thirteen()->list($year)]);
});

Route::post('/thirteenth-month/generate', static function () use ($thirteen): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $year = (int) (Http::body()['year'] ?? date('Y'));
    return Http::json($thirteen()->generate($year), 201);
});

Route::post('/thirteenth-month/{id}/status', static function (string $id) use ($thirteen): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json($thirteen()->setStatus((int) $id, Http::requireString(Http::body(), 'status')));
});

/* ── Integration (external HRMS modules) ────────────── */

Route::get('/integration/capabilities', static function (): \Illuminate\Http\JsonResponse {
    return Http::json([
        'system' => 'Payroll & Benefits',
        'version' => '0.1.0',
        'auth' => 'X-Api-Key header; keys issued by an Admin or scripts/create-integration-key.php',
        'consumes' => [
            ['module' => 'Core HR', 'endpoint' => 'POST /api/integration/employees', 'scope' => 'core-hr:write'],
            ['module' => 'Workforce Management', 'endpoint' => 'POST /api/integration/attendance', 'scope' => 'workforce:write'],
            ['module' => 'Workforce Management', 'endpoint' => 'POST /api/integration/leave', 'scope' => 'workforce:write'],
            ['module' => 'Workforce Management', 'endpoint' => 'POST /api/integration/performance', 'scope' => 'performance:write', 'dedupe' => 'optional evaluation_id — duplicates are skipped'],
            ['module' => 'Performance & Development', 'endpoint' => 'POST /api/integration/recognition', 'scope' => 'performance:write', 'dedupe' => 'optional recognition_id — duplicates are skipped'],
            ['module' => 'Performance & Development', 'endpoint' => 'POST /api/integration/promotions', 'scope' => 'performance:write', 'dedupe' => 'optional promotion_id — duplicates are skipped'],
        ],
        'provides' => [
            ['module' => 'Financial Management', 'endpoint' => 'GET /api/integration/journal/{runId}', 'scope' => 'finance:read'],
            ['module' => 'Recruitment & Onboarding (ESS)', 'endpoint' => 'GET /api/integration/payslips/{employeeCode}', 'scope' => 'payroll:read'],
            ['module' => 'Recruitment & Onboarding (ESS)', 'endpoint' => 'POST /api/integration/payslips/batch', 'scope' => 'payroll:read'],
            ['module' => 'All modules', 'events' => ['payroll.submitted', 'payroll.approved', 'payroll.rejected', 'payroll.paid'], 'delivery' => 'webhook (HMAC-SHA256 signed)'],
        ],
    ]);
});

Route::post('/integration/employees', static function () use ($integration): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('core-hr:write');
    $rows = Http::body()['employees'] ?? null;
    if (!is_array($rows) || $rows === []) {
        Http::error('Body must be {"employees": [ ... ]} with at least one record.', 422);
    }
    $pdo = Database::pdo();
    $str = static fn (array $e, string $k): ?string => (isset($e[$k]) && $e[$k] !== '') ? trim((string) $e[$k]) : null;
    $find = $pdo->prepare('SELECT id FROM employees WHERE code = ?');
    $upd = $pdo->prepare(
        'UPDATE employees SET first_name = COALESCE(?, first_name), middle_name = COALESCE(?, middle_name),
                last_name = COALESCE(?, last_name), suffix = COALESCE(?, suffix), email = COALESCE(?, email),
                mobile = COALESCE(?, mobile), birth_date = COALESCE(?, birth_date), gender = COALESCE(?, gender),
                department = COALESCE(?, department), position = COALESCE(?, position),
                employment_type = COALESCE(?, employment_type), hire_date = COALESCE(?, hire_date),
                basic_salary = COALESCE(?, basic_salary), status = COALESCE(?, status),
                sss = COALESCE(?, sss), philhealth = COALESCE(?, philhealth), pagibig = COALESCE(?, pagibig),
                tin = COALESCE(?, tin), ewallet_provider = COALESCE(?, ewallet_provider),
                ewallet_account = COALESCE(?, ewallet_account), ewallet_name = COALESCE(?, ewallet_name),
                updated_at = now()
           WHERE id = ?'
    );
    $ins = $pdo->prepare(
        'INSERT INTO employees (id, code, first_name, middle_name, last_name, suffix, email, mobile, birth_date, gender,
                                department, position, employment_type, hire_date, basic_salary, status, sss, philhealth, pagibig, tin,
                                ewallet_provider, ewallet_account, ewallet_name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $pushed = 0;
    $created = 0;
    foreach ($rows as $e) {
        $code = is_array($e) ? $str($e, 'code') : null;
        $first = is_array($e) ? $str($e, 'first_name') : null;
        $last = is_array($e) ? $str($e, 'last_name') : null;
        if ($code === null || $first === null || $last === null) {
            Http::error('Each employee needs at least code, first_name and last_name.', 422);
        }
        $vals = [
            $first, $str($e, 'middle_name'), $last, $str($e, 'suffix'), $str($e, 'email'),
            $str($e, 'mobile'), $str($e, 'birth_date'), $str($e, 'gender'),
            $str($e, 'department'), $str($e, 'position'), $str($e, 'employment_type'), $str($e, 'hire_date'),
            ($bs = $str($e, 'basic_salary')) !== null && (float) $bs > 0 ? (float) $bs : null, $str($e, 'status'),
            $str($e, 'sss'), $str($e, 'philhealth'), $str($e, 'pagibig'), $str($e, 'tin'),
            $str($e, 'ewallet_provider'), $str($e, 'ewallet_account'), $str($e, 'ewallet_name'),
        ];
        $find->execute([$code]);
        $id = $find->fetchColumn();
        if ($id !== false) {
            $upd->execute([...$vals, $id]);
        } else {
            if ($vals[12] === null) {
                $vals[12] = 0; // new records need a salary value; 0 until Core HR supplies the real one
            }
            $ins->execute(['hris-' . strtolower($code), $code, ...$vals]);
            $created++;
        }
        $pushed++;
    }
    AuditService::log('Core HR Sync', 'Integration', null, ['pushed' => $pushed, 'created' => $created]);
    return Http::json(['ok' => true, 'pushed' => $pushed, 'created' => $created]);
});

Route::post('/integration/attendance', static function () use ($integration): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('workforce:write');
    $rows = Http::body()['logs'] ?? null;
    if (!is_array($rows) || $rows === []) {
        Http::error('Body must be {"logs": [ ... ]} with at least one record.', 422);
    }
    $pdo = Database::pdo();
    $check = $pdo->prepare('SELECT 1 FROM employees WHERE id = ?');
    $stmt = $pdo->prepare(
        'INSERT INTO attendance_logs (employee_id, log_date, status, actual_hours, ot_hours, nd_hours, holiday_hours, late_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (employee_id, log_date) DO UPDATE SET
           status = EXCLUDED.status, actual_hours = EXCLUDED.actual_hours, ot_hours = EXCLUDED.ot_hours,
           nd_hours = EXCLUDED.nd_hours, holiday_hours = EXCLUDED.holiday_hours, late_minutes = EXCLUDED.late_minutes'
    );
    $saved = 0;
    foreach ($rows as $l) {
        $eid = trim((string) (is_array($l) ? $l['employee_id'] ?? '' : ''));
        $date = trim((string) (is_array($l) ? $l['log_date'] ?? '' : ''));
        if ($eid === '' || $date === '') {
            Http::error('Each log needs employee_id and log_date (YYYY-MM-DD).', 422);
        }
        $check->execute([$eid]);
        if ($check->fetchColumn() === false) {
            Http::error('Unknown employee_id ' . $eid . '. Sync Core HR employees first.', 422);
        }
        $status = in_array((string) ($l['status'] ?? 'P'), ['P', 'H', 'A', 'OT'], true) ? (string) $l['status'] : 'P';
        $stmt->execute([
            $eid, $date, $status,
            (float) ($l['actual_hours'] ?? 0), (float) ($l['ot_hours'] ?? 0),
            (float) ($l['nd_hours'] ?? 0), (float) ($l['holiday_hours'] ?? 0), (float) ($l['late_minutes'] ?? 0),
        ]);
        $saved++;
    }
    AuditService::log('Workforce Sync', 'Integration', null, ['logs' => $saved]);
    return Http::json(['ok' => true, 'saved' => $saved]);
});

Route::post('/integration/leave', static function () use ($integration): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('workforce:write');
    $rows = Http::body()['requests'] ?? null;
    if (!is_array($rows) || $rows === []) {
        Http::error('Body must be {"requests": [ ... ]} with at least one record.', 422);
    }
    $pdo = Database::pdo();
    $check = $pdo->prepare('SELECT 1 FROM employees WHERE id = ?');
    $stmt = $pdo->prepare(
        'INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, is_paid, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $saved = 0;
    foreach ($rows as $r) {
        $eid = trim((string) (is_array($r) ? $r['employee_id'] ?? '' : ''));
        $type = trim((string) (is_array($r) ? $r['leave_type'] ?? '' : ''));
        $start = trim((string) (is_array($r) ? $r['start_date'] ?? '' : ''));
        if ($eid === '' || $type === '' || $start === '') {
            Http::error('Each leave request needs employee_id, leave_type and start_date.', 422);
        }
        $check->execute([$eid]);
        if ($check->fetchColumn() === false) {
            Http::error('Unknown employee_id ' . $eid . '. Sync Core HR employees first.', 422);
        }
        $status = in_array((string) ($r['status'] ?? 'Approved'), ['Pending', 'Approved', 'Rejected'], true) ? (string) $r['status'] : 'Approved';
        $stmt->execute([
            $eid, $type, $start,
            trim((string) ($r['end_date'] ?? '')) ?: $start,
            (float) ($r['days'] ?? 0),
            (int) filter_var($r['is_paid'] ?? true, FILTER_VALIDATE_BOOL),
            $status,
        ]);
        $saved++;
    }
    AuditService::log('Workforce Leave Sync', 'Integration', null, ['requests' => $saved]);
    return Http::json(['ok' => true, 'saved' => $saved]);
});

Route::post('/integration/performance', static function () use ($integration): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('performance:write');
    $rows = Http::body()['ratings'] ?? null;
    if (!is_array($rows) || $rows === []) {
        Http::error('Body must be {"ratings": [ ... ]} with at least one record.', 422);
    }
    $pdo = Database::pdo();
    $dup  = $pdo->prepare('SELECT 1 FROM performance_ratings WHERE evaluation_ref = ?');
    $check = $pdo->prepare('SELECT 1 FROM employees WHERE id = ?');
    $stmt = $pdo->prepare('INSERT INTO performance_ratings (employee_id, review_date, rating, bonus_amount, evaluation_ref) VALUES (?, ?, ?, ?, ?)');
    $saved = 0;
    $skipped = 0;
    foreach ($rows as $r) {
        $eid = trim((string) (is_array($r) ? $r['employee_id'] ?? '' : ''));
        $date = trim((string) (is_array($r) ? $r['review_date'] ?? '' : ''));
        if ($eid === '' || $date === '') {
            Http::error('Each rating needs employee_id and review_date.', 422);
        }
        $evalRef = isset($r['evaluation_id']) && (string) $r['evaluation_id'] !== '' ? (int) $r['evaluation_id'] : null;
        if ($evalRef !== null) {
            $dup->execute([$evalRef]);
            if ($dup->fetchColumn() !== false) {
                $skipped++;
                continue;
            }
        }
        $check->execute([$eid]);
        if ($check->fetchColumn() === false) {
            Http::error('Unknown employee_id ' . $eid . '. Sync Core HR employees first.', 422);
        }
        $stmt->execute([$eid, $date, trim((string) ($r['rating'] ?? '')) ?: null, (float) ($r['bonus_amount'] ?? 0), $evalRef]);
        $saved++;
    }
    AuditService::log('Performance Sync', 'Integration', null, ['ratings' => $saved, 'skipped' => $skipped]);
    return Http::json(['ok' => true, 'saved' => $saved, 'skipped_duplicates' => $skipped]);
});

Route::post('/integration/recognition', static function () use ($integration): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('performance:write');
    $rows = Http::body()['awards'] ?? null;
    if (!is_array($rows) || $rows === []) {
        Http::error('Body must be {"awards": [ ... ]} with at least one record.', 422);
    }
    $pdo = Database::pdo();
    $dup  = $pdo->prepare('SELECT 1 FROM recognition_awards WHERE recognition_ref = ?');
    $check = $pdo->prepare('SELECT 1 FROM employees WHERE id = ?');
    $stmt = $pdo->prepare('INSERT INTO recognition_awards (employee_id, award_date, award_name, bonus_amount, recognition_ref, tier, points) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $saved = 0;
    $skipped = 0;
    foreach ($rows as $a) {
        $eid = trim((string) (is_array($a) ? $a['employee_id'] ?? '' : ''));
        $award = trim((string) (is_array($a) ? $a['award'] ?? ($a['award_name'] ?? '') : ''));
        $date = trim((string) (is_array($a) ? ($a['approved_at'] ?? $a['award_date'] ?? '') : ''));
        $date = substr($date, 0, 10);
        if ($eid === '' || $award === '' || $date === '') {
            Http::error('Each award needs employee_id, award and approved_at (or award_date).', 422);
        }
        $recRef = isset($a['recognition_id']) && (string) $a['recognition_id'] !== '' ? (int) $a['recognition_id'] : null;
        if ($recRef !== null) {
            $dup->execute([$recRef]);
            if ($dup->fetchColumn() !== false) {
                $skipped++;
                continue;
            }
        }
        $check->execute([$eid]);
        if ($check->fetchColumn() === false) {
            Http::error('Unknown employee_id ' . $eid . '. Sync Core HR employees first.', 422);
        }
        $stmt->execute([
            $eid, $date, $award,
            (float) ($a['bonus_amount'] ?? 0), $recRef,
            trim((string) ($a['tier'] ?? '')) ?: null,
            ($a['points'] ?? null) !== null && $a['points'] !== '' ? (float) $a['points'] : null,
        ]);
        $saved++;
    }
    AuditService::log('Recognition Sync', 'Integration', null, ['awards' => $saved, 'skipped' => $skipped]);
    return Http::json(['ok' => true, 'saved' => $saved, 'skipped_duplicates' => $skipped]);
});

Route::post('/integration/promotions', static function () use ($integration): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('performance:write');
    $rows = Http::body()['promotions'] ?? null;
    if (!is_array($rows) || $rows === []) {
        Http::error('Body must be {"promotions": [ ... ]} with at least one record.', 422);
    }
    $pdo = Database::pdo();
    $dup  = $pdo->prepare('SELECT 1 FROM promotion_records WHERE promotion_ref = ?');
    $check = $pdo->prepare('SELECT 1 FROM employees WHERE id = ?');
    $stmt = $pdo->prepare('INSERT INTO promotion_records (employee_id, from_position, to_position, readiness, effective_date, approved_at, promotion_ref) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $saved = 0;
    $skipped = 0;
    foreach ($rows as $pr) {
        $eid = trim((string) (is_array($pr) ? $pr['employee_id'] ?? '' : ''));
        $to  = trim((string) (is_array($pr) ? $pr['to_position'] ?? '' : ''));
        $approvedAt = substr(trim((string) (is_array($pr) ? ($pr['approved_at'] ?? '') : '')), 0, 10);
        if ($eid === '' || $to === '' || $approvedAt === '') {
            Http::error('Each promotion needs employee_id, to_position and approved_at (YYYY-MM-DD).', 422);
        }
        $ref = isset($pr['promotion_id']) && (string) $pr['promotion_id'] !== '' ? (int) $pr['promotion_id'] : null;
        if ($ref !== null) {
            $dup->execute([$ref]);
            if ($dup->fetchColumn() !== false) {
                $skipped++;
                continue;
            }
        }
        $check->execute([$eid]);
        if ($check->fetchColumn() === false) {
            Http::error('Unknown employee_id ' . $eid . '. Sync Core HR employees first.', 422);
        }
        $eff = trim((string) ($pr['effective_date'] ?? ''));
        $stmt->execute([
            $eid,
            trim((string) ($pr['from_position'] ?? '')) ?: null,
            $to,
            trim((string) ($pr['readiness'] ?? '')) ?: null,
            $eff !== '' ? substr($eff, 0, 10) : null,
            $approvedAt,
            $ref,
        ]);
        $saved++;
    }
    AuditService::log('Promotion Sync', 'Integration', null, ['promotions' => $saved, 'skipped' => $skipped]);
    return Http::json(['ok' => true, 'saved' => $saved, 'skipped_duplicates' => $skipped]);
});

Route::get('/integration/journal/{runId}', static function (string $runId) use ($integration): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('finance:read');
    $pdo = Database::pdo();
    $stmt = $pdo->prepare('SELECT * FROM payroll_runs WHERE id = ?');
    $stmt->execute([(int) $runId]);
    $run = $stmt->fetch();
    if ($run === false) {
        Http::error('No such payroll run.', 404);
    }
    $gl = $pdo->prepare('SELECT entry_date, account_code, account_name, debit, credit, memo FROM general_ledger_entries WHERE payroll_run_id = ? ORDER BY account_code');
    $gl->execute([(int) $runId]);
    $disb = $pdo->prepare('SELECT employee_id, amount, provider, reference_no, status, disbursed_at FROM disbursement_records WHERE payroll_run_id = ? ORDER BY employee_id');
    $disb->execute([(int) $runId]);
    return Http::json([
        'run' => $run,
        'journal_entries' => $gl->fetchAll(),
        'disbursements' => $disb->fetchAll(),
    ]);
});

/* Employee-scoped payslip export for external ESS portals (scope payroll:read).
   Only post-submission runs are exposed; numeric fields stay strings, matching
   the /api/me/payroll-summary field names HR systems map against. */
$payslipsFor = static function (string $code, ?string $periodStart, int $limit): ?array {
    $pdo = Database::pdo();
    $emp = $pdo->prepare(
        "SELECT id, code, first_name, middle_name, last_name, department, position, status, basic_salary
           FROM employees WHERE code = ? AND is_archived = FALSE"
    );
    $emp->execute([$code]);
    $e = $emp->fetch();
    if ($e === false) {
        return null;
    }
    $sql =
        "SELECT r.period, r.period_start, r.period_end, r.status AS run_status,
                i.days_worked, i.ot_hours, i.basic_pay, i.overtime_pay, i.night_differential,
                i.holiday_pay, i.allowances, i.claims_amount, i.incentives, i.gross_pay,
                i.sss_ee, i.philhealth_ee, i.pagibig_ee, i.withholding_tax,
                i.loans_deduction, i.unpaid_leave_deduction, i.hmo_deduction, i.attendance_deduction,
                i.total_deductions, i.net_pay, i.pay_date, i.statutory_basis
           FROM payroll_items i
           JOIN payroll_runs r ON r.id = i.payroll_run_id
          WHERE i.employee_id = ? AND i.is_included = TRUE AND i.is_archived = FALSE
            AND r.status IN ('Pending Finance Approval', 'Approved', 'Paid', 'Closed')";
    if ($periodStart !== null) {
        $sql .= ' AND r.period_start >= ?';
    }
    $sql .= ' ORDER BY r.period_start DESC LIMIT ' . $limit;
    $stmt = $pdo->prepare($sql);
    $stmt->execute($periodStart !== null ? [$e['id'], $periodStart] : [$e['id']]);
    return [
        'employee' => [
            'id'           => $e['id'],
            'code'         => $e['code'],
            'name'         => trim($e['first_name'] . ' ' . ($e['middle_name'] ?? '') . ' ' . $e['last_name']),
            'department'   => $e['department'],
            'position'     => $e['position'],
            'status'       => $e['status'],
            'basic_salary' => $e['basic_salary'],
        ],
        'payslips' => $stmt->fetchAll(),
    ];
};

Route::get('/integration/payslips/{employeeCode}', static function (string $employeeCode, Request $request) use ($integration, $payslipsFor): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('payroll:read');
    $code = trim($employeeCode);
    if ($code === '') {
        Http::error('employeeCode is required.', 422);
    }
    $query = $request->query();
    $limit = min(max((int) ($query['limit'] ?? 24), 1), 24);
    $periodStart = trim((string) ($query['period_start'] ?? '')) ?: null;
    $payload = $payslipsFor($code, $periodStart, $limit);
    if ($payload === null) {
        Http::error('Unknown employee code ' . $code . '.', 404);
    }
    return Http::json($payload);
});

Route::post('/integration/payslips/batch', static function () use ($integration, $payslipsFor): \Illuminate\Http\JsonResponse {
    $integration()->requireScope('payroll:read');
    $body = Http::body();
    $codes = $body['codes'] ?? null;
    if (!is_array($codes) || $codes === []) {
        Http::error('Body must be {"codes": [ "E001", ... ]} with at least one code.', 422);
    }
    if (count($codes) > 100) {
        Http::error('A batch supports at most 100 codes per call.', 422);
    }
    $limit = min(max((int) ($body['limit'] ?? 24), 1), 24);
    $periodStart = trim((string) ($body['period_start'] ?? '')) ?: null;
    $employees = [];
    $notFound = [];
    foreach ($codes as $c) {
        $code = is_string($c) ? trim($c) : '';
        if ($code === '') {
            Http::error('Every code must be a non-empty string.', 422);
        }
        $payload = $payslipsFor($code, $periodStart, $limit);
        if ($payload === null) {
            $notFound[] = $code;
        } else {
            $employees[] = $payload;
        }
    }
    return Http::json(['ok' => true, 'employees' => $employees, 'not_found' => $notFound]);
});

Route::get('/integration/status', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $pdo = Database::pdo();
    $count = static function (string $sql, array $args = []) use ($pdo): int {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return (int) $st->fetchColumn();
    };
    $lastAt = static function (array $actions) use ($pdo): ?string {
        $in = implode(',', array_fill(0, count($actions), '?'));
        $st = $pdo->prepare("SELECT MAX(created_at) FROM audit_log WHERE action IN ($in)");
        $st->execute($actions);
        $v = $st->fetchColumn();
        return ($v === null || $v === false) ? null : (string) $v;
    };
    $keysFor = static function (string $prefix) use ($pdo): array {
        $st = $pdo->prepare('SELECT name, scopes, is_active, last_used_at FROM integration_keys WHERE name LIKE ? ORDER BY id');
        $st->execute([$prefix . '%']);
        return $st->fetchAll();
    };

    $partners = [
        [
            'key' => 'hr1', 'system' => 'HR1', 'name' => 'Core HR & Onboarding (Recruitment)',
            'direction' => 'Two-way',
            'endpoints' => [
                ['method' => 'POST', 'path' => '/api/integration/employees', 'purpose' => 'Push employee master + compensation into HR4', 'scope' => 'core-hr:write'],
                ['method' => 'GET', 'path' => '/api/integration/payslips/{code}', 'purpose' => 'Serve one employee\'s payslips back to ESS', 'scope' => 'payroll:read'],
                ['method' => 'POST', 'path' => '/api/integration/payslips/batch', 'purpose' => 'Serve payslips for up to 100 codes', 'scope' => 'payroll:read'],
            ],
            'metrics' => [
                ['label' => 'Employees synced', 'value' => $count("SELECT COUNT(*) FROM employees WHERE id LIKE 'hris-%' AND is_archived = FALSE")],
                ['label' => 'Last push', 'value' => $lastAt(['Core HR Sync'])],
            ],
            'keys' => $keysFor('hr1'),
        ],
        [
            'key' => 'hr2', 'system' => 'HR2', 'name' => 'Workforce Management',
            'direction' => 'Inbound',
            'endpoints' => [
                ['method' => 'POST', 'path' => '/api/integration/attendance', 'purpose' => 'Push daily attendance & overtime logs', 'scope' => 'workforce:write'],
                ['method' => 'POST', 'path' => '/api/integration/leave', 'purpose' => 'Push leave requests', 'scope' => 'workforce:write'],
            ],
            'metrics' => [
                ['label' => 'Attendance rows', 'value' => $count('SELECT COUNT(*) FROM attendance_logs')],
                ['label' => 'Leave requests', 'value' => $count('SELECT COUNT(*) FROM leave_requests')],
                ['label' => 'Last push', 'value' => $lastAt(['Workforce Sync', 'Workforce Leave Sync'])],
            ],
            'keys' => $keysFor('hr2'),
        ],
        [
            'key' => 'hr3', 'system' => 'HR3', 'name' => 'Performance & Development',
            'direction' => 'Inbound',
            'endpoints' => [
                ['method' => 'POST', 'path' => '/api/integration/performance', 'purpose' => 'Push approved performance ratings', 'scope' => 'performance:write'],
                ['method' => 'POST', 'path' => '/api/integration/recognition', 'purpose' => 'Push recognition awards', 'scope' => 'performance:write'],
                ['method' => 'POST', 'path' => '/api/integration/promotions', 'purpose' => 'Push succession-plan promotions', 'scope' => 'performance:write'],
            ],
            'metrics' => [
                ['label' => 'Evaluations', 'value' => $count('SELECT COUNT(*) FROM performance_ratings WHERE evaluation_ref IS NOT NULL')],
                ['label' => 'Recognition awards', 'value' => $count('SELECT COUNT(*) FROM recognition_awards WHERE recognition_ref IS NOT NULL')],
                ['label' => 'Promotions', 'value' => $count('SELECT COUNT(*) FROM promotion_records')],
                ['label' => 'Last push', 'value' => $lastAt(['Performance Sync', 'Recognition Sync', 'Promotion Sync'])],
            ],
            'keys' => $keysFor('hr3'),
        ],
    ];
    return Http::json(['partners' => $partners]);
});

Route::get('/integration/keys', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => Database::pdo()->query(
        'SELECT id, name, scopes, is_active, created_at, last_used_at FROM integration_keys ORDER BY id'
    )->fetchAll()]);
});

Route::post('/integration/keys', static function () use ($integration): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        Http::error('A key name is required.', 422);
    }
    $scopes = trim((string) ($body['scopes'] ?? '*')) ?: '*';
    $plain = $integration()->issueKey($name, $scopes);
    AuditService::log('Integration Key Issued', 'Integration', null, ['name' => $name, 'scopes' => $scopes]);
    return Http::json(['ok' => true, 'name' => $name, 'key' => $plain, 'scopes' => $scopes], 201);
});

Route::delete('/integration/keys/{id}', static function (string $id): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $stmt = Database::pdo()->prepare('UPDATE integration_keys SET is_active = FALSE WHERE id = ?');
    $stmt->execute([(int) $id]);
    return Http::json(['ok' => true]);
});

Route::get('/integration/webhooks', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    return Http::json(['data' => Database::pdo()->query(
        'SELECT id, name, event, url, is_active, created_at FROM webhook_endpoints ORDER BY id'
    )->fetchAll()]);
});

Route::post('/integration/webhooks', static function (): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $body = Http::body();
    $name = trim((string) ($body['name'] ?? ''));
    $event = trim((string) ($body['event'] ?? '*'));
    $url = trim((string) ($body['url'] ?? ''));
    if ($name === '' || !preg_match('#^https?://#', $url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
        Http::error('name and a valid http(s) url are required.', 422);
    }
    $stmt = Database::pdo()->prepare(
        "INSERT INTO webhook_endpoints (name, event, url, secret, is_active) VALUES (?, ?, ?, ?, TRUE)
         ON CONFLICT (name) DO UPDATE SET event = EXCLUDED.event, url = EXCLUDED.url, secret = EXCLUDED.secret, is_active = TRUE"
    );
    $stmt->execute([$name, $event !== '' ? $event : '*', $url, trim((string) ($body['secret'] ?? ''))]);
    return Http::json(['ok' => true]);
});

Route::delete('/integration/webhooks/{id}', static function (string $id): \Illuminate\Http\JsonResponse {
    Auth::requireHrAdmin();
    $stmt = Database::pdo()->prepare('UPDATE webhook_endpoints SET is_active = FALSE WHERE id = ?');
    $stmt->execute([(int) $id]);
    return Http::json(['ok' => true]);
});
