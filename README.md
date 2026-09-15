# Servicing CRM Platform

A modular, polyglot Service Industry CRM designed to handle field service operations, door-to-door sales workflows, recurring contract models, and HR staff management. 

## Architecture
The platform is powered by a central PostgreSQL schema, providing a single source of truth across four interchangeable backend API variants and two React frontend portals.

### Ports & Services
- **Admin Portal**: `http://localhost:3000`
- **Customer Portal**: `http://localhost:3001`
- **Express API (Node.js)**: `http://localhost:8002`
- **FastAPI (Python)**: `http://localhost:8004`
- **GraphQL API**: `http://localhost:8003`
- **Laravel API (PHP)**: `http://localhost:8001`
- **PostgreSQL Database**: `localhost:5432`

## Local Setup Instructions

1. **Start the Containers**
   Boot the database, redis, frontends, and backends via Docker Compose:
   ```bash
   docker-compose up -d --build
   ```

2. **Run Migrations & Seed Data**
   Inject the core schema, the expanded domain models, and the mock seed data into the PostgreSQL container.
   
   **Windows (PowerShell):**
   ```powershell
   Get-Content shared\database\001_initial_schema.sql, shared\database\002_expanded_domain.sql, shared\database\003_seed_data.sql | docker-compose exec -T postgres psql -U crm_user -d crm_db
   ```
   **Mac/Linux (Bash):**
   ```bash
   cat shared/database/*.sql | docker-compose exec -T postgres psql -U crm_user -d crm_db
   ```

3. **Verify Health**
   Navigate to `http://localhost:3000` to view the Admin Portal.
