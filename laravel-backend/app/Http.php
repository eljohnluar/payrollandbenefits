<?php
declare(strict_types=1);

namespace App;

use App\Support\ApiException;
use Illuminate\Http\JsonResponse;

/**
 * Response helpers for the ported API handlers. json() returns a real Laravel
 * response (no echo/exit); error() throws an ApiException that the exception
 * renderer turns into the same {error, ...extra} JSON body the legacy backend
 * produced, with the same status codes.
 */
final class Http
{
    public static function json(mixed $data, int $status = 200): JsonResponse
    {
        return new JsonResponse($data, $status, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function error(string $message, int $status = 400, array $extra = []): never
    {
        throw new ApiException($message, $status, $extra);
    }

    /** Best-effort client address; honours the proxy header Supabase/Cloudflare set. */
    public static function clientIp(): ?string
    {
        $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if (is_string($forwarded) && $forwarded !== '') {
            $first = trim(explode(',', $forwarded)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP) !== false) {
                return $first;
            }
        }
        $direct = $_SERVER['REMOTE_ADDR'] ?? '';
        return is_string($direct) && $direct !== '' ? $direct : null;
    }

    /** Decoded JSON body, falling back to form-encoded POST fields. */
    public static function body(): array
    {
        $decoded = json_decode((string) request()->getContent(), true);
        if (is_array($decoded)) {
            return $decoded;
        }
        return request()->all();
    }

    public static function requireString(array $data, string $key): string
    {
        $value = trim((string) ($data[$key] ?? ''));
        if ($value === '') {
            self::error("Field '{$key}' is required.", 422);
        }
        return $value;
    }

    public static function number(array $data, string $key, float $default = 0.0): float
    {
        return is_numeric($data[$key] ?? null) ? (float) $data[$key] : $default;
    }
}
