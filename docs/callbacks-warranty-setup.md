# Callbacks and Warranty Service

## Implemented workflow

Customer/CSR intake → coverage review → staff decision → linked return visit → technician outcome → staff resolution. Cases support photos, information requests/replies, reopening, multiple visits, cancellation, paid quote acceptance, audit history, response targets, and reporting.

The shared PostgreSQL migration owns coverage checks and transactional commands. Express, FastAPI, GraphQL, and Laravel provide authenticated adapters. Keeping commands in PostgreSQL avoids four independently evolving implementations of approvals, retries, and billing rules. PostgreSQL is required for this feature; SQLite-only backend tests cannot exercise these commands.

## Enable locally or for a pilot

1. Apply `shared/database/022_callbacks_warranty.sql` after migrations 001–021. Use the project's configured database connection and standard migration procedure. The migration runs in a transaction; existing jobs remain standard jobs and tenant intake defaults to disabled.
2. Regenerate each TypeScript backend's Prisma client with its existing `prisma:generate` script. Do not use Prisma `db push` to manage this feature: SQL functions, triggers, and checks are authoritative in migration 022.
3. Set a nonempty `JWT_SECRET` on all enabled backend adapters. They accept HS256 bearer tokens with UUID `id`, UUID `tenantId`, and numeric `exp`; optional `nbf` is enforced. Roles and customer/technician ownership are loaded from the database, not trusted from token claims. Development mock identities and fallback secrets are deliberately unsupported for callback APIs.
4. Set `VITE_API_BASE_URL` to the selected backend's `/api/v1` URL, or configure the host to proxy `/api/v1` to that backend. For example the local Express API URL is `http://localhost:3182/api/v1`. Rebuild the frontend after changing Vite environment variables.
5. Have the application's authenticated session provider place its bearer token in `sessionStorage.crm_access_token` for each portal. Clear session storage on logout. **The existing portals do not have a production login/session provider; wiring this to the deployment's identity provider remains a prerequisite for real-user rollout.** The callback screens show a sign-in message when no token exists and never fall back to mock customer IDs.
6. As a manager or super-admin, open Admin → Callbacks & Warranty. Configure the tenant's contract-date time zone and optional hourly labor cost. Create policy versions and assign them to contracts or one-time service jobs. Enable new requests for the tenant.
7. Open Customer → Service requests to submit a report. Staff reviews it in the queue. Technicians access the assigned callback through their job's callback context.

Deploying to a live database and enabling real tenants have not been performed by this code change.

## Operational rules

- Warranty windows are elapsed days from the source visit's recorded `actual_departure`, inclusive at the boundary. Missing completion timestamps require manual review; invoice/update timestamps never extend coverage.
- Contract start/end dates are evaluated at report time in the configured tenant time zone (UTC until configured). Inactive contracts are not automatically covered. Free-text exclusions require staff review.
- Policy versions and case audit events are immutable. Assessment saves a policy snapshot. Changing an assignment does not silently rewrite an approved case's decision.
- New recurring source jobs copy the assigned contract policy at creation, so later contract policy changes do not replace the terms of a completed source visit. Legacy visits without this snapshot fall back to their explicitly assigned contract policy during staff assessment.
- CSRs/dispatchers can approve covered no-charge service. Goodwill or no-charge approval without a covered assessment requires a manager and recorded reason. Customers cannot approve coverage or financial overrides.
- Paid service requires a sent quote for the same customer/property. The customer accepts it through the callback command; this does not create an unrelated job. Dispatch is blocked until acceptance.
- Return jobs have no recurring contract link, preventing them from altering the recurring cadence. No-charge/goodwill jobs cannot be invoiced, and return jobs cannot generate sales commissions. Return-job identity/billing fields are immutable.
- Manage return-visit assignment, rescheduling, start, and cancellation through the callback workflow. Generic job updates cannot modify return visits. Dispatch cards link to the appropriate callback view.
- Completing a return visit does not resolve a case. Staff must review a recorded outcome and provide a resolution explanation.
- Each visit snapshots the tenant's labor rate. Manager-reviewed material costs are entered explicitly because inventory package costs and application units do not currently have a reliable conversion model. Missing labor time/rate/material cost yields an incomplete estimate, never a false zero.
- Intake, visit creation, and technician outcomes use stable request keys. Staff writes require the current case version and fail with 409 when stale. Customer replies and quote acceptance also use versions.
- Photos are JPEG/PNG, up to 1 MB each and ten per case, stored behind authenticated ownership checks. They are not served through the legacy public uploads directory.
- Customer timelines omit internal decision reasons, policy evidence, and technician/internal cost details. Technician access is limited to cases with assigned visits; submitting an outcome additionally requires assignment to that specific visit.
- Customer email updates reuse the notification queue and honor email opt-out preferences. Messages are queued in the same transaction as the case change. Existing notification workers deliver them.
- Authenticated `/callbacks/events` streams publish committed, ownership-scoped snapshots, refreshing every 15 seconds. Signing-token expiration closes the stream. The frontend uses authenticated fetch streaming, not the global unauthenticated event bus.
- Technician offline outcomes are retained in IndexedDB under their signed identity, retry with the same request key, and remain pending until accepted by the server. Conflicts/validation failures retain the draft for explicit review and retry. Offline case context uses the last loaded session cache.

## API contract

All four REST adapters expose `/api/v1/callbacks`. Fields use the same snake_case payloads and response shape. GET `/` returns `{items:[...]}` with `state`, `customer_id`, `job_id`, `limit` (max 100), and `offset` filters.

| Endpoint | Purpose |
|---|---|
| GET/POST `/settings` | Read configuration; managers enable/pause intake or configure labor rate/time zone |
| GET `/options` | Ownership-scoped properties, source visits, and staff technician/quote choices |
| GET `/report` | Cohort callback rate inputs, response/resolution time, repeat visits and reason/billing distributions |
| GET `/events` | Authenticated, scoped SSE snapshots |
| GET/POST `/policies` | List or create immutable warranty terms |
| POST `/policies/assign` | Assign policy to a contract or one-time job |
| POST `/` | Intake: property_id, optional source_job_id, pest_code, description, request_key |
| GET `/:id` | Case detail and timeline |
| POST `/:id/assess-coverage` | Assess or confirm source visit; version required |
| POST `/:id/decision` | Approve/decline/request information with reason and customer_message |
| POST `/:id/quotes` | Staff creates and sends a property-specific return-service quote |
| POST `/:id/reply` | Customer supplies requested information |
| POST `/:id/accept-quote` | Explicit customer acceptance of associated quote |
| POST `/:id/visits` | Create return job; scheduled_start, optional technician_id, request_key |
| POST `/:id/visit-update` | Start, assign/reschedule, or cancel an individual visit |
| POST `/:id/outcome` | Assigned technician findings, resolution_code, summary, job_id, request_key |
| POST `/:id/visit-cost` | Manager-reviewed material cost for a visit |
| POST `/:id/resolution` | Staff resolution summary, category and customer explanation |
| POST `/:id/reopen` or `/cancel` | Reasoned staff transition |
| POST `/:id/attachments` | Protected name, media_type, base64 data upload |
| GET `/:id/attachments/:attachment_id` | Ownership-checked photo retrieval |

GraphQL queries/mutations are defined in `shared/contracts/callbacks.graphql`. JSON inputs use the same REST fields and domain validation; GraphQL errors include the corresponding HTTP status in extensions.

## Verification

The database/adapter suite uses a temporary embedded PostgreSQL runtime without Docker:

```powershell
npm install --prefix .callback-test-runtime --no-save --package-lock=false @electric-sql/pglite
node tests/callbacks.integration.mjs
php tests/callback_auth.php
python -m pytest tests/test_callback_auth.py -q
```

Run the callback portal test from `apps/admin-portal`:

```powershell
node node_modules/vitest/vitest.mjs run src/features/callbacks/CallbackWorkspace.test.tsx
```

Run `src/callbackOfflineQueue.test.ts` with the technician portal's Vitest installation to verify retained failures, retry keys, and identity partitioning.

Local results: 50 PostgreSQL workflow assertions, 22 TypeScript REST/GraphQL/authentication/SSE assertions, eight FastAPI authentication tests, eight Laravel authentication assertions, four customer-workspace tests, and four technician offline-queue tests passed. Both Prisma schemas validated and their local clients were regenerated. The GraphQL backend and technician portal passed full typechecks; the Express and admin/customer portal callback files passed targeted strict typechecks. Full Express/admin/customer typechecks remain blocked by pre-existing errors in unrelated modules.

`scripts/prepare_callback_models.py` synchronizes the shared GraphQL/Prisma contract and portal source copies. Run it after changing `shared/ui` or `shared/contracts/callbacks.*`, and review generated changes.

The embedded suite loads the existing schema migrations, skipping only sample seed data and substituting PostgreSQL's built-in UUID generator for the optional uuid-ossp extension. It exercises actual PL/pgSQL commands and triggers. TypeScript REST/GraphQL transport tests use that same database through a Prisma test bridge. PHP/FastAPI identity tests exercise the actual adapter authentication boundaries without framework/database bootstrapping.

Full production pilot, real notification delivery, and browser/device offline testing require the deployed database, working identity provider, and external service credentials. Existing unrelated repository-wide typecheck errors are tracked separately from targeted callback checks.

## Pilot and rollback

Start with staff intake and one tenant; review coverage decisions, invoice protections, material-cost completeness, retained offline failures, and customer message delivery. Enable customer intake after validating the session integration. Pause intake through tenant settings if problems occur; existing cases stay readable and manageable. Keep the additive tables and historical records on rollback.
