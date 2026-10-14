# Commercial Multi-Site Accounts

Status: slice 1 implemented as a disabled-by-default staff directory. Operational instructions, legacy route hardening, delegated access, invitations, and billing rollups remain planned. See commercial-accounts-setup.md for operation and limits.

## Outcome

Give staff one commercial account workspace for organizations with multiple service sites, while preserving site-specific service history, contacts, contracts, and access boundaries. Later allow authorized corporate and site users to see the appropriate services and billing records.

## Repository findings

- Customers already own multiple properties. Jobs and service contracts each reference a customer and property; grouping sites does not require changing those ownership links.
- A customer references a user, and tenant ownership is derived through that user. There is no commercial organization, account membership, account-level permission grant, or delegated customer identity model.
- Customer phone/email records distinguish primary contacts but do not define site, billing, corporate, or emergency responsibilities. A contact record is not an authenticated portal user or notification consent.
- The schema section titled Customer & Account Hierarchy currently contains technician restrictions, not an account hierarchy.
- Existing callback, inspection, device, recurring, and cost foundations enforce their own ownership rules. Adding organization membership must not silently broaden access to their records.
- Reviewed FastAPI customer directory/360 handlers lack identity and tenant filtering in the handler, and property photo routes still use placeholder/public-file behavior. These are not suitable delegated-access interfaces without hardening.
- The customer service calendar uses a hardcoded mock customer identity. Production commercial access must use verified identity and server-side grants instead.

Sources: shared/database/001_initial_schema.sql, 002_expanded_domain.sql, 004_crm_features.sql, and 023_job_authorization.sql; FastAPI CRM customer/property handlers; customer portal account/ServiceCalendar.tsx.

## Account and site model

Introduce a tenant-owned CommercialAccount with immutable account code, organization/display name, lifecycle state, optimistic version, and staff owner. Start with one organization and its sites; arbitrary parent/subsidiary hierarchies are later scope.

Use explicit membership records to group existing same-tenant customers and their properties. An account can contain sites belonging to different existing customers, such as separately billed branches or franchisees. Membership is organizational context, not a legal ownership transfer, billing payer change, or authorization grant.

Represent each site with a permanent account/site code, property reference, customer ownership snapshot, display name, service timezone, lifecycle, and optional operating/access instructions. A property has at most one active commercial account membership initially. Support inactive historical memberships and audited prospective moves; never rewrite old jobs, invoices, contracts, callbacks, or cost postings.

If legacy property/customer ownership changes outside this workflow, mark the site relationship as requiring review and block further site mutations until reconciled. Staff directory projections must validate current tenant/customer/property relationships on every request, not trust a stale membership snapshot.

Account/site archival retains history and does not cancel contracts, delete devices, stop recurring service, revoke unrelated customer access, or modify billing. Archiving must make these outstanding dependencies visible. Reopening and moving sites require explicit manager actions and reasons; avoid hard deletion or implicit cascading effects.

## Contacts and responsibilities

Add account and site contact responsibilities for corporate coordination, on-site access, billing inquiries, and emergency escalation. Store the role/scope, name, email/phone, active interval, and primary status. Enforce uniqueness of an active primary contact per scope/responsibility where applicable.

Link an existing customer contact only after validating ownership and tenant; otherwise create a distinct scoped commercial contact. Do not copy legacy contacts automatically across sites. Editing the account contact must not overwrite a site's local contact or a customer's existing primary contact.

Commercial contacts do not gain portal access automatically. Receiving operational communications requires appropriate consent/preference evidence; a billing responsibility is not permission to receive every site's service report. Contact responsibility assignment is directory-only in the first slice, with no automatic email/SMS dispatch or invitation.

Keep access instructions separate from corporate administration notes. Technician projections expose only the current assigned site's operational instructions and permitted contacts. Secrets such as access codes need a separate protected field and audit policy before support is offered; do not encourage entering them in general notes.

## Permissions and delegated access

Use verified identity and current database tenant roles before queries, mutation, and retry replay. Managers/super administrators configure accounts, site memberships, moves, archival, and access grants. Dispatchers/customer service staff can read the staff directory and perform narrowly authorized contact/operational edits when that slice ships. Technicians and customers cannot browse the staff account directory.

Later introduce explicit authenticated user grants:

| Grant | Scope |
| --- | --- |
| Corporate service viewer | Customer-safe service information for explicitly granted account sites |
| Site service viewer/requester | Customer-safe information and permitted requests for listed sites only |
| Billing viewer | Explicit billing scope, independently granted from service access |
| Account access administrator | Delegation within approved boundaries; never tenant administration or internal cost access |

No grant follows from email domain, shared customer name, contact role, or account membership alone. Validate same-tenant users and sites, intersect scopes on every endpoint, and revoke promptly without trusting old JWT role claims. Invitations and delivery require a later explicit workflow; do not send anything during the foundation slice.

Corporate views must omit internal notes, employee rates, profitability, private inspections/draft proposals, staff-only callback evidence, and restricted property documents. Apply grants to exports, attachments, search, counts, calendars, SSE subscriptions, and offline data, not just page navigation. Revoke access when a user or site leaves the grant scope, clear caches on identity/scope changes, and reauthorize each queued write on replay.

Before commercial portal access ships, audit and harden every participating legacy customer/property/contact/booking/calendar/billing/report route. New scoped endpoints do not repair bypasses through old endpoints by themselves. Preserve existing technician current-assignment checks and existing individual customer access semantics during the staff foundation.

## Billing and service relationships

Keep site contracts, service schedules, device registers, inspection findings, and callback cases attached to their existing identities. Account membership is a navigational rollup. Show separate source links and completeness indicators; do not count a callback visit twice through overlapping site/job links.

Master agreements, corporate service standards, and contract templates can later reference the account, but each covered site and its effective period must be explicit. Site exceptions require versioned overrides with effective dates, not silent inheritance that changes active contracts.

Consolidated billing is a separate later workflow: record the payer, covered sites, service/billing period, invoice source allocations, taxes/currency, and credit/refund policy. Grouping an organization must not combine currencies, reassign unpaid invoices, pool payment methods, charge a corporate card, or treat contract recurring amounts as realized revenue. Profitability remains manager-only and depends on the revenue reconciliation initiative.

## Data and API design

Add a migration after the job-cost migration with tenant feature enablement, commercial accounts, versioned site memberships, account/customer membership context, scoped contacts/responsibilities, immutable audit events, and idempotency records. Later migrations add grants, invitations, agreement coverage, and billing allocations.

Use the canonical PostgreSQL command pattern across Express, GraphQL, FastAPI, and Laravel, with synchronized contracts/read model metadata. Enforce tenant relationships, account/site code uniqueness, a single active account per property, optimistic versions, correction/move history, and permission checks before idempotent replay.

Expose equivalent settings, account list/detail, eligible customer/property search, site list/detail, scoped contact operations, and manager mutations as their slices ship. Use bounded pagination and batched joins for counts and summaries. Account detail does not load every site's complete service history at once. Filter source data by tenant and ownership before computing counts. Responses are private/no-store; clients reject results after identity changes.

## Staff and customer experience

Staff workspace: account directory with organization names/codes, lifecycle, owner, active site count, and an actionable empty state. Account detail provides a paginated site roster, customer/property labels, timezone, scoped contacts, membership history, and links to protected source workspaces. Linking sites previews their current ownership and relevant active service dependencies before confirmation.

Provide clear labels for corporate contact, local site contact, service customer, and billing payer. Do not describe a grouping as a merged customer record. Add account/site context to Customer360 after its backend routes are protected.

Later customer workspace: server-authorized site selector, service overview, site calendars/report access, and explicit billing scope. A denied site must not leak its name, address, counts, or documents. Requesting service at a site uses the same protected domain rules as individual customer requests.

## Delivery slices

1. **Staff account/site foundation:** tenant enablement, immutable account/site codes, same-tenant links to existing customers/properties, scoped directory contacts, manager create/update/link/archive actions, immutable events, paginated read APIs across all backends, admin workspace, and ownership/permission/concurrency tests. No delegated portal access, notifications, service-history reparenting, or billing changes.
2. **Operational site context and legacy hardening:** protect participating customer/property/contact routes, staff contact edits, site instructions with assigned-technician projections, audited site moves, and protected Customer360/service workspace links.
3. **Delegated commercial portal:** explicit user/site/capability grants and revocation, scoped customer-safe views/calendar/reports, secure attachment access, and notification/invitation preferences and delivery workflow.
4. **Master agreements and commercial rollups:** versioned site coverage/overrides, validated operational account summaries, consolidated billing allocations, and manager-only profitability integration after its prerequisites ship.

Begin with slice 1. Preserve existing customer ownership and authorization while establishing the commercial directory.

## Verification and rollout

Default disabled per tenant. Preview existing customers/properties for linking; flag cross-tenant, changed-owner, duplicate, or ambiguous relationships for review. Do not group customers by email/name automatically. Retain existing standalone residential behavior. Enabling the directory must not enable corporate access elsewhere.

Test multiple sites under one customer and under distinct same-tenant customers; duplicate site codes/memberships; concurrent linking; invalid tenant/customer/property/contact relationships; forged and downgraded roles; technician/customer denial; request-key conflicts and optimistic versions; immutable history; archive/reactivate behavior without contract/billing changes; stale ownership detection; bounded/paginated counts without data leakage; and portal identity changes. Later grant tests cover sibling-site isolation, capability separation, revocation, attachment/export/SSE scope, and offline replay. Run real canonical database integration tests, four-backend transport checks, and focused portal tests.
