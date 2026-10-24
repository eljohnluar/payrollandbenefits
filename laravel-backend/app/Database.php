<?php
declare(strict_types=1);

namespace App;

use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

/**
 * Single shared PDO handle. Rebased on Laravel's pgsql connection so Eloquent,
 * the query builder and the ported services all use one Supabase pooler link.
 */
final class Database
{
    public static function pdo(): PDO
    {
        try {
            return DB::connection('pgsql')->getPdo();
        } catch (RuntimeException $e) {
            throw $e;
        } catch (\Throwable $e) {
            throw new RuntimeException(
                'Unable to reach the PostgreSQL database. Check .env (DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD). Driver said: ' . $e->getMessage()
            );
        }
    }
}
