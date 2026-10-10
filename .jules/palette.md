## 2024-05-24 - Missing accessibility in PropertyPhotos
**Learning:** The PropertyPhotos component was missing essential accessibility features, including missing labels for the file and caption inputs, no helpful empty state when photos are missing, and no aria-busy on the upload button.
**Action:** Always ensure that inputs have corresponding `<label>` tags with `htmlFor`, add helpful empty states for empty lists, and provide `aria-busy` states on async buttons for better screen reader and user experience.

## 2026-09-29 - Scope Verification for Async Loading Attributes
**Learning:** Blindly injecting `disabled={loading}` or `aria-busy={loading}` into JSX/TSX buttons causes fatal TypeScript compilation errors (`TS2304: Cannot find name 'loading'`) when `loading` is not declared in component props, state hooks (`useState`), or mutation results. Furthermore, using temporary patch scripts (`fix_*.cjs`) to manipulate source code pollutes the git index.
**Action:** Before referencing any state identifier (such as `loading`, `isSubmitting`, `isPending`) in `disabled` or `aria-busy`, inspect the component scope. If no loading state is tracked, define it using `useState(false)` or check existing query/mutation hooks. Never bind undeclared variables. Always run `tsc --noEmit` locally and never commit temporary fix scripts.

## 2026-10-01 - Inline Accessible Form Validation Over Browser Alerts
**Learning:** Using native browser `alert()` for form validation blocks the main browser thread and provides an unaccessible, jarring user experience that screen readers cannot contextualize. Furthermore, when build errors or peer dependency warnings occur during frontend testing, attempting to install build-time tools (like `@babel/core`, `prop-types`) as direct runtime `dependencies` pollutes package manifests and causes upstream lockfile conflicts.
**Action:** Replace `alert()` with inline accessible error/warning containers equipped with `role="alert"` and `aria-live="assertive"`. Include a smooth scroll (`window.scrollTo({ top: 0, behavior: 'smooth' })`) to bring error banners into view for long mobile forms. Never add build tooling to runtime `dependencies` in `package.json`; use `"overrides"` or `devDependencies` if peer conflicts arise, and ensure `package-lock.json` is always committed synchronously.

## 2026-10-02 - Dynamic Action Button Labeling, Focus Visibility & Mandatory Journaling
**Learning:** State advancement buttons with changing text (e.g. advancing job status across lifecycle steps) can confuse screen readers and keyboard users if assistive attributes and visual focus indicators are omitted. Omitting learnings from `.jules/palette.md` also leads to recurrent omissions across PRs.
**Action:** Always provide explicit dynamic `aria-label` attributes describing the exact state transition (e.g. `aria-label={`Mark job status as ${nextStatus}`}`). Add Tailwind `focus-visible:ring-2 focus-visible:ring-offset-2` keyboard rings to all actionable buttons and links. Always append newly established patterns to `.jules/palette.md` before submitting the Pull Request.

## 2026-10-03 - [Tailwind CSS Missing in Tech Portal]
**Learning:** Tailwind CSS is not currently configured or active in the React frontends (e.g., `apps/tech-portal`), despite the presence of Tailwind-like class usage in some component prompts.
**Action:** Do not use Tailwind utility classes for UI styling in frontends unless the framework is explicitly added and configured. Rely on standard inline styles or existing custom CSS stylesheets.

## 2026-10-04 - Dynamic Disabled State & Tooltip in SignatureCapture
**Learning:** The 'Save' button in `SignatureCapture` was originally enabled even when the canvas was blank, and it lacked visual feedback for its disabled state.
**Action:** Adding a `hasSignature` state tracked via `onEnd`, along with `disabled={!hasSignature}`, a helpful `title` tooltip, and dynamic inline styles (`opacity`, `cursor`) improves the user experience by preventing invalid submissions and clearly communicating the button's state.


## Important Process Rules
- **Do NOT perform whole-file code formatting.** Only apply necessary changes specifically related to the task. Formatting existing, untouched code creates massive PR diffs that are hard to review.
- **Only write your journal to your matching file (`.jules/palette.md`).** Do not edit or create journal files for other personas.


## 2026-10-05 - Accessible Toast Notifications Over Blocking Alerts
**Learning:** Using native browser `alert()` for asynchronous, background events (like server-sent "job assigned" updates) blocks the main thread, halts user interaction, and provides a poor experience—especially for users with assistive technology, as it interrupts their current task abruptly.
**Action:** Replace `alert()` usage with non-blocking, accessible toast notifications utilizing `role="status"` and `aria-live="polite"`. Ensure these notifications have a clearly labeled dismiss button (`aria-label`) and an auto-hide timeout (e.g., 5 seconds) to maintain a smooth, accessible user experience without hijacking the interface.

## 2026-10-06 - Dynamic Action Loading States & Inactive Tailwind Classes
**Learning:** Using a single generic boolean (e.g. `const [loading, setLoading] = useState(false)`) for components with multiple asynchronous actions (like "Clock In" vs "Clock Out") causes poor UX, as users lack specific feedback on which action is processing. Additionally, using Tailwind utility classes in a frontend where Tailwind is not configured (`apps/tech-portal`) results in unstyled components and inaccessible buttons lacking focus rings.
**Action:** Use specific loading state trackers (e.g. `const [actionLoading, setActionLoading] = useState<'in' | 'out' | null>(null)`) and dynamically update button text/`aria-busy` attributes during async operations. When working in frontends without Tailwind, always write semantic class names and append the required styling (including `focus-visible` outlines) to the existing `style.css` stylesheet.

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

## 2026-10-07 - Non-Blocking Notifications Over Alerts
**Learning:** Using the native `alert()` in React components blocks the main thread, halting user interaction and breaking the seamless flow of the application, especially on mobile PWAs where users expect a fluid experience. This is also inaccessible to screen readers that cannot gracefully parse or bypass blocking alerts in context.
**Action:** Replace `alert()` usage with accessible, non-blocking state-driven notifications (like the existing `resultMessage` state tied to an `aria-live="assertive"` element). This provides a better UX by rendering the error directly in the UI without freezing the app.

- **Strict Lowercase Directory Casing**: Always write learning notes to lowercase `.jules/<bot>.md`. Never create, commit, or reference uppercase `.Jules/`.

- **Clean Markdown Formatting**: Always append journal entries using actual newline characters, never literal string escape sequences `\n`.

## 2026-10-08 - Explicit Form Labeling & Role Grouping
**Learning:** React elements without properly associated `<label>` attributes (using `htmlFor` matching the input's `id`) severely harm screen reader accessibility. Additionally, related inputs like a group of pest checkboxes must be semantically grouped. Simply wrapping them in a `<label>` or `<div>` without a `role` is insufficient. Screen readers require `role="group"` on the container and an `aria-labelledby` referencing an ID on the heading/description text to correctly announce the group's context when tabbing through.
**Action:** Always verify that every form `<input>`, `<select>`, and `<textarea>` has a corresponding `id` correctly bound to a `<label htmlFor="...">`. For nested or multiple-choice checkbox arrays, wrap the container in `role="group"` with an explicit `aria-labelledby` targeting the group's textual heading.
