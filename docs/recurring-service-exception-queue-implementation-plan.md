# Recurring Service Exception Queue

Status: slice 1 implemented as a disabled-by-default shadow review. Generation cutover and recovery actions remain planned. See recurring-exception-queue-setup.md for operation and limits.

## Outcome

Give dispatchers a tenant-scoped queue of recurring service obligations that need attention, with enough evidence to recover the visit safely. Preserve the original obligation when a job moves, is cancelled, or cannot be completed. Every resolution must explain what happened to the service obligation.

## Repository findings

- Express and GraphQL use JavaScript calendar mutations; FastAPI uses fixed 30/60/90/180/365-day intervals; Laravel uses Carbon calendar mutations. These produce different dates, particularly around month ends and leap years.
- All four generators advance past historical dates and only consider the next future occurrence. Missed service is therefore invisible to generation.
- Duplicate prevention uses a contract plus scheduled-day lookup. Moving a job changes that lookup; concurrent workers can both create a job. Cancelled jobs still count as existing visits.
- Contract end dates are not enforced by these generators. Host/UTC dates are used without a recurring-service timezone setting.
- Job creation and notification insertion are separate writes in the JavaScript and Laravel implementations. Python commits the entire batch together, so a failure can roll back other contracts.
- Missing primary email falls back to a customer name as an email recipient.
- Existing contracts contain cadence, start/end dates, status, and auto-renew fields, but no durable occurrence ledger, schedule revision, pause interval, or service exception record.

Relevant sources: `backends/express-api/src/domains/dispatch/JobGenerationCron.ts`, `backends/graphql-api/src/domains/dispatch/JobGenerationCron.ts`, `backends/fastapi-api/app/domains/dispatch/job_generation_cron.py`, `backends/laravel-api/app/Domains/Dispatch/Commands/GenerateRecurringJobs.php`, and `shared/database/002_expanded_domain.sql`.

## Scope and rules

### Stable service occurrences

Introduce a canonical database implementation shared by the four backends, following the existing callback, inspection, device, and catalog command patterns.

Each expected visit gets an immutable occurrence ID, contract ID, schedule revision, ordinal, nominal local date, timezone snapshot, and due-window snapshot. A unique contract/revision/ordinal constraint prevents duplicate generation. Jobs link to occurrences explicitly; appointment dates do not identify obligations.

Calculate each date from the original schedule anchor. Clamp an unavailable anchor day to the month's last day without changing subsequent anchors: January 31 becomes February 28/29 and then March 31. Annual February 29 becomes February 28 in other years and returns to February 29 in leap years. Apply inclusive contract start/end bounds. Exclude ONE_TIME from this recurring workflow and preserve its existing handling until separately reviewed.

Require an explicit tenant recurring-service timezone using a validated IANA name; do not silently repurpose the callback-only timezone. Due windows use local calendar dates; appointments use timezone-aware instants. A nominal due date is not an appointment at midnight. Keep the generation horizon configurable, initially 30 days, and use bounded batches and a configured recovery lookback.

Schedule edits create revisions prospectively. Preserve historical and fulfilled occurrences. Reconcile outstanding occurrences explicitly, rejecting overlapping active obligations. Auto-renew alone must not manufacture an extension beyond a recorded end date.

### Exceptions

Initial reason codes:

| Reason | Trigger | Suggested recovery |
| --- | --- | --- |
| Missing job | An eligible occurrence has no linked service job by its generation deadline | Generate or link a verified existing job |
| Overdue service | Its due window has ended without completion or an authorized waiver | Reschedule and record recovery |
| Unassigned visit | A scheduled visit reaches its configured assignment deadline without a technician | Assign the existing job |
| Cancelled visit | Its linked job is cancelled while the obligation remains outstanding | Rebook or authorize a skip |
| Invalid schedule | Required configuration or contract relationships are invalid | Correct the contract and retry |
| Generation failure | A bounded worker attempt fails | Inspect evidence and retry |

Failed-access/failed-treatment outcomes and pause/resumption exceptions follow once their structured workflows exist. Do not infer these from free-text notes. Notification failures remain a separate operational reason and never imply that job creation failed.

Deduplicate by occurrence and reason, or contract/revision/reason for failures before an occurrence can be constructed. Keep first/last detection times, evidence, owner, response deadline, and immutable events. Re-evaluate conditions before recovery; stale evidence must not cause a duplicate visit.

Separate fulfillment state from queue state. Fulfillment records outstanding, completed, or explicitly waived obligations. Queue states include open, in progress, awaiting customer, deferred, resolved, and dismissed. Snoozing changes attention timing, not fulfillment. Dismissal requires a reason and cannot conceal an outstanding obligation; persistent conditions reopen according to policy. Completion resolves only applicable reasons and retains history.

### Recovery actions

- Assign or reschedule the existing linked job, preserving occurrence identity and nominal date.
- Generate a missing job atomically, after rechecking existing links and contract eligibility.
- Link an existing job only after validating tenant, customer, property, contract, status, and whether another occurrence already owns it.
- Record a manager-authorized skip with reason, actor, and timestamp. No automatic credit, refund, billing cancellation, or cadence shift.
- Defer attention with an expiry and reason; escalation resumes when it expires.
- Retry generation after correcting the underlying problem.

Use request keys, optimistic versions, database locks, and unique constraints for every write. Respect existing job authorization, customer technician restrictions, inspection completion requirements, and future device requirements. Callback/warranty return visits do not fulfill recurring service automatically.

### Permissions

Resolve tenant and actor from verified identity and database roles. Dispatch staff/managers can read the queue and perform permitted scheduling actions. Managers alone configure schedules, authorize skips, and override protected decisions. Technicians can later report a structured unsuccessful outcome for a currently assigned job; they cannot waive obligations, change contracts, or browse the staff queue. Customers have no internal queue access.

Workers use a dedicated trusted system capability scoped to a tenant and run ID. They must not impersonate a user supplied in a request. Permission and tenant checks occur before retry replay. Audit human and system actions distinctly.

## Data and API design

Add a migration after the existing catalog migration, with:

- Tenant enablement, recurring timezone, horizon, lookback, and deadline configuration.
- Contract schedule revisions and explicit future pause intervals when the pause slice ships.
- Recurring service occurrences and an explicit job link with uniqueness for the active primary fulfillment job; preserve historical replacement links separately.
- Service exceptions, immutable exception events, and idempotency records.
- Durable generation runs and per-contract failure records with bounded, sanitized error evidence.
- An occurrence-keyed notification outbox/deduplication key when notification generation is migrated.

Expose equivalent REST endpoints in all four backends and GraphQL operations in the GraphQL backend. Operations cover configuration, queue list/detail, occurrence history, assignment/rescheduling, generation/linking, deferral, authorized skip, and retry as their slices ship. Use consistent envelopes, pagination, filtering, permission errors, and version-conflict behavior. Reference/list responses are private and uncached.

Generation commits per contract/bounded unit, isolates failures, records progress, and supports retry/backoff. Multiple worker processes must safely cooperate through database claims/locks. Legacy generators must be gated during cutover; do not run four independent generators for the same tenant.

Job and eligible notification outbox creation must share a transaction and stable deduplication keys. Validate contact availability; never use a name as an email. Notification retry must not recreate a job. Sending and customer messaging are outside the initial slice.

## Staff experience

Add an admin exception queue with counts and filters for reason, due date, property, contract, owner, and state. Show nominal date and appointment date separately, local timezone, elapsed overdue time, linked job status, and the evidence behind each exception.

Detail view links to the contract, property, customer, and job; shows occurrence and resolution history; and exposes only authorized recovery actions. Include accessible loading, empty, error, and conflict states. Add contract/customer context links after the queue foundation. Technician outcome reporting and customer-facing updates are later slices.

## Rollout and verification

Start disabled per tenant. Run a read-only shadow assessment comparing canonical schedules with current jobs. Backfill only within an explicit bounded window, automatically linking unambiguous matches; send multiple matches or moved-job ambiguity to review. Do not automatically create historical catch-up visits.

Cut over one tenant at a time: confirm timezone and due-window policy, preview occurrences and exceptions, disable its legacy generator, then enable canonical generation. Track duplicate attempts, generation lag, open overdue obligations, failures, and recovery outcomes. Disabling the feature stops new worker actions while retaining ledger/history; rollback must not restart legacy generation without reconciliation.

Required tests cover calendar parity, month-end/leap anchors, DST/local boundaries, contract bounds, schedule revision overlap, recovery lookback, cancelled/rescheduled/completed jobs, concurrent workers, transactional rollback, stale actions, notification deduplication, tenant isolation, forged roles, technician denial, manager skip authorization, and existing inspection/job completion safeguards. Run canonical database integration tests plus transport contracts for all APIs and focused portal interaction tests.

## Delivery slices

1. **Occurrence ledger and read-only exception queue:** canonical calendar calculations, tenant configuration, bounded shadow assessment/backfill, durable occurrence/exception evidence, authorized list/detail APIs across all backends, admin queue, and permission/calendar tests. Keep existing job generation unchanged and prevent shadow assessment from sending notifications or creating jobs.
2. **Generation cutover and recovery:** transactional canonical generator, worker claims/run history, tenant-specific legacy gates, assignment/rescheduling/linking/generation, manager skips, deferral/retry, audit and concurrency tests. Enable only after the shadow preview is reviewed.
3. **Structured field outcomes and pauses:** technician unsuccessful-visit reports, pause interval semantics, resumption reconciliation, owner/escalation policy, and contract/customer context.
4. **Notification integration and pilot:** deduplicated outbox, contact-failure recovery, explicit customer communication policy, operational metrics, and controlled tenant rollout.

The first implementation should deliver slice 1. It establishes trustworthy visibility and permissions before changing how recurring jobs are created.
