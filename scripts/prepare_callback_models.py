"""Keep ORM scalar mappings and GraphQL schema aligned with migration 022."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for backend in ('express-api', 'graphql-api'):
    path = root / 'backends' / backend / 'prisma/schema.prisma'
    source = path.read_text(encoding='utf-8')
    additions = {
        'Tenant': '  callbacksEnabled Boolean @default(false) @map("callbacks_enabled")\n  callbackHourlyLaborRate Decimal? @map("callback_hourly_labor_rate") @db.Decimal(10,2)\n',
        'ServiceContract': '  warrantyPolicyId String? @map("warranty_policy_id") @db.Uuid\n',
        'Job': '  warrantyPolicyId String? @map("warranty_policy_id") @db.Uuid\n  purpose String @default("standard") @db.VarChar(20)\n  sourceJobId String? @map("source_job_id") @db.Uuid\n  billingDisposition String @default("standard") @map("billing_disposition") @db.VarChar(20)\n',
    }
    for model, fields in additions.items():
        marker = 'model ' + model + ' {\n'
        if fields.split()[0] not in source.split(marker)[1].split('}')[0]:
            source = source.replace(marker, marker + fields)
    if 'callbackHourlyLaborRate' not in source:
        source = source.replace('model Tenant {\n', 'model Tenant {\n  callbackHourlyLaborRate Decimal? @map("callback_hourly_labor_rate") @db.Decimal(10,2)\n')
    if 'callbackTimezone' not in source:
        source = source.replace('model Tenant {\n','model Tenant {\n  callbackTimezone String @default("UTC") @map("callback_timezone") @db.VarChar(80)\n')
    if 'model WarrantyPolicyVersion' not in source:
        source += '\n' + (root / 'shared/contracts/callbacks.prisma').read_text(encoding='utf-8')
    else:
        source = source[:source.index('// Scalar mappings;')] + (root / 'shared/contracts/callbacks.prisma').read_text(encoding='utf-8')
    path.write_text(source, encoding='utf-8')

path = root / 'backends/graphql-api/src/typeDefs.ts'
source = path.read_text(encoding='utf-8')
contract = (root / 'shared/contracts/callbacks.graphql').read_text(encoding='utf-8')
if 'type CallbackCase' not in source:
    source = source.replace('`;','\n' + contract + '\n`;')
else:
    source = source[:source.index('scalar CallbackJSON')] + contract + '\n`;\n'
path.write_text(source, encoding='utf-8')

for backend, folder in [('admin-portal', 'src/features/callbacks'), ('customer-portal', 'src/features/callbacks'), ('tech-portal', 'src/components/callbacks')]:
    destination = root / 'apps' / backend / folder
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('CallbackWorkspace.tsx', 'callbackApi.ts'):
        (destination / name).write_text((root / 'shared/ui' / name).read_text(encoding='utf-8'), encoding='utf-8')

# Keep transport action names identical in every adapter.
for backend in ('express-api','graphql-api'):
    path = root / 'backends' / backend / 'src/domains/crm/callbackRoutes.ts'
    source = path.read_text(encoding='utf-8')
    if "'visit-update':" not in source:
        source = source.replace("'visit-cost': 'visit_cost'", "'visit-cost': 'visit_cost', 'visit-update': 'visit_update'")
    if "quotes: 'quote'" not in source:
        source = source.replace("decision: 'decision'", "decision: 'decision', quotes: 'quote'")
    path.write_text(source,encoding='utf-8')

for name, table, casts in [
    ('WarrantyPolicyVersion','warranty_policy_versions',{'covered_pests':'array'}),
    ('ServiceCallback','service_callbacks',{'policy_snapshot':'array','reported_at':'datetime','resolved_at':'datetime'}),
    ('CallbackVisit','callback_visits',{'follow_up':'boolean','outcome_at':'datetime','material_cost':'decimal:2','labor_rate_snapshot':'decimal:2'}),
    ('CallbackEvent','callback_events',{'details':'array'}),
    ('CallbackAttachment','callback_attachments',{}),
]:
    cast_text = ', '.join("'%s' => '%s'" % item for item in casts.items())
    hidden = "    protected $hidden = ['data'];\n" if name == 'CallbackAttachment' else ''
    source = fr'''<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
// Writes use the canonical callback commands; guard against generic mass assignment.
class {name} extends Model {{
    use HasUuids;
    protected $table = '{table}';
    protected $guarded = ['*'];
    public $timestamps = false;
    protected $casts = [{cast_text}];
{hidden}}}
'''
    (root / 'backends/laravel-api/app/Models' / (name + '.php')).write_text(source,encoding='utf-8')
