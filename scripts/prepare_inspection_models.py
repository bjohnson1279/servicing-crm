"""Synchronize inspection scalar mappings and portal source copies without replacing other work."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
contract=(root/'shared/contracts/inspections.prisma').read_text(encoding='utf-8')
for backend in ('express-api','graphql-api'):
    path=root/'backends'/backend/'prisma/schema.prisma'
    source=path.read_text(encoding='utf-8')
    if 'inspectionsEnabled' not in source:
        source=source.replace('model Tenant {','model Tenant {\n  inspectionsEnabled Boolean @default(false) @map("inspections_enabled")')
    if 'model Inspection {' not in source:
        source+='\n'+contract
    path.write_text(source,encoding='utf-8')
for app,folder in [('admin-portal','src/features/inspections'),('tech-portal','src/components/inspections')]:
    target=root/'apps'/app/folder
    target.mkdir(parents=True,exist_ok=True)
    for name in ('InspectionWorkspace.tsx','inspectionApi.ts'):
        (target/name).write_text((root/'shared/ui'/name).read_text(encoding='utf-8'),encoding='utf-8')
