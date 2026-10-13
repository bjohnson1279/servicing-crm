# Inspection capture and review — local implementation

This is the first Inspection to Treatment slice. It includes staff intake/review, assigned-technician findings, revision history and protected photos across Express, FastAPI, GraphQL and Laravel. Proposal publication, consent, treatment conversion, offline drafts and notifications are later slices.

## Setup

1. Apply migration 023 and then `shared/database/024_inspection_capture.sql` before deploying the changed adapters. Migration 024 adds inspection records, revision snapshots, attachments, events, retry records and a job completion guard.
2. Configure `JWT_SECRET` and the deployed identity provider. Portals expect the authenticated token in `sessionStorage.crm_access_token`; new handlers use verified identity and current database roles, not mock users or client role claims.
3. Configure `VITE_API_BASE_URL` to the chosen backend's `/api/v1` base. Every backend exposes inspection REST routes at `/api/v1/inspections`; the GraphQL backend also exposes equivalent queries/commands.
4. A manager enables the tenant feature in the admin inspection workspace or authenticated `POST /inspections/settings` with `{"enabled":true}`. It defaults off.
5. Create a scheduled standard job through authorized job/dispatch endpoints, then attach an inspection from the admin queue. Return visits retain their callback workflow and cannot be used for inspection intake.

Use a real PostgreSQL smoke test and a tenant pilot before rollout. PGlite verification is not a deployed four-server integration test. Turning the feature off freezes inspection access; finish or cancel active inspections before disabling it, because the completion guard remains active.

## Using the slice

The admin portal has an Inspections navigation entry. Staff select a scheduled job, create an inspection, and review submitted findings with a mandatory reason. Requesting a revision creates a new draft while preserving the old submitted findings and their photos. A closed job requires a new inspection visit rather than an amendment on that visit.

The technician job detail has an Inspection findings panel. Begin inspection, record a summary and zones, distinguish observed/reported/unknown/no evidence, record severity and inaccessible areas, save a draft, attach optional JPEG/PNG photos up to 1 MB, and submit for review. Draft fields may be incomplete; submission requires meaningful zone notes and summary.

Start uses the authoritative job clock-in command. Submission does not claim job completion: clock-out remains a separate authoritative job action. A database trigger blocks all updates completing/invoicing an inspection job until its findings are submitted/reviewed or the inspection is explicitly cancelled. The pre-existing Job Detail status indicator is still local UI state and must not be used as evidence of server completion.

This slice requires an online connection. An interrupted mutation offers a retry with the same request key and payload. The server validates access before accepting a replay, rejects reused keys with changed data, and enforces optimistic versions. Refresh reconciles conflicts. Findings and photos are not persisted in browser storage.

## Security and contracts

- Staff scope is tenant-bound; technicians additionally require current job assignment. Customers have no access to this internal capture/review slice.
- State mutations lock actor/job/inspection records. Assignment and role revocation apply to subsequent reads and retries.
- Submitted findings cannot be overwritten or deleted, including through a direct ORM write; staff review metadata is recorded once. Revision requests preserve the previous snapshot.
- Photos are retrieved only through authenticated parent-inspection access. Lists return metadata, not photo data. Uploads enforce MIME/signature, size, revision and count limits; media bytes are stored privately in PostgreSQL for this MVP.
- The staff queue supports bounded pagination and state filters. Events are audit history, not an unscoped broadcast stream.

REST reads: `GET /settings`, `/options`, `/`, `/:id`, `/:id/attachments/:attachment_id`.

REST writes: `POST /settings`, `/` (create), `/:id/start`, `/save`, `/submit`, `/review`, `/cancel`, `/attachment`. Every record mutation includes `request_key`; all except create include the current `version`. Path IDs override body IDs.

Findings payload: `{"summary":"...","zones":[{"name":"Kitchen","pests":["ants"],"evidence":"observed","severity":"moderate","inaccessible":false,"notes":"Observed trail near window; access available."}]}`.

GraphQL definitions and ORM scalar contracts are in `shared/contracts/inspections.graphql` and `inspections.prisma`. Run `python scripts/prepare_inspection_models.py` after changing shared portal sources or adding scalar mappings. PostgreSQL commands own relationship constraints and writes.

## Verification

```text
node tests/inspections.integration.mjs
python -m pytest tests/test_inspection_adapters.py -q
php tests/inspection_auth.php
```

The admin portal's `InspectionWorkspace.test.tsx` checks unsaved submission guards, review permissions/reasons and stable retries. Database tests cover tenant/assignment isolation, revocation, optimistic conflicts, immutability, revisions, photo access and job completion. Adapter checks exercise actual handlers with a test database or boundary doubles.

Existing unrelated technician test files have type errors in matcher/global declarations; the new component is checked separately. Legacy booking, chemical log, generic photo and event endpoints remain outside this slice and must be secured before future treatment execution reuses them.
