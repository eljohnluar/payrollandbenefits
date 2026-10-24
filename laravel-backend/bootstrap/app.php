<?php

use App\Support\ApiException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Mirror the legacy bootstrap error contract exactly: every API failure
        // is JSON {error, ...extra} with the intended status code.
        $exceptions->respond(function ($response, Throwable $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return $response;
            }

            if ($e instanceof ApiException) {
                return new JsonResponse(['error' => $e->apiMessage] + $e->extra, $e->status);
            }

            if ($e instanceof NotFoundHttpException) {
                return new JsonResponse(['error' => 'Unknown endpoint.'], 404);
            }

            if ($e instanceof MethodNotAllowedHttpException) {
                return new JsonResponse(['error' => 'Method not allowed for this endpoint.'], 405);
            }

            if ($e instanceof HttpExceptionInterface) {
                return new JsonResponse(['error' => $e->getMessage() ?: 'Unexpected server error.'], $e->getStatusCode());
            }

            error_log('[payroll-api] ' . $e->getMessage());

            // Services throw RuntimeException with an HTTP code for business-rule
            // violations (422 etc.); surface the message with that status.
            if ($e instanceof RuntimeException && $e->getCode() >= 400 && $e->getCode() <= 599) {
                return new JsonResponse(['error' => $e->getMessage()], (int) $e->getCode());
            }

            $debug = (bool) env('APP_DEBUG', false);
            $status = $e instanceof RuntimeException && str_contains($e->getMessage(), 'PostgreSQL') ? 503 : 500;

            return new JsonResponse(
                ['error' => $debug ? $e->getMessage() : 'Unexpected server error.']
                + ($debug ? ['trace' => explode("\n", $e->getTraceAsString())] : []),
                $status
            );
        });
    })->create();
