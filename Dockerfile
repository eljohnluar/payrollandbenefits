# =============================================================================
# Payroll & Benefits System — single-image deployment for HostForge
#
# Stage 1 (node-builder): builds the React frontend into /frontend/dist
# Stage 2 (php-runtime):  runs the Laravel API and serves the React SPA as
#                         static files from Laravel's public/ directory.
#
# The frontend and backend share the same origin, so no CORS headers are
# needed for browser → API calls in production.
# =============================================================================

# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:22-alpine AS node-builder

WORKDIR /build

# Install deps first (layer-cache friendly)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build
COPY frontend/ .

# VITE_API_BASE is intentionally empty: same-origin API calls go to /api/*
# which Laravel handles directly — no proxy needed in production.
# Supabase browser keys are baked into the JS bundle at build time.
# Pass them as Build Arguments in the HostForge dashboard.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_API_BASE="" \
    VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

RUN npm run build

# ── Stage 2: PHP / Laravel runtime ───────────────────────────────────────────
FROM php:8.3-bookworm

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1 \
    COMPOSER_MEMORY_LIMIT=-1 \
    COMPOSER_HOME=/tmp/composer

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev unzip git ca-certificates \
 && docker-php-ext-install pdo_pgsql \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PHP dependencies (layer-cache friendly)
COPY laravel-backend/composer.json laravel-backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist \
        --optimize-autoloader --no-progress

# Copy the full Laravel backend
COPY laravel-backend/ .

# Copy the compiled React app into Laravel's public directory so it is served
# as static files alongside the API.
COPY --from=node-builder /build/dist ./public/spa
RUN cp -rn ./public/spa/* ./public/ 2>/dev/null || true

RUN mkdir -p storage/framework/cache storage/framework/sessions \
             storage/framework/views storage/logs bootstrap/cache \
 && composer dump-autoload --optimize --no-dev \
 && php artisan package:discover --ansi \
 && chmod -R 775 storage bootstrap/cache public

ENV PORT=8080
EXPOSE 8080

# Generate APP_KEY at boot when the operator did not pre-set one.
CMD ["sh", "-c", \
  "if [ -z \"$APP_KEY\" ]; then touch .env; php artisan key:generate --force; fi; \
   exec php artisan serve --host=0.0.0.0 --port=${PORT} --no-reload"]
