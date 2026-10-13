# Bait station and device register — local foundation

Implemented: tenant/property device register, planned registration, staff installation confirmation, historical installation entry, location versions, replacement/retirement history, exact label lookup, staff portal and assigned-job technician read view across all four APIs.

Service observations/checklists, technician installation permissions, QR printing/scanning, photos, material posting, offline capture and mandatory device completion checks remain later slices. Registering or installing a device does not decrement stock or create a chemical application record.

## Deployment

Apply migration `025_property_devices.sql` after migrations 023/024 before deploying the changed backends. Configure `JWT_SECRET` with the existing authenticated portal provider. Portals read `sessionStorage.crm_access_token` and use `VITE_API_BASE_URL` pointing to the chosen backend's `/api/v1` base.

Device tracking defaults off per tenant. A manager can enable it from the admin register or authenticated `POST /devices/settings` with `{"enabled":true}`. Complete a real PostgreSQL deployment smoke test and tenant pilot before wider rollout; local PGlite tests are not a deployed four-server conformance run.

## Staff workflow

Open Bait stations & devices in the admin portal, select a property, and register a planned bait station, trap or monitor. Labels are normalized to uppercase and unique within a tenant. They are permanent and cannot be reused after retirement. An optional inventory equipment reference must belong to the tenant.

Record a zone and location description with a reason. The API also accepts optional paired latitude/longitude and positive finite accuracy; the foundation UI captures textual locations. Coordinates are recorded with the location event time, not inferred from an address.

Confirm installation using an active job for that property/customer, or explicitly record a historical installation. Historical installations have a null actual installation time when unknown; the lifecycle event records when the history was entered. The API accepts an optional past `installed_at` only for historical entry.

Relocation creates a new immutable location version. Replacement retires the installed original and creates a new planned identity, label and location in one transaction. The replacement needs its own installation confirmation. Retiring a device requires a reason. Retired records remain readable and immutable; looking up an old label returns the original device and its replacement link, never silently substitutes another physical asset.

## Technician access

The Property devices panel on Job Detail displays the register and manual label lookup. Every read requires a verified identity, current TECHNICIAN database role, and a scheduled/in-progress job currently assigned to that technician in the same tenant, property and customer scope.

Device UUIDs and labels alone do not grant access. Reassignment, role revocation and job closure revoke the job-context read path. Technicians cannot register, install, relocate, retire or replace devices in this foundation. Customers have no access. Future service capture will add separately authorized capabilities.

Protected device responses use `Cache-Control: no-store`; portal data is not saved in browser storage. Session changes clear the view and form values. A network-interrupted mutation can be retried with the same key and payload. Changed data under an existing retry key is rejected. Current role and scope checks run before a replay is accepted.

## Contracts and verification

REST base: `/api/v1/devices` on every backend.

- GET: `/settings`, `/options` (staff), `/` (paginated, property/lifecycle filters), `/lookup?label=...`, `/:id`.
- POST: `/settings`, `/` (create), `/:id/install`, `/:id/relocate`, `/:id/retire`, `/:id/replace`.
- Technician reads additionally require `job_id`. Mutations require `request_key`, an explicit reason, and the current version except on create. Path IDs override body IDs.

GraphQL equivalents are in `shared/contracts/devices.graphql`. Scalar ORM contracts are in `devices.prisma`. Run `python scripts/prepare_device_models.py` to add mappings and synchronize shared portal sources; PostgreSQL owns relationship checks and lifecycle writes.

```text
node tests/devices.integration.mjs
python -m pytest tests/test_device_adapters.py -q
php tests/device_auth.php
```

Portal tests cover registration, hidden technician management controls, explicit installation context and stable retries. Database tests cover tenant isolation, assignment/revocation, label permanence, location history, atomic replacement rollback, historical dates, pagination and equipment ownership. Transport tests exercise real Express/GraphQL handlers against a test database and FastAPI/Laravel parameter/error boundaries with doubles.

Existing unrelated technician test files still have matcher/global type errors; the new device component is checked independently. This is not a full audit of existing inventory, chemical, photo or generic event endpoints. Those must be secured before later slices reuse them.
