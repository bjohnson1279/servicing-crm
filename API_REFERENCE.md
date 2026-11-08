# API Endpoint & Schema Reference

The platform operates across four interchangeable backends designed with identical contracts under the `/api/v1` namespace (with real-time events at `/api/events` and webhooks under `/api/webhooks`).

- **Express Reference API**: `http://localhost:3182`
- **FastAPI Reference API**: `http://localhost:3184`
- **Laravel Reference API**: `http://localhost:3181`
- **GraphQL Apollo Server**: `http://localhost:3183/graphql`

### Formal Contract Specifications
- **OpenAPI 3.1 Specification**: [`shared/contracts/openapi.yaml`](shared/contracts/openapi.yaml)
- **GraphQL Core Schema**: [`shared/contracts/schema.graphql`](shared/contracts/schema.graphql)
- **Domain Contracts & Schemas**:
  - Callbacks: [`callbacks.graphql`](shared/contracts/callbacks.graphql) | [`callbacks.prisma`](shared/contracts/callbacks.prisma)
  - Product Catalog: [`catalog.graphql`](shared/contracts/catalog.graphql) | [`catalog.prisma`](shared/contracts/catalog.prisma)
  - Commercial Accounts: [`commercial.graphql`](shared/contracts/commercial.graphql) | [`commercial.prisma`](shared/contracts/commercial.prisma)
  - Property Devices: [`devices.graphql`](shared/contracts/devices.graphql) | [`devices.prisma`](shared/contracts/devices.prisma)
  - Inspections: [`inspections.graphql`](shared/contracts/inspections.graphql) | [`inspections.prisma`](shared/contracts/inspections.prisma)
  - Profitability Analytics: [`profitability.graphql`](shared/contracts/profitability.graphql) | [`profitability.prisma`](shared/contracts/profitability.prisma)
  - Recurring Exceptions: [`recurring.graphql`](shared/contracts/recurring.graphql)

---

## 1. Dispatch Domain

### `GET /api/v1/jobs`
- **Description**: Returns all scheduled, in-progress, and active field jobs for the tenant.
- **Query Params**: `status` (optional: `draft`, `scheduled`, `in_progress`, `completed`, `invoiced`, `cancelled`), `date` (optional: YYYY-MM-DD).
- **Response**: Array of `Job` objects with eager-loaded `customer`, `property`, and `technician`.

### `POST /api/v1/jobs`
- **Description**: Creates a new field service job.
- **Payload**:
  ```json
  {
    "customerId": "uuid",
    "propertyId": "uuid",
    "serviceType": "PEST_CONTROL_GENERAL",
    "scheduledDate": "2026-10-05T09:00:00Z",
    "timeWindowStart": "09:00",
    "timeWindowEnd": "11:00",
    "technicianId": "uuid (optional)"
  }
  ```

### `PATCH /api/v1/jobs/:id`
- **Description**: Updates job status, scheduling window, or reassigns technician.
- **Payload**:
  ```json
  {
    "status": "in_progress",
    "technicianId": "uuid",
    "scheduledDate": "2026-10-05T10:00:00Z"
  }
  ```

### `GET /api/v1/technicians`
- **Description**: Lists all technicians, their current duty statuses (`available`, `en_route`, `on_site`, `off_duty`), and last known GPS coordinates.

### `GET /api/v1/technicians/:id/schedule`
- **Description**: Retrieves a technician's ordered daily job manifest for route navigation.
- **Query Params**: `date` (YYYY-MM-DD).

### `PATCH /api/v1/technicians/:id/location`
- **Description**: Ingests live GPS telemetry from the Technician PWA. Broadcasts a `tech_updated` event to the real-time event bus.
- **Payload**: `{ "lat": 40.7608, "lng": -111.8910 }`

### `POST /api/v1/dispatch/optimize`
- **Description**: Executes nearest-neighbor Traveling Salesperson Problem (TSP) optimization using OSRM drive-time matrices for a technician's daily route.
- **Payload**: `{ "technicianId": "uuid", "jobIds": ["uuid", "uuid", "uuid"] }`
- **Response**: Reordered `jobIds` array with calculated driving distances, durations, and estimated arrival windows.

### `POST /api/v1/dispatch/emergency`
- **Description**: Calculates the nearest available field technician to a target property coordinate for urgent priority service calls.
- **Payload**: `{ "propertyId": "uuid", "urgency": "HIGH" }`
- **Response**: Recommended `technician` object, drive-distance in kilometers, and estimated drive time.

### `POST /api/v1/dispatch/auto-schedule`
- **Description**: Runs the constraint-solver auto-scheduling engine across unassigned pending jobs for a specified date, matching time windows and technician territories.
- **Payload**: `{ "date": "2026-10-05" }`
- **Response**: Proposed schedule assignments with technician clusters and route orders.

### `POST /api/v1/dispatch/commit-schedule`
- **Description**: Persists the proposed auto-schedule assignments into the database and queues notification events.
- **Payload**: `{ "assignments": [{ "jobId": "uuid", "technicianId": "uuid", "scheduledDate": "..." }] }`

### `GET /api/v1/inventory/items`
- **Description**: Returns all chemical and equipment inventory levels with reorder thresholds.

### `POST /api/v1/inventory/items`
- **Description**: Creates a new inventory SKU.
- **Payload**: `{ "name": "Bifenthrin 7.9%", "sku": "CHEM-BIF-01", "quantity": 45, "minimumThreshold": 10, "unit": "GALLONS" }`

### `PATCH /api/v1/inventory/items/:id/quantity`
- **Description**: Logs chemical usage or restocks. Automatically triggers purchase order drafts when quantity drops below threshold.

### `POST /api/v1/inventory/chemical-logs`
- **Description**: Records a field technician chemical application log for a job. Automatically decrements linked inventory quantities and triggers low-stock reorder workflows when thresholds are crossed.
- **Parameters**:
  - `job_id` (body, required UUID): The job for which the chemical application took place.
  - `technician_id` (body, required UUID): The technician who applied the chemical treatment.
  - `chemical_name` (body, required string): Trade name or active formulation of the chemical applied.
  - `quantity_used` (body, required number): Amount of chemical applied.
  - `unit` (body, required string): Measurement unit for applied chemical (e.g. `oz`, `fl oz`, `gallons`, `lbs`).
  - `application_method` (body, required string): Method of application (e.g. `Broadcast Spray`, `Perimeter Barrier`, `Crack & Crevice`, `Spot Treatment`, `Direct Injection`, `Bait Placement`).
  - `target_pests` (body, required array of strings): Array of targeted pest categories (e.g. `["Ants", "Spiders"]`).
  - `epa_registration_no` (body, optional string): EPA registration number of the applied chemical formulation.
  - `inventory_item_id` (body, optional UUID): Linked warehouse inventory item ID to auto-deduct stock.
  - `weather_conditions` (body, optional object): On-site ambient weather data containing `temperature` (string) and `windSpeed` (string).
  - `notes` (body, optional string): Additional technician observations or treatment notes.
  - `photo_url` (body, optional string): URL or data URI of evidence photo captured on site.
- **Response**: `200 OK` or `201 Created`
  ```json
  {
    "id": "uuid",
    "job_id": "uuid",
    "inventory_updated": true,
    "low_stock_warning": false,
    "message": "Chemical log recorded successfully!"
  }
  ```
- **Workflow Usage**: Used by field technicians in the Technician PWA during or immediately upon completion of on-site service jobs. Supports offline queued synchronization via IndexedDB when field network connectivity is unavailable.

### `GET /api/v1/inventory/epa-report`
- **Description**: Generates an Environmental Protection Agency (EPA) compliance report aggregating chemical application logs, total application events, and cumulative usage quantities per chemical across the tenant.
- **Parameters**: None. Authenticated by tenant session or JWT.
- **Response**: `200 OK`
  ```json
  {
    "totalApplications": 42,
    "summary": [
      {
        "chemicalName": "Bifenthrin 7.9%",
        "totalQuantity": 12.5,
        "unit": "GALLONS"
      }
    ]
  }
  ```
- **Workflow Usage**: Used by compliance managers and operations leads to audit regulated pesticide applications and generate statutory compliance filings.

---

## 2. Billing & Finance Domain

### `GET /api/v1/finance/report`
- **Description**: Aggregates enterprise financial health: Monthly Recurring Revenue (MRR), Annual Recurring Revenue (ARR), outstanding uncollected invoices, and paid commission sums.

### `GET /api/v1/finance/invoices`
- **Description**: Lists invoices with status filters (`unpaid`, `paid`, `overdue`).

### `POST /api/v1/finance/invoices`
- **Description**: Generates an invoice for a completed job and marks the job status as `invoiced`.
- **Payload**: `{ "jobId": "uuid", "totalAmount": 175.00, "dueDate": "2026-10-15" }`

### `PATCH /api/v1/finance/invoices/:id/status`
- **Description**: Manually marks an invoice as paid.

### `GET /api/v1/finance/quotes`
- **Description**: Lists service estimates/quotes.

### `POST /api/v1/finance/quotes`
- **Description**: Drafts a service quote for a property.
- **Payload**: `{ "customerId": "uuid", "propertyId": "uuid", "totalAmount": 249.00 }`

### `PATCH /api/v1/finance/quotes/:id/accept`
- **Description**: Customer or CSR accepts a quote. Automatically transitions quote status to `accepted` and generates the corresponding scheduled job.

### `POST /api/v1/finance/payments`
- **Description**: Records a payment transaction against an invoice.
- **Payload**:
  ```json
  {
    "invoiceId": "uuid",
    "customerId": "uuid",
    "amount": 175.00,
    "method": "CREDIT_CARD",
    "stripePaymentIntentId": "pi_mock_123"
  }
  ```

### `POST /api/v1/finance/integrations/erp/sync`
- **Description**: Pushes transaction logs to external ERP/Accounting platforms (QuickBooks Online, Xero, or NetSuite).
- **Payload**: `{ "provider": "QUICKBOOKS", "resourceType": "INVOICE", "resourceId": "uuid" }`

### `POST /api/webhooks/stripe`
- **Description**: Ingests Stripe webhook event payloads (`payment_intent.succeeded`, `payment_intent.payment_failed`) to settle invoices and log auto-charge failures.

---

## 3. CRM & Customer 360 Domain

### `GET /api/v1/customers`
- **Description**: Paginated customer account directory with search filters.

### `GET /api/v1/customers/:id`
- **Description**: Unified **Customer 360** profile. Eager-loads:
  - Properties & service locations
  - Active and historical service contracts
  - Job history with technician notes & chemical logs
  - Unified contact log timeline (Inbound SMS, Outbound Calls, Emails)
  - Internal customer notes
  - Churn Health Score & risk level indicators

### `GET /api/v1/contracts`
- **Description**: Lists all recurring service agreements.
- **Query Params**: `cadence` (`MONTHLY`, `BI_MONTHLY`, `QUARTERLY`, `SEMI_ANNUALLY`, `ANNUALLY`), `status` (`active`, `paused`, `cancelled`).

### `POST /api/v1/contracts`
- **Description**: Activates a new recurring service contract.
- **Payload**:
  ```json
  {
    "customerId": "uuid",
    "propertyId": "uuid",
    "cadence": "QUARTERLY",
    "recurringAmount": 129.00,
    "startDate": "2026-10-01"
  }
  ```

### `GET /api/v1/properties/:id/photos`
- **Description**: Retrieves historical property condition photos, entry points, and pest damage records with timestamps.

### `POST /api/v1/properties/:id/photos`
- **Description**: Uploads a property photo from the Technician PWA (`multipart/form-data`).
- **Fields**: `photo` (file), `caption` (text), `tag` (`EXTERIOR`, `ATTIC`, `CRAWL_SPACE`, `DAMAGE`).

### `GET /api/v1/commercial/settings`
- **Description**: Retrieves current tenant commercial account directory configuration and caller role.
- **Headers**: `Authorization: Bearer <token>` (Required).
- **Access**: Staff roles (`SUPER_ADMIN`, `MANAGER`, `DISPATCHER`, `CUSTOMER_SERVICE_REP`).
- **Response** (`200 OK`):
  ```json
  {
    "enabled": true,
    "role": "MANAGER"
  }
  ```

### `POST /api/v1/commercial/settings`
- **Description**: Enables or disables the commercial account directory for the tenant.
- **Headers**: `Authorization: Bearer <token>` (Required).
- **Access**: `MANAGER` or `SUPER_ADMIN`.
- **Payload**:
  ```json
  {
    "enabled": true
  }
  ```
- **Parameters**: `enabled` (boolean, Required).
- **Response** (`200 OK`): Updated settings object.

### `GET /api/v1/commercial`
- **Description**: Lists commercial accounts with pagination and filtering.
- **Headers**: `Authorization: Bearer <token>` (Required).
- **Query Params**:
  * `state` (string, Optional: `active`, `archived`)
  * `q` (string, Optional: text search by account name or code)
  * `limit` (integer, Optional, default: 25, range: 1–100)
  * `offset` (integer, Optional, default: 0)
- **Response** (`200 OK`):
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "code": "ACME",
        "name": "Acme Stores",
        "owner_id": "uuid",
        "owner_name": "manager@example.com",
        "state": "active",
        "version": 1,
        "active_site_count": 2,
        "ownership_review_count": 0,
        "contact_review_count": 0,
        "created_at": "2026-10-01T12:00:00Z",
        "updated_at": "2026-10-01T12:00:00Z"
      }
    ],
    "has_more": false
  }
  ```

### `POST /api/v1/commercial`
- **Description**: Creates a new tenant commercial account with a permanent code and name.
- **Headers**: `Authorization: Bearer <token>` (Required).
- **Access**: `MANAGER` or `SUPER_ADMIN`.
- **Payload**:
  ```json
  {
    "code": "ACME",
    "name": "Acme Stores",
    "owner_id": "uuid (optional)",
    "reason": "Commercial multi-site coordination",
    "request_key": "uuid"
  }
  ```
- **Parameters**:
  * `code` (string, Required: 1–80 chars alphanumeric, normalized to uppercase)
  * `name` (string, Required: 1–160 chars)
  * `owner_id` (uuid, Optional: staff owner, defaults to caller)
  * `reason` (string, Required: 1–2000 chars action audit reason)
  * `request_key` (uuid, Required: idempotency key)
- **Response** (`200 OK`): Created commercial account object.

### `GET /api/v1/commercial/options`
- **Description**: Search helper returning eligible linkable properties, staff owner candidates, or customer contact sources.
- **Headers**: `Authorization: Bearer <token>` (Required).
- **Query Params**:
  * `kind` (string, Optional: `owners`, `contacts`, or omit for unlinked properties)
  * `customer_id` (uuid, Required when `kind=contacts`)
  * `q` (string, Optional: filter by name, address, or email)
  * `limit` (integer, Optional, default: 25, range: 1–100)
  * `offset` (integer, Optional, default: 0)
- **Response** (`200 OK`): Paginated choices with dependency previews.

### `GET /api/v1/commercial/:id`
- **Description**: Retrieves single commercial account details, active site counts, and review alerts.
- **Path Params**: `id` (uuid, Required).
- **Response** (`200 OK`): Commercial account detail object.

### `POST /api/v1/commercial/:id`
- **Description**: Updates commercial account name or reassigns staff owner. Code is permanent.
- **Path Params**: `id` (uuid, Required).
- **Access**: `MANAGER` or `SUPER_ADMIN`.
- **Payload**:
  ```json
  {
    "version": 1,
    "name": "Acme Retail Group",
    "owner_id": "uuid (optional)",
    "reason": "Corporate re-branding",
    "request_key": "uuid"
  }
  ```
- **Parameters**: `version` (integer, Required), `name` (string, Optional), `owner_id` (uuid, Optional), `reason` (string, Required), `request_key` (uuid, Required).
- **Response** (`200 OK`): Updated commercial account object.

### `POST /api/v1/commercial/:id/archive`
- **Description**: Archives a commercial account. Requires acknowledgment that service and billing obligations remain unchanged.
- **Path Params**: `id` (uuid, Required).
- **Payload**: `{"version": 1, "acknowledge_dependencies": true, "reason": "...", "request_key": "uuid"}`.
- **Response** (`200 OK`): Archived commercial account object (`state: "archived"`).

### `POST /api/v1/commercial/:id/reopen`
- **Description**: Reopens an archived commercial account.
- **Path Params**: `id` (uuid, Required).
- **Payload**: `{"version": 1, "reason": "...", "request_key": "uuid"}`.
- **Response** (`200 OK`): Active commercial account object (`state: "active"`).

### `GET /api/v1/commercial/:id/sites`
- **Description**: Paginated roster of sites linked to the commercial account.
- **Path Params**: `id` (uuid, Required).
- **Query Params**: `state` (optional: `active`, `archived`), `limit` (1–100), `offset`.
- **Response** (`200 OK`): `{ "items": [...], "has_more": false }`.

### `POST /api/v1/commercial/:id/sites`
- **Description**: Links an eligible property as a commercial site under the account.
- **Path Params**: `id` (uuid, Required: account ID).
- **Payload**:
  ```json
  {
    "version": 1,
    "property_id": "uuid",
    "code": "NORTH",
    "name": "North Branch",
    "timezone": "America/Denver",
    "acknowledge_dependencies": true,
    "reason": "Link existing service property to corporate account",
    "request_key": "uuid"
  }
  ```
- **Parameters**: `version` (account version, Required), `property_id` (uuid, Required), `code` (string, Required: 1–80 chars), `name` (string, Required: 1–160 chars), `timezone` (string, Required: valid IANA timezone), `acknowledge_dependencies` (boolean, Required if active jobs/contracts/devices/callbacks exist), `reason` (string, Required), `request_key` (uuid, Required).
- **Response** (`200 OK`): Linked site object with eager-loaded dependency counts.

### `GET /api/v1/commercial/:id/sites/:siteId`
- **Description**: Retrieves single site details, customer snapshot, and timezone.
- **Path Params**: `id` (uuid, Required: account ID), `siteId` (uuid, Required: site ID).
- **Response** (`200 OK`): Commercial site detail view.

### `POST /api/v1/commercial/:id/sites/:siteId`
- **Description**: Updates site name or directory timezone using optimistic site version.
- **Path Params**: `id` (uuid, Required), `siteId` (uuid, Required).
- **Payload**: `{"version": 1, "name": "...", "timezone": "America/Denver", "reason": "...", "request_key": "uuid"}`.
- **Response** (`200 OK`): Updated site object.

### `POST /api/v1/commercial/:id/sites/:siteId/archive`
- **Description**: Archives site membership, making property eligible for other accounts while retaining history.
- **Path Params**: `id` (uuid, Required), `siteId` (uuid, Required).
- **Payload**: `{"version": 1, "acknowledge_dependencies": true, "reason": "...", "request_key": "uuid"}`.
- **Response** (`200 OK`): Archived site object.

### `POST /api/v1/commercial/:id/sites/:siteId/reopen`
- **Description**: Reopens archived site membership (fails if property is currently active in another account).
- **Path Params**: `id` (uuid, Required), `siteId` (uuid, Required).
- **Payload**: `{"version": 1, "reason": "...", "request_key": "uuid"}`.
- **Response** (`200 OK`): Reopened site object.

### `GET /api/v1/commercial/:id/contacts`
- **Description**: Retrieves scoped commercial contacts for the account or a specific site.
- **Path Params**: `id` (uuid, Required: account ID).
- **Query Params**: `site_id` (uuid, Optional), `state` (Optional: `active`, `archived`), `review` (boolean, Optional: `true` lists redacted contacts needing source review), `limit`, `offset`.
- **Response** (`200 OK`): `{ "items": [...], "has_more": false }`.

### `POST /api/v1/commercial/:id/contacts`
- **Description**: Creates or updates an account- or site-scoped commercial contact.
- **Path Params**: `id` (uuid, Required: account ID).
- **Payload**:
  ```json
  {
    "contact_id": "uuid (optional for update)",
    "version": 1,
    "site_id": "uuid (optional for site-scoped contact)",
    "responsibility": "corporate",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "555-0100",
    "is_primary": true,
    "customer_id": "uuid (optional source link)",
    "source_email_id": "uuid (optional source link)",
    "source_phone_id": "uuid (optional source link)",
    "reason": "Assign primary corporate coordinator",
    "request_key": "uuid"
  }
  ```
- **Parameters**: `responsibility` (`corporate`, `on_site`, `billing`, `emergency`), `name` (string), `email` / `phone` (string), `is_primary` (boolean), `reason` (string), `request_key` (uuid).
- **Response** (`200 OK`): Contact object.

### `POST /api/v1/commercial/:id/contacts/:contactId/archive`
- **Description**: Archives an existing commercial contact.
- **Path Params**: `id` (uuid, Required), `contactId` (uuid, Required).
- **Payload**: `{"version": 1, "reason": "...", "request_key": "uuid"}`.
- **Response** (`200 OK`): Archived contact object.

### `GET /api/v1/commercial/:id/events`
- **Description**: Paginated immutable audit event stream for commercial account, site, and contact modifications.
- **Path Params**: `id` (uuid, Required).
- **Query Params**: `limit` (1–100), `offset`.
- **Response** (`200 OK`): `{ "items": [...], "has_more": false }`.

---

## 4. Communications & Real-Time Domain

### `GET /api/events`
- **Description**: Server-Sent Events (SSE) persistent event stream for live UI synchronization.
- **Event Types Streamed**:
  - `tech_updated`: Broadcasts technician live coordinates and status changes to the Dispatch board.
  - `job_assigned`: Alerts the technician PWA of a newly dispatched job.
  - `sms_received`: Triggers inbound message notifications across admin dashboards.

### `POST /api/webhooks/twilio/sms`
- **Description**: Twilio incoming webhook handler for customer SMS replies. Logs inbound messages directly to the Customer 360 contact timeline and broadcasts an `sms_received` event.

### `POST /api/webhooks/twilio/voice-gather`
- **Description**: Twilio Voice TwiML IVR webhook. Connects automated robocalls to customer service if the customer presses `1`.

### `GET /api/v1/comms/chat/conversations`
- **Description**: Lists active and historical two-way live customer chat conversation threads for the CSR message inbox.
- **Query Params**:
  - `status` (optional string): Filter threads by status (`OPEN`, `WAITING_ON_CUSTOMER`, `WAITING_ON_AGENT`, `RESOLVED`).
  - `customerId` (optional UUID): Filter conversations belonging to a specific customer.
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "uuid",
      "customerId": "uuid",
      "status": "OPEN"
    }
  ]
  ```
- **Workflow Usage**: Powers the back-office Customer Service Representative (CSR) real-time chat interface to triage inbound customer inquiries and dispatch follow-ups.

### `GET /api/v1/comms/chat/canned-responses`
- **Description**: Retrieves predefined canned response message templates for CSRs with quick shortcut keys.
- **Parameters**: None. Authenticated by tenant session or JWT.
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "uuid",
      "shortcut": "/eta",
      "title": "Technician Arrival ETA",
      "category": "DISPATCH",
      "content": "Hello! Your technician is currently en route and estimated to arrive within the next 20-30 minutes. You will receive an SMS as soon as they pull up."
    }
  ]
  ```
- **Workflow Usage**: Used by CSRs in the live chat console to insert standard customer service replies via keyboard shortcuts (e.g., `/eta`, `/reschedule`, `/safety`).

---

## 5. Sales & Marketing Domain

### `GET /api/v1/sales/pins`
- **Description**: Returns Door-to-Door (D2D) canvassing pins with lat/lng coordinates and status markers (`NOT_HOME`, `NOT_INTERESTED`, `PITCHED`, `SOLD`).

### `POST /api/v1/sales/pins`
- **Description**: Drops a new spatial lead pin on the sales rep mobile canvass map.

### `POST /api/v1/agreements`
- **Description**: Assembles and renders a digital service agreement PDF document with company terms and pricing schedules.
- **Payload**:
  ```json
  {
    "customerId": "uuid",
    "propertyId": "uuid",
    "cadence": "QUARTERLY",
    "recurringAmount": 119.00,
    "startDate": "2026-10-15"
  }
  ```

### `POST /api/v1/agreements/:id/sign`
- **Description**: Submits a customer's e-signature data URI. Stamps the PDF, activates the service contract, and auto-generates the initial service job.
- **Payload**: `{ "signatureData": "data:image/png;base64,...", "signerName": "Jane Doe" }`

### `GET /api/v1/agreements/:id/download`
- **Description**: Streams the finalized signed PDF document for download or customer printing.

### `GET /api/v1/marketing/campaigns`
- **Description**: Lists active marketing and seasonal retention campaigns.

### `POST /api/v1/marketing/followups`
- **Description**: Schedules automated customer check-ins and re-service reminders.

### `GET /api/v1/sales/territories`
- **Description**: Lists defined sales territory polygons with quota targets and active status markers.
- **Parameters**: None. Authenticated by tenant session or JWT.
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "uuid",
      "name": "Northwest Metro",
      "polygonCoordinates": [
        [40.7608, -111.8910],
        [40.7708, -111.8810],
        [40.7508, -111.8710]
      ],
      "quotaTarget": 15000.00,
      "isActive": true
    }
  ]
  ```
- **Workflow Usage**: Rendered on the sales manager territory map to allocate geographic sectors to field sales reps and track regional quota goals.

### `GET /api/v1/sales/territories/compliance/do-not-knock`
- **Description**: Retrieves registered Do-Not-Knock addresses and ordinances within sales territories to prevent unauthorized canvassing.
- **Parameters**: None. Authenticated by tenant session or JWT.
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "uuid",
      "address": "123 Elm Street",
      "reason": "Customer Request"
    }
  ]
  ```
- **Workflow Usage**: Consulted by door-to-door sales representatives and canvass map overlays before knocking on properties to maintain legal compliance with municipal and HOA restrictions.

---

## 6. Human Resources (HR) & Onboarding Domain

### `GET /api/v1/hr/staff`
- **Description**: Returns employee directory, assigned roles, licensing credentials, and accrued commission earnings.

### `GET /api/v1/hr/courses`
- **Description**: Lists OSHA, state applicator, and customer service training modules.

### `POST /api/v1/hr/certifications`
- **Description**: Records a newly earned applicator license or certification for a technician with expiration tracking.

### `GET /api/v1/hr/onboarding/:userId/tasks`
- **Description**: Returns role-based onboarding checklist tasks for newly hired sales reps or field technicians.

### `POST /api/v1/hr/onboarding/upload`
- **Description**: Handles file uploads for employee W-4s, driver's licenses, and pesticide applicator certificates (`multipart/form-data`).

---

## 7. Analytics Domain

### `GET /api/v1/analytics/dashboard`
- **Description**: Aggregates top-level operational metrics:
  - Total Monthly & Annual Recurring Revenue
  - Technician completion rates and route efficiency
  - Door-to-door sales representative leaderboard (closing percentages and revenue)

### `GET /api/v1/analytics/pest-risk/climate`
- **Description**: Connects to the real-time Open-Meteo Climate API to retrieve current weather metrics (temperature, relative humidity, precipitation, wind speed, WMO weather code) with automated pest activity impact evaluation and a 30-minute in-memory/Redis coordinate cache with deterministic offline fallback.
- **Query Parameters**:
  - `lat` (optional float, default `39.7817`): Latitude coordinate.
  - `lng` (optional float, default `-89.6501`): Longitude coordinate.
- **Response**:
  ```json
  {
    "latitude": 39.7817,
    "longitude": -89.6501,
    "temperature": 72.4,
    "temperatureUnit": "fahrenheit",
    "relativeHumidity": 55.0,
    "precipitation": 0.0,
    "windSpeed": 6.8,
    "weatherCode": 1,
    "conditionSummary": "Mainly Clear",
    "pestActivityImpact": "Optimal temperature range (72.4°F) supports aggressive surface foraging.",
    "source": "open-meteo",
    "cached": false
  }
  ```

### `GET /api/v1/analytics/pest-risk/heatmap`
- **Description**: Retrieves geographic coordinate clusters and composite risk scores across customer properties for interactive map visualization.

### `GET /api/v1/analytics/pest-risk/:propertyId`
- **Description**: Generates an AI-driven multi-factor pest resurgence prediction for a specific property, incorporating live climate data, historical chemical decay half-life, seasonal vectors, and structural vulnerability tags.

### `POST /api/v1/analytics/pest-risk/recalculate`
- **Description**: Triggers a tenant-wide background re-scoring of all active service properties against current weather conditions.


---

## 8. GraphQL API Schema Reference (`/graphql`)

Apollo Server provides comprehensive queries and mutations mapped to all 7 bounded contexts:

### Core Queries
```graphql
type Query {
  # Dispatch
  jobs(status: String, date: String): [Job!]!
  technicians: [Technician!]!
  technicianSchedule(technicianId: ID!, date: String!): [Job!]!
  inventoryItems: [InventoryItem!]!
  purchaseOrders: [PurchaseOrder!]!

  # Billing
  financeReport: FinancialReport!
  invoices(status: String): [Invoice!]!
  quotes: [Quote!]!

  # CRM
  customers(search: String): [Customer!]!
  customer(id: ID!): Customer
  contracts(status: String): [ServiceContract!]!
  propertyPhotos(propertyId: ID!): [PropertyPhoto!]!

  # Sales
  canvassPins: [CanvassPin!]!
  agreements: [ServiceAgreement!]!
  campaigns: [Campaign!]!

  # HR & Analytics
  staff: [StaffMember!]!
  courses: [Course!]!
  analyticsDashboard: AnalyticsDashboard!
}
```

### Core Mutations
```graphql
type Mutation {
  # Dispatch
  createJob(input: CreateJobInput!): Job!
  updateJob(id: ID!, input: UpdateJobInput!): Job!
  optimizeRoute(technicianId: ID!, jobIds: [ID!]!): RouteOptimizationResult!
  autoSchedule(date: String!): [ScheduleAssignment!]!
  createInventoryItem(input: CreateInventoryItemInput!): InventoryItem!
  createPurchaseOrder(input: CreatePurchaseOrderInput!): PurchaseOrder!

  # Billing
  createInvoice(input: CreateInvoiceInput!): Invoice!
  markInvoicePaid(id: ID!): Invoice!
  createQuote(input: CreateQuoteInput!): Quote!
  acceptQuote(id: ID!): Quote!
  recordPayment(input: RecordPaymentInput!): Payment!
  triggerErpSync(provider: String!, resourceType: String!, resourceId: ID!): ErpSyncResult!

  # Sales & Agreements
  createCanvassPin(input: CreatePinInput!): CanvassPin!
  generateAgreement(input: GenerateAgreementInput!): ServiceAgreement!
  signAgreement(id: ID!, signatureData: String!, signerName: String!): ServiceAgreement!
  createCampaign(input: CreateCampaignInput!): Campaign!
  scheduleFollowup(input: ScheduleFollowupInput!): AutomatedFollowup!

  # HR
  assignCertification(input: AssignCertificationInput!): Certification!
}
```
