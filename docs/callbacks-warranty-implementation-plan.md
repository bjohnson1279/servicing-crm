# Callbacks and Warranty Service — Implementation Plan

Status: Core implementation completed locally. Database/API, portal, offline queue, and authentication checks pass. Live rollout requires applying migration 022, configuring authenticated portal sessions, and completing the tenant pilot. See `callbacks-warranty-setup.md` for setup and verification details.

## Objective

Let customers and office staff report problems after service, assess coverage consistently, dispatch a linked return visit, and record the outcome and internal cost. Preserve the original service history and make repeat problems visible.

## Repository context

- Reuse existing customers, properties, service contracts, jobs, dispatch, chemical logs, photos, notification queue, and Customer 360.
- Add case management to CRM; keep return visits in Dispatch and charge decisions in Billing.
- Deliver equivalent behavior across Express, FastAPI, GraphQL, and Laravel, with shared API contracts and conformance fixtures.
- Existing contract fields describe cadence, dates, status, and amount, but do not define warranty terms. Do not infer warranty entitlement from an active contract alone.
- Customer BookingForm currently uses mock identity and a hardcoded API address. The new flow must use authenticated identity and the configured API client. Existing job controllers also need explicit ownership enforcement on any paths reused by this initiative.

## MVP scope and defaults

Include customer/CSR intake, photos, source-job linking, coverage assessment, approval/decline, linked return jobs, technician resolution, customer status updates, and basic callback reporting.

Default to staff approval before dispatch. Coverage checks produce a recommendation with reasons; they do not promise free service. Missing terms or ambiguous source jobs require manual review. Store configurable policy terms rather than hardcoding a universal warranty window.

Defer automatic approval, predictive callback risk, refunds, external claims processing, complex contract amendments, and full accounting of vehicle overhead.

## Workflow

1. Customer selects a property and optionally a completed visit, describes pest activity, adds photos, and supplies preferred availability. A CSR can submit on the customer's behalf.
2. Create a case, acknowledge receipt, and suggest relevant completed jobs for that property. Staff confirms the source visit when ambiguous.
3. Evaluate the applicable policy version against property, service/pest scope, report date, source visit, and exclusions. Save evidence and a proposed coverage decision.
4. Authorized staff approves covered service, offers a paid return visit, requests information, or declines with an explanation. A paid visit requires explicit customer acceptance of the quote before scheduling.
5. Create a return job transactionally and send it through existing dispatch. Show source findings, applications, photos, and case details to the technician.
6. Technician records findings, work performed, resolution code, materials, and any follow-up requirement. Completing a job alone does not prove the case is resolved.
7. Staff resolves the case after reviewing the outcome, or arranges another visit. Notify the customer and retain the complete audit history.

Case states: submitted → triage → awaiting_customer / approved / declined → scheduled → in_service → awaiting_review → resolved. Allow cancellation with a reason. Reopening a resolved case requires a reason and returns it to triage.

Keep coverage separate: pending, covered, not_covered, manual_review. Record billing disposition separately: no_charge, quoted_paid, goodwill. A staff override requires a recorded reason.

## Data model

| Entity/change | Essential fields and behavior |
|---|---|
| WarrantyPolicyVersion | Tenant, immutable version, effective dates, covered service/pest codes, reporting window and anchor, exclusions, approval requirements. Attach the applicable version to a contract or eligible one-time job. |
| ServiceCallback | Tenant/customer/property, optional source job/contract, issue and pest codes, description, reported time, state, assigned CSR, response target, coverage decision/reasons, policy snapshot, billing disposition, resolution code/summary, resolved time, optimistic-lock version. |
| CallbackAttachment | Case, tenant, protected storage key, uploader, media metadata, timestamp. Reuse upload infrastructure where possible. |
| CallbackEvent | Append-only actor/time/action, state transitions, decision evidence, override reasons, and notification references. |
| CallbackVisit | Case-to-return-job link with visit sequence and outcome. Support multiple visits per case; enforce unique job links. |
| Job extension | Job purpose (standard/return_visit), optional source-job reference, billing disposition. Keep current job lifecycle statuses. |

Enforce matching tenant, customer, and property on every relationship. Add indexes for tenant/state/created time, property/source job, and assigned CSR/response target. Protect links with database constraints where supported and transactional service validation elsewhere. Historical cases retain the policy decision snapshot even when policies change.

Record labor minutes and material costs using existing job data. Label preliminary costs as incomplete when rates or material prices are unavailable; do not treat missing costs as zero.

## API and service responsibilities

Define REST payloads and GraphQL equivalents in shared contracts before backend implementation.

- POST /api/v1/callbacks: customer or CSR intake; supports an idempotency key.
- GET /api/v1/callbacks and GET /api/v1/callbacks/:id: filtered/paginated staff queue or customer-owned cases.
- POST /api/v1/callbacks/:id/attachments: authenticated upload using existing storage conventions.
- POST /api/v1/callbacks/:id/assess-coverage: staff assessment with persisted policy evidence.
- POST /api/v1/callbacks/:id/decision: approve, decline, request information, or override; validate allowed actor and transition.
- POST /api/v1/callbacks/:id/visits: create a linked return job atomically; enforce billing approval and prevent duplicate creation on retries.
- POST /api/v1/callbacks/:id/resolution: record visit outcome and resolve or reopen, subject to role and state.
- Policy administration endpoints: manager-only version creation and assignment; never edit terms already used for historical decisions.

Derive tenant/customer identity from authentication, never from a customer-supplied tenant ID. Customers see only their cases and customer-facing explanations; technicians see assigned visits; CSRs/dispatchers manage their tenant's queue; managers administer policies and override decisions.

Use optimistic concurrency for staff decisions. Reject stale writes with a consistent conflict response. Persist case changes, audit events, job links, and queued notifications transactionally. Publish SSE updates after commit. Deduplicate notification events and restrict event delivery to authorized recipients.

## Portal changes

- Customer: “Report a problem” on service history, guided intake, attachment upload, pending-review language, case timeline, requests for information, and paid quote acceptance.
- Admin: callback queue with age, response target, property, pest, coverage, assignee, and repeat-case indicator; case detail with source service, decision evidence, approvals, visits, and cost summary. Add case history to Customer 360 and return-visit badges to dispatch/calendar.
- Technician: callback context in JobDetail, prior treatment information, structured findings/resolution, photos, and follow-up flags. Queue outcomes offline with idempotency and explicit sync status; do not show a case as resolved until the server accepts the change.
- Billing: explicit no-charge handling that bypasses automatic payment capture while retaining labor/material costs. Paid returns use the existing quote/invoice flow. Do not create zero-dollar payments or sales commissions for covered callbacks.

## Delivery sequence

### 1. Contract and foundation

Finalize state transitions, policy semantics, role matrix, payloads, migration, and fixtures. Add tables/models across all backends and nullable job extensions. Existing jobs remain standard jobs; existing contracts remain without warranty terms until explicitly assigned.

Exit: migrations apply safely and shared fixtures validate tenant boundaries, policy snapshots, and relationship rules.

### 2. Staff-assisted MVP

Implement intake, coverage assessment, decisions, audit events, and linked visit creation. Build the admin queue/detail and Customer 360 integration. Implement no-charge billing protections before exposing return-job creation.

Exit: CSR can take a report through approval and dispatch; duplicate requests create one return job; covered visits cannot trigger automatic charging.

### 3. Customer and technician completion

Add customer intake/status, uploads, technician context/outcomes, offline retries, customer quote acceptance, and notification events.

Exit: an end-to-end customer report becomes a completed visit and reviewed resolution, with correct permissions and messages on all four backends.

### 4. Reporting and pilot

Add callback counts, response time, resolution time, repeat cases, reason distribution, and internal cost completeness. Enable by tenant behind a feature flag. Pilot with a small staff group, then enable customer intake.

Exit: cross-backend conformance and portal checks pass; pilot confirms useful triage, trustworthy billing, and no lost offline outcomes.

## Verification

- Coverage: window boundary/time zone, covered versus excluded pest, inactive/expired contract, one-time warranty, missing terms, changed policy, and manual override. Specify whether report-time or visit-time eligibility governs each policy; preserve report-time evidence.
- Authorization: cross-tenant IDs, wrong property/customer, customer access to another case, unauthorized overrides, attachment access, and technician assignment checks.
- State/concurrency: illegal transitions, two simultaneous approvals, duplicate intake/visit creation, cancelled return job, reopened case, multiple visits, and duplicate offline submission.
- Billing: no-charge job completion never captures payment; paid visit needs accepted quote; callback costs remain available without invoice revenue.
- Communications: only committed transitions notify; retries do not duplicate messages; internal notes and decision evidence do not leak to customers.
- End-to-end: intake → coverage review → dispatch → technician outcome → staff resolution → customer timeline, plus decline and paid-service branches.
- Run targeted backend tests, migration checks, shared conformance fixtures, frontend typechecks, and focused portal E2E checks. Preserve existing scheduling and standard-job billing behavior.

## Metrics and rollout safeguards

Define callback rate as distinct original completed service jobs with a linked callback divided by eligible original completed service jobs in a specified service-date cohort. Show the observation window; exclude return visits from the denominator. Separately show total cases and unlinked cases.

Measure time to first staff response, time to resolution, repeat visits per case, covered/goodwill/paid mix, and cost with completeness indicators. Avoid ranking technician quality from raw callback counts without accounting for job mix and volume.

Use additive migrations and per-tenant feature flags. Disable new intake if rollback is needed while retaining staff access to existing cases. Log failed transitions, notification failures, duplicate retries, and billing disposition violations.

## Product choices to confirm during implementation

- Actual warranty terms and exclusions by plan/service; no assumed universal coverage.
- Who can approve goodwill visits and financial overrides.
- Response targets, escalation recipients, and customer-facing wording.
- Whether staff review is always required for resolution or may later be delegated to technicians.
- Which labor rates and material valuation source should populate internal cost estimates.

These choices do not block schema/contract design; unresolved coverage terms default to manual review.
