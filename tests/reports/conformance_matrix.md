# Cross-Backend Conformance & E2E Verification Report

Generated: `2026-10-07 17:06:48`
Execution Duration: `16.16s`

---

## 1. Backend Target Availability

| Backend Target | Endpoint URL | Status |
|---|---|:---:|
| **Express (Node.js/TS)** | `http://localhost:3182` | ⚪ Standby / Offline |
| **FastAPI (Python/Async)** | `http://localhost:3184` | ⚪ Standby / Offline |
| **GraphQL (Apollo 4)** | `http://localhost:3183` | ⚪ Standby / Offline |
| **Laravel (PHP 8.2)** | `http://localhost:3181` | ⚪ Standby / Offline |

---

## 2. Test Execution Summary

- **Total Test Cases**: `80`
- **Passed**: `0`
- **Failed**: `0`
- **Skipped (Offline Targets)**: `80`

---

## 3. Domain Bounded Context Coverage

All 7 canonical DDD Bounded Contexts are covered under contract & conformance testing:

| Bounded Context | Conformance Module | Key Assertions |
|---|---|---|
| **Dispatch** | `test_dispatch_conformance.py` | Job transitions, EPA compliance reports, Inventory thresholds, Tech schedules |
| **Billing** | `test_billing_conformance.py` | Invoices, Quotes, Payments, Stripe webhook payload processing, ERP sync |
| **CRM** | `test_crm_conformance.py` | Customer 360 profile, Service contracts cadence, Churn & health scores |
| **Comms** | `test_comms_conformance.py` | Live chat threads, Contact log persistence, Canned templates, Notification queue |
| **Sales** | `test_sales_conformance.py` | Canvass pins, Territory polygon coordinates, Do-Not-Knock compliance |
| **Analytics** | `test_analytics_conformance.py` | Revenue MRR/ARR, Leaderboards, AI Pest Risk scoring & geospatial heatmap |
| **HR** | `test_hr_conformance.py` | Staff directory, Training courses, Certifications, Onboarding tasks |

---

## 4. Operational End-to-End Lifecycle (`tests/e2e/`)

- **Module**: `test_lifecycle_sales_to_settlement.py`
- **Flow**: Canvass Pin Drop $\rightarrow$ Agreement E-Signature $\rightarrow$ Auto-Scheduling $\rightarrow$ Chemical Application Logging $\rightarrow$ Invoice & Stripe Settlement $\rightarrow$ AI Pest Risk Recalculation
