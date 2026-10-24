<?php

use Illuminate\Http\Response;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
| All non-API requests are forwarded to the React SPA (index.html) so that
| client-side routing works correctly when the app is deployed as a single
| Docker image on HostForge.
|
| Uses direct Response instances to avoid dependencies on Laravel's optional
| ViewServiceProvider, ensuring zero chance of a 500 error on health checks.
*/

$serveSpa = static function (string $any = ''): Response {
    $spaDir = public_path('spa');

    // 1. If a static asset is requested, look in public/spa/ first, then public/
    $cleanPath = ltrim(preg_replace('#^spa/#', '', $any), '/');
    if ($cleanPath !== '') {
        $spaCandidate = $spaDir . DIRECTORY_SEPARATOR . $cleanPath;
        $rootCandidate = public_path($cleanPath);
        $candidate = is_file($spaCandidate) ? $spaCandidate : (is_file($rootCandidate) ? $rootCandidate : null);

        if ($candidate !== null) {
            $mime = 'application/octet-stream';
            if (str_ends_with($candidate, '.html')) {
                $mime = 'text/html; charset=UTF-8';
            } elseif (str_ends_with($candidate, '.js')) {
                $mime = 'application/javascript';
            } elseif (str_ends_with($candidate, '.css')) {
                $mime = 'text/css';
            } elseif (str_ends_with($candidate, '.jpg') || str_ends_with($candidate, '.jpeg')) {
                $mime = 'image/jpeg';
            } elseif (str_ends_with($candidate, '.png')) {
                $mime = 'image/png';
            } elseif (str_ends_with($candidate, '.svg')) {
                $mime = 'image/svg+xml';
            } elseif (str_ends_with($candidate, '.ico')) {
                $mime = 'image/x-icon';
            } elseif (str_ends_with($candidate, '.json')) {
                $mime = 'application/json';
            }
            return new Response(file_get_contents($candidate), 200, ['Content-Type' => $mime]);
        }
    }

    // 2. Otherwise serve the SPA index.html for client-side routing
    $spa = $spaDir . DIRECTORY_SEPARATOR . 'index.html';
    if (file_exists($spa)) {
        return new Response(file_get_contents($spa), 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-cache, private',
        ]);
    }

    // 3. Health check fallback if index.html is not yet copied
    return new Response('OK', 200, ['Content-Type' => 'text/plain']);
};

Route::get('/', $serveSpa);
Route::get('/{any}', $serveSpa)->where('any', '^(?!api).*$');
