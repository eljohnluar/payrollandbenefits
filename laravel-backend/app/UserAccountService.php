<?php
declare(strict_types=1);

namespace App;

use PDO;
use RuntimeException;

/**
 * HR-managed login accounts for employees (revision #9): HR Admin creates the
 * account with the employee's company email and sets the initial password.
 * Password resets are admin-only — self-service forgot-password is removed.
 * When the service role key is configured the account is mirrored into
 * Supabase Auth so the OTP second factor works for the new login.
 */
final class UserAccountService
{
    public function __construct(private readonly PDO $pdo) {}

    public function list(): array
    {
        return $this->pdo->query(
            "SELECT u.id, u.email, u.name, u.role, u.is_active, u.employee_id, u.created_at,
                    e.first_name, e.last_name, e.department, e.position
               FROM app_users u
               LEFT JOIN employees e ON e.id = u.employee_id
              ORDER BY u.role, u.name"
        )->fetchAll();
    }

    public function create(string $employeeId, array $body): array
    {
        $employee = $this->employee($employeeId);
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Enter a valid company email address for the employee.', 422);
        }
        $password = (string) ($body['password'] ?? '');
        $problem = Auth::strongPasswordProblem($password);
        if ($problem !== null) {
            throw new RuntimeException($problem, 422);
        }

        $dup = $this->pdo->prepare('SELECT id, employee_id FROM app_users WHERE lower(email) = ?');
        $dup->execute([$email]);
        $existing = $dup->fetch();
        if ($existing !== false && $existing['employee_id'] === null && $employeeId !== '') {
            // Self-registered login waiting for a record — attach it to this employee instead of duplicating.
            $linkedCheck = $this->pdo->prepare('SELECT 1 FROM app_users WHERE employee_id = ?');
            $linkedCheck->execute([$employeeId]);
            if ($linkedCheck->fetchColumn()) {
                throw new RuntimeException('That employee already has a login account. Reset its password instead.', 409);
            }
            $name = trim((string) ($body['name'] ?? '')) ?: trim($employee['first_name'] . ' ' . $employee['last_name']);
            $fix = $this->pdo->prepare(
                "UPDATE app_users SET employee_id = ?, password = ?, name = ?, role = 'Employee', is_active = TRUE, updated_at = now()
                  WHERE id = ?
                  RETURNING id, email, name, role, employee_id"
            );
            $fix->execute([$employeeId, password_hash($password, PASSWORD_DEFAULT), $name, (int) $existing['id']]);
            $user = $fix->fetch();
            AuditService::log('Employee Account Linked', 'Employees', null, ['employee_id' => $employeeId, 'email' => $email]);
            return ['account' => $user, 'supabase' => 'linked'];
        }
        if ($existing !== false) {
            throw new RuntimeException('That email already has a login account.', 409);
        }
        $linked = $this->pdo->prepare('SELECT 1 FROM app_users WHERE employee_id = ?');
        $linked->execute([$employeeId]);
        if ($linked->fetchColumn()) {
            throw new RuntimeException('That employee already has a login account. Reset its password instead.', 409);
        }

        $name = trim((string) ($body['name'] ?? '')) ?: trim($employee['first_name'] . ' ' . $employee['last_name']);
        $stmt = $this->pdo->prepare(
            "INSERT INTO app_users (email, password, name, role, initials, is_active, employee_id)
             VALUES (?, ?, ?, 'Employee', ?, TRUE, ?)
             RETURNING id, email, name, role, employee_id"
        );
        $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name, strtoupper(substr($name, 0, 2)), $employeeId]);
        $user = $stmt->fetch();

        $supabase = $this->syncToSupabase($email, $name, (int) $user['id']);
        AuditService::log('Employee Account Created', 'Employees', null, [
            'employee_id' => $employeeId, 'email' => $email, 'supabase' => $supabase,
        ]);
        return ['account' => $user, 'supabase' => $supabase];
    }

    /** Admin-side password reset (replaces self-service forgot-password). */
    public function update(string $employeeId, array $body): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM app_users WHERE employee_id = ?');
        $stmt->execute([$employeeId]);
        $user = $stmt->fetch();
        $stmt->closeCursor();
        if ($user === false) {
            throw new RuntimeException('That employee does not have a login account yet.', 404);
        }

        $password = (string) ($body['password'] ?? '');
        $updated = $user;
        if ($password !== '') {
            $problem = Auth::strongPasswordProblem($password);
            if ($problem !== null) {
                throw new RuntimeException($problem, 422);
            }
            $this->pdo->prepare('UPDATE app_users SET password = ?, is_active = TRUE WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), (int) $user['id']]);
            $this->updateSupabasePassword((string) ($user['auth_uid'] ?? ''), $password);
        }
        AuditService::log('Employee Account Updated', 'Employees', null, [
            'employee_id' => $employeeId, 'email' => $updated['email'],
            'password_reset' => $password !== '',
        ]);
        return ['account' => ['id' => (int) $updated['id'], 'email' => $updated['email'], 'name' => $updated['name'], 'role' => $updated['role'], 'employee_id' => $updated['employee_id']]];
    }

    public function deactivate(string $employeeId): array
    {
        $stmt = $this->pdo->prepare('UPDATE app_users SET is_active = FALSE, employee_id = NULL WHERE employee_id = ? RETURNING id, email');
        $stmt->execute([$employeeId]);
        $user = $stmt->fetch();
        if ($user === false) {
            throw new RuntimeException('That employee does not have a login account.', 404);
        }
        AuditService::log('Employee Account Deactivated', 'Employees', null, ['employee_id' => $employeeId, 'email' => $user['email']]);
        return ['ok' => true];
    }

    private function employee(string $id): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM employees WHERE id = ? AND is_archived = FALSE');
        $stmt->execute([$id]);
        $employee = $stmt->fetch();
        if ($employee === false) {
            throw new RuntimeException("Employee {$id} not found.", 404);
        }
        return $employee;
    }

    /** @return array{linked:bool,detail:string} */
    private function syncToSupabase(string $email, string $name, int $userId): array
    {
        $url = rtrim(Config::supabaseUrl(), '/');
        $key = Config::serviceRoleKey();
        if ($url === '' || $key === '') {
            return ['linked' => false, 'detail' => 'SUPABASE_SERVICE_ROLE_KEY not configured — run scripts/import-supabase-users.php after setting it so email-code sign-in works.'];
        }

        // GoTrue only needs to know the user for the OTP second factor; the
        // real password is verified against app_users in PHP. hashed_password
        // imports are rejected by this project's GoTrue, so use a random
        // placeholder that nobody signs in with.
        $payload = [
            'email'          => $email,
            'email_confirm'  => true,
            'user_metadata'  => ['name' => $name],
            'password'       => bin2hex(random_bytes(16)) . 'Aa1!',
        ];
        [$status, $body] = $this->request('POST', '/auth/v1/admin/users', $payload);
        $decoded = json_decode($body, true) ?: [];
        $uid = $decoded['id'] ?? null;

        if ($status === 422 && str_contains(strtolower($body), 'already')) {
            [$listStatus, $listBody] = $this->request('GET', '/auth/v1/admin/users?per_page=1000', null);
            $found = json_decode($listBody, true) ?: [];
            foreach ((array) ($found['users'] ?? []) as $su) {
                if (strcasecmp((string) ($su['email'] ?? ''), $email) === 0) {
                    $uid = $su['id'] ?? null;
                }
            }
        }
        if (!is_string($uid) || ($status >= 300 && $uid === null)) {
            return ['linked' => false, 'detail' => "Supabase import failed (HTTP {$status}): " . substr($body, 0, 160)];
        }
        if (preg_match('/^[0-9a-f-]{36}$/i', $uid)) {
            $this->pdo->prepare('UPDATE app_users SET auth_uid = ? WHERE id = ?')->execute([$uid, $userId]);
        }
        return ['linked' => true, 'detail' => 'Supabase auth user ready for email-code sign-in.'];
    }

    private function updateSupabasePassword(string $uid, string $password): void
    {
        if ($uid === '') {
            return;
        }
        // GoTrue expects a plaintext new password on the admin update.
        $this->request('PUT', '/auth/v1/admin/users/' . rawurlencode($uid), ['password' => $password]);
    }

    /** @return array{0:int,1:string} */
    private function request(string $method, string $path, ?array $payload): array
    {
        $url = rtrim(Config::supabaseUrl(), '/') . $path;
        $key = Config::serviceRoleKey();
        $ch = curl_init($url);
        $headers = ['apikey: ' . $key, 'Authorization: Bearer ' . $key, 'Content-Type: application/json'];
        $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_HTTPHEADER => $headers];
        if ($method === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = json_encode($payload);
        } elseif ($method === 'PUT') {
            $options[CURLOPT_CUSTOMREQUEST] = 'PUT';
            $options[CURLOPT_POSTFIELDS] = json_encode($payload);
        }
        curl_setopt_array($ch, $options);
        $body = (string) curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$status, $body];
    }
}
