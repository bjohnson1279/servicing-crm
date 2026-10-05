## 2024-09-21 - PostgreSQL Foreign Key Indexing Missing in Initial Schema
**Learning:** In PostgreSQL, foreign keys are not automatically indexed. The `jobs` table (and likely others) was missing crucial indexes on `tenant_id`, `customer_id`, and `technician_id`. In a multi-tenant CRM, queries are almost always filtered by `tenant_id`, which means omitting this index results in catastrophic full table scans as the dataset grows. This is a critical performance bottleneck specific to how this multi-tenant DB architecture scales.
**Action:** Always verify that foreign keys used in frequent `WHERE` clauses (especially `tenant_id`) have explicitly defined indexes in the SQL schema files. Add `CREATE INDEX` statements for these foreign keys.

## 2026-09-28 - Multi-tenant Missing tenant_id Indexes
**Learning:** Found multiple tables (`users`, `routes`, `training_courses`, `canvass_pins`, `commissions`, `service_contracts`, `contact_logs`, `internal_notes`, `onboarding_checklists`, `notification_queue`) missing explicitly defined indexes for `tenant_id`. In this multi-tenant architecture, virtually all queries will filter by `tenant_id`. Without explicit indexes, these queries will degenerate into full table scans causing severe performance bottlenecks.
**Action:** When adding new tables that belong to a tenant, always explicitly add a `CREATE INDEX` on the `tenant_id` column as part of the schema creation migration to ensure optimal query performance.
## 2024-10-24 - Testing Migrations with PGlite
**Learning:** PGlite has issues parsing `CREATE EXTENSION` directives dynamically if they aren't pre-loaded into the configuration of the client.
**Action:** When testing migrations locally via `pglite`, manually remove `CREATE EXTENSION` statements from the script content before evaluating, or preload them via the `extensions` parameter.

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
\n\n## Important Process Rules\n- **Do NOT perform whole-file code formatting.** Only apply necessary changes specifically related to the task. Formatting existing, untouched code creates massive PR diffs that are hard to review.\n- **Only write your journal to your matching file (`.jules/bolt.md`).** Do not edit or create journal files for other personas.\n