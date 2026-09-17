# API Endpoint Reference

The REST architecture operates under `/api/v1`. Currently, the **Express API (Port 8002)** serves as the canonical reference implementation.

## Jobs & Dispatch
- `GET /api/v1/jobs`
  - **Description**: Returns all scheduled and active jobs.
  - **Response**: Array of `Job` objects including eager-loaded `customer` and `property` relations.
- `POST /api/v1/jobs`
  - **Description**: Creates a new draft/scheduled job.
  - **Payload**: `{ "tenantId": "...", "customerId": "...", "propertyId": "..." }`
- `PATCH /api/v1/jobs/:id/schedule`
  - **Description**: Updates the start/end time and assigned technician for a job (used by drag-and-drop dispatch).
  - **Payload**: `{ "scheduledStart": "...", "scheduledEnd": "...", "technicianId": "..." }`

## Customers & CRM
- `GET /api/v1/customers`
  - **Description**: Retrieves a high-level list of all customer accounts.
- `GET /api/v1/customers/:id`
  - **Description**: The **Customer 360** endpoint. Eager-loads the customer's properties, active contracts, recent jobs, unified `contactLogs`, and `internalNotes` ordered chronologically.

## Service Contracts
- `GET /api/v1/contracts`
  - **Description**: Lists all active recurring service agreements (e.g. quarterly, bi-monthly).

## Field Staff & Territory
- `GET /api/v1/technicians`
  - **Description**: Lists all field technicians and their current route statuses (`on_site`, `available`, etc.).
- `PATCH /api/v1/technicians/:id/location`
  - **Description**: Pings the technician's live GPS coordinates.
- `GET /api/v1/sales/pins`
  - **Description**: Lists spatial canvassing lead pins (Lat/Lng) dropped by Door-to-Door sales reps.

## Human Resources (HR)
- `GET /api/v1/hr/staff`
  - **Description**: Retrieves the internal staff directory, including each employee's certifications and sales commissions.
- `GET /api/v1/hr/courses`
  - **Description**: Lists available mandatory/optional training courses.
- `POST /api/v1/hr/certifications`
  - **Description**: Assigns a new training certification to a staff member.

## Finance
- `GET /api/v1/finance/report`
  - **Description**: Aggregates the platform's financial health, returning calculated `MRR`, `ARR`, total commissions paid out, and a list of outstanding `unpaid` invoices.
- `GET /api/v1/finance/invoices`
  - **Description**: Lists all invoices with eager-loaded job and customer details.
- `POST /api/v1/finance/invoices`
  - **Description**: Creates a new invoice for a job and updates the job status to `invoiced`.
  - **Payload**: `{ "jobId": "...", "totalAmount": 150.0 }`
- `PATCH /api/v1/finance/invoices/:id/status`
  - **Description**: Marks a specific invoice as paid.
