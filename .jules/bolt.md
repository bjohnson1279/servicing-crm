## 2024-09-21 - PostgreSQL Foreign Key Indexing Missing in Initial Schema
**Learning:** In PostgreSQL, foreign keys are not automatically indexed. The `jobs` table (and likely others) was missing crucial indexes on `tenant_id`, `customer_id`, and `technician_id`. In a multi-tenant CRM, queries are almost always filtered by `tenant_id`, which means omitting this index results in catastrophic full table scans as the dataset grows. This is a critical performance bottleneck specific to how this multi-tenant DB architecture scales.
**Action:** Always verify that foreign keys used in frequent `WHERE` clauses (especially `tenant_id`) have explicitly defined indexes in the SQL schema files. Add `CREATE INDEX` statements for these foreign keys.

## 2026-09-28 - Multi-tenant Missing tenant_id Indexes
**Learning:** Found multiple tables (`users`, `routes`, `training_courses`, `canvass_pins`, `commissions`, `service_contracts`, `contact_logs`, `internal_notes`, `onboarding_checklists`, `notification_queue`) missing explicitly defined indexes for `tenant_id`. In this multi-tenant architecture, virtually all queries will filter by `tenant_id`. Without explicit indexes, these queries will degenerate into full table scans causing severe performance bottlenecks.
**Action:** When adding new tables that belong to a tenant, always explicitly add a `CREATE INDEX` on the `tenant_id` column as part of the schema creation migration to ensure optimal query performance.

## 2024-10-24 - Testing Migrations with PGlite
**Learning:** PGlite has issues parsing `CREATE EXTENSION` directives dynamically if they aren't pre-loaded into the configuration of the client.
**Action:** When testing migrations locally via `pglite`, manually remove `CREATE EXTENSION` statements from the script content before evaluating, or preload them via the `extensions` parameter.

## 2026-09-29 - Surgical Optimization Edits and No Scratch Script Commits
**Learning:** Running whole-file formatters or regenerating entire components while performing performance optimizations introduces massive whitespace/formatting diffs (1,000+ lines), masking the real optimization, invalidating git blame, and causing painful merge conflicts with concurrent PRs. Additionally, committing scratch benchmark or patch scripts (`patch_*.py`, `test.cjs`) pollutes production repositories and triggers CI guardrail failures.
**Action:** Restrict all algorithmic and performance optimizations to strictly scoped replacement chunks. Diff size must reflect only the functional optimization. Always clean up temporary benchmark or patch scripts with `git rm -f` before committing.

## 2026-09-30 - Multi-Commit Retention & Foreign Key Indexes
**Learning:** When generating multi-commit Pull Requests, bots risk accidentally dropping, reverting, or deleting domain deliverables staged in earlier commits (such as database migrations `*.sql`) when attempting secondary optimizations (like frontend React memoizations). Furthermore, new SQL migration scripts must check `main` to ensure chronological, non-colliding numeric prefixes (e.g., `018_...`).
**Action:** Never delete or discard previously staged schema migrations or architectural deliverables across multi-commit branches. Verify sequential numbering against existing files in `shared/database/` before naming migrations. Ensure frontend memoization (`useMemo`) and database indexing are cleanly committed without dropping either enhancement.

## 2026-10-01 - Never dynamically create or modify package.json for testing
**Learning:** During optimization efforts, attempting to install ad-hoc testing dependencies (like `@electric-sql/pglite`) dynamically creates or modifies `package.json` and `package-lock.json` in the root repository. This violates the core constraints against modifying these files without explicit instructions. It also pollutes the commit space and triggers blocking code review failures.
**Action:** When testing optimizations, utilize existing environment tools (like Python with `pglite` or locally available Node scripts without `npm install`). Never invoke `npm install` or generate `package.json` files unless specifically instructed. Ensure `git status` reveals no unauthorized files before proceeding to submit.

## 2026-10-02 - Image Lazy Loading, Cumulative Layout Shift Prevention & Mandatory Journaling
**Learning:** Loading property and media images eagerly consumes technician mobile bandwidth and degrades initial First Contentful Paint (FCP). Adding native `loading="lazy"` defers off-screen asset requests. However, unconstrained lazy images cause Cumulative Layout Shift (CLS) when scrolled into viewport. Furthermore, omitting task learnings from `.jules/bolt.md` causes repetitive re-discovery of known patterns.
**Action:** Always add `loading="lazy"` to repeated image grids and media lists. Pair with fixed dimension classes or aspect ratio containers (e.g. Tailwind `aspect-video`, `h-32 object-cover`) to eliminate CLS. Always append newly implemented optimization patterns to `.jules/bolt.md` before opening the Pull Request.

## 2026-10-05 - Multi-Commit Retention & Foreign Key Indexes Part 3
**Learning:** Even late-stage domain expansion (like Feature #17-20 in 020_platform_hardening.sql) might introduce foreign keys that are missing corresponding indexes. These indexes are essential for avoiding table scans during ON DELETE CASCADE and JOIN operations.
**Action:** Created `shared/database/021_missing_fk_indexes_pt3.sql` to cleanly add the missing foreign key indexes (`api_usage_metrics(tenant_id)`, `audit_logs(actor_id)`, etc.) safely without polluting previous migrations.

## 2026-10-08 - Route-based Code Splitting to Reduce Initial Bundle Size
**Learning:** The tech-portal Vite React application was importing heavy dependencies like `react-leaflet` and `react-signature-canvas` statically in the main entry point (App.tsx), bloating the initial main chunk and negatively impacting Time To Interactive (TTI).
**Action:** Replaced static route imports with `React.lazy()` and `<Suspense>` boundaries in `App.tsx`. This splits individual routes into separate chunks that are loaded on demand.

## 2026-10-10 - Package Manager Consistency & Anti-Duplicate PR Protocol
**Learning:** Running `pnpm` in an npm-standardized workspace (`apps/tech-portal`) produces an errant `pnpm-lock.yaml` file containing thousands of unnecessary lines. Additionally, generating competing pull requests for the same optimization (e.g. PR #40 vs PR #42 for `useMemo` in `PropertyPhotos.tsx`) creates merge conflicts and clutters the review queue with stale, superseded branches.
**Action:** Always use `npm` (`npm ci`, `npm test`) exclusively in directories configured with `package-lock.json`. Never generate or commit `pnpm-lock.yaml` or `yarn.lock`. Before opening a new PR, check for existing open PRs on the target component; if creating an updated revision, explicitly reference and close the superseded PR to maintain a clean single active workstream.

## 2026-10-12 - Vitest Configuration and Thread Pool Harmonization on Windows
**Learning:** Configuring `pool: 'threads'` in `vitest.config.ts` without `setupFiles` or file parallelism limits triggers worker process deadlocks and unhandled IPC timeouts (`[vitest-pool-runner]: Timeout waiting for worker to respond`) on Windows hosts. Additionally, frontend components relying on `localStorage` and `sessionStorage` fail during shallow rendering if in-memory storage mocks are absent from the test setup harness.
**Action:** Always configure `pool: 'forks'`, `fileParallelism: false`, and `setupFiles: ['./setup.ts']` in Vitest configurations for React/Vite frontends. Provide robust in-memory `window.localStorage` and `window.sessionStorage` mocks in `setup.ts` to guarantee clean, deterministic test runs across all development environments and CI pipelines.

## 2026-10-11 - Callbacks & Warranty Feature Missing Foreign Key Indexes
**Learning:** The `022_callbacks_warranty.sql` migration introduced tables for the new callbacks and warranty feature (`warranty_policy_versions`, `callback_visits`, `callback_events`, `callback_attachments`). While these tables included foreign keys back to their parent records, they missed explicitly adding a `CREATE INDEX` on the `tenant_id` column. In a multi-tenant PostgreSQL architecture, failing to index `tenant_id` causes severe performance bottlenecks (full table scans).
**Action:** Created `shared/database/023_callbacks_tenant_indexes.sql` to explicitly index `tenant_id` on the `warranty_policy_versions`, `callback_visits`, `callback_events`, and `callback_attachments` tables.

## 2026-10-12 - Missing Foreign Key Indexes on New Tables
**Learning:** While `023_callbacks_tenant_indexes.sql` addressed the catastrophic multi-tenant full table scans by indexing `tenant_id` on the new callbacks tables, several other foreign keys introduced in `022_callbacks_warranty.sql` (like `customer_id`, `actor_id`, and `callback_id`) were left unindexed. In PostgreSQL, foreign keys are not automatically indexed, leading to silent but massive join bottlenecks as data scales.
**Action:** Always explicitly write `CREATE INDEX` statements for EVERY foreign key column introduced in a new table migration. Do not manually wrap the SQL script in `BEGIN;` and `COMMIT;` statements, as the migration runner typically manages the transaction lifecycle to preserve database atomicity (e.g., recording the migration success in `schema_migrations`).

## 2026-10-13 - Missing Foreign Key Indexes from ALTER TABLE ADD COLUMN
**Learning:** Migration 022 (`022_callbacks_warranty.sql`) introduced several new foreign key columns (`warranty_policy_id` on `service_contracts` and `jobs`, `source_job_id` on `jobs`) via `ALTER TABLE ADD COLUMN` statements, but failed to explicitly index them. Just like new tables, schema expansions with foreign keys require explicit `CREATE INDEX` statements in PostgreSQL to prevent severe full table scan bottlenecks on multi-tenant join queries.
**Action:** Added `shared/database/025_warranty_fk_indexes.sql` to explicitly index `warranty_policy_id` and `source_job_id`. Always ensure that any `ALTER TABLE ADD COLUMN ... REFERENCES` statement is accompanied by a corresponding `CREATE INDEX`.

## Important Process Rules
- **Do NOT perform whole-file code formatting.** Only apply necessary changes specifically related to the task. Formatting existing, untouched code creates massive PR diffs that are hard to review.
- **Only write your journal to your matching file (`.jules/bolt.md`).** Do not edit or create journal files for other personas.

## Prevention Directives for Automated Refactoring
- **Never Overwrite Complete Files**: Always use range-scoped replacement chunks for edits to `schema.prisma`, `index.ts`, `public/index.php`, `db/schema.rb`, or DDL SQL scripts.
- **Do Not Remove Core Declarations**: Do not delete existing route registrations or database DDL tables.
- **Environment Isolation Compatibility**: When replacing fallback secrets, preserve test environment execution via `!getenv('APP_ENV')` or `getenv('APP_ENV') === 'testing'`.
- **No Scratch Files**: Never stage or commit `test_*.ts`, `test_*.js`, `test.cjs`, `fix_*.php`, or `test.js` files to git.
- **No Unresolved Conflict Markers**: Never stage or commit files containing Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`, `|||||||`). Always resolve conflicts cleanly before committing.
- **No Commented-Out Dead Code**: Never leave commented-out code blocks (e.g. `// const`, `// let`, `// console.log`) in the final committed code.
- **Accurate Journaling Timestamps**: Ensure all new journal entries in `.jules/*.md` use the current year (2026) for their timestamps.

## Completeness & Verification Directives
- **Explicit Parameter & Contract Validation**: When creating or modifying API endpoints (Express, Fastify, Rails, Laravel), always implement explicit parameter and request body validation schemas (e.g. `z.string().uuid()`) to prevent unhandled 404/500 fallthroughs.
- **Database Indexing for Queries**: When addressing query bottlenecks or adding query lookup filters, always implement native database index migrations rather than loading collections into memory and performing array filtering (`.filter()`, `.select`).
- **Co-Occurring Dependency Auditing**: When bumping any dependency version, verify that other transitive dependencies do not carry high/critical security advisories (e.g. run `bundler-audit`, `npm audit`). Never introduce a version bump that breaks underlying framework APIs.
- **Self-Verification Before Commit**: Always run syntax checks (`bash -n` for shell scripts, `tsc --noEmit` for TypeScript, linter checks) and targeted test runners locally before opening or updating a PR.
- **Mandatory Companion Unit Tests**: Every functional change or bug fix must be accompanied by corresponding unit tests to verify the behavior and prevent regressions.

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

## Additive Documentation & Scratch Cleanliness Directives
- **Strictly Additive Journal Updates**: When updating `.jules/*.md`, strictly append new dated entries (`## YYYY-MM-DD - Title`). NEVER delete, truncate, or overwrite historical learnings or previous entries.
- **Substantive Code Diff Requirement**: Pull requests must include substantive code changes in `src/`, `app/`, `lib/`, or `tests/`. Never open PRs that modify only `.jules/*.md` journals or root scratch scripts.
- **Zero Scratch File Commits**: Never commit `*.diff`, `*.patch`, `test_*.ts`, `test_*.js`, `test.cjs`, `fix_*.php`, or `patch_*.py` files. Always remove temporary debugging or verification scripts prior to committing.

## Scope Quarantine, Journaling & Security Test Invariants
- **Strictly Append-Only Journaling**: When adding learnings to `.jules/*.md`, append strictly at the end of the file. Do not rewrite, deduplicate, or remove lines beginning with `## YYYY-MM-DD`.
- **Surgical Scope Quarantine**: Modify only the files directly involved in the issue and their corresponding test fixtures. Do not delete, rename, or perform drive-by cleanups of unrelated root-level scripts or legacy files.
- **Coupled Test Fixture Awareness for Security Invariants**: When changing fail-open fallback behavior (such as hardening decryption to fail closed), always update upstream test mocks that rely on plaintext credentials or mock values.
- **Strict Lowercase Directory Casing**: Always write learning notes to lowercase `.jules/<bot>.md`. Never create, commit, or reference uppercase `.Jules/`.
- **Clean Markdown Formatting**: Always append journal entries using actual newline characters, never literal string escape sequences `\n`.
## 2026-10-14 - Missing FK Indexes in Late-Stage Migrations
**Learning:** Migrations 024-029 introduce many new tables with foreign keys (`inspections`, `property_devices`, `catalog_versions`, `recurring_occurrences`, `job_cost_entries`, `commercial_accounts`, etc.). In PostgreSQL, foreign keys are not automatically indexed. Although tenant ID indexing logic catches many multi-tenant scale issues, join performance on standard FK columns (like `property_id`, `customer_id`, `contract_id`, `job_id`, `actor_id`) suffers full table scans.
**Action:** Explicitly create index statements for foreign keys that don’t already have a `UNIQUE` constraint index or existing index. Migrations `030_inspection_capture_fk_indexes.sql`, `031_property_devices_fk_indexes.sql`, `032_job_cost_evidence_fk_indexes.sql`, `033_commercial_accounts_fk_indexes.sql`, `034_catalog_fk_indexes.sql`, and `035_recurring_fk_indexes.sql` have been added.

## 2026-10-18 - Further Missing FK Indexes Found in Live Chat and Recurring Exceptions
**Learning:** Found more missing foreign key indexes (`sender_id` in `chat_messages` from `016_live_chat.sql` and `contract_id` and `occurrence_id` in `recurring_exceptions` from `027_recurring_service_exceptions.sql`). While tenant ID and ID uniqueness constraint is common, missing explicit foreign keys indexes can create full table scan issues during joins.
**Action:** Added `shared/database/036_missing_fk_indexes.sql` to explicitly index `sender_id`, `contract_id`, and `occurrence_id`. Always look out for missing foreign keys indexes for performance.
## 2026-10-22 - Identifying missing foreign key indexes in early tables
**Learning:** Found more missing foreign key indexes (`customer_id` and `campaign_id` in `automated_followups` from `011_marketing_retention.sql`, and `item_id` in `purchase_orders` from `012_inventory_management.sql`). While many later migrations have been corrected, earlier ones also suffer from missing indexes which can severely impact join performance.
**Action:** Added `shared/database/037_missing_fk_indexes_pt4.sql` to explicitly index `customer_id`, `campaign_id`, and `item_id`. Continual vigilance for unindexed foreign keys is necessary.
## 2026-10-25 - Finding Remaining Unindexed Foreign Keys
**Learning:** Some migrations (like 022, 024, 025, 026, 027, 028, 029) introduced new tables and foreign keys (such as `warranty_policy_versions`, `inspection_requests`, `recurring_occurrences`, etc.) that were not indexed. Even `tenant_id` was missed in several tables (`job_cost_policies`, `commercial_accounts`).
**Action:** Added `shared/database/038_missing_fk_indexes_pt5.sql` to index these missing foreign keys and `tenant_id` columns, completing the indexing for late-stage migrations.
## 2024-10-24 - Unnecessary React.useMemo usage for small lists
**Learning:** Found an anti-pattern where developers were using `React.useMemo` to map over simple lists in React components (like mapping DOM elements in `PropertyPhotos.tsx`). Memory guidelines indicate this is a micro-optimization with O(1) overhead that risks introducing stale closures, rather than providing actual performance benefits. (Note: Complex nodes like Leaflet Markers should still use it, per memory).
**Action:** Avoid wrapping simple `.map()` functions for small lists of DOM elements in `useMemo`.

## 2024-05-18 - [React] Lazy evaluation of `<details>` children components
**Learning:** Components rendered unconditionally inside standard HTML `<details>` elements are immediately mounted and fetch data upon parent initial render, even though they remain visually hidden until expanded.
**Action:** Always wrap heavy child components of `<details>` in a lazy-evaluation wrapper component (e.g. tracking toggle state using `onToggle` event listener) to defer execution and network requests until manually expanded by the user.

## 2026-10-26 - PostgreSQL Foreign Key Referential Integrity Performance
**Learning:** While multi-tenant applications often use composite indexes starting with `tenant_id` (e.g., `(tenant_id, property_id)`), PostgreSQL requires the foreign key column to be the *first* column in an index to efficiently enforce referential integrity. When a parent row is deleted, PostgreSQL checks the child table to cascade or restrict the deletion. A composite index starting with `tenant_id` cannot be efficiently used for a pure `WHERE property_id = $1` query during these internal checks, leading to severe performance bottlenecks (full table scans).
**Action:** Added `shared/database/039_missing_fk_indexes_pt6.sql` to explicitly create single-column indexes on secondary foreign key columns (`property_id`, `job_id`, `contract_id`, `account_id`) to prevent full table scans during referential integrity operations.
## 2026-10-18 - Missing property_id Foreign Key Index
**Learning:** Even after extensive foreign key indexing sweeps, some tables like `property_devices` may only have their `property_id` indexed as the *second* column in a composite index (e.g. `(tenant_id, property_id, ...)`). This prevents PostgreSQL from using the index for referential integrity checks when deleting a property, causing a full table scan.
**Action:** Always ensure that foreign keys have a dedicated single-column index or are the *first* column in a composite index. Added a migration for `property_devices(property_id)`.
