"""Add device mappings and synchronize portal sources without touching other features."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
contract=(root/'shared/contracts/devices.prisma').read_text(encoding='utf-8')
for backend in ('express-api','graphql-api'):
    path=root/'backends'/backend/'prisma/schema.prisma'
    source=path.read_text(encoding='utf-8')
    if 'devicesEnabled' not in source:source=source.replace('model Tenant {','model Tenant {\n  devicesEnabled Boolean @default(false) @map("devices_enabled")')
    if 'model PropertyDevice {' not in source:source+='\n'+contract
    path.write_text(source,encoding='utf-8')
for app,folder in [('admin-portal','src/features/devices'),('tech-portal','src/components/devices')]:
    target=root/'apps'/app/folder;target.mkdir(parents=True,exist_ok=True)
    for name in ('DeviceWorkspace.tsx','deviceApi.ts'):(target/name).write_text((root/'shared/ui'/name).read_text(encoding='utf-8'),encoding='utf-8')
