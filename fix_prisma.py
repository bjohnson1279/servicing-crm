import re

f = 'backends/express-api/prisma/schema.prisma'
with open(f, 'r') as file:
    content = file.read()

content = re.sub(r'@relation\(\"[^\"]+\",\s*fields', r'@relation(fields', content)

with open(f, 'w') as file:
    file.write(content)
