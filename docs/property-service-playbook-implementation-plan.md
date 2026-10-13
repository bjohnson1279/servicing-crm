# Property Service Playbook — Implementation Plan

Status: Proposed scope and implementation sequence; implementation has not started.

## Objective

Give each property a durable service brief so any assigned technician can arrive prepared, follow consistent instructions, and preserve findings for the next visit. Connect recurring service and callback visits to the same property history.

## MVP

- Property service brief: access instructions, service zones, customer preferences, known hazards, pets, sensitive areas, and pest concerns.
- Versioned service checklists with required and optional tasks, attached to a property and service type.
- Visit records: checklist responses, observations, exceptions, photos, and recommended follow-up.
- Admin editing in Customer 360 and technician viewing/completion from Job Detail.
- Offline access to previously downloaded assigned-job briefs and queued visit responses.
- Callback context linking to the original visit findings and the property brief.

Defer floor-plan drawing, device/bait-station tracking, automated treatment recommendations, and customer editing. Treatment instructions are authored by authorized staff; the playbook does not generate pesticide dosage or safety claims.

## Workflow

1. Staff prepares the property brief and selects a published checklist for the relevant service type.
2. On job assignment, capture the applicable checklist version. Display current property instructions with their update time; retain the instructions acknowledged for the visit.
3. The assigned technician downloads the brief, reviews important instructions, and acknowledges them before beginning the checklist.
4. Technician records task results, observations, protected photos, and exceptions. Required tasks need a response or an explicit exception reason.
5. Server validates the submission and records a completed visit checklist. A local offline save remains pending until confirmed by the server.
6. Staff reviews follow-up flags and can promote a finding into the property brief. Technician observations do not silently overwrite standing instructions.

Job completion enforcement is enabled only after existing job lifecycle endpoints and the technician status UI use authoritative server state. The current technician status control is local state, so adding a button-level guard alone would not enforce completion.

## Data model

| Entity | Purpose |
|---|---|
| PropertyServiceBrief | Tenant/property, structured instructions, service zones, preferences, revision, editor, timestamps. Separate restricted access credentials from ordinary notes. |
| ServiceChecklistVersion | Tenant, template identity, immutable published version, service type, ordered tasks with stable IDs, response type, required flag, active/retired state. |
| PropertyPlaybookAssignment | Property/service type to published checklist version; record effective dates and prevent ambiguous active assignments. |
| JobPlaybookRun | Job/property, checklist snapshot, acknowledged instruction snapshot, technician, state, responses, exceptions, follow-up flags, revision. One active run per job. |
| PlaybookAttachment | Tenant/run/task, protected media reference, uploader, timestamps. |
| PlaybookEvent | Append-only actor, action, revision and time for edits, acknowledgement, submission, review and overrides. |

Validate tenant/customer/property/job relationships transactionally. Published templates and submitted visit records retain historical snapshots. Restricted access details must be excluded from customer responses, reports, logs and notification payloads.

## API and authorization

Define REST payloads and GraphQL equivalents in shared contracts, then implement matching behavior in Express, FastAPI, GraphQL and Laravel.

- Read/update property briefs with optimistic locking.
- Draft/publish/retire checklist templates; publishing creates an immutable version.
- Assign a checklist to a property's service type.
- Read an assigned job's playbook and acknowledge its brief.
- Save task responses and submit a visit checklist using idempotency keys.
- Upload/read authorized attachments and review flagged findings.

Reuse verified authenticated tenant identity. Managers publish templates; authorized office staff maintain briefs; technicians access only authorized assigned jobs and record their own work. Customer portal exposure is deferred. Audit overrides and require reasons. Validate payload sizes, task IDs, response types, versions and allowed transitions on the server.

## Backend technician authorization — mandatory implementation gate

Repository inspection found that existing Express job handlers query jobs without tenant or assignment filters and update jobs by ID alone; job creation also accepts tenant identity from the request body. FastAPI job listing similarly has no route-level identity dependency or tenant/assignment predicate. These paths must be hardened before the playbook relies on them. Callback commands already perform database actor-role and assignment checks, but those checks do not secure ordinary job endpoints.

Local hardening is now implemented for job, technician schedule/location and dispatch endpoints in all four backends using migration 023. See `job-authorization-setup.md` for deployment requirements, verification and remaining surfaces that require review. This does not yet implement the playbook or secure its future attachment endpoints.

- Derive actor and tenant exclusively from verified authentication, and resolve the current role and technician relationship from server-owned records. Ignore client-supplied roles, tenant IDs and technician identity as authorization evidence.
- Scope list, calendar, detail, brief, visit-history and attachment access by tenant and the technician's current job assignment. A property association alone does not authorize access to every job at that property.
- Permit technicians to acknowledge instructions, record permitted task responses and observations, and advance allowed states of their assigned jobs. Deny template publication, standing-brief edits, assignment/reassignment, billing changes, administrative overrides and arbitrary job status changes.
- Apply the same checks to REST, GraphQL, protected media, real-time feeds and offline synchronization. Limit original-visit context to the fields needed for an authorized current job.
- Revalidate assignment and role at each mutation, including idempotent retries. Lock the job or use equivalent transactional predicates so reassignment cannot race an authorized write. Revoked access must not succeed through cached identity or an earlier authorization check.
- Return 401 for unauthenticated requests, 403 for prohibited operations on accessible resources, and a consistent 404 for resources outside the actor's scope. Record accepted sensitive actions with the authenticated actor.
- Make permission tests a prerequisite for enabling the feature: two tenants, two technicians, forged body identity, cross-job IDs, direct endpoint calls, forbidden fields/actions, attachment access, revoked role, reassignment, stale offline submissions and retries after revocation. Run equivalent cases against all four backend adapters.

Completion enforcement must cover every server endpoint capable of completing a job, including clock-out and generic update mutations. UI visibility and disabled controls are usability measures, not authorization controls.

## Offline behavior

Use the established technician IndexedDB queue pattern, partitioned by authenticated identity and tenant. Cache only authorized assigned jobs. Explicitly mark cached instructions with their revision/download time. Minimize restricted credential caching and clear protected caches on sign-out or identity change.

Retries preserve their idempotency key. Server conflicts, reassignment and revoked permissions require visible review. Never replace a newer brief or a submitted run with a stale queued draft. Pending submissions cannot claim server-confirmed completion.

## Delivery sequence

1. **Contracts and foundation:** inspect actual property/job lifecycle schemas, specify permissions and state transitions, add migration and model parity, and define conformance fixtures.
2. **Backend workflow:** briefs, versioned templates, assignments, run snapshots, validation, audit and protected attachments across all four APIs.
3. **Office experience:** Customer 360 brief editor, checklist administration, and follow-up review queue.
4. **Technician experience:** job brief, acknowledgement, task responses, exceptions, photos, offline drafts and conflict recovery; integrate callback visit context.
5. **Completion and rollout:** integrate authoritative job completion checks, tenant feature flag, migration verification and a small tenant pilot before wider enablement.

Each phase should leave a reviewable working slice. Do not enable completion enforcement until backend parity and the authoritative job lifecycle integration pass verification.

## Acceptance and verification

- Another tenant, unassigned technician, or customer cannot read protected instructions or attachments.
- Editing a brief or publishing a new template does not change historical visit records.
- Missing required responses block submission unless an authorized, reasoned exception is recorded.
- Duplicate retries create one run/submission; stale revisions produce actionable conflicts.
- Offline drafts survive a restart, remain isolated across identities and synchronize without overwriting newer work.
- Reassignment and permission revocation are enforced on synchronization.
- A callback technician can inspect relevant original-visit findings without broadening access.
- All four APIs return equivalent state, validation and ownership behavior.
- Meaningful database/conformance tests cover these boundaries; portal tests cover required-task, exception, offline and conflict flows.

Pilot measurements: completed checklist rate, missing-task exceptions, follow-up flags, synchronization failures and repeat visits by property. Compare against a baseline before setting operational targets.
