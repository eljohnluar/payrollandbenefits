<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
| All non-API requests are forwarded to the React SPA (index.html) so that
| client-side routing works correctly when the app is deployed as a single
| Docker image on HostForge. The compiled frontend lives in public/spa/.
|
| In local development the React dev-server (Vite) handles the frontend;
| this catch-all only applies in production (when public/spa/index.html exists).
*/

Route::get('/{any}', function (string $any = '') {
    $spaDir = public_path('spa');

    // 1. If the browser requested a static file located in public/spa/ (e.g. /logo.jpg, /favicon.ico)
    $cleanPath = ltrim(preg_replace('#^spa/#', '', $any), '/');
    if ($cleanPath !== '') {
        $candidate = $spaDir . DIRECTORY_SEPARATOR . $cleanPath;
        if (is_file($candidate)) {
            return response()->file($candidate);
        }
    }

    // 2. Otherwise serve the SPA index.html for client-side routing
    $spa = $spaDir . DIRECTORY_SEPARATOR . 'index.html';
    if (file_exists($spa)) {
        return response()->file($spa);
    }
    return response('Not Found', 404);
})->where('any', '^(?!api).*$');
