# API Endpoint & Schema Reference

The platform operates across four interchangeable backends designed with identical contracts under the `/api/v1` namespace (with real-time events at `/api/events` and webhooks under `/api/webhooks`).

- **Express Reference API**: `http://localhost:3182`
- **FastAPI Reference API**: `http://localhost:3184`
- **Laravel Reference API**: `http://localhost:3181`
- **GraphQL Apollo Server**: `http://localhost:3183/graphql`

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
