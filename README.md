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
                               │   (Port 3102)    │   (Port 3101)    │   (Port 3002)    │
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
| **Admin Portal** | React 18, Vite, Tailwind CSS, Leaflet | `3102` (`3000`) | Back-office hub for dispatch, customer 360, billing, sales canvass map, and HR. |
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
   - Two-Way Live Chat (Customer ↔ CSR) with canned response templates, conversation routing, and contact log synchronization.
5. **`Sales`**:
   - Spatial canvassing map pins (Leaflet) with lead states (`NOT_HOME`, `NOT_INTERESTED`, `PITCHED`, `SOLD`).
   - Automated commission calculations and clawback tracking.
   - Digital Service Agreements with dynamic PDF generation, in-browser e-signatures, and auto-activation.
   - Marketing campaigns and automated customer retention follow-ups.
   - Sales Territory Management with interactive polygon boundary drawing, rep quota targets, penetration analytics, and legal Do-Not-Knock compliance.
6. **`HR`**:
   - Internal staff directory with role-based access control (RBAC).
   - Mandatory and optional training course tracking.
   - Employee certifications and expiration dates.
   - Role-based onboarding task checklists and employee document file uploads.
7. **`Analytics`**:
   - Executive revenue dashboard (Monthly Recurring Revenue / Annual Recurring Revenue).
   - Technician productivity leaderboard (completed jobs).
   - Sales representative revenue leaderboard (commissions earned).
   - AI-Powered Pest Risk Scoring & Geospatial Heatmap (chemical decay half-life, seasonal vector, weather humidity/heat index, structural vulnerability tags).
   - Projected pest resurgence timeline and automated upsell package recommendations.



---

## Local Setup Instructions

See [Docker runtime configuration and verification](docs/docker-runtime.md) for port, key, proxy and worker settings.

### 1. Configure Environment Variables
Copy the `.env.example` template to `.env` and configure your credentials:
```bash
cp .env.example .env
```
Ensure secrets (`JWT_SECRET`, `LARAVEL_APP_KEY`) and passwords (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`) are configured appropriately for your environment.

### 2. Boot the Stack via Docker Compose
```bash
docker-compose up -d --build
```

### 3. Run Database Migrations
For a fresh, empty database only, apply the sequential SQL suite below. Existing databases require a backup and inspection of missing migrations; see [Docker runtime](docs/docker-runtime.md). Do not rerun the full suite against existing data.

**Windows (PowerShell):**
```powershell
Get-ChildItem -Path shared\database -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "Applying $($_.Name)..."
    Get-Content $_.FullName | docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}
```

**Linux / macOS (Bash):**
```bash
for file in $(ls shared/database/*.sql | sort); do
    echo "Applying $file..."
    docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
done
```

### 4. Migration Sequence Reference
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
- `014_chemical_inventory_link.sql`: Inventory item references and EPA registration numbers for chemical application logs.
- `015_sales_territories.sql`: Sales territories and Do-Not-Knock compliance registries.
- `016_live_chat.sql`: Real-time chat conversations, messages, and canned response templates.
- `017_pest_risk_scoring.sql`: AI-powered pest risk scoring and predictive resurgence models.
- `018_missing_fk_indexes.sql`: Foreign key indexing optimizations across core domain models.
- `019_missing_fk_indexes_pt2.sql`: Index optimizations for job contracts and related references.
- `020_platform_hardening.sql`: API usage metrics, audit logging, notification preferences, and customer surveys.
- `021_missing_fk_indexes_pt3.sql`: Index coverage for API usage metrics and audit logs.
- `022_callbacks_warranty.sql`: Warranty policies, service callbacks, visits, events, and attachment models.
- `023_callbacks_tenant_indexes.sql`: Tenant isolation index optimizations for callback and warranty tables.
- `023_job_authorization.sql`: Invoker-rights job distance calculation and transactional job authorization procedures.
- `024_callbacks_fk_indexes.sql`: Foreign key indexes for callback tracking tables.
- `024_inspection_capture.sql`: Inspection workflow, revisions, evidence attachments, events, and request records.
- `025_property_devices.sql`: Property bait station / device registers, location histories, and device events.
- `025_warranty_fk_indexes.sql`: Foreign key indexes for service contract warranty policies.
- `026_verified_product_catalog.sql`: Tenant product catalog, versioning, verified evidence documents, and requests.
- `027_recurring_service_exceptions.sql`: Recurring schedule revisions, occurrences, exception queues, and event logs.
- `028_job_cost_evidence.sql`: Job cost policy definitions, cost entries, settings events, and evidence tracking.
- `029_commercial_accounts.sql`: Commercial multi-site account hierarchies, sites, contacts, and account events.
- `030_inspection_capture_fk_indexes.sql`: Foreign key indexing for inspection revisions and attachments.
- `031_property_devices_fk_indexes.sql`: Foreign key indexing for property device registers and locations.
- `032_job_cost_evidence_fk_indexes.sql`: Foreign key indexing for job cost policy actors and cost entry logs.
- `033_commercial_accounts_fk_indexes.sql`: Foreign key indexing for commercial account ownership and site links.
- `034_catalog_fk_indexes.sql`: Foreign key indexing for catalog product versions and document verifications.
- `035_recurring_fk_indexes.sql`: Foreign key indexing for recurring schedule exceptions and assessments.
- `036_missing_fk_indexes.sql`: Foreign key indexing for live chat messages and related relations.
- `037_missing_fk_indexes_pt4.sql`: Foreign key indexing for automated marketing followups.
- `038_missing_fk_indexes_pt5.sql`: Comprehensive foreign key index optimizations across historical schema tables.
- `039_missing_fk_indexes_pt6.sql`: Single-column foreign key index optimizations for referential integrity checks.
- `040_missing_fk_indexes_pt7.sql`: Single-column index optimizations for callback visit jobs and remaining references.

---

## Accessing the Applications

- **Admin Portal**: Open [http://localhost:3102](http://localhost:3102) (or `5173` standalone)
- **Customer Portal**: Open [http://localhost:3101](http://localhost:3101) (or `3001` standalone)
- **Technician PWA**: Open [http://localhost:3002](http://localhost:3002)
- **GraphQL Playground**: Open [http://localhost:3183/graphql](http://localhost:3183/graphql)
- **Express REST Health**: [http://localhost:3182/health](http://localhost:3182/health)
- **FastAPI REST Health**: [http://localhost:3184/health](http://localhost:3184/health)
- **Laravel REST Health**: [http://localhost:3181/api/v1/health](http://localhost:3181/api/v1/health)

---

## Documentation & Sub-Guides

For detailed setup instructions, domain specs, and feature implementation plans, refer to the guides in `/docs`:

### Setup & Operations Guides
- [Docker Runtime Configuration & Verification](docs/docker-runtime.md)
- [Callbacks & Warranty Claims Setup Guide](docs/callbacks-warranty-setup.md)
- [Commercial Accounts & Multi-Site Hierarchy Setup Guide](docs/commercial-accounts-setup.md)
- [Property Device Register & Inspection Setup Guide](docs/device-register-setup.md)
- [Mobile Inspection & Treatment Evidence Setup Guide](docs/inspection-capture-setup.md)
- [Job Authorization & Digital Sign-off Setup Guide](docs/job-authorization-setup.md)
- [Job Cost Evidence & Profitability Tracking Setup Guide](docs/job-cost-evidence-setup.md)
- [Verified Product Catalog & Service Reports Setup Guide](docs/product-catalog-setup.md)
- [Recurring Service Exception Queue Setup Guide](docs/recurring-exception-queue-setup.md)

### Feature Architecture & Implementation Plans
- [Bait Station & Device Tracking Implementation Plan](docs/bait-station-device-tracking-implementation-plan.md)
- [Callbacks & Warranty Claims Architecture Implementation Plan](docs/callbacks-warranty-implementation-plan.md)
- [Commercial & Multi-Site Accounts Architecture Implementation Plan](docs/commercial-multi-site-accounts-implementation-plan.md)
- [Mobile Inspection & Treatment Capture Architecture Implementation Plan](docs/inspection-treatment-implementation-plan.md)
- [Job & Contract Profitability Analytics Architecture Implementation Plan](docs/job-contract-profitability-implementation-plan.md)
- [Property Service Playbook Architecture Implementation Plan](docs/property-service-playbook-implementation-plan.md)
- [Recurring Service Exception Queue Architecture Implementation Plan](docs/recurring-service-exception-queue-implementation-plan.md)
- [Verified Product Catalog & Service Reports Architecture Implementation Plan](docs/verified-products-service-reports-implementation-plan.md)

### API & Schema Specifications
- [API Endpoint & Schema Reference](API_REFERENCE.md)
- [OpenAPI 3.1 Specification](shared/contracts/openapi.yaml)
- [GraphQL Schema Definition](shared/contracts/schema.graphql)

---

## Verification & Testing

### Cross-Backend Conformance Test Suite
The repository includes a comprehensive, cross-backend conformance verification suite that validates behavioral equivalence and golden schema compliance across all 4 backends:

```bash
# Run full cross-backend conformance suite against available backends
python -u tests/run_conformance.py

# Target a specific domain (e.g. analytics, dispatch, billing)
python -u tests/run_conformance.py --domain analytics

# Run against a specific backend target (express, fastapi, graphql, laravel)
python -u tests/run_conformance.py --backend express
```

### Individual Backend Unit & Integration Tests
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

---

## Docker Compose Production Profiling & Health Orchestration

The project includes pre-configured Docker Compose service profiles (`default`, `all`, `express`, `fastapi`, `graphql`, `laravel`, `apps`) and an orchestration utility:

```bash
# Inspect compose configuration
python scripts/docker_orchestrate.py config

# Start core services with Express backend
python scripts/docker_orchestrate.py up --profile express

# Start all backends and frontend applications
python scripts/docker_orchestrate.py up --profile all

# Check container status and fast TCP health probes (<0.1s)
python scripts/docker_orchestrate.py test-health

# Tear down all running containers
python scripts/docker_orchestrate.py down
```
