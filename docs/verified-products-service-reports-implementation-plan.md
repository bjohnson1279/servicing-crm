# Verified Product Catalog and Service Reports — Implementation Plan

Status: The catalog foundation is implemented locally across all four APIs and staff/technician portals; guessed EPA numbers were removed from inventory selection. See `product-catalog-setup.md`. Application integrity, service reports, report delivery and offline slices remain planned. Deployment requires migration 026 and a tenant pilot.

## Objective

Give technicians a source-backed product catalog and customers an accurate, reviewed account of completed service. Preserve which product/document versions were used and which facts were recorded at the visit. Verification describes documented staff review of source evidence; it is not a claim of regulatory certification or blanket safety.

## Repository findings and prerequisites

The app has inventory items, chemical application logs, EPA registration text, job signatures, property photos and an internal chemical-usage report. It does not have a versioned product catalog or immutable customer service-report model.

The technician ChemicalLog form currently guesses registration numbers from SKU substrings and supplies a default number for unmatched items. Remove this behavior; missing identifiers must remain explicitly unknown. Do not mark historical logs verified because their guessed identifier matches a catalog record.

The Express application handler accepts request-supplied technician identity, creates the log before stock posting, falls back to a name match, and rounds application quantity to integer inventory units. Review equivalent handlers in all four backends. Before reuse, enforce current tenant/job assignment, derive technician identity from the server, use explicit product/inventory links, and make logging/stock posting transactional and retry-safe. Application quantity and stocked packages are different measurements; no implicit rounding or conversion is acceptable.

Inspection capture and device-register foundations are implemented locally. Treatment proposals, the Property Service Playbook, device service observations and their offline workflows remain planned. Report generation must tolerate unavailable domains instead of inventing records or claiming those features exist.

## MVP scope

- Tenant-owned product identities with trade name, manufacturer, product category, jurisdiction, and identifier type/value or an explicit unknown/not-applicable reason.
- Versioned source documents/references: product label and SDS where applicable, source authority, retrieval/document dates, checksum for stored copies, and review evidence.
- Manager review and activation of an immutable product version, followed by supersession or withdrawal when needed.
- Technician selection from active reviewed versions; actual application logs retain the selected product/version snapshot.
- Staff-reviewed, versioned service reports with work summary, customer-visible findings, actual products/applications, approved instructions, follow-up needs and explicitly selected photos.
- Authenticated customer report access and a printable/downloadable report. Publication and delivery are separate audited operations.

Defer automatic external catalog crawling, OCR-based verification, automated dosage/product recommendations, electronic regulatory filing, jurisdiction-wide compliance certification and offline catalog/report publishing. No catalog data or report text may generate pesticide dosage, re-entry periods or safety claims from product names or generic templates.

## Catalog workflow

1. Staff creates a draft product identity and a version with explicit source references/documents. Link an inventory item separately; an inventory SKU is not a verified product identity.
2. A manager compares trade name, manufacturer, identifier, formulation/category and jurisdiction to the supplied evidence. Record reviewer, review time, reasons and document versions.
3. Activate that reviewed version for selection. Missing, contradictory or stale evidence stays in review with visible reasons. Configure review dates; do not invent a universal verification window.
4. A correction creates a new version. Superseded/withdrawn versions are unavailable for new selection, while historical application/report snapshots remain intact.
5. Technician chooses a version, then records actual quantity/unit, application method, area, target pests, time and relevant conditions. Selection alone does not certify that a particular use is authorized.

Version states: draft → in_review → active / rejected; active → superseded / withdrawn. Record every decision. Non-pesticide products must support appropriate identifier types and not-applicable document reasons without fabricated EPA numbers.

## Service report workflow

1. Staff or the assigned technician creates a draft from an authorized job. Include actual source records and their IDs/versions; identify missing information explicitly.
2. Keep internal findings and customer-facing narrative separate. Include inspection findings or device service summaries only when those records exist and are approved for customer visibility.
3. Staff reviews the customer-visible content, selected evidence, product snapshots, instructions and follow-up. Unverified legacy product data must be labeled as unverified; publication either requires resolution or an explicitly permitted, reasoned exception.
4. Publish a frozen report version for completed service. The report is an allowlisted customer document, not a serialized internal job object. A later correction publishes a successor version linked to the original and records the reason.
5. Customer accesses only published reports for their own customer/property relationship. Render/download the same immutable payload and record publication/download/delivery evidence as appropriate.
6. Sending an email/SMS is a separate explicit action or configured notification workflow. Do not automatically expose a report via a public object URL or silently message customers during implementation.

Report states: draft → awaiting_review → published; drafts may return for revision. Published versions can be superseded or withdrawn with a reason. Retain audit history and display current versus superseded status consistently.

## Data model

| Record | Responsibilities |
|---|---|
| CatalogProduct | Tenant, stable identity, trade name/manufacturer/category and optional inventory mappings. |
| CatalogProductVersion | Versioned identifiers, formulation/category, jurisdiction, document references, state, review evidence and configured review-due date. Immutable after activation. |
| ProductDocument | Parent version, label/SDS/other type, protected stored reference or HTTPS source URL, source authority, document/retrieval dates, checksum and uploader. |
| Application extension | Verified product-version link, identity/document snapshot, actual quantity/unit, method/area/time and recorder. Legacy name/identifier retained separately with verification status. |
| Inventory unit mapping/posting | Explicit stock unit, application unit conversion where valid, posting key/status and source application link. Reject incompatible or missing conversions. |
| ServiceReport / ServiceReportVersion | Tenant/job/customer/property, source-record references, customer-visible content snapshot, review/publication evidence, correction chain and rendering metadata. |
| ReportEvidence / DomainEvent | Explicitly selected protected photos/documents and append-only verification, withdrawal, publication, correction and delivery history. |

Validate tenant/customer/property/job/product/document/inventory relationships transactionally. Source changes must not rewrite historical reports or application snapshots. Separate report content from internal review reasons, costs, credentials, callback coverage notes and customer restrictions.

## Backend enforcement

Implement equivalent REST/GraphQL behavior in Express, FastAPI, GraphQL and Laravel using verified identity and current database roles/assignment.

- Managers activate/withdraw catalog versions. Authorized office staff draft records and review/publish reports according to an explicit permission matrix.
- Technicians read applicable active catalog entries and record applications/draft reports only through currently assigned jobs. They cannot assert verification, override inventory conversions or publish reports.
- Customers read only their own published report payloads and customer-visible evidence. Deny access to drafts, internal source objects and catalog review notes.
- Recheck scope for document/photo endpoints, print/PDF exports, report URLs, event feeds and retries. IDs or URLs alone never authorize access.
- Path IDs override body IDs; body tenant/role/technician claims never supply authority. Lock records around review, publication and assignment-sensitive writes; use optimistic versions and stable idempotency keys.
- Prefer controlled document uploads and stored source URLs in the first slice. If server fetching is introduced, apply outbound URL/IP/redirect controls before fetching user-supplied URLs.
- Version changes or withdrawal during a pending application require visible review on synchronization. Never silently substitute a different product or claim an unconfirmed offline action is recorded.

## Portals and delivery

Admin: product drafts, evidence review, activation/withdrawal history, report review queue, customer preview, corrections and delivery history.

Technician: verified catalog selector with document/version links, explicit unknown-product handling, actual application entry and customer-visible service summary draft.

Customer: published service-report list/detail and printable/downloadable view; clear correction/supersession status. PDF/print output must be visually verified and match the authorized payload, including absent-data wording and selected evidence.

## Implementation sequence

1. **Catalog foundation:** shared contracts and migration/model parity, remove guessed registration numbers, draft/source/review/activation workflow, staff catalog UI, protected evidence and permission tests. No automatic external verification.
2. **Application integrity:** harden all legacy application routes, adopt product-version snapshots, align frontend/backend payloads, explicit units/conversions, atomic posting and retry protection.
3. **Report workflow:** allowlisted draft/review/publication APIs, immutable snapshots and corrections, admin/technician drafting and customer ownership checks.
4. **Report delivery:** customer portal, printable/PDF rendering and visual verification, protected evidence, configured notifications and audited delivery.
5. **Rollout and offline:** migration/deployment smoke tests, tenant feature flag/pilot, catalog/application conflict recovery; publishing and verification remain server-confirmed actions.

Start with catalog foundation and the removal of guessed product identifiers. Do not enable new verified application/report claims until application integrity checks pass.

## Acceptance checks

- Product verification requires manager-reviewed matching evidence, not a SKU, name match or supplied role claim.
- Missing identifiers/documents remain unknown or explicitly not applicable; legacy guesses are never backfilled as verified facts.
- Superseded/withdrawn versions cannot be newly selected; historical applications and reports retain their original snapshots.
- Unauthorized tenants, unassigned technicians and customers cannot access internal catalog/report objects, evidence or exports.
- Concurrent application retries create one log and one correct stock posting; incompatible units and insufficient stock fail without partial writes.
- Published reports contain only explicitly customer-visible fields and actual recorded work; absent data is not represented as zero or completed work.
- Corrections preserve earlier published versions and customer-visible correction history.
- All four APIs enforce equivalent roles, states, ownership, retry and validation behavior.
- Rendered report/PDF output matches the frozen authorized payload and passes visual/accessibility checks before release.

Pilot measures: catalog evidence completeness, rejected/stale verification, unverified application rate, stock posting exceptions, report review turnaround and corrections. Establish baselines before operational targets.
