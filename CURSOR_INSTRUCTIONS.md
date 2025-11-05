# Cursor IDE Instructions for Vend Technical Assessment

**Project Goal:** Build a type-safe billing and multi-tenant reporting system for Vend's parking subscription platform using PostgreSQL + Drizzle ORM + Elysia.js backend + Snowflake/DBT analytics.

---

## Phase 1: Project Setup & Structure

### 1.1 Initialize Turborepo Monorepo

- Create new directory `vend-assessment`
- Initialize Turborepo with Bun
- Create the following workspace structure:
  - `apps/web` - React + Vite dashboard
  - `apps/api` - Elysia.js backend server
  - `packages/database` - PostgreSQL + Drizzle ORM
  - `packages/billing` - Stripe integration logic
  - `packages/shared` - Shared TypeScript types
  - `packages/snowflake-dbt` - DBT models and SQL
  - `docs/` - Architecture documentation

### 1.2 Setup Docker Compose

- Create `docker-compose.yml` in project root
- Add PostgreSQL 16 service with:
  - Database name: `vend_assessment`
  - User: `vend`
  - Password: `vend_dev_pass`
  - Port: 5432
  - Persistent volume for data

### 1.3 Configure Turborepo

- Set up `turbo.json` with build pipelines
- Configure workspace dependencies between packages
- Set up shared TypeScript config

---

## Phase 2: Database Package with Drizzle ORM

### 2.1 Initialize Database Package

- Navigate to `packages/database`
- Install dependencies:
  - `drizzle-orm`
  - `postgres` (node-postgres client)
  - `drizzle-kit` (dev dependency)
- Create `drizzle.config.ts` pointing to local PostgreSQL

### 2.2 Define Database Schema

Create `src/schema.ts` with the following tables using Drizzle:

**Base Tables:**

- `users` table with fields: id (uuid), firstName, lastName, email, phone, stripeCustomerId, createdAt, updatedAt
- `garages` table with fields: id (uuid), name, address, stripeAccountId, createdAt, updatedAt
- `passes` table with fields: id (uuid), garageId (FK), name, description, stripeProductId, stripePriceId, monthlyAmount, active, createdAt, updatedAt

**Billing Tables:**

- `subscriptions` table with fields: id (uuid), stripeSubscriptionId, userId (FK), garageId (FK), passId (FK), stripePriceId, status (enum: active, past_due, canceled, unpaid, trialing), currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, canceledAt, monthlyAmount, createdAt, updatedAt
- `payments` table with fields: id (uuid), stripePaymentIntentId, subscriptionId (FK), garageId (FK), amount, stripeFee, netAmount, status (enum: succeeded, failed, processing, canceled), currency, paymentDate, createdAt, updatedAt

**Key Requirements:**

- Use pgEnum for status fields
- Add indexes on: garageId (all tables for multi-tenant queries), status fields, date fields
- Define relations between tables using Drizzle relations API
- Export TypeScript types using Drizzle's `$inferSelect` and `$inferInsert`

### 2.3 Create Database Client

- Create `src/client.ts` that exports configured Drizzle instance
- Export all schema definitions and types

### 2.4 Generate and Run Migrations

- Use `drizzle-kit generate:pg` to create migrations
- Use `drizzle-kit push:pg` to apply to database
- Verify tables created in PostgreSQL

---

## Phase 3: Elysia.js Backend API

### 3.1 Initialize API Package

- Navigate to `apps/api`
- Install dependencies:
  - `elysia`
  - `@elysiajs/cors`
  - `@elysiajs/swagger` (for API docs)
  - Import `@vend/database` package

### 3.2 Create Core API Routes

Set up the following route groups:

**Health Check:**

- GET `/health` - returns API status

**Billing Routes:**

- POST `/api/billing/pass` - creates a garage pass with Stripe product/price
- POST `/api/billing/subscribe` - subscribes user to a pass
- GET `/api/billing/report` - generates revenue report by garage

**Garage Routes (for dashboard):**

- GET `/api/garages/:garageId/pl` - returns P&L data for specific garage
- GET `/api/garages/:garageId/metrics` - returns KPIs for garage dashboard

### 3.3 Request Validation

- Use Elysia's built-in validation with TypeBox or Zod
- Define request/response schemas for all endpoints
- Ensure type safety from request → database → response

### 3.4 Error Handling

- Create custom error handling middleware
- Return proper HTTP status codes
- Include helpful error messages for debugging

---

## Phase 4: Stripe Integration (Billing Package)

### 4.1 Initialize Billing Package

- Navigate to `packages/billing`
- Install Stripe SDK: `stripe`
- Create Stripe client wrapper in `src/stripe-client.ts` configured for test mode

### 4.2 Implement Core Billing Functions

**Function 1: createGaragePass**

- Parameters: passId, garageId, name, description, monthlyPrice (in dollars)
- Steps:
  1. Create Stripe Product with metadata (passId, garageId)
  2. Create Stripe Price with monthly recurring interval, convert price to cents
  3. Return productId and priceId
- Use proper TypeScript types throughout

**Function 2: subscribeUserToPass**

- Parameters: userId, passId
- Steps:
  1. Query database for user and pass details using Drizzle
  2. Get or create Stripe Customer (check if user.stripeCustomerId exists)
  3. If no customer, create one and update user record with customerId
  4. Create Stripe Subscription with the pass's priceId
  5. Insert subscription record into database with all Stripe details
  6. Return subscriptionId
- Handle errors gracefully (user not found, pass not found, etc.)

**Function 3: generateRevenueReport**

- Query subscriptions table with status='active'
- Join with garages table
- Group by garage
- Aggregate: COUNT(subscriptions) as activeSubscriptions, SUM(monthlyAmount) as monthlyRevenue
- Return array in format: `{ garage: string, activeSubscriptions: number, monthlyRevenue: number }[]`
- Sort by revenue descending

### 4.3 Create Seed Data Script

- Create `src/seed.ts` that:
  1. Creates 2-3 garages
  2. Creates 2-3 passes per garage using createGaragePass
  3. Creates 15-20 users
  4. Subscribes users to passes using subscribeUserToPass (distribute across garages)
  5. Generates mock payment history (3 months per subscription)
- Make it idempotent (check if data exists first)

---

## Phase 5: Snowflake & DBT Design (Documentation)

### 5.1 Create Reporting Documentation

Create `docs/reporting.md` with the following sections:

**Architecture Overview:**

- Draw ASCII or describe data flow: PostgreSQL → ETL → Snowflake → DBT → Dashboards
- Explain why Snowflake (columnar storage, multi-tenant security, time travel)
- Explain ETL strategy (Fivetran/Airbyte, 6-hour incremental sync)

**Snowflake Schema Design:**

Write SQL DDL for these layers:

**Raw Layer (raw schema):**

- Mirror PostgreSQL tables exactly
- Include \_fivetran_synced timestamp
- No transformations, just landing zone

**Staging Layer (staging schema):**

- Create views that clean and type-cast raw data
- Rename columns to be analytics-friendly
- Filter out deleted/invalid records

**Marts Layer (marts schema):**

- Design star schema with:
  - **Dimension tables:** dim_garages, dim_users, dim_passes, dim_date
  - **Fact tables:** fact_subscriptions, fact_payments
- Add clustering keys on garage_id for multi-tenant queries
- Use Snowflake-specific features (clustering, time travel)

**Reporting Layer (reports schema):**

- **Critical table: rpt_garage_monthly_pl** (this is explicitly requested!)
  - Columns: garage_id, garage_name, month, gross_revenue, total_stripe_fees, total_platform_fees (10% to Vend), garage_profit, subscription_count, unique_customers, arpu, revenue_per_customer
  - Clustered by (garage_id, month)
  - Pre-aggregated for fast dashboard queries
- rpt_executive_dashboard - aggregated across all garages for Vend leadership

### 5.2 Write DBT Models

In `packages/snowflake-dbt/models/`:

**Staging models** (create .sql files):

- `staging/stg_users.sql` - select and clean from raw.users
- `staging/stg_subscriptions.sql` - select and clean from raw.subscriptions
- `staging/stg_payments.sql` - select and clean from raw.payments

**Intermediate models:**

- `intermediate/int_active_subscriptions.sql` - filter only active subscriptions with business logic
- `intermediate/int_subscription_lifecycle.sql` - track subscription state changes over time

**Marts models:**

- `marts/dim_garages.sql` - dimension table materialized as table
- `marts/dim_users.sql` - dimension table materialized as table
- `marts/fact_subscriptions.sql` - fact table with incremental materialization, clustered by garage_id
- `marts/fact_payments.sql` - fact table with incremental materialization, clustered by (garage_id, payment_date)

**Reporting models:**

- `reports/rpt_garage_monthly_pl.sql` - THE CRITICAL ONE
  - Join fact_payments with fact_subscriptions and dim_garages
  - Group by garage and month
  - Calculate all financial metrics (revenue, fees, profit, ARPU, etc.)
  - Use window functions for growth calculations
  - Materialize as table, cluster by (garage_id, month)
- `reports/rpt_executive_dashboard.sql` - aggregate across all garages

### 5.3 Document Multi-Tenant Access Control

In `docs/reporting.md`, describe:

- How Snowflake row access policies work
- Create example policy that filters by garage_id based on user role
- Show role hierarchy: vend_admin (see all), garage_admin (see only their garage)
- Explain how this integrates with auth system (Clerk/WorkOS)

### 5.4 Cost Analysis

Document estimated monthly costs:

- PostgreSQL: ~$300/month
- ETL (Fivetran/Airbyte): ~$100-500/month depending on volume
- Snowflake storage: ~$50/month for 500GB
- Snowflake compute: ~$400-800/month for small warehouse running periodically
- Total: ~$850-1,650/month

---

## Phase 6: React Dashboard

### 6.1 Initialize Web App

- Navigate to `apps/web`
- Create Vite + React + TypeScript project
- Install dependencies:
  - `@radix-ui/react-*` (via shadcn/ui)
  - `tailwindcss`
  - `recharts` (for charts)
  - `lucide-react` (for icons)

### 6.2 Setup shadcn/ui

- Run `npx shadcn@latest init` to configure
- Add components: `npx shadcn@latest add card button`
- Configure Tailwind with theme

### 6.3 Build Garage P&L Dashboard Component

Create `src/components/GaragePLDashboard.tsx`:

**Props:**

- garageId: string
- garageName: string

**Layout sections:**

1. **Header** - Display garage name and date range
2. **KPI Cards** (4 cards in grid):
   - Gross Revenue (with month-over-month growth %)
   - Net Profit (after all fees)
   - Active Subscriptions (with count change)
   - ARPU (average revenue per user)
3. **Revenue Trend Chart**:
   - Use Recharts BarChart
   - Show last 6 months
   - 3 bars per month: gross revenue, fees, profit
   - X-axis: months, Y-axis: dollars
4. **Subscription Growth Chart**:
   - Use Recharts LineChart
   - Show subscription count over time
5. **Detailed P&L Table**:
   - Columns: Month, Gross Revenue, Stripe Fees, Platform Fee, Net Profit, Subscription Count, ARPU
   - Sortable by clicking headers
   - Format numbers with proper currency display

**Data fetching:**

- Create mock data array for 6 months of P&L data matching the report structure
- Use TypeScript interface for monthly P&L data type
- Add TODO comment indicating where to fetch from API endpoint

**Styling:**

- Use shadcn/ui Card components
- Apply Tailwind classes for responsive grid layout
- Add lucide-react icons for visual interest
- Use green color for profit, red for losses
- Make it clean and professional looking

### 6.4 Main App

- Create `src/App.tsx` that renders the dashboard component
- Pass mock garageId and name as props
- Set up basic routing structure (even if only one page)

---

## Phase 7: Documentation

### 7.1 Architecture Document

Create `docs/architecture.md`:

- System overview diagram
- Technology stack with rationale for each choice
- Data flow: User action → API → Database → ETL → Warehouse → Dashboard
- Explain why Elysia.js (performance, type safety, Bun-native)
- Explain why Drizzle (type safety, SQL-based, migrations)
- Multi-tenant architecture approach

### 7.2 Billing Lifecycle Document

Create `docs/billing-lifecycle.md`:

- Subscription creation flow (step-by-step)
- Monthly billing process (how Stripe handles renewals)
- Payment success flow (webhook → database update → analytics)
- Payment failure flow (retry logic, grace periods)
- Cancellation flow (immediate vs end-of-period)
- Include sequence diagrams if possible

### 7.3 README

Create comprehensive `README.md`:

**Sections:**

1. **Overview** - What the project does, tech stack summary
2. **Quick Start**:
   - Prerequisites (Bun, Docker)
   - Installation steps
   - Running migrations
   - Seeding data
   - Starting all services
3. **Project Structure** - Tree view of monorepo
4. **Design Decisions**:
   - Why PostgreSQL + Drizzle (type safety, ACID for billing)
   - Why Elysia.js (performance, Bun-native, type safety)
   - Why Stripe-based data model (production-ready patterns)
   - Why Snowflake + DBT (columnar analytics, multi-tenant security)
5. **Key Features**:
   - Type-safe end-to-end
   - Multi-tenant data isolation
   - Automated P&L reports
   - Stripe integration patterns
6. **API Endpoints** - List all routes with example requests/responses
7. **Database Schema** - High-level ER diagram or description
8. **Snowflake Architecture** - Link to reporting.md
9. **Future Enhancements** - Real-time CDC, ML predictions, etc.
10. **Time Spent** - Breakdown by phase (~5 hours total)

---

## Phase 8: Testing & Demo Preparation

### 8.1 Test Billing Functions

- Run seed script to populate database
- Test each API endpoint with curl or Postman
- Verify data appears correctly in database
- Generate revenue report and verify aggregations are correct

### 8.2 Verify Dashboard

- Start web app
- Check all KPI cards display correctly
- Verify charts render properly
- Test responsive layout at different screen sizes
- Ensure professional appearance

### 8.3 Sample Output

Prepare screenshots or terminal output showing:

- Successful API calls with JSON responses
- Revenue report output matching assessment requirements format
- Dashboard screenshots showing the P&L visualization
- Include these in README or separate docs/ folder

---

## Deliverables Checklist

Ensure these files exist and are complete:

**Code:**

- [ ] `packages/database/src/schema.ts` - Complete Drizzle schema
- [ ] `packages/database/src/client.ts` - Database client
- [ ] `packages/billing/src/billing.ts` - Three required functions
- [ ] `packages/billing/src/seed.ts` - Data seeding script
- [ ] `apps/api/src/index.ts` - Elysia.js server with routes
- [ ] `apps/web/src/components/GaragePLDashboard.tsx` - Dashboard component

**DBT/Snowflake:**

- [ ] `packages/snowflake-dbt/models/staging/*.sql` - Staging models
- [ ] `packages/snowflake-dbt/models/marts/*.sql` - Dimensional models
- [ ] `packages/snowflake-dbt/models/reports/rpt_garage_monthly_pl.sql` - CRITICAL P&L report
- [ ] `packages/snowflake-dbt/dbt_project.yml` - DBT configuration

**Documentation:**

- [ ] `docs/architecture.md` - System architecture
- [ ] `docs/reporting.md` - Complete warehouse design (MOST IMPORTANT)
- [ ] `docs/billing-lifecycle.md` - Subscription lifecycle flows
- [ ] `README.md` - Setup, decisions, and reasoning

---

## Key Points to Emphasize

### In Your Code:

1. **Type Safety** - Use Drizzle's inferred types everywhere, no `any` types
2. **Stripe Integration** - Use real Stripe SDK patterns (test mode)
3. **Multi-Tenant** - Always include garage_id in queries and indexes
4. **Error Handling** - Proper try/catch and meaningful error messages

### In Your Documentation:

1. **Automated P&L Report** - They explicitly asked for this, explain in detail
2. **Multi-Tenant Security** - Show you understand row-level access control
3. **Cost Awareness** - Include cost analysis and optimization strategies
4. **Scalability** - Explain how design handles growth (clustering, incremental loads)
5. **Type Safety** - Emphasize TypeScript throughout the entire stack

### In Your Design:

1. **Stripe Connect** - Each garage = Connected Account (platform/marketplace pattern)
2. **Star Schema** - Proper dimensional modeling in Snowflake
3. **DBT Layers** - Raw → Staging → Marts → Reports
4. **Incremental Models** - Cost-effective data processing

---

## Success Metrics

Your assessment will be evaluated on:

**Architecture Quality (40%):**

- Clean separation of concerns
- Type-safe at every layer
- Production-ready patterns
- Scalable design

**Data Warehouse Design (30%):**

- Proper dimensional modeling
- DBT best practices
- Automated P&L report (critical!)
- Multi-tenant access control

**Code Quality (20%):**

- TypeScript mastery
- Clean, readable code
- Proper error handling
- Good abstractions

**Product Thinking (10%):**

- Understands business problem
- Professional UI
- Cost-conscious decisions
- Practical trade-offs

---

## Final Tips

1. **Start with documentation** - Sketch out your architecture first
2. **Prioritize the P&L report** - It's explicitly mentioned in job description
3. **Mock when appropriate** - Don't need live Snowflake, mock the report output
4. **Show your thinking** - Document WHY, not just WHAT
5. **Keep it simple** - 5 hours is tight, focus on quality over completeness
6. **Make it visual** - The dashboard should look professional
7. **Be production-minded** - Show you think about cost, scale, security

Good luck! 🚀
