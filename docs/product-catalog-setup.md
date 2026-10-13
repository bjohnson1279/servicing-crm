# Product catalog foundation — local implementation

Implemented: tenant-owned product identities, editable drafts, immutable submitted/versioned details and evidence, manager review/activation/rejection/withdrawal, successor drafts, protected PDF copies and HTTPS references, staff catalog UI and assigned-job technician references across all four APIs.

This is the first Verified Product Catalog and Service Reports slice. Verified application-version snapshots, application/stock-posting integrity, service-report drafting/publication, customer reports, PDF report rendering and delivery remain planned. Catalog activation records a manager's source review; it is not regulatory certification or authorization of a specific application.

## Deployment

Apply `shared/database/026_verified_product_catalog.sql` after migrations 023–025 before deploying the changed adapters. Configure `JWT_SECRET` with the deployed signed identity provider. Portals expect `sessionStorage.crm_access_token` and `VITE_API_BASE_URL` pointing to the selected backend's `/api/v1` base.

Catalog access defaults off per tenant. Managers enable it in the admin Product catalog view or through authenticated `POST /catalog/settings` with `{"enabled":true}`. Complete a real PostgreSQL deployment smoke test and tenant pilot; PGlite and adapter-boundary tests do not constitute a deployed four-server conformance run.

## Review workflow

Staff creates a permanent tenant-unique product code and draft version with trade name, manufacturer, category, jurisdiction and identifier status. Unknown identifiers require an explanation and an empty value. Inventory references are explicit and tenant-checked; linking inventory does not verify identity or change stock.

For this company's catalog gate, pesticide records require label and SDS evidence. This is an application verification rule, not a statement of universal legal requirements. Other products can document not-applicable identifiers/documents with reasons, but still need at least one authoritative product source before activation.

Add label/SDS/other evidence as a stored PDF up to 2 MB or a public HTTPS source reference. Record source kind/authority, retrieval time, and document date or an explicit unknown-date reason. Stored copies receive a server-computed SHA-256 checksum. Source URLs are stored, not fetched by the server; the application does not automatically inspect external sources or certify their authority.

Submit the draft for source review. Only a current database manager/super-admin may activate/reject it. Activation requires explicit identity, identifier, jurisdiction and document-currency checks, a future review-due time, and the required authoritative source records. Unknown identifiers cannot be activated.

Submitted details and documents cannot be edited. Reject and create a successor draft to correct them. A successor copies source evidence for deliberate review; it carries no inherited approval. Only one draft/review and one active version may exist per product. Activating a successor supersedes the earlier active version atomically. Withdrawal and supersession preserve original evidence and verification history.

## Technician references and permissions

The technician Job Detail has a Reviewed product references panel. Access requires the current TECHNICIAN database role and a scheduled/in-progress job currently assigned in the same tenant. Only active versions whose configured review deadline is still in the future are returned. Withdrawal, supersession, overdue review, assignment changes and role revocation are enforced on subsequent reads and document downloads.

Customers have no catalog access in this slice. Technicians cannot draft or verify catalog records. They do not receive internal review history/checklists. Product IDs/document IDs alone do not authorize access. PDFs are downloaded through authenticated parent-product access; responses use `Cache-Control: no-store`, and portal catalog data is not persisted in browser storage.

## Registration-number correction

The technician ChemicalLog inventory selector no longer guesses EPA registration numbers from BIF/TER SKU substrings or supplies a fallback. Selection clears prior manual identity text; unknown numbers remain blank. The form explicitly asks for source-based manual entry.

Existing logs are unchanged and are not retroactively verified. The legacy application endpoints and integer stock deduction still require the planned application-integrity slice. The new catalog reference view does not link a verified version into those legacy logs or make new verified-application/report claims.

## Contracts and verification

REST base: `/api/v1/catalog` in every backend.

- GET `/settings`, `/options` (staff inventory references), `/` (bounded pagination/status filter), `/:id`, `/:id/documents/:document_id`.
- POST `/settings`, `/` (create), `/:id/save`, `/document`, `/remove_document`, `/submit`, `/activate`, `/reject`, `/withdraw`, `/next_version`.
- Mutations use a stable `request_key` and reason; version commands also carry `revision` and current optimistic `version`. A reused key with a changed payload is rejected. Path IDs override body IDs; current roles/scope are checked before replay.
- Technician reads require `job_id`. GraphQL equivalents and scalar ORM contracts are in `shared/contracts/catalog.graphql` and `catalog.prisma`.

Run `python scripts/prepare_catalog_models.py` after updating shared portal sources or adding scalar mappings. Database commands own partial unique indexes, ownership and immutable-history constraints.

```text
node tests/catalog.integration.mjs
python -m pytest tests/test_catalog_adapters.py -q
php tests/catalog_auth.php
```

Admin portal tests cover unknown identifiers, manager review requirements, hidden verification controls and stable network retries. The technician `ChemicalLogIdentifiers.test.tsx` verifies that inventory SKUs never populate guessed registration numbers. Database tests cover source evidence, immutability, supersession/withdrawal, overdue review, tenant/assignment isolation, revocation, retry integrity and unchanged stock. Transport tests exercise actual handlers against a test database or parameter/error-boundary doubles.

Full technician type checks still include unrelated matcher/global errors in existing test files; the catalog component is checked separately. Service-report publication, existing generic document/photo endpoints and legacy application/stock routes remain outside this foundation and must be reviewed before later slices reuse them.
