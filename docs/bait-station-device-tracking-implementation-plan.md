# Bait Station and Device Tracking — Implementation Plan

Status: The register foundation is implemented locally across all four APIs, the admin portal and technician job read view. See `device-register-setup.md`. Service capture, QR/evidence, material integration and offline/completion enforcement remain planned. Deployment requires migration 025 and a tenant pilot.

## Objective

Maintain a reliable register of installed stations, traps and monitoring devices at each property, with a durable service history. Let assigned technicians identify a device, record its condition and activity, perform authorized service, and flag follow-up work.

## Repository context

The app has tenant-scoped inventory items and transactions, properties, jobs, chemical application logs, property photos and a new inspection capture/review slice. Bait stations currently appear as an application-method option, without installed-device identities or visit histories.

Use inventory for stocked equipment and materials; use a separate installed-device register for assets at a property. A product SKU is not an installed device ID. Job authorization and inspection migrations 023/024 require deployment verification. The Property Service Playbook, treatment proposals and offline inspection workflows remain planned.

## MVP

- Property register for bait stations, traps and monitoring devices, with permanent IDs and tenant-unique human-readable labels.
- Installation location: service zone, location description, optional GPS coordinates with accuracy/time, and protected reference photos.
- Job-based device service checklist: condition, pest/activity observations, consumption measurements when applicable, actions performed, replenishment/replacement and follow-up flags.
- Printable QR labels encoding opaque device IDs; manual lookup remains available when scanning or labels fail.
- Staff register, missing/damaged-device queue and per-device history; assigned-technician visit workflow.
- Versioned device locations and lifecycle events so relocation and replacement preserve historical evidence.

Defer floor-plan drawing, indoor positioning, connected-device telemetry, automated pest diagnosis and predictive replenishment. QR codes identify records; they do not authorize access. Scanning never bypasses tenant or job assignment checks.

## Workflow

1. Staff registers a planned device or authorizes an installation on a property's job. Select a device type and optional inventory equipment item.
2. The assigned technician installs it, confirms its label and location, and records a reference photo. Existing devices can be imported through staff entry with an explicit historical-installation indicator.
3. At the next authorized visit, snapshot the expected device set and their locations. Scan or manually select each device.
4. Record inspected, inaccessible or not found explicitly. For inspected devices, record condition, activity, applicable consumption measurement and actions. Unknown/unmeasured consumption must remain distinct from zero.
5. Replenishment records actual material use. Product, quantity and units are recorded separately from pest observations; regulated applications use the existing application-log domain after its authorization review.
6. Flag damage, repeated inactivity, missing labels or follow-up work. Staff reviews exceptions and promotes relevant findings into an inspection or future property playbook.
7. Relocation preserves the device identity with a new location version. Physical replacement creates a new installed-device identity linked to the old one. Removal retires the device with actor, time and reason.

Lifecycle: planned → installed → retired. Condition and visit outcomes are separate from lifecycle: serviceable, damaged, missing, inaccessible or unknown. A missing observation does not automatically retire or replace a device.

## Data model

| Entity | Responsibilities |
|---|---|
| PropertyDevice | Tenant/property/customer, opaque ID, unique label, device type, optional manufacturer serial and equipment inventory item, lifecycle, installation/retirement evidence, replacement link, optimistic version. |
| DeviceLocationVersion | Device, zone, description, optional coordinates/accuracy, effective time, actor and relocation reason. Historical visits retain the location version they observed. |
| DeviceVisit | Tenant/job/property, expected-device snapshot, workflow state and revision, submit/review evidence. |
| DeviceServiceRecord | Visit/device/location version, inspected/access outcome, condition, activity, measurement value/unit or explicit unmeasured status, service actions, notes and follow-up flags. |
| DeviceMaterialUsage | Service record, inventory item, actual quantity/unit, application-log link where applicable and inventory posting status. |
| DeviceAttachment / DeviceEvent | Protected reference/service photos and append-only installation, relocation, service, replacement and retirement history. |

Enforce tenant/property/job/device relationships transactionally. Never reuse a retired device ID or label for a different physical asset. Historical visit snapshots remain intact after later device additions, moves or retirements. Keep replacement chains within one tenant/property; moving equipment between properties is a separately audited staff transfer, deferred from MVP.

## Backend permissions and integrity

Apply one policy across Express, FastAPI, GraphQL and Laravel, using verified identity and current database roles/assignment.

- Technicians read a property's device register only through an authorized assigned job. Possessing a device UUID, label or QR code grants no access.
- Technicians record observations/service for that job and install or relocate only where staff has authorized that capability. Staff controls registration, label reassignment, replacement approval, retirement and administrative overrides.
- Customers do not receive internal device notes, sensitive location details or reference photos in MVP.
- Scope label lookup, scanning results, media access, exports and event feeds by tenant and job access.
- Recheck assignment/role during writes and offline retries. Lock job/device/location records during updates; reject stale versions and changed payloads under a reused idempotency key.
- Preserve immutable submitted service snapshots. Corrections create an amendment with actor and reason.
- Validate quantity/unit compatibility and inventory ownership. Post stock consumption transactionally once per usage record, or through a durable outbox with visible pending/failure status; retries must not decrement inventory twice.
- Inspect and harden legacy inventory, chemical-log and photo routes before reusing them. Their existence does not establish authorization parity.

## Completion and offline behavior

Snapshot expected devices at visit start. Submission requires a service result or explained exception for each expected device; it must not silently mark unchecked devices serviced. Record newly installed devices separately. Staff additions after the snapshot cannot silently alter the checklist in progress.

Integrate mandatory-device completion with authoritative job completion after rollout testing, using a tenant setting rather than requiring device checks for every job. Coexist with inspection completion guards; each applicable requirement must be satisfied.

Offline capture is a later slice: cache assigned-job device/location snapshots under authenticated tenant/user identity, preserve stable retry keys, mark saves pending, and require review for reassignment, retirement, replacement, relocation or inventory conflicts. A stale scan must not service a replacement device automatically. Do not persist access credentials in label payloads or offline records.

## Portal and API delivery

Admin: property device register, installation authorization, QR label printing, location/replacement/retirement history, and exception review queue.

Technician: assigned-job expected-device list, optional camera scan plus manual lookup, service form, protected photos and explicit outstanding-device counts. Scanning failure always leaves manual entry available.

Define shared REST/GraphQL contracts for device register reads, job-scoped label lookup, registration/installation, visit start, service draft/submission, location changes, replacement/retirement, staff review and protected attachments. Return bounded paginated lists and scoped feeds. Link inspection findings to device/service IDs without making inspections a prerequisite for ordinary device service.

## Implementation sequence

1. **Register foundation:** contracts, schema/model parity, tenant/assignment checks, staff property register, planned-device registration and lifecycle audit tests.
2. **Service capture:** expected-device snapshots, technician observations/actions, submission/exception checks and staff review.
3. **Identification and evidence:** QR label printing/scanning with manual fallback, protected reference/service photos and historical location views.
4. **Material integration:** authorized application-log linkage, unit validation, inventory postings and duplicate-posting protection.
5. **Offline and rollout:** conflict recovery, optional completion enforcement, migration/deployment verification and tenant pilot behind a feature flag.

Start with the register foundation. Keep mandatory completion checks off until service capture and synchronization have been verified.

## Acceptance checks

- Cross-tenant, unassigned-job and customer reads/writes are denied through direct endpoints, scans and media URLs.
- Forged body tenant/role/technician identities do not authorize installation or service.
- Relocation, replacement and retirement preserve earlier visit snapshots and device history.
- Repeated installation/service/material-posting requests create one intended record and one stock deduction.
- Every expected device has an observation or explained exception; missing and unmeasured are not treated as zero activity/consumption.
- Retired devices and stale labels cannot silently resolve to replacements.
- Inventory items, units and related application records match the authorized tenant/job.
- Offline synchronization after revocation or reassignment fails visibly without corrupting history.
- API behavior and permission boundaries are equivalent across all four backends.

Pilot measures: expected devices accounted for per visit, missing/damaged-device exceptions, unresolved follow-ups, inventory discrepancies and synchronization failures. Establish a baseline before setting targets.
