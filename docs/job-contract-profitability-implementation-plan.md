# Job and Contract Profitability

Status: slice 1 implemented as a disabled-by-default manager cost evidence workspace. Revenue reconciliation and contract profitability remain planned. See job-cost-evidence-setup.md for operation and limits.

## Outcome

Show managers which jobs and contracts cover their direct service costs, where callbacks erode margins, and which figures still need evidence. Provide a traceable operational contribution view for pricing and service decisions, with billed revenue, collections, and forecasts visibly separated.

## Repository findings

- Jobs contain on-site and driving minutes, but no general effective-dated labor-cost schedule or immutable job-cost postings. Current labor dashboards aggregate minutes rather than monetary costs.
- Inventory items contain a mutable unit_cost. Chemical logs optionally reference an item and record quantity/unit, but do not establish historical purchase cost, compatible unit conversion, or a valuation ledger. Device tracking currently covers registration, not usage costing.
- Invoices link to jobs and contain a total and free-text status. They lack structured tax, credit, invoice-line, currency, and revenue-allocation evidence needed for reliable net service revenue.
- Payments can reference invoices; subscription billing events reference customers, not contracts or occurrences. Contract recurring_amount is a pricing field, not proof of billed or collected revenue. The Express auto-charge cron is currently a placeholder.
- Callback visits already snapshot labor rates and material costs, and explicitly flag incomplete cost evidence. General job costing must reuse these source identities without counting the same return visit twice.
- Reviewed legacy finance and labor handlers query records without tenant predicates in the handler. The FastAPI finance report can return mock outstanding invoices when there are none. New profitability calculations must use protected, evidence-based inputs; legacy finance authorization also needs a dedicated audit before being exposed alongside the new workspace.

Sources: shared/database/001_initial_schema.sql, 002_expanded_domain.sql, 005_finance_and_revenue.sql, 006_stripe_payments.sql, 012_inventory_management.sql, 014_chemical_inventory_link.sql, 020_platform_hardening.sql, and 022_callbacks_warranty.sql; backend analytics handlers; FastAPI billing/routes.py; Express billing/autoCharge.ts.

## Metric definitions

| Metric | Rule |
| --- | --- |
| Net billed service revenue | Eligible issued invoice allocations minus evidenced credits, excluding separately evidenced taxes and pass-through amounts |
| Collected cash | Completed, allocated payments minus evidenced refunds; separate from billed revenue |
| Direct service cost | Validated on-site labor, attributed driving labor, consumed materials, subcontractor cost, and approved direct adjustments |
| Contribution | Net billed service revenue minus direct service cost |
| Contribution margin | Contribution / net billed service revenue; unavailable when revenue is zero or the required evidence is incomplete |
| Contract contribution | Revenue and cost attributed to that contract, including uniquely attributed callback/warranty visits |
| Forecast | Explicit assumptions about future visits, price, labor, travel, and materials; never included in actuals |

Use decimal arithmetic and an explicit tenant reporting currency. Return decimal values as strings consistently across APIs. Do not combine currencies; currency migration/import ambiguity requires review. Preserve original source amounts and rounding rules. Label the report as direct contribution; overhead allocation and statutory profit reporting are later scope.

Missing is not zero. Distinguish confirmed zero, unknown, estimated, and evidenced actual for each category. Show known revenue/cost subtotals and coverage counts when incomplete, but do not present a definitive margin. A completed job does not prove that no material was used. An unpaid issued invoice is billed revenue, not collected cash. Paid flags alone are not payment evidence.

## Cost and revenue evidence

### Job cost ledger

Introduce tenant-scoped immutable postings with job ID, optional contract attribution, category, effective service date, source identity/version, quantity/unit, decimal amount, currency, evidence status, actor, timestamp, and policy snapshot. Unique source keys prevent duplicate ingestion and retries. Corrections create reversal/replacement entries with a reason; never overwrite historical postings.

Snapshot the applicable effective-dated loaded labor cost at posting time. Initially support a manager-configured organization rate and explicit job overrides; technician-specific rates are a later restricted capability. Null minutes, negative values, overlapping time, and ambiguous timezone timestamps require review. Do not treat a missing rate as zero or retroactively apply today's rate to old jobs without a labeled estimate.

Driving cost must be attributed once. Start with recorded job driving minutes when validated; flag unknown attribution instead of dividing route travel across jobs arbitrarily. Multi-technician visits and route allocation require explicit source records before support is claimed.

Materials require compatible units and a historical cost snapshot. Do not multiply ounces/gallons by an inventory item's current per-container cost. Import existing chemical logs as pending-cost evidence when units or valuation are missing. Later verified application/inventory postings can feed the ledger without duplicate material cost. Callback material totals are a fallback source only until detailed postings supersede them through an audited reconciliation.

### Revenue and cash allocation

Create explicit job/contract allocations from verified invoice evidence. An invoice linked to one job can be a candidate source, but legacy totals without net/tax/currency evidence remain labeled gross/unknown rather than net revenue. Draft, void, cancelled, duplicate, and otherwise unsupported invoice states require explicit policy validation.

Monthly subscription charges are allocated to a contract/service period once, not multiplied by every visit. Require an explicit contract reference for customer-level billing events. Jobs with no invoice may be included in a prepaid contract period; absence of a job invoice does not prove zero revenue. Quotes and recurring_amount appear only in estimates.

Cash allocations cannot exceed the source payment or be attributed across tenants. Unallocated customer payments remain separate. Payment retries/webhooks, credits, refunds, chargebacks, and commission reversals must have stable source identities and an audit trail. Do not invent credits/refunds from callback outcomes or cancelled recurring visits.

### Contract rollup

Snapshot contract attribution at posting time. Preserve it when contract/job links later change. Show direct contract entries, recurring jobs, and separately attributed return visits with reconciled totals. A return job is counted once even if reachable through both job and callback joins. If its source job has no contract, leave it unattributed for review.

Contract views show lifetime totals and service-date period totals, source billing periods, callback cost, completed visit count, cost per visit, and incomplete coverage. For mismatched billing/service periods, show the mismatch instead of calling a timing difference a loss. Recurring occurrence previews do not establish delivery or revenue allocation. Do not create fake jobs to distribute a subscription invoice.

## Data and API design

Add a migration after the recurring queue migration with tenant feature/currency/timezone policy, effective-dated cost-rate policies, job cost postings, evidence attestations, revenue/cash allocation records, immutable correction events, import batches, and idempotency records. Use appropriate tenant/source uniqueness and indexes for job, contract, service date, and source identity.

Use a canonical PostgreSQL command/report implementation shared across Express, GraphQL, FastAPI, and Laravel. Synchronize contracts and model metadata. Expose consistent settings, bounded job/contract list and detail reports, source breakdowns, completeness filters, and later posting/reconciliation commands. Use batched aggregation rather than per-job queries. Read-only reports do not silently generate or mutate cost evidence.

Authorize using verified identity and current database roles before query or retry replay. Managers/super administrators can see profitability and configure policies. Dispatchers, technicians, customer service staff, and customers have no access to internal costs/margins by default. Any future operational summary for dispatchers must omit rate and margin data through a separate server-side projection. Do not rely on UI hiding or JWT role claims. Cross-tenant source relationships must be rejected even when legacy foreign keys permit them.

Keep reports private/no-store and reject responses after a client identity change. Exports follow the same permissions, filters, currency, completeness labels, and limits; sanitize spreadsheet formulas. Do not expose individual employee rates through drilldowns or events to less privileged roles.

## Manager experience

Add a profitability workspace with job/contract views, customer/property labels, service-date filters, currency, completeness status, and sortable contribution where valid. Explain empty and incomplete states with the specific missing evidence. Never rank an incomplete job as most profitable because costs are missing.

Detail views reconcile revenue allocations, collected cash, labor/travel, materials, other direct costs, and callback burden. Show source documents/records, policy snapshots, corrections, and separate estimated values. Clearly distinguish a recorded zero-cost waiver visit from a visit whose cost is unknown. Provide renewal/pricing review flags only after sufficiently complete evidence exists; repricing and customer communication remain explicit manager actions.

## Delivery slices

1. **Cost evidence foundation and protected manager view:** tenant policy, cost-rate history, immutable job-cost postings, completeness/zero attestations, bounded manager review of existing labor/material/callback sources, source deduplication, read-only job cost summaries across all backends, and admin workspace. Legacy imports remain provisional unless historical evidence is sufficient. This slice provides cost visibility and an explicit revenue-not-reconciled state, not a definitive profit figure.
2. **Revenue reconciliation and job contribution:** invoice net/currency evidence, credits/payment/refund allocation, audited corrections, eligible source reconciliation, complete job contribution, and protected exports. Audit/harden relevant legacy finance endpoints before integrating their controls into the workspace.
3. **Contract profitability:** subscription service-period allocation, unique callback attribution, billing/service-period comparison, contract rollups, and explicit unallocated amounts.
4. **Operational inputs and forecasting:** verified treatment/inventory consumption, route/multi-technician cost attribution, forecast assumptions, overhead scenarios, renewal review flags, and controlled rollout.

Start with slice 1. Existing application integrity, recurring generation cutover, and service-report work remain prerequisites for their respective later automatic cost/revenue feeds.

## Verification and rollout

Default disabled per tenant. Require reporting currency/timezone and a reviewed cost policy. Preview historical imports in bounded batches; never derive historical actuals from current inventory price or silently overwrite existing costs. Preserve partial/unallocated amounts and allow correction through audited postings. No automatic billing, repricing, inventory deduction, or customer messaging during profitability rollout.

Test decimal/rounding parity, zero/negative net revenue, missing versus confirmed zero, rate-effective boundaries, historical policy stability, incompatible material units, invalid time records, multi-source deduplication, callback double counting, corrections/reversals, subscription allocations, partial/refunded payments, currency mismatch, service/billing period mismatch, cross-tenant relationships, forged/downgraded roles, retry conflicts, concurrent imports, and bounded report aggregation. Run canonical database integration tests, four-backend transport checks, and focused manager UI tests. Check that totals reconcile to source allocations and that incomplete data cannot produce a definitive margin.
