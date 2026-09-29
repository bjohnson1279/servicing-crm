# Servicing CRM Platform

A modular, enterprise-grade, polyglot Service Industry & Pest Control CRM platform designed to handle field operations, dispatching, door-to-door (D2D) sales, recurring service contract cadences, automated customer communications, and staff management.

The platform provides complete feature parity across **four interchangeable backend architectures** and **three frontend applications**, all organized using **Domain-Driven Design (DDD) Vertical Slices**.

---

## Architecture Overview

```
                               ┌────────────────────────────────────────────────────────┐
                               │                     Frontend Apps                      │
                               ├──────────────────┬──────────────────┬──────────────────┤
                               │   Admin Portal   │ Customer Portal  │  Technician PWA  │
                               │   (Port 3100)    │   (Port 3101)    │   (Port 3002)    │
                               └────────┬─────────┴────────┬─────────┴────────┬─────────┘
                                        │                  │                  │
         ┌──────────────────────────────┴──────────────────┴──────────────────┴──────────────────────────────┐
         │                                   API Gateway / Interchangeable Backends                          │
         ├──────────────────────────┬──────────────────────────┬──────────────────────────┬──────────────────┤
         │       Express API        │       FastAPI API        │       GraphQL API        │   Laravel API    │
         │   (Node.js / TS: 3182)   │    (Python / ASync: 3184)│     (Apollo 4: 3183)     │   (PHP 8.2: 3181)│
         └────────────┬─────────────┴────────────┬─────────────┴────────────┬─────────────┴────────────┬─────┘
                      │                          │                          │                          │
                      └──────────────────────────┴────────────┬─────────────┴──────────────────────────┘
                                                              │
                                        ┌─────────────────────┴─────────────────────┐
                                        │               Data Layer                  │
                                        ├─────────────────────┬─────────────────────┤
                                        │    PostgreSQL 16    │       Redis 7       │
                                        │     (Port 3110)     │     (Port 3120)     │
                                        └─────────────────────┴─────────────────────┘
```

### Applications & Services

| Service | Technology | Port (Host) | Description |
|---|---|:---:|---|
| **Admin Portal** | React 18, Vite, Tailwind CSS, Leaflet | `3100` (`3000`) | Back-office hub for dispatch, customer 360, billing, sales canvass map, and HR. |
| **Customer Portal** | React 18, Vite, Tailwind CSS | `3101` (`3001`) | Customer self-service dashboard for invoices, payment method management, and agreement signing. |
| **Technician Portal** | React 18, Vite, PWA, Service Worker | `3002` | Mobile-first offline-capable PWA with route turn-by-turn, chemical logs, and camera uploads. |
| **Express API** | Node.js, Fastify/Express, Prisma ORM | `3182` (`8000`) | Canonical TypeScript REST reference backend. |
| **FastAPI API** | Python 3.13, FastAPI, SQLAlchemy, AsyncPG | `3184` (`8000`) | High-performance Python asynchronous backend with APScheduler. |
| **GraphQL API** | Apollo Server 4, Express, Prisma ORM | `3183` (`8000`) | Unified GraphQL schema with Apollo Server and REST fallback mounts. |
| **Laravel API** | PHP 8.2, Laravel 10, Eloquent ORM | `3181` (`8000`) | PHP Hexagonal/Domain-structured API with Artisan task scheduler. |
| **PostgreSQL** | PostgreSQL 16 Alpine | `3110` (`5432`) | Multi-tenant single source of truth relational database. |
| **Redis** | Redis 7 Alpine | `3120` (`6379`) | Cache and session store. |

---

## Domain-Driven Design (7 Bounded Contexts)

All four backends are strictly organized into **7 domain modules** (vertical slices), co-locating controllers, domain services, cron jobs, and route definitions:

1. **`Dispatch`**:
   - Job lifecycle state machine (`draft` → `scheduled` → `in_progress` → `completed` → `invoiced`).
   - Technician live GPS tracking, status transitions (`available`, `en_route`, `on_site`, `off_duty`), and daily schedule views.
   - OSRM-powered Traveling Salesperson Route Optimization.
   - Emergency Nearest-Tech Dispatch algorithm.
   - Auto-scheduling constraint solver with drive-time estimation.
   - Inventory tracking, threshold alerts, and automated purchase order drafting.
2. **`Billing`**:
   - Invoices CRUD, total calculation, and status progression (`unpaid` → `paid`).
   - Quotes generation and acceptance with automated job creation.
   - Payment capture supporting Credit Card, ACH, Check, and Cash.
   - Stripe integration (PCI-compliant Elements tokenization, auto-charge, and webhook processor).
   - ERP synchronization adapters (QuickBooks V3, Xero, NetSuite SuiteTalk).
3. **`CRM`**:
   - Customer 360 Profile aggregating properties, contracts, jobs, contact logs, and notes.
   - Service Contract management supporting flexible cadences (`MONTHLY`, `BI_MONTHLY`, `QUARTERLY`, `SEMI_ANNUALLY`, `ANNUALLY`).
   - Property condition tracking with photo uploads and historical timelines.
   - Customer Churn Prediction and Health Scoring engine (0–100 risk score based on invoices, complaints, and service gaps).
4. **`Comms`**:
   - Automated multi-channel notification engine (Twilio SMS, Voice TwiML IVR with digit-1 CSR forwarding, SMTP Email).
   - Persistent Notification Queue with background worker cron.
   - Twilio inbound webhook processor logging two-way SMS conversations to customer contact logs.
   - Real-Time Server-Sent Events (SSE) Event Bus (`/api/events`) broadcasting dispatch updates, technician location, and inbound SMS.
5. **`Sales`**:
   - Spatial canvassing map pins (Leaflet) with lead states (`NOT_HOME`, `NOT_INTERESTED`, `PITCHED`, `SOLD`).
   - Automated commission calculations and clawback tracking.
   - Digital Service Agreements with dynamic PDF generation, in-browser e-signatures, and auto-activation.
   - Marketing campaigns and automated customer retention follow-ups.
6. **`HR`**:
   - Internal staff directory with role-based access control (RBAC).
   - Mandatory and optional training course tracking.
   - Employee certifications and expiration dates.
   - Role-based onboarding task checklists and employee document file uploads.
7. **`Analytics`**:
   - Executive revenue dashboard (Monthly Recurring Revenue / Annual Recurring Revenue).
   - Technician productivity leaderboard (completed jobs).
   - Sales representative revenue leaderboard (commissions earned).

---

## Local Setup Instructions

### 1. Boot the Stack via Docker Compose
```bash
docker-compose up -d --build
```

### 2. Run Database Migrations
Apply the complete sequential migration suite against the PostgreSQL container:

**Windows (PowerShell):**
```powershell
Get-ChildItem -Path shared\database -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "Applying $($_.Name)..."
    Get-Content $_.FullName | docker-compose exec -T postgres psql -U crm_user -d crm_db
}
```

**Linux / macOS (Bash):**
```bash
for file in $(ls shared/database/*.sql | sort); do
    echo "Applying $file..."
    docker-compose exec -T postgres psql -U crm_user -d crm_db < "$file"
done
```

### 3. Migration Sequence Reference
- `001_initial_schema.sql`: Core multi-tenant foundation, users, properties, jobs, roles.
- `002_expanded_domain.sql`: Technicians, canvass pins, commissions, training courses, and certifications.
- `003_seed_data.sql`: Realistic mock data for tenants, dispatch boards, and staff directory.
- `004_crm_features.sql`: Service contracts, cadences, contact logs, internal notes, and customer communication channels.
- `005_finance_and_revenue.sql`: Quotes, invoices, payments, and ERP sync logs.
- `006_stripe_payments.sql`: Stripe customer IDs, payment intent IDs, and subscription billing events.
- `006_tenant_id_indexes.sql`: High-performance composite tenant index optimizations.
- `007_customer_health.sql`: Customer health scores, risk levels, and contributing factor matrices.
- `007_tech_pwa_features.sql`: Customer signatures, chemical application logs, and photo verification.
- `008_digital_agreements.sql`: Service agreements, signed PDF storage, and signer audit trails.
- `009_auto_scheduling.sql`: Job scheduling time windows and constraint solver metadata.
- `010_property_conditions.sql`: Property damage photos, tags, and condition tracking.
- `011_marketing_retention.sql`: Marketing campaigns, channels, and automated follow-up sequences.
- `012_inventory_management.sql`: Inventory items, minimum thresholds, and purchase order tracking.
- `013_service_agreements_tenant_idx.sql`: Tenant isolation index hardening for service agreements.

---

## Accessing the Applications

- **Admin Portal**: Open [http://localhost:3100](http://localhost:3100) (or `3000` standalone)
- **Customer Portal**: Open [http://localhost:3101](http://localhost:3101) (or `3001` standalone)
- **Technician PWA**: Open [http://localhost:3002](http://localhost:3002)
- **GraphQL Playground**: Open [http://localhost:3183/graphql](http://localhost:3183/graphql)
- **Express REST Health**: [http://localhost:3182/health](http://localhost:3182/health)
- **FastAPI REST Health**: [http://localhost:3184/health](http://localhost:3184/health)
- **Laravel REST Health**: [http://localhost:3181/api/v1/health](http://localhost:3181/api/v1/health)

---

## Verification & Testing

Each backend variant contains automated unit and integration tests:

```bash
# Express API
cd backends/express-api && npx tsc --noEmit && npm test

# FastAPI API
cd backends/fastapi-api && python -c "from app.main import app; print('OK')" && pytest

# GraphQL API
cd backends/graphql-api && npx tsc --noEmit

# Laravel API
cd backends/laravel-api && php artisan test
```
