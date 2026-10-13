# Job authorization hardening

Apply `shared/database/023_job_authorization.sql` after migration 022 before deploying the changed adapters. This migration adds shared invoker-rights job commands; it does not grant end users database access. Use PostgreSQL and configure `JWT_SECRET` consistently with the signed portal identity provider. There is no mock identity or fallback secret in the new job handlers.

Express, FastAPI, GraphQL and Laravel job lists/calendars, creation, updates, clock-in/out, technician directories/schedules/location updates, and dispatch commands now use the same policy. Roles are read from the database. Technician lists are restricted to the authenticated technician; job reads and writes use the current assignment and tenant. Customers can read their own jobs but cannot mutate them through staff job endpoints. Staff creation validates customer/property/contract relationships and technician tenant/role. Body tenant identity cannot override authenticated identity.

Job mutations lock the actor's role record and job while validating and writing. Technician state changes allow scheduled to in-progress to completed. Clock retries preserve recorded arrival/departure. Technician assignment changes, administrative states and unsupported fields are rejected. Successful job mutations are audited. A schedule batch rolls back entirely when an entry fails validation.

Former global job/technician/dispatch event broadcasts were removed from these handlers to avoid publishing authorized results into an unscoped event bus. Consumers should refetch authenticated job endpoints; a scoped job event feed remains future work. Callback events retain their existing scoped feed.

Dispatch still uses the existing MVP synthetic property coordinates and estimated drive times; these are not real routing data. A shared property-ID-based coordinate placeholder now gives consistent behavior across backends. Emergency dispatch validates the property/job relationship and restricts candidates to technicians in the authenticated tenant.

Verification:

```text
node tests/jobs.integration.mjs
python -m pytest tests/test_job_adapters.py tests/test_callback_auth.py -q
php tests/job_auth.php
node tests/callbacks.integration.mjs
```

The database suite uses the locally installed PGlite runtime in `.callback-test-runtime`, as does the callback suite. Adapter tests exercise actual handlers and parameter binding with a test database or database boundary doubles; they do not constitute a deployed four-server conformance test. Run a PostgreSQL deployment smoke test before rollout.

This change addresses the inspected job and dispatch surfaces. It is not a full application authorization audit: booking, CRM property/customer endpoints, chemical logs, photos, and generic event feeds need separate review before they are reused by the Property Service Playbook. Playbook-specific endpoints and attachments are not yet implemented.
