# Commercial account directory foundation

Apply migrations in order through 029_commercial_accounts.sql and deploy the APIs/admin portal together. Scalar Prisma, SQLAlchemy, and Eloquent read mappings are included; commercial_api owns writes. Generate Prisma clients through the normal deployment process if generated read mappings are needed. Do not replace canonical migrations with ORM schema synchronization.

## Enable and use

Open **Commercial accounts**. A current database MANAGER or SUPER_ADMIN can enable the directory, create an account with a permanent code/name, and assign a same-tenant staff owner. Managers control all mutations in this slice. DISPATCHER and CUSTOMER_SERVICE_REP can read the staff directory. Technicians and customers are denied even if their JWT claims an administrator role.

Link an existing eligible property using a permanent site code, site name, explicit IANA timezone, and action reason. The property remains owned by its existing customer. Sites under different same-tenant customers can belong to the same account. The account's customer context is derived from validated site membership; there is no new customer ownership or parent-customer relationship.

Linking previews active contracts, jobs, device registers, and callbacks. Acknowledgment is required when dependencies exist. Account/site archival always requires acknowledgment that service and billing remain unchanged. Archiving an account keeps its site memberships active/reserved. Archiving an individual site ends its active membership and makes the property eligible for another account; old membership/history remain. A property has at most one active membership. Reopening an old membership conflicts if another active membership owns that property. Account and site codes cannot be reused or renamed within their scope.

No operation cancels a contract/job, reparents service records, charges a payer, changes inventory, sends a message, or grants portal access. Archived accounts remain readable; reopen the account before editing its directory. Sites can be renamed or have their directory timezone corrected without changing operational schedules.

## Contact scopes

Contact responsibilities are corporate coordination, on-site access, billing inquiries, and emergency escalation. Each contact belongs to the account or one site. Active primary contacts are unique per responsibility/scope. The same person can have distinct responsibility records. Contacts do not automatically gain authentication, report access, notification consent, or billing authority.

Create a separate commercial contact or explicitly link an existing customer email/phone. Site customer links use the site's validated customer. Account-level source links supplied through the API require an associated same-tenant customer. Linked source values are snapshots; changes to a customer contact do not silently propagate. Source fields and contact scope are permanent. Archive/recreate to change a source or scope. Updating the commercial directory never overwrites customer_emails/customer_phones. Referenced source rows must be retained rather than deleted through legacy contact management.

Changed source values are hidden from normal contact lists. Use **Show contacts needing source review** for redacted review rows. If customer/site ownership still validates, managers can archive the stale contact and create an explicit replacement from the new source value. A true ownership mismatch blocks contact mutations until a later reconciliation workflow. Source-linked fields cannot be edited through a commercial contact update.

## Ownership and history

Every property/customer/tenant relationship is revalidated on reads and writes. If a legacy ownership change invalidates a site snapshot, current customer names/addresses/dependencies are hidden, active valid site counts exclude it, and ownership review counts increase. Site mutations and site contact reads are blocked until reconciliation. This slice does not provide an ownership repair or transfer workflow.

Events retain account, site, and contact change snapshots and reasons. Codes/membership identities cannot be overwritten, and audit/retry records cannot be edited or deleted. Staff events are tenant-owned historical records; they do not perform fresh joins to a former customer's current private data. Rate/profitability information and internal operational notes are not included in directory projections.

A request key with the same actor/action/payload returns the recorded result; a different payload conflicts. Current database role, feature enablement, and relevant site/contact relationship validity are checked before replay. Optimistic versions protect account, site, and contact changes. Linking also checks the account version; refresh after linking before another link.

## API parity

All four backends expose /api/v1/commercial:

- GET /settings; POST /settings with enabled.
- GET / with state, q, limit (1–100), offset; POST / creates code/name/optional owner_id.
- GET /options: eligible properties with dependency preview; kind=owners searches same-tenant staff; kind=contacts requires customer_id and returns customer email/phone choices. Options are paginated and q filters property/customer names or staff email.
- GET /{id}; POST /{id} updates account name/owner using version.
- POST /{id}/archive or /reopen.
- GET /{id}/sites; POST /{id}/sites links property_id/code/name/timezone using account version.
- GET /{id}/sites/{site_id}; POST to update its name/timezone using site version; POST /archive or /reopen.
- GET /{id}/contacts with optional site_id, state, review=true, limit, offset.
- POST /{id}/contacts creates a scoped contact; POST /{id}/contacts/{contact_id} updates it using contact version; POST /archive archives it.
- GET /{id}/events with limit/offset.

All manager mutations except feature settings require reason and UUID request_key. Archive operations use acknowledge_dependencies=true. Contact creation accepts responsibility, name, email/phone, is_primary, optional site_id, and optional customer_id/source_email_id/source_phone_id. Changing contact scope/source is rejected. IDs from route parameters override body IDs.

GraphQL equivalents are commercialSettings, commercialAccounts, commercialAccount, commercialSites, commercialSite, commercialContacts, commercialEvents, commercialOptions, and commercialCommand restricted to manager actions. GET settings cannot write configuration. All responses are private/no-store, and the client rejects replies after identity changes.

Account directory, eligible properties, site roster, scoped contacts, and audit history are bounded/paginated. Active site counts exclude invalid relationships. Pending network writes retain their request key; resolve or discard the pending request before another action. Discard reloads the directory because the original write may already have committed.

## Remaining scope

No delegated commercial portal grants, invitations, notification delivery, master agreements, consolidated invoices, payment pooling, operational instruction inheritance, technician projections, or account profitability rollups ship in this slice. Existing individual customer access is unchanged. Participating legacy customer/property/contact/calendar/billing routes still need the planned authorization audit before commercial portal access or source workspace links are introduced.

## Verification

Run node tests/commercial.integration.mjs for real migrations, relationship guards, account/site/contact lifecycle, primary uniqueness, source review, no billing/notification side effects, permission/retry/version boundaries, and TypeScript adapters. Run Python test_commercial_adapters.py, PHP commercial_auth.php, and the admin CommercialWorkspace.test.tsx suite. The canonical tests use the existing local PGlite runtime. Prisma validation requires DATABASE_URL configured but does not connect to it.
