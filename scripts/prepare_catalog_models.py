"""Add catalog scalar mappings and synchronize portal sources without replacing other work."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
contract=(root/'shared/contracts/catalog.prisma').read_text(encoding='utf-8')
for backend in ('express-api','graphql-api'):
    path=root/'backends'/backend/'prisma/schema.prisma'
    source=path.read_text(encoding='utf-8')
    if 'catalogEnabled' not in source:source=source.replace('model Tenant {','model Tenant {\n  catalogEnabled Boolean @default(false) @map("catalog_enabled")')
    if 'model CatalogProduct {' not in source:source+='\n'+contract
    path.write_text(source,encoding='utf-8')
for app,folder in [('admin-portal','src/features/catalog'),('tech-portal','src/components/catalog')]:
    target=root/'apps'/app/folder;target.mkdir(parents=True,exist_ok=True)
    for name in ('CatalogWorkspace.tsx','catalogApi.ts'):(target/name).write_text((root/'shared/ui'/name).read_text(encoding='utf-8'),encoding='utf-8')
