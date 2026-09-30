## 2026-09-21 - [Hardcoded Database Credentials in Orchestration Files]
**Vulnerability:** Found hardcoded database credentials (`crm_password`, `crm_user`) in plain text inside `docker-compose.yml`. This exposes sensitive connection details directly in version control.
**Learning:** Even though `docker-compose.yml` is often used for local development, hardcoding credentials in version-controlled infrastructure/orchestration files is a critical anti-pattern that can leak into production environments or expose local data to anyone with repo access.
**Prevention:** Use environment variables with default fallbacks (e.g., `${POSTGRES_PASSWORD:-default_pass}`) in `docker-compose.yml` and provide a `.env.example` file. Never commit `.env` files containing actual secrets.

## 2026-09-22 - [Unauthenticated Data Store & Exposed Ports]
**Vulnerability:** Found Redis running without any authentication (no password required) and bound to `0.0.0.0:6379`. Also found Postgres port bound to `0.0.0.0:5432`.
**Learning:** Leaving datastores unauthenticated and fully exposed to host networking can lead to immediate remote code execution, data exfiltration, or data destruction if deployed in un-firewalled environments or public subnets. This violated the principle of least privilege.
**Prevention:** Always require passwords for databases like Redis (`command: redis-server --requirepass ${PASSWORD}`). Furthermore, bind exposed local ports strictly to localhost (`127.0.0.1:6379:6379`) to prevent external network accessibility.

## 2026-09-28 - [IDOR Vulnerability in API Contracts]
**Vulnerability:** The API contract `schema.graphql` accepted `tenantId` in the `createJob` mutation payload. This is an Insecure Direct Object Reference (IDOR) and authorization bypass vulnerability, as a malicious user could provide a `tenantId` belonging to another organization to access or manipulate their data.
**Learning:** API contracts and implementations in this multi-tenant architecture must never accept `tenantId` from client payloads. The tenant context must be securely inferred on the server-side from the authenticated user's session or token (e.g., JWT). Also, when modifying shared API contracts, we do not need to update frontend queries or backend resolvers since the `apps/` and `backends/` directories are currently empty scaffolding without implementation code.
**Prevention:** Remove `tenantId` from client-facing input types and mutations. Ensure authentication middleware correctly extracts and injects the `tenantId` into the request context for downstream resolvers to use.


## Prevention Directives for Automated Refactoring
- **Never Overwrite Complete Files**: Always use range-scoped replacement chunks for edits to `schema.prisma`, `index.ts`, `public/index.php`, `db/schema.rb`, or DDL SQL scripts.
- **Do Not Remove Core Declarations**: Do not delete existing route registrations or database DDL tables.
- **Environment Isolation Compatibility**: When replacing fallback secrets, preserve test environment execution via `!getenv('APP_ENV')` or `getenv('APP_ENV') === 'testing'`.
- **No Scratch Files**: Never stage or commit `test_*.ts`, `test_*.js`, `test.cjs`, `fix_*.php`, or `test.js` files to git.
- **No Unresolved Conflict Markers**: Never stage or commit files containing Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`, `|||||||`). Always resolve conflicts cleanly before committing.

## Completeness & Verification Directives
- **Explicit Parameter & Contract Validation**: When creating or modifying API endpoints (Express, Fastify, Rails, Laravel), always implement explicit parameter and request body validation schemas (e.g. `z.string().uuid()`) to prevent unhandled 404/500 fallthroughs.
- **Database Indexing for Queries**: When addressing query bottlenecks or adding query lookup filters, always implement native database index migrations rather than loading collections into memory and performing array filtering (`.filter()`, `.select`).
- **Co-Occurring Dependency Auditing**: When bumping any dependency version, verify that other transitive dependencies do not carry high/critical security advisories (e.g. run `bundler-audit`, `npm audit`). Never introduce a version bump that breaks underlying framework APIs.
- **Self-Verification Before Commit**: Always run syntax checks (`bash -n` for shell scripts, `tsc --noEmit` for TypeScript, linter checks) and targeted test runners locally before opening or updating a PR.

## Hallucinatory Task & Empty PR Directives
- **Zero-Diff Task Termination**: If the requested optimization, refactor, or fix is ALREADY natively present in the target branch, DO NOT create an empty pull request or commit an acknowledgment PR. Exit the task cleanly without opening a PR.
- **No Journal-Only PRs**: Never open a pull request that only contains updates to .jules/*.md files without corresponding functional code changes and tests.
- **Stale Suggestion Guard**: Always verify the current code on `main`/`master` before planning changes. If no actionable diff is required, cancel task execution immediately.

## Assertiveness, Decisive PR Execution & Comparative Recommendations
- **Proactive & Decisive PR Submission**: Do NOT repeatedly pause to ask permission to open a pull request (e.g., avoid "Would you like me to open a PR for this?", "Can I submit the PR?", "Should I go ahead and create the PR?"). When an optimization, fix, or feature satisfies requirements, passes local test runners/linters, and preserves architectural invariants, proceed decisively to create and submit the Pull Request with a clear, structured summary and rationale.
- **Explicit Recommendations on Options**: When presenting multiple implementation strategies or architecture options (e.g., Option A vs. Option B), NEVER leave the choice open-ended or passive. Always make an explicit, reasoned recommendation (prefixed with `(Recommended)`) based on **overall technical effectiveness**:
  1. *Algorithmic & Complexity Gains*: Time and space complexity impact (O(N*M) -> O(N+M), reduction of nested scans).
  2. *Resource Overhead*: Heap allocations, memory pressure, and GC pause reduction.
  3. *Domain & Architecture Invariants*: Strict backward compatibility, contract stability, and prevention of regression risks.
  4. *Security & Reliability*: Input validation, cryptographic safety, and concurrency safety.
- **Lead with Recommended Path**: State clearly why the recommended solution delivers the highest net value and immediately execute or propose it as the primary course of action rather than asking open-ended questions.

## Scope Verification, Minimal Churn & CI Protection Directives
- **Scope Verification Before Variable Binding**: When adding interactive states or accessibility attributes (e.g. `disabled={loading}`, `aria-busy={loading}`, `isSubmitting`), NEVER assume a variable identifier exists. Always inspect component props, local state hooks (`useState`), or declaration scope first. If not defined, declare the state hook or reuse an existing scope variable. Never introduce TS2304 / TS2552 ("Cannot find name") compile errors.
- **Surgical Edits Only (No Whole-File Formatting)**: Never run whole-file code formatters (Prettier, Black, Pint, rustfmt) across unmodified lines. Changes must be strictly range-scoped and limited to the minimal AST block needed. Avoid noisy quote/whitespace churn that masks real logic changes and causes merge conflicts. Verify with `git diff -w` that non-functional churn is zero.
- **Zero Scratch File Commits**: Never stage or commit ad-hoc verification, patch, or debug scripts (`test.cjs`, `fix_*.cjs`, `fix_*.php`, `patch_*.py`, `patch_*.sh`, `scratch_*`). Execute checks via the project's native test commands (`npm test`, `pytest`, `phpunit`, etc.) and delete temporary scripts before creating git commits.
- **Never Weaken CI Workflows**: Do not modify `.github/workflows/**` to bypass failures (e.g. adding `|| true`, setting `continue-on-error: true`, or commenting out assertions). Always resolve the defect in the source code or test fixture.
- **Explicit Parameter & Variable Types**: In TypeScript files, avoid implicit `any` by always providing explicit types on functions, parameters, and arrow callbacks (e.g. `(id: string) => ...`). Verify zero type errors with `tsc --noEmit` before committing.

## 2026-09-29 - Non-Destructive Security Patching & CI Protection
**Learning:** Security patches must never weaken CI workflow files (`.github/workflows/**`) by appending `|| true` or `continue-on-error: true` to suppress test/build failures. Furthermore, when adding defensive type assertions or input validators in TypeScript, omitting explicit types can introduce `TS7006: Parameter implicitly has an 'any' type`.
**Action:** Never modify CI workflow definitions to bypass test failures; resolve the underlying issue in source code or test fixtures. Always provide explicit types on newly introduced parameters and helper functions. Ensure zero scratch scripts (`fix_*.php`, `test_*.js`) are committed.

## 2026-09-30 - [IDOR in GraphQL Schema Fixed & Monorepo Guard]
**Vulnerability:** The API contract `schema.graphql` previously accepted `salesRepId` in the `createCanvassPin` mutation and `commissions` query. Allowing this parameter creates an IDOR risk, enabling sales representatives to retrieve commissions or submit pins on behalf of other reps.
**Learning:** Similar to the previously fixed `tenantId` IDOR, API definitions must never trust user-supplied identifiers (such as `salesRepId`) when the backend can definitively resolve them from the authenticated session context. Furthermore, when attempting to resolve CI build issues, bots must NEVER fabricate `.gitmodules` entries pointing to speculative remote URLs that do not exist or force `submodules: true` in CI checkouts without verifying remote repository accessibility.
**Prevention:** Remove `salesRepId` from GraphQL input arguments and mutations. Infer user context exclusively from JWT tokens or session context. Verify repository cleanliness and do not alter submodule configurations without existing public remotes.
