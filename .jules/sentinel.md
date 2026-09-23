## 2026-09-21 - [Hardcoded Database Credentials in Orchestration Files]
**Vulnerability:** Found hardcoded database credentials (`crm_password`, `crm_user`) in plain text inside `docker-compose.yml`. This exposes sensitive connection details directly in version control.
**Learning:** Even though `docker-compose.yml` is often used for local development, hardcoding credentials in version-controlled infrastructure/orchestration files is a critical anti-pattern that can leak into production environments or expose local data to anyone with repo access.
**Prevention:** Use environment variables with default fallbacks (e.g., `${POSTGRES_PASSWORD:-default_pass}`) in `docker-compose.yml` and provide a `.env.example` file. Never commit `.env` files containing actual secrets.
## 2026-09-23 - [IDOR Authorization Bypass in API Contracts]
**Vulnerability:** The API contracts (`API_REFERENCE.md`, `shared/contracts/schema.graphql`) allowed clients to explicitly provide `tenantId` in request payloads (e.g., `createJob`). This allows a malicious user to create jobs or access data belonging to a different tenant, resulting in an Insecure Direct Object Reference (IDOR).
**Learning:** Multi-tenant systems must strictly isolate tenant data. Relying on a client-provided `tenantId` bypasses server-side authorization checks and breaks tenant isolation.
**Prevention:** Never accept `tenantId` in API request payloads. The backend must securely infer the `tenantId` from the authenticated user's session or verified token (e.g., JWT).
