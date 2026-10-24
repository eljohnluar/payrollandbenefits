<?php
declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/** Error raised by App\Http::error(); rendered as {error, ...extra} JSON. */
final class ApiException extends RuntimeException
{
    /** @param array<string,mixed> $extra */
    public function __construct(
        public readonly string $apiMessage,
        public readonly int $status,
        public readonly array $extra = [],
    ) {
        parent::__construct($apiMessage, $status);
    }
}
