# Job cost evidence foundation

Apply migrations in order through 028_job_cost_evidence.sql, then deploy the API and admin portal changes together. Prisma scalar mappings and Python/PHP read metadata are included; database commands own evidence writes. Standard Prisma client generation can be performed during deployment; these API adapters use parameterized raw SQL rather than generated model write methods.

## Configure

Open **Job cost review**. A current database MANAGER or SUPER_ADMIN must set a three-letter reporting currency and IANA timezone, save an effective-dated loaded hourly labor-cost policy with a review reason, then enable cost review. Currency cannot change once a policy or cost entry exists. Historical policies are immutable; a correction on the same effective date creates a new policy revision. Existing cost snapshots retain the original policy.

Dispatchers, customer service staff, technicians, and customers are denied all cost endpoints, including settings and retry replay. Verified bearer identity supplies tenant and actor; token role claims do not authorize access. Client reports are uncached and cleared after identity change.

## Record evidence

The workspace reports five category totals per job: on-site labor, driving labor, materials, subcontractors, and other direct costs. Each category is missing until a manager records evidence. Available statuses are evidenced actual, confirmed zero, estimated, and unknown. Source references and a review/correction reason are required. Each write replaces the **entire category total**, preserves the previous revision, and uses its current revision as an optimistic guard. This first slice is a category-total ledger, not an item-level stock or payroll journal.

For provisional labor/driving estimates, explicitly enter a service date. The database multiplies recorded minutes by the applicable effective-dated policy and rounds to two decimals. Missing, negative, or more than 1440 minutes are rejected. No applicable historical policy means no estimate; today's rate is not silently substituted. Recorded time estimates cannot be labeled actual through that source. Managers may record a separate actual total supported by payroll/other evidence after review.

Material quantities and callback totals appear as source evidence only. Current inventory unit_cost is never used for historical valuation. Units are not automatically converted. Callback currency is explicitly unverified. When reconciling material evidence, include all costs in the category total once; the report does not separately add callback totals or legacy chemical logs.

Corrections append an immutable replacement entry linked to the prior entry; reports count only the latest revision per job/category. Negative category totals are unsupported; use a corrected nonnegative total instead. Unknown has a null amount. Confirmed zero has an explicit zero amount and attestation. Future actual/zero service dates are rejected; forecasts must be estimated. All monetary inputs/outputs use decimal strings with two decimal places. No cross-currency conversion is performed.

Changed source minutes/technician or material logs/callback material evidence makes the relevant total stale. Stale amounts are excluded from valid known/estimated subtotals, and completeness becomes false until reviewed and replaced. Rate policy changes alone do not rewrite historical estimates. Manual receipts and source references are manager attestations; the system does not verify uploaded documents in this slice.

## Reports and scope

Complete requires current actual/zero evidence for all five categories. Missing, unknown, estimated, or stale evidence remains incomplete. Known and estimated subtotals are separate. A displayed known subtotal of 0.00 does not imply confirmed zero categories; inspect category status.

Revenue state is always not_reconciled, with null contribution and margin. Invoices, payments, subscription charges, taxes, credits/refunds, and recurring_amount are not treated as revenue automatically. Contract attribution is snapshotted on cost entries, but contract rollups and callback-to-source-contract attribution are later work. Existing billing, inventory quantities, job status, and callback records are unchanged.

Date filters select jobs with at least one current category evidence date in the requested range. Job totals still cover all current categories; they are not period allocations. Jobs without cost evidence are excluded by evidence-date filters. Read reports do not post costs, and nothing runs as an automatic importer. Legacy finance/labor routes retain their existing behavior and need the separate authorization audit planned before finance integration.

## API

All four backends expose /api/v1/profitability:

- GET /settings: reporting configuration and immutable labor policies.
- POST /settings: enabled, currency, timezone.
- POST /policies: effective_from (ISO date), hourly_rate (decimal string), reason, request_key (UUID).
- GET /: job cost list; limit (1–100), offset, complete, property_id, contract_id, from, through.
- GET /{id}: current categories, recorded source evidence, historical revisions.
- POST /{id}/costs: category, revision, status, source (manual or recorded_time), amount (decimal string/null), service_date (ISO date), source_reference, reason, request_key.

GraphQL equivalents: profitabilitySettings, jobCosts, jobCost, profitabilityCommand restricted to settings/policy/record. GET settings cannot mutate configuration. Cross-tenant job/customer/property/contract/technician/material references are denied or excluded. Writes require valid same-tenant actor, currency, policy, and correction chain.

Network retries reuse the original request key/payload. A reused key with different payload conflicts. Role and enablement are checked before record replay. Resolve or discard a pending retry before changing the action; discard reloads evidence because the original request may already have committed. Version conflicts require reload before recording a correction.

## Verification

Run node tests/profitability.integration.mjs for real migrations, decimal/date/policy behavior, immutable corrections, completeness, source deduplication, tenant/role enforcement, and TypeScript adapters. Run Python test_profitability_adapters.py, PHP profitability_auth.php, and the admin ProfitabilityWorkspace.test.tsx suite for transport and UI boundaries. Canonical tests use the existing local PGlite runtime. Prisma validation needs DATABASE_URL set; schema validation itself does not connect to that database.
