## 2026-09-21 - [Hardcoded Database Credentials in Orchestration Files]
**Vulnerability:** Found hardcoded database credentials (`crm_password`, `crm_user`) in plain text inside `docker-compose.yml`. This exposes sensitive connection details directly in version control.
**Learning:** Even though `docker-compose.yml` is often used for local development, hardcoding credentials in version-controlled infrastructure/orchestration files is a critical anti-pattern that can leak into production environments or expose local data to anyone with repo access.
**Prevention:** Use environment variables with default fallbacks (e.g., `${POSTGRES_PASSWORD:-default_pass}`) in `docker-compose.yml` and provide a `.env.example` file. Never commit `.env` files containing actual secrets.
## 2026-09-24 - [IDOR in GraphQL Schema: Client-provided Tenant Context]
**Vulnerability:** The GraphQL schema previously accepted `tenantId` as a direct parameter in mutations like `createJob(tenantId: UUID!, ...)`. This allows an authenticated user to potentially perform actions or create data on behalf of another tenant by simply injecting a different `tenantId` UUID into the payload.
**Learning:** In multi-tenant architectures, API contracts must never trust the client to specify their tenant context if the endpoint performs data manipulation or fetching scoped to a tenant.
**Prevention:** Always infer the `tenantId` server-side from the authenticated user's session, JWT token, or API key. Remove `tenantId` from client-facing input types and mutation arguments.
