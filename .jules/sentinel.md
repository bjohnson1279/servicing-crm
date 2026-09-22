## 2026-09-21 - [Hardcoded Database Credentials in Orchestration Files]
**Vulnerability:** Found hardcoded database credentials (`crm_password`, `crm_user`) in plain text inside `docker-compose.yml`. This exposes sensitive connection details directly in version control.
**Learning:** Even though `docker-compose.yml` is often used for local development, hardcoding credentials in version-controlled infrastructure/orchestration files is a critical anti-pattern that can leak into production environments or expose local data to anyone with repo access.
**Prevention:** Use environment variables with default fallbacks (e.g., `${POSTGRES_PASSWORD:-default_pass}`) in `docker-compose.yml` and provide a `.env.example` file. Never commit `.env` files containing actual secrets.

## 2026-09-22 - [Unauthenticated Data Store & Exposed Ports]
**Vulnerability:** Found Redis running without any authentication (no password required) and bound to `0.0.0.0:6379`. Also found Postgres port bound to `0.0.0.0:5432`.
**Learning:** Leaving datastores unauthenticated and fully exposed to host networking can lead to immediate remote code execution, data exfiltration, or data destruction if deployed in un-firewalled environments or public subnets. This violated the principle of least privilege.
**Prevention:** Always require passwords for databases like Redis (`command: redis-server --requirepass ${PASSWORD}`). Furthermore, bind exposed local ports strictly to localhost (`127.0.0.1:6379:6379`) to prevent external network accessibility.