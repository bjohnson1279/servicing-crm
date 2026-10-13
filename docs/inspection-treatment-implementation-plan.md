# Inspection to Treatment Workflow — Implementation Plan

Status: The first inspection capture/review slice is implemented locally across all four APIs and admin/technician portals. See `inspection-capture-setup.md`. Proposal/consent, treatment execution, offline and notification slices remain planned. Deployment requires migrations 023/024 and a tenant pilot.

## Objective

Turn an inspection's documented findings into a reviewed treatment proposal, explicit customer approval, linked treatment visits, and a verified outcome. Preserve what was observed, what was authorized, and what was actually performed.

## Repository context

Existing properties, customers, jobs, quotes, contracts, chemical application logs, photos and callbacks provide the surrounding records. There is no dedicated inspection or versioned treatment-plan model in the shared database.

Quotes currently store an amount and status, without treatment scope or acceptance evidence. The existing admin quote UI can accept a quote, and the Express acceptance handler creates an unrelated job. This initiative must protect linked proposals from that legacy path and require authenticated customer acceptance or separately audited staff recording of documented customer consent.

The Property Service Playbook is planned, not implemented. This workflow should operate independently and expose inspection findings for later playbook integration rather than depend on unavailable playbook entities.

## MVP scope

- Schedule an inspection using an existing job, with a distinct inspection record linked to that job.
- Assigned technician records service zones, pest activity, severity, evidence, conducive conditions, customer concerns and inaccessible areas.
- Submit findings for staff review; return incomplete inspections with a reason.
- Create versioned treatment proposals with scope, service steps, exclusions, preparation instructions, follow-up expectations and itemized pricing.
- Capture explicit consent for the exact published version; support decline and expiry.
- Convert an accepted proposal into a linked treatment job transactionally and without duplicate jobs on retries.
- Show authorized scope to the assigned technician; link actual applications and observations to the visit.
- Review completed work, flag deviations and arrange follow-up or a callback.

Defer automatic pest diagnosis, generated pesticide selection/dosage, financing, plan drawings and multi-property proposals. Treatment content is authored by authorized staff. This is a workflow and evidence system, not an automated treatment recommendation engine.

## Workflow and states

1. Staff creates an inspection for the customer's property and links its scheduled job.
2. The assigned technician drafts observations and protected photos. Distinguish observed activity from customer-reported activity; record inaccessible areas explicitly.
3. Technician submits an immutable findings snapshot. Staff accepts it or requests a revision. Amendments create a new revision with an explanation.
4. Authorized staff prepares and publishes a treatment proposal linked to the reviewed inspection revision. Publishing freezes scope, pricing and customer-visible instructions.
5. Customer reviews and accepts or declines that published version. Expired or superseded versions cannot be accepted. Record actor, time, version, scope and amount. Staff may record consent only with evidence and the permitted role; staff approval is not customer consent.
6. Staff schedules the accepted scope. Job creation stores the accepted proposal version and reuses authoritative dispatch/assignment validation. Acceptance itself does not silently create a job through a legacy quote handler.
7. Technician records actual work, application logs, photos and deviations. Additional billable scope requires a revised proposal and fresh acceptance before it is performed.
8. Staff reviews the outcome and closes the treatment episode, schedules an authorized follow-up, or opens a callback under its own coverage workflow.

Inspection states: draft → scheduled → in_progress → submitted → reviewed; requests for revision return to draft as a new revision. Cancellation requires a reason.

Proposal states: draft → published → accepted / declined / expired / superseded. Accepted versions remain immutable; changes require a successor version.

Treatment episode states: awaiting_schedule → scheduled → in_service → awaiting_review → completed. Job completion alone does not close the episode. Support cancellation with disposition of already completed work.

## Data model

| Record | Responsibilities |
|---|---|
| Inspection | Tenant/customer/property, inspection job, assigned technician derived from job, state, revision and timestamps. |
| InspectionRevision | Findings and zone records, evidence links, inaccessible areas, author, submission/review evidence, immutable submitted snapshot. |
| TreatmentProposalVersion | Inspection revision, tenant/property/customer, version, scope and exclusions, preparation instructions, itemized amount/currency, expiration, publication actor and time. |
| ProposalAcceptance | Accepted version, authenticated customer actor or authorized staff recorder, consent evidence, time, accepted scope/price snapshot. Unique effective acceptance per version. |
| TreatmentEpisode / TreatmentVisit | Accepted proposal to job links, visit sequence, authorized scope snapshot, actual-work references, deviations, outcome and review. Unique job link and conversion request key. |
| WorkflowAttachment / WorkflowEvent | Protected evidence with object ownership and append-only audit events for submission, publication, consent, conversion, revision and review. |

Quotes remain financial records linked to a proposal version. Use a proposal discriminator/link so legacy acceptance cannot mutate initiative-owned quotes or produce duplicate jobs. Do not infer warranty coverage from treatment acceptance; assign an explicit warranty policy when applicable.

## Backend enforcement

Use verified signed identity and current database role/tenant/assignment checks on every backend. Reuse the job authorization policy established in migration 023, extending it deliberately for inspection and treatment job transitions.

- Technicians read and write only authorized assigned inspections/visits; they cannot publish prices, record customer consent, assign jobs or change standing treatment scope.
- Customers see their own published proposals and customer-visible reports. Internal observations, access credentials and review notes remain excluded.
- Office staff review findings and schedule accepted work; publication and staff-recorded consent require explicitly configured roles.
- Scope photo uploads/downloads, real-time feeds and original-visit context by parent-record ownership. Recheck access when offline work synchronizes.
- Validate all tenant/customer/property/job/quote relationships transactionally. Lock source/version/job records during acceptance, conversion and reassignment-sensitive writes.
- Apply optimistic locking and idempotency to submission, acceptance and conversion. Retry after revocation must be denied even when an earlier attempt succeeded.
- Guard all legacy quote acceptance, booking, job completion and application-log routes that could bypass this workflow before enabling it.

Do not claim the existing chemical/photo endpoints are secured merely because job endpoints now are. Review and harden them before reuse, including technician identity supplied in a request body.

## API and portal delivery

Define REST and GraphQL contracts first, then implement matching behavior in Express, FastAPI, GraphQL and Laravel.

Commands cover inspection creation/assignment context, draft findings, submission/review, proposal drafting/publication, customer acceptance/decline, treatment conversion, visit outcome/review and protected evidence access. Publish paginated staff queues and customer-owned proposal lists with scoped event updates.

Admin: inspection queue and review, proposal editor, approval evidence and scheduling, deviation/follow-up review. Technician: inspection form and zone findings, authorized treatment scope, execution notes and existing application-log entry. Customer: findings summary, versioned proposal, preparation instructions and explicit accept/decline controls.

Offline support covers assigned inspection drafts and execution observations, partitioned by tenant and identity. Mark cached scope with its version and download time. Publication, acceptance and scheduling require a live server confirmation. Conflicting, superseded or reassigned submissions require visible review; pending local saves cannot claim accepted scope or completed server state.

## Implementation sequence

1. **Contracts and security prerequisites:** document permissions, legacy-route guards, record relationships and state transitions; add migration/model parity and database conformance fixtures.
2. **Inspection slice:** scheduling links, draft/submit/review APIs, protected photos, admin review and technician capture.
3. **Proposal and consent slice:** immutable published versions, itemized scope/pricing, customer review/acceptance, expiry and legacy quote guards.
4. **Treatment execution slice:** atomic conversion, accepted-scope job snapshots, technician work records, application-log linkage and outcome review.
5. **Offline and rollout:** conflict/revocation recovery, scoped notifications, migration/deployment checks and a tenant pilot behind a feature flag.

## Acceptance checks

- Cross-tenant and unassigned access is denied through direct REST/GraphQL calls and media URLs.
- Forged body role, tenant, technician or customer identities do not authorize operations.
- Submitted findings and accepted scope retain their original revisions after subsequent edits.
- Expired/superseded proposals cannot be accepted; changed price/scope requires fresh consent.
- Concurrent acceptance and conversion retries create one effective acceptance and one intended job.
- Legacy quote paths cannot accept a linked proposal or create a second job.
- Actual applications remain distinct from proposed work; deviations are visible and extra billable scope cannot be silently approved.
- Offline retries after reassignment or permission revocation fail visibly without overwriting newer work.
- All four APIs enforce equivalent permissions and transitions. Portal tests cover submission, revision, consent and conflict recovery.
- Migration 023 and the new workflow migration pass a real PostgreSQL deployment smoke test before pilot enablement.

Pilot measures: inspection-to-proposal time, proposal acceptance rate, accepted-to-scheduled time, scope deviations, follow-up requirements and callbacks linked to treatment episodes. Establish a baseline before setting targets.
