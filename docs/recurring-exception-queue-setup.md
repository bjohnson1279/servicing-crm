# Recurring exception shadow review

Apply shared database migrations in order through 027_recurring_service_exceptions.sql and deploy API and admin portal changes together. This slice does not change legacy recurring generators, job records, contract schedules, billing, or notification delivery.

## Enable and assess

Open **Recurring exceptions** in the admin portal. A database manager or super administrator must supply an explicit IANA timezone, for example America/Denver, before enabling shadow review. Dispatchers and customer service staff can read the queue. Technicians and customers are denied by the database regardless of token role claims.

A manager runs assessment in batches of up to 100 contracts. Use **Assess next batch** until the assessment reaches the end. Each batch has a request key; retries reuse it. A completed pass does not run automatically. Re-run to refresh evidence. Runs serialize per tenant and commit each bounded request; errors within one contract produce a sanitized assessment-failure exception without discarding other contracts. Transport/database failure rolls back the batch, which can be retried.

Defaults: 90 days back and 30 days ahead. Managers can change lookback (1–366) and horizon (1–90) through POST settings. These are observation windows, not permission to create catch-up visits. Assessment uses the database clock in the configured timezone. ONE_TIME contracts are excluded.

## API parity

All backends expose /api/v1/recurring:

- GET /settings: private read-only settings and authoritative actor role.
- POST /settings: manager configuration using enabled, timezone, lookback, horizon.
- POST /assess: manager-only bounded shadow assessment using UUID request_key and optional contract UUID cursor after. Continue while has_more is true.
- GET /: list exceptions with state (default open), reason, contract_id, property_id, local nominal from/through, limit (1–100), and offset.
- GET /{id}: exception evidence, occurrence snapshot, and immutable assessment event history.

GraphQL equivalents are recurringSettings, recurringExceptions, recurringException, and recurringCommand(action, input) restricted to settings/assess. Identity comes from a verified bearer token, and permissions come from current tenant database roles. Responses use no-store caching. The admin client does not persist queue data and rejects responses when its token changes.

## Interpretation and limits

Every occurrence is a preview identified by schedule snapshot revision and ordinal. Calendar calculations retain the original anchor day and clamp only the individual month, including February/leap-year dates. Contract end dates are inclusive. Snapshot revisions and exception events are immutable; occurrence identity cannot change.

Matching compares contract, customer, property, tenant, and the job's scheduled date in the recurring timezone. A single match is a **candidate**, not a confirmed fulfillment link. Multiple matches produce an ambiguous-match alert. Moved visits may appear as missing visits; staff must inspect existing jobs before drawing a conclusion. Shadow evidence must never drive automatic job creation.

The initial overdue policy is the day after the nominal date; the initial unassigned policy is the local appointment day. Flexible due windows, configured assignment deadlines, explicit fulfillment links, and recovery actions belong to slice 2. Completed/invoiced candidate jobs suppress overdue alerts; this is an observation, not an independently verified service report.

Assessment records missing jobs, overdue service, cancelled visits, unassigned visits, ambiguous matches, invalid relationships/date ranges, and isolated assessment failures. Reason alerts resolve when their observed condition disappears. Alerts from an obsolete schedule preview or outside the configured review window resolve with an explicit evidence marker. **Resolved describes the preview alert, not waiver or satisfaction of a contract obligation.** Old snapshots, occurrences, and event history remain available. Date/property filters exclude contract-level alerts without an occurrence.

Schedule changes create comparison snapshots; this slice does not implement prospective schedule reconciliation, pauses, skip authorization, job recovery, notification retries, automatic workers, or generation cutover. Billing decisions and callback/warranty fulfillment are outside this review. Queue evidence shows its last assessment time and can become stale.

## Verification

Run node tests/recurring.integration.mjs for real migration/calendar/policy tests and TypeScript adapter checks. Run python -m pytest tests/test_recurring_adapters.py -q, php tests/recurring_auth.php, and the admin portal's focused RecurringWorkspace.test.tsx suite for transport and UI verification. Local PGlite dependencies must already be available at .callback-test-runtime.
