<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
| All non-API requests are forwarded to the React SPA (index.html) so that
| client-side routing works correctly when the app is deployed as a single
| Docker image on HostForge.  The compiled frontend lives in public/spa/.
|
| In local development the React dev-server (Vite) handles the frontend;
| this catch-all only applies in production (when public/spa/index.html exists).
*/

Route::get('/{any}', function () {
    $spa = public_path('spa/index.html');
    if (file_exists($spa)) {
        return response()->file($spa);
    }
    return response('Not Found', 404);
})->where('any', '^(?!api).*$');
