<?php

// In production the frontend is served from the same origin as the API, so
// CORS is only needed for local development.  Add extra origins (e.g. a
// staging domain) via the FRONTEND_ORIGIN env var (comma-separated).
$default = 'http://localhost:5173,http://localhost:5180';
$configured = trim((string) env('FRONTEND_ORIGIN', ''));
$origins = array_values(array_filter(array_map(
    static fn ($o) => rtrim(trim($o), '/'),
    explode(',', $configured !== '' ? $configured : $default)
), static fn ($o) => $o !== ''));

return [
    'paths' => ['api/*', 'up'],

    'allowed_methods' => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],

    'allowed_origins' => $origins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Api-Key', 'Accept'],

    'exposed_headers' => [],

    'max_age' => 600,

    'supports_credentials' => false,
];
