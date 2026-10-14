# Local Docker runtime

The default profile runs PostgreSQL, Redis, Express and the three portals.
The all profile adds GraphQL, FastAPI and Laravel against the same database.

## Configuration

Copy .env.example to .env for a new installation and set PostgreSQL and Redis
credentials. JWT_SECRET must contain a random shared HS256 signing secret.
LARAVEL_APP_KEY must be base64: followed by the base64 encoding of 32 random bytes.
Keep .env private. The application does not generate a new key on every startup.

Admin uses host port 3102 because 3100 belongs to another local application.
Customer uses 3101 and technician uses 3002. Backends use 3181 through 3184.
Port variables in .env override host bindings; container ports remain fixed.

Each portal uses same-origin /api URLs and the Vite server proxies them to
VITE_API_PROXY_TARGET (http://express-api:8000 in Compose). Standalone Vite
defaults to http://localhost:3182. This proxy target is a server-side address,
not a URL embedded into browser code. Vite allows the exact Docker service hostname and polls bind-mounted files so
Windows source changes are detected. Legacy backend path differences are still
listed in the parity audit.

## Startup and verification

On a constrained Docker VM, build backend images individually to avoid parallel
dependency downloads and compiler memory pressure. Dependency caches retain
completed downloads across retries.

Run docker compose up -d --build for the default profile, or
docker compose --profile all up -d --build for all four backends.

PostgreSQL and Redis volumes retain their data. Backend source trees do not
hide compiled image artifacts or installed dependencies. Laravel stores writable
files in the laravel-storage volume. GraphQL HR uploads are kept in the
graphql-private-uploads volume, outside the public upload directory. Python reload is disabled in the image.

Run the read-only runtime check from PowerShell after all services are healthy:

    Get-Content -Raw scripts/docker-runtime-smoke.cjs | docker compose exec -T express-api node

The check selects an existing manager/admin identity from the local database,
creates a short-lived token in memory, and checks health, jobs and feature
settings through all four HTTP runtimes. It also checks GraphQL POST handling
and portal proxies, plus unsigned-request denial. It never prints tokens or
customer records and does not mutate domain records. Ordinary usage-metering
middleware may record read requests.

## Background workers

When all backends share one database, only one implementation should run
background workers. Express is enabled by default; GraphQL and Python are
disabled. Override EXPRESS_BACKGROUND_JOBS, GRAPHQL_BACKGROUND_JOBS and
FASTAPI_BACKGROUND_JOBS in .env when selecting a different worker owner.
Laravel's scheduler is not started by the HTTP container.

These switches prevent concurrent processors in the comparison stack; they do
not implement distributed locking or change the deferred recurring-generation
feature. Database migrations remain explicit, not automatic startup operations.

## Database migrations

Do not rerun the whole SQL folder against an existing database: several migrations
are non-idempotent. Inspect installed tables/functions, take a pg_dump backup and
apply only missing migrations in order with ON_ERROR_STOP enabled. Never delete
the PostgreSQL volume to resolve an application startup failure.

## Verification status on October 14

The Express image built and the default stack passed HTTP/proxy, PostgreSQL and
Redis checks earlier in the run. Docker later returned engine HTTP 500/EOF errors
and the WSL control connection timed out. A subsequent host API health check
returned no HTTP response. Docker Desktop was not restarted because the user
requested that other projects remain running.

GraphQL dependencies and Linux Prisma generation completed on a cached retry,
but its final image did not complete. Python and Laravel images did not complete.
Their Docker deployment remains unverified. The runtime smoke script is ready
for use after the engine is available; it has not passed the full all-backend run.

All eight Compose profiles validate independently. The apps profile includes its
Express dependency. Final local GraphQL TypeScript, PHP syntax, Python syntax,
Node smoke-script syntax and whitespace checks passed. Full runtime verification
remains blocked by the engine/WSL condition described above.
