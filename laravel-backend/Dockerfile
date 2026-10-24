# Payroll & Benefits Laravel API — standalone backend-only image.
# NOTE: For HostForge deployments use the root-level Dockerfile instead;
# it builds the React frontend and bundles it with the Laravel backend into
# a single container.  This file is kept for backend-only testing purposes.
# pdo_pgsql + libpq-dev required for the Supabase Postgres connection.
FROM php:8.3-bookworm

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# unzip: Composer cannot extract dist zips without ext-zip OR unzip on PATH.
# COMPOSER_MEMORY_LIMIT/HOME: php.ini-production caps memory at 128M and the
# build user may have no writable home dir — both abort install with exit 1.
ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1 \
    COMPOSER_MEMORY_LIMIT=-1 \
    COMPOSER_HOME=/tmp/composer

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev unzip git ca-certificates \
 && docker-php-ext-install pdo_pgsql \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --optimize-autoloader --no-progress

COPY . .

RUN composer dump-autoload --optimize --no-dev \
 && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
 && php artisan package:discover --ansi \
 && chmod -R 775 storage bootstrap/cache

ENV PORT=8080
EXPOSE 8080

# key:generate needs a .env to write into; an empty one adds no keys, so the
# Render env vars stay authoritative.
CMD ["sh", "-c", "if [ -z \"$APP_KEY\" ]; then touch .env; php artisan key:generate --force; fi; exec php artisan serve --host=0.0.0.0 --port=${PORT} --no-reload"]
