# Phase-by-Phase Implementation Plan

## **Phase 1: Executive Oversight & Foundation** 
*(Weeks 3–5 | Dependencies: PREREQ — DB migrations for `customers`, `jobs`, `quotes` tables, auth middleware)*

### Prisma Schema (Migrations)
```sql
-- customers table
CREATE TABLE customers (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255), email TEXT, phone TEXT);

-- quotes table  
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted');
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  amount DECIMAL(12,2),
  status quote_status DEFAULT 'draft'
);

-- jobs table with expanded status types
CREATE TYPE job_status AS ENUM ('draft', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled');
```

### Backend Controller Pattern (`Express API`)
```typescript
// controllers/analyticsController.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const getExecutiveDashboards = async (req, res) => {
  const kpis = await Promise.all([
    prisma.job.groupBy('status').select({ status: true, count: 'count' }),
    prisma.customer.aggregate({ _sum: { amount: true } }), // revenue metrics
    prisma.quote.groupBy('status').select({ status: true, count: 'count' })
  ]);
  res.json(kpis);
};

export const getSalesLeaderboards = async (req, res) => {
  const salesRepCommissions = await prisma.commission.aggregate(); // from existing schema
  res.json(salesRepCommissions);
};
```

### React Component Pattern (`Admin Portal`)
```tsx
// features/dashboard/ExecutiveDashboard.tsx
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
const API_BASE = '/api/v1';

export function ExecutiveDashboard() {
  const [kpis, setKpis] = useState(null);
  
  const query = useQuery({ queryKey: ['executive-dashboards'] });
  query.refetch(); // real-time data
  
  return (
    <div className="dashboard-grid">
      <KPICard title="Revenue" value={`$${kpis?.totalCustomers * 1250}`}/> 
      <KPICard title="Jobs in Progress" value={jobs.length} />
    </div>
  );
}
```

### Testing Strategy (Jest + Mock Prisma)
```typescript
// tests/analytics.test.ts
jest.mock('@prisma/client', () => ({ mockPrisma: { ... } }));

test('Executive Dashboard aggregates KPIs correctly', async () => {
  await mockPrisma.job.groupBy.mockResolvedValueOnce([
    { status: 'scheduled', count: 45 },
    { status: 'in_progress', count: 23 },
  ]);
  
  const res = await api.get('/api/v1/executive-dashboards');
  expect(res.status).toBe(200);
});
```

### CI/CD Pipeline (Docker)
```yaml
# .github/workflows/phases/build-and-test.yml
stages:
  - stage: build
    steps:
      - name: Build Express API
        run: docker build -t servicing-crm-express-api --tag=PHASE1
      - name: Test Analytics Controller
        run: docker run --rm servicing-crm-express-api node tests/analytics.test.ts
```

---

## **Phase 2: Financials & Revenue Cycle** 
*(Weeks 6–9 | Dependencies: PHASE1 complete, ERP integration reference)*

### New Prisma Schema (PostgreSQL)
```sql
CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'paid');
CREATE TABLE invoices (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), job_id UUID REFERENCES jobs(id), amount DECIMAL(12,2));
CREATE TABLE payments (invoice_id UUID REFERENCES invoices(id), customer_id UUID NOT NULL, amount DECIMAL(12,2));

CREATE TYPE payment_method AS ENUM ('card', 'cash', 'check');
```

### Backend Controller (`Express API`)
```typescript
// controllers/financeController.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createInvoice = async (req, res) => {
  const { jobId, totalAmount } = req.body; // from job controller
  const invoice = await prisma.invoice.create({ data: { jobId, amount: totalAmount } });
  
  // Sync to ERP (existing reference function):
  try { syncToErp(invoice.id, 'invoice') }; 
  res.json({ id: invoice.id, status: 'created' });
};

export const markInvoicePaid = async (req, res) => {
  const payment = await prisma.payment.create({...});
  await Promise.all([
    prisma.invoice.update({ where: { id: req.params.id }, data: { status: 'paid' } }),
    syncToErp(req.params.id, 'payment') // ERP integration
  ]);
  res.json({ status: 'marked_paid' });
};

export const generateMRRARR = async (req, res) => {
  // Aggregate recurring subscription revenue + one-time invoices
  const monthlyRevenue = await prisma.invoice.aggregate();
  res.json({ mrr, arr });
};
```

### React Component (`Customer Portal`)
```tsx
// features/invoices/InvoiceList.tsx
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export function InvoiceList() {
  const query = useQuery({ queryKey: ['invoices'] });
  
  return (
    <table>
      <thead><th>Invoice</th><th>Status</th></thead>
      <tbody>
        {invoices.map(i => (
          <tr key={i.id}>
            <td>{i.number}</td>
            <td>{i.status === 'paid' ? <Badge>Paid</Badge> : 'Pending'}</td>
            <td><button onClick={() => openPaymentModal(i)}>Pay Now</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Testing Strategy (Jest)
```typescript
// tests/finance.test.ts
test('Invoice creation updates job status to invoiced', async () => {
  await mockPrisma.job.update.mockResolvedValueOnce({ ... });
  
  const res = await api.post('/api/v1/finance/invoices', { jobId: '...', amount: 500.0 });
  
  expect(await mockPrisma.invoice.findUnique()).toEqual({ status: 'invoiced' });
});
```

### CI/CD Pipeline (`Dockerfile`)
```docker
FROM node:23-alpine AS finance-api

WORKDIR /app/finance-api
COPY package*.json ./
RUN npm ci --omit=dev

# Install Prisma schema, build, test, dockerize
COPY prisma/schema.prisma .
COPY src controllers tests Dockerfile .env.example ./
RUN npx prisma migrate dev && npm run build && npm test
```

---

## **Phase 3: Service Operations & Routing** 
*(Weeks 10–14 | Dependencies: PHASE2 complete, existing job API)*

### Prisma Schema (PostgreSQL)
```sql
CREATE TYPE tech_status AS ENUM ('available', 'en_route', 'on_site', 'off_duty');
CREATE TABLE technicians (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(100), skills TEXT[], status tech_status);

CREATE TABLE jobs (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customerId UUID REFERENCES customers(id), scheduledStart DateTime, technicianId UUID REFERENCES technicians(id));
```

### Backend Controller (`Express API`)
```typescript
// controllers/dispatchController.ts
import { PrismaClient, TechStatus } from '@prisma/client';
const prisma = new PrismaClient();

export const createJobMutation = async (req) => {
  // Drag-and-drop scheduling logic: assign technician based on skills
  const techsBySkill = await prisma.technician.findMany({ where: { skills: ['plumbing'] } });
  return prisma.job.create({ data: { customerId, scheduledStart, technicianId: techsBySkill[0].id } });
};

export const scheduleJobMutation = async (req) => {
  // Move job from draft → scheduled
  return prisma.job.update({ where: { id: req.params.id }, data: { status: 'scheduled' } });
};

export const reRouteForUrgentCall = async (callDetails) => {
  // Find nearest available technician by geo-fencing on tech location + call address
  return await prisma.technician.findFirst({ where: { status: 'available', lat: ..., lng: ... } });
};
```

### React Component (`Admin Portal`)
```tsx
// features/dispatch/DispatchBoard.tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';

export function DispatchBoard() {
  const query = useQuery({ queryKey: ['dispatch'] });
  
  return (
    <div className="drag-and-drop-board">
      <DropZone targetTechId={null} label="Unassigned Jobs" /> {/* Draft */ }
      <DropZone targetTechId={techA.id} label={`Tech A - ${jobName}`} /> {/* Scheduled */ }
    </div>
  );
}
```

### Testing Strategy (Jest + Mock Prisma)
```typescript
// tests/dispatch.test.ts
test('Job scheduling assigns technician by skill', async () => {
  await mockPrisma.technician.findMany.mockResolvedValueOnce([...]);
  
  const res = await api.post('/api/v1/jobs/schedule', { customerId: '...', scheduledStart: ... });
  
  expect(await mockPrisma.job.findUnique()).toEqual({ status: 'scheduled' });
});
```

### CI/CD Pipeline (`Dockerfile`)
```docker
FROM node:23-alpine AS dispatch-api
# Build Express API + tests
COPY prisma schema.prisma .
COPY src controllers tests Dockerfile .env.example ./
RUN npx prisma migrate dev && npm run build && npm test
```

---

## **Phase 4: Supply Chain & Asset Management** 
*(Weeks 15–19 | Dependencies: PHASE3 complete)*

### Prisma Schema (PostgreSQL)
```sql
CREATE TABLE inventory_items (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255), sku TEXT, quantity DECIMAL(10,0));

CREATE TYPE chemical_use_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TABLE material_usage (job_id UUID REFERENCES jobs(id), quantity DECIMAL(8,3), status chemical_use_status);
```

### Backend Controller (`Express API`)
```typescript
// controllers/inventoryController.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const autoRestockAlerts = async (req, res) => {
  // Low-stock threshold logic → trigger purchase orders to ERP
  return await prisma.inventoryItem.findMany({ where: { quantity: { lt: 10 } } });
};

export const logMaterialUsage = async (req) => {
  return prisma.materialUsage.create({ data: { job_id: req.params.jobId, quantity: ... } });
};
```

### React Component (`Admin Portal`)
```tsx
// features/inventory/InventoryDashboard.tsx
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export function InventoryDashboard() {
  const query = useQuery({ queryKey: ['inventory'] });
  
  return (
    <LowStockAlerts onRestock={async (item) => await api.post('/api/v1/inventory/reorder', item)} />
  );
}
```

### Testing Strategy (Jest)
```typescript
// tests/inventory.test.ts
test('Auto-restock alerts trigger when stock < threshold', async () => {
  await mockPrisma.inventoryItem.findMany.mockResolvedValueOnce([...]);
  
  const res = await api.get('/api/v1/inventory/alerts');
  expect(res.status).toBe(200);
});
```

### CI/CD Pipeline (`Dockerfile`)
```docker
FROM node:23-alpine AS inventory-api
COPY prisma schema.prisma .
COPY src controllers tests Dockerfile .env.example ./
RUN npx prisma migrate dev && npm run build && npm test
```

---

## **Phase 5: Client Experience & Self-Service** 
*(Weeks 20–24 | Dependencies: PHASE4 complete)*

### Prisma Schema (PostgreSQL)
```sql
CREATE TABLE customer_bookings (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customerId UUID REFERENCES customers(id), status booking_status, scheduledStart DateTime);

CREATE TYPE contact_log_channel AS ENUM ('sms', 'email');
CREATE TABLE contact_logs (customerId UUID REFERENCES customers(id), channel contact_log_channel, direction incoming|outgoing, summary TEXT);
```

### Backend Controller (`Express API`)
```typescript
// controllers/bookingController.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createBookingMutation = async (req) => {
  // Auto-approve bookings for repeat customers, otherwise queue
  if (isRepeatCustomer(req.customerId)) return await prisma.booking.create({ data: req });
  else return await prisma.contactLog.create(...); // Log incoming inquiry → email confirmation
};

export const contactLogMutation = async (req) => {
  return prisma.contactLog.create({ data: req });
};
```

### React Component (`Customer Portal`)
```tsx
// features/booking/BookingForm.tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useState } from 'react';

export function BookingForm({ customerId }: any) {
  const query = useQuery({ queryKey: ['available-techs', customerId] });
  
  return (
    <BookingForm onSubmit={async (details) => await api.post('/api/v1/bookings', details)} />
  );
}
```

### Testing Strategy (Jest + Mock Prisma)
```typescript
// tests/booking.test.ts
test('Repeat customer bookings auto-approve', async () => {
  await mockPrisma.customer.findUnique.mockResolvedValueOnce({ repeatCustomer: true });
  
  const res = await api.post('/api/v1/bookings', { customerId: '...', details: ... });
  expect(await mockPrisma.booking.create()).toBeTruthy();
});
```

### CI/CD Pipeline (`Dockerfile`)
```docker
FROM node:23-alpine AS booking-api
COPY prisma schema.prisma .
COPY src controllers tests Dockerfile .env.example ./
RUN npx prisma migrate dev && npm run build && npm test
```

---

## **Phase 6: Growth & Retention** 
*(Weeks 25–30 | Dependencies: PHASE5 complete)*

### Prisma Schema (PostgreSQL)
```sql
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'completed');
CREATE TABLE campaigns (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(100), status campaign_status, start_date DATE);

CREATE TYPE follow_up_sequence AS ENUM ('none', '30_days_late', '90_days_inactive', 'service_expiring_soon');
CREATE TABLE automated_followups (customerId UUID REFERENCES customers(id), sequence follow_up_sequence, scheduledDate DATE, sent BOOLEAN DEFAULT false);
```

### Backend Controller (`Express API`)
```typescript
// controllers/marketingController.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createCampaignMutation = async (req) => {
  return prisma.campaign.create({ data: req });
};

export const sendAutomatedFollowup = async (customerId, triggerReason) => {
  // Determine sequence based on trigger reason → schedule email/SMS via Twilio API or SendGrid
  await Promise.all([
    prisma.automatedFollowup.create(...),
    // External SMTP/WhatsApp API calls go here
  ]);
};

export const sendServiceReminder = async (customerId) => {
  return await prisma.automatedFollowup.upsert({
    where: { customerId },
    update: { scheduledDate: '30 days before service', sent: false },
    create: { customerId, sequence: 'service_expiring_soon' }
  });
};
```

### React Component (`Admin Portal`)
```tsx
// features/marketing/CampaignManager.tsx
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

export function CampaignManager() {
  const create = useMutation({ mutationFn: api.post('/api/v1/campaigns') });
  
  return (
    <CampaignForm onCreate={create.mutate} />
  );
}
```

### Testing Strategy (Jest + Mock Prisma)
```typescript
// tests/marketing.test.ts
test('Automated followups schedule reminders correctly', async () => {
  await mockPrisma.customer.findUnique.mockResolvedValueOnce({ serviceDate: '2026-01-01' });
  
  const res = await api.post('/api/v1/followup', { customerId: '...', triggerReason: 'service_expiring_soon' });
  
  expect(await mockPrisma.automatedFollowup.upsert()).toBeTruthy();
});
```

### CI/CD Pipeline (`Dockerfile`)
```docker
FROM node:23-alpine AS marketing-api
COPY prisma schema.prisma .
COPY src controllers tests Dockerfile .env.example ./
RUN npx prisma migrate dev && npm run build && npm test
```

---

## **Summary Table**

| Phase | Focus | Key Prisma Types | Key API Endpoints | Key React Components | Testing Pattern | CI/CD Stage |
|-------|-------|-----------------|------------------|--------------------|----------------|-------------|
| 1️⃣ | Executive Oversight | `customers`, `quotes`, `jobs` | `/api/v1/executive-dashboards` | `ExecutiveDashboard` | Jest + Mock Prisma | Build & Test API |
| 2️⃣ | Financials | `invoices`, `payments` | `/api/v1/finance/*` | `InvoiceList`, `PaymentModal` | Jest + Mock Prisma | ERP Integration CI |
| 3️⃣ | Service Operations | `technicians`, `jobs` | `/api/v1/dispatch/*` | `DispatchBoard` (Drag-and-Drop) | Jest + Mock Prisma | Build & Test API |
| 4️⃣ | Supply Chain | `inventory_items`, `material_usage` | `/api/v1/inventory/*` | `InventoryDashboard` | Jest + Mock Prisma | Low-stock Alert CI |
| 5️⃣ | Customer Self-Service | `customer_bookings`, `contact_logs` | `/api/v1/bookings`, `/api/v1/contact-logs` | `BookingForm`, `ContactLogView` | Jest + Mock Prisma | Build & Test API |
| 6️⃣ | Growth & Retention | `campaigns`, `automated_followups` | `/api/v1/campaigns`, `/api/v1/followup` | `CampaignManager` | Jest + Mock Prisma | Email/SMS Integration CI |

---

## **Cross-Phase Dependencies**
All phases depend on: **Prisma ORM v5.10, Express API (ports 8002/8003), JWT authentication middleware.** No new tech stack changes required — just expand existing APIs and add database tables via migrations.

## **Recommended Execution Order:** Start Phase 1 → validate foundation → move to Phase 2 → iterate through remaining phases in order, as each builds on the previous phase's data models.


---

## **Phase 7: Platform Hardening & Feature Expansion (Features #16–#25)**

*Added: October 2, 2026 — Based on comprehensive gap analysis of all backends, frontends, schema, and infrastructure.*

### Implementation Order

| Priority | # | Feature | Effort | Key Rationale |
|:---:|:---:|---|:---:|---|
| 🔴 P0 | **16** | Territory & DNK Management UI | Low | Backend 100% complete, frontend-only work |
| 🔴 P0 | **17** | API Rate Limiting & Usage Metering | Low | Security/abuse prevention, Redis already provisioned |
| 🟠 P1 | **18** | Audit Trail & Activity Logging System | Medium | SOC 2 readiness, compliance requirement |
| 🟠 P1 | **19** | Multi-Channel Notification Preferences & Opt-Out | Medium | TCPA/CAN-SPAM compliance, legal risk |
| 🟡 P2 | **20** | Customer Satisfaction Surveys & NPS Scoring | Medium | Closes feedback loop for churn engine |
| 🟡 P2 | **21** | Customer Self-Service Booking & Rescheduling | Medium-High | Reduces inbound call volume 30-40% |
| 🟢 P3 | **22** | Technician Time Tracking & Labor Cost Analytics | Medium | #1 cost center visibility |
| 🟢 P3 | **23** | OpenAPI 3.1 Auto-Generation & Interactive API Docs | Low | Developer onboarding, FastAPI built-in |
| 🟢 P3 | **24** | Recurring Service Visit Calendar & Customer Reminders | Medium | Reduces no-access failures, improves retention |
| 🟢 P3 | **25** | Scheduled Report Generation & Export Engine | Medium-High | Franchise operator engagement |

---

### Feature #16: Territory & DNK Management UI (Admin Portal)

**Status**: NOT STARTED
**Effort**: Low — Backend CRUD is 100% complete across all 4 backends. This is frontend-only.

**Scope**:
- `apps/admin-portal/src/features/sales/TerritoryManager.tsx` — Interactive Leaflet polygon drawing on map, sales rep assignment dropdown, quota target configuration, territory color picker, active/inactive toggle.
- `apps/admin-portal/src/features/sales/DoNotKnockManager.tsx` — Address search with geocoding, map pin placement, expiration date picker, reason field, bulk import capability.
- Wire both components into the admin portal's existing React Router and sidebar navigation.

**Existing Backend Endpoints** (already implemented in all 4 backends):
- `GET/POST /api/v1/sales/territories`
- `PUT/DELETE /api/v1/sales/territories/:id`
- `GET/POST /api/v1/sales/territories/:id/dnk`
- `DELETE /api/v1/sales/territories/dnk/:id`
- GraphQL: `territories`, `doNotKnockRecords` queries; `createTerritory`, `updateTerritory`, `deleteTerritory`, `createDoNotKnock`, `deleteDoNotKnock` mutations.

---

### Feature #17: API Rate Limiting & Usage Metering

**Status**: NOT STARTED
**Effort**: Low — Redis already provisioned on port 3120.

**Scope**:
- Token bucket / sliding window rate limiter middleware in all 4 backends.
- Per-tenant and per-user rate limits stored in Redis.
- `429 Too Many Requests` responses with `Retry-After` headers.
- New `api_usage_metrics` table for usage metering (requests per tenant per endpoint per day).
- Admin Portal: API usage dashboard component.

---

### Feature #18: Audit Trail & Activity Logging System

**Status**: NOT STARTED
**Effort**: Medium

**Scope**:
- New `014_audit_trail.sql` migration: `audit_logs` table (id, tenant_id, actor_id, actor_role, action, entity_type, entity_id, old_values JSONB, new_values JSONB, ip_address, user_agent, created_at).
- Automatic mutation capture middleware/interceptor in all 4 backends.
- Admin Portal: Activity feed on Customer 360 page and global audit log viewer with filters.
- GraphQL: `auditLogs(entityType, entityId, actorId, dateRange)` query.

---

### Feature #19: Multi-Channel Notification Preferences & Opt-Out Management

**Status**: NOT STARTED
**Effort**: Medium

**Scope**:
- New `notification_preferences` table: per-customer channel toggles (SMS, email, voice, push), quiet hours window, opt-out timestamps, TCPA consent records.
- Backend: Preference check before every notification dispatch in all 4 backends.
- Customer Portal: Notification settings page with toggle switches and quiet hours configuration.
- Twilio webhook: Automatic opt-out processing for "STOP" SMS replies.
- Email: Unsubscribe link generation with one-click opt-out.

---

### Feature #20: Customer Satisfaction Surveys & NPS Scoring

**Status**: NOT STARTED
**Effort**: Medium

**Scope**:
- New `surveys` and `survey_responses` tables.
- Post-service automated survey delivery (email/SMS via existing Twilio/SMTP comms engine).
- NPS collection: 0–10 rating scale with free-text comment.
- Integration with `CustomerHealthScore` model — real NPS data feeds into churn prediction algorithm.
- Customer Portal: Survey response widget.
- Admin Portal: NPS trend dashboard with per-technician satisfaction scores.

---

### Feature #21: Customer Self-Service Booking & Rescheduling

**Status**: NOT STARTED
**Effort**: Medium-High

**Scope**:
- New customer-facing availability API: returns open time slots based on technician schedules, territory, and service type.
- Rescheduling endpoint with configurable business rules (minimum notice period, blackout dates).
- Customer Portal: Calendar picker with available slots, confirmation flow, reschedule/cancel buttons.
- Automatic notifications to assigned technician and dispatcher via existing SSE + SMS infrastructure.

---

### Feature #22: Technician Time Tracking & Labor Cost Analytics

**Status**: NOT STARTED
**Effort**: Medium

**Scope**:
- New fields on Job model: `actual_arrival`, `actual_departure`, `drive_time_minutes`, `on_site_time_minutes`.
- Tech Portal: Clock-in/clock-out buttons on JobDetail.tsx with GPS coordinate verification.
- Analytics: Labor cost per job, average time on-site by service type, technician efficiency metrics.
- Admin Portal: Timesheet approval workflow and labor cost reports.

---

### Feature #23: OpenAPI 3.1 Auto-Generation & Interactive API Docs

**Status**: NOT STARTED
**Effort**: Low

**Scope**:
- FastAPI: Enable built-in `/docs` (Swagger UI) and `/openapi.json` endpoints.
- Express: Add `swagger-jsdoc` + `swagger-ui-express` to auto-generate from route JSDoc annotations.
- Laravel: Add `l5-swagger` package for OpenAPI generation from PHP docblocks.
- GraphQL: Enable Apollo Sandbox/Playground for non-production environments.
- CI: Validate OpenAPI spec doesn't drift from implementation.

---

### Feature #24: Recurring Service Visit Calendar & Customer Reminders

**Status**: NOT STARTED
**Effort**: Medium

**Scope**:
- Admin Portal: Full calendar view (FullCalendar.js) showing scheduled, projected, and completed service visits.
- Customer Portal: "My Service Schedule" calendar showing upcoming visits with countdown.
- Automated pre-visit reminders: 48-hour and same-day SMS/email via existing comms engine.
- Post-visit "service completed" confirmation notification.

---

### Feature #25: Scheduled Report Generation & Export Engine

**Status**: NOT STARTED
**Effort**: Medium-High

**Scope**:
- Report templates: Revenue Summary, Technician Productivity, Chemical Usage/EPA Compliance, Customer Churn Risk, Territory Performance.
- CSV and PDF export endpoints across all 4 backends.
- Scheduled delivery via existing notification queue + email infrastructure.
- Admin Portal: Report builder UI with template selection, date range picker, and delivery schedule configuration.