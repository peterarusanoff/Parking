# Quick Setup Guide

Get up and running in 5 minutes!

## Prerequisites

Ensure you have these installed:

- ✅ **Bun** >= 1.0.0 - [Install Bun](https://bun.sh)
- ✅ **Docker** - [Install Docker](https://www.docker.com/get-started)
- ✅ **Stripe Account** - [Sign up for Stripe](https://dashboard.stripe.com/register)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
bun install
```

This will install all dependencies across all workspaces in the monorepo.

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://vend:vend_dev_pass@localhost:5432/vend_assessment

# Stripe (Get from https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# API
PORT=3000
NODE_ENV=development
```

**To get Stripe test keys:**

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your "Secret key" (starts with `sk_test_`)
3. Copy your "Publishable key" (starts with `pk_test_`)

### 3. Start PostgreSQL

```bash
docker-compose up -d
```

Verify it's running:

```bash
docker ps
```

You should see a container named `vend-postgres` running.

### 4. Generate and Run Migrations

```bash
# Generate migration files from schema
bun run db:generate

# Apply migrations to database
bun run db:migrate
```

This creates all the necessary tables in PostgreSQL.

### 5. Seed the Database

```bash
bun run seed
```

This will:

- Create 3 garages
- Create 9 parking passes (3 per garage)
- Create 20 users
- Create 20 subscriptions (distributed across garages)
- Set up data in Stripe test mode

**Expected output:**

```
🌱 Starting seed process...

1️⃣ Creating garages...
  ✓ Created garage: Downtown Parking Garage
  ✓ Created garage: Airport Long-term Parking
  ✓ Created garage: Financial District Garage

2️⃣ Creating passes...
  ✓ Created pass: Downtown Parking Garage - Basic Monthly ($150/mo)
  ...

3️⃣ Creating users...
  ✓ Created user: John Doe
  ...

4️⃣ Subscribing users to passes...
  ✓ Subscribed John Doe to Downtown Parking Garage - Basic Monthly
  ...

✅ Seed complete!
  - Garages: 3
  - Passes: 9
  - Users: 20
  - Subscriptions: 20
```

### 6. Start the Development Server

```bash
bun run dev
```

**Expected output:**

```
🦊 Vend Parking API is running!

  📍 Server:       http://localhost:3000
  📚 Swagger:      http://localhost:3000/swagger
  🏥 Health:       http://localhost:3000/health

  Environment:     development
  Process ID:      12345
```

### 7. Test the API

**Option A: Open Swagger UI**

Navigate to http://localhost:3000/swagger in your browser. You'll see interactive API documentation where you can test all endpoints.

**Option B: Use curl**

```bash
# Health check
curl http://localhost:3000/health

# Get revenue report
curl http://localhost:3000/api/billing/report
```

## Verification Checklist

- [ ] Dependencies installed successfully
- [ ] PostgreSQL container running
- [ ] Migrations applied
- [ ] Database seeded with test data
- [ ] API server running
- [ ] Swagger UI accessible
- [ ] Health endpoint returns 200 OK

## Common Issues

### Issue: "Connection refused" when accessing database

**Solution:**

```bash
# Check if PostgreSQL is running
docker ps

# If not running, start it
docker-compose up -d

# Check logs
docker logs vend-postgres
```

### Issue: "STRIPE_SECRET_KEY is required"

**Solution:**
Make sure you've created a `.env` file in the root directory with your Stripe test keys.

### Issue: Seed script fails with "User already exists"

**Solution:**
The seed script is idempotent. If data already exists, it will skip creating duplicates. This is normal behavior.

To start fresh:

```bash
# Stop and remove containers
docker-compose down -v

# Start fresh
docker-compose up -d
bun run db:migrate
bun run seed
```

### Issue: "Cannot find module '@vend/database'"

**Solution:**
Make sure you've run `bun install` from the root directory. Turborepo needs to build the workspace dependencies.

## Next Steps

### Explore the API

1. **Try creating a new pass:**

   ```bash
   curl -X POST http://localhost:3000/api/billing/pass \
     -H "Content-Type: application/json" \
     -d '{
       "passId": "550e8400-e29b-41d4-a716-446655440000",
       "garageId": "<garage-id-from-database>",
       "name": "VIP Monthly Pass",
       "description": "Premium features included",
       "monthlyPrice": 350
     }'
   ```

2. **Check revenue report:**

   ```bash
   curl http://localhost:3000/api/billing/report | jq
   ```

3. **View in Stripe Dashboard:**
   - Go to https://dashboard.stripe.com/test/customers
   - See your test customers, subscriptions, and products

### Explore the Database

**Option 1: Drizzle Studio (Recommended)**

```bash
bun run db:studio
```

Opens a web-based database browser at http://localhost:4983

**Option 2: psql**

```bash
docker exec -it vend-postgres psql -U vend -d vend_assessment
```

Example queries:

```sql
-- See all garages
SELECT * FROM garages;

-- See active subscriptions by garage
SELECT
  g.name,
  COUNT(*) as subscriptions,
  SUM(s.monthly_amount) as monthly_revenue
FROM subscriptions s
JOIN garages g ON s.garage_id = g.id
WHERE s.status = 'active'
GROUP BY g.name;
```

### Build for Production

**Standard build:**

```bash
bun run build
bun run start
```

**Compile to binary:**

```bash
bun run build:binary
./vend-api
```

**Multi-core cluster mode:**

```bash
bun run build:cluster
./vend-cluster
```

## Development Workflow

### Running Tests (Future)

```bash
bun test
```

### Linting and Formatting

```bash
# Check formatting
bun run format:check

# Fix formatting
bun run format

# Run linter
bun run lint

# Type checking
bun run typecheck
```

### Working with Database

```bash
# Make changes to src/schema.ts, then:
bun run db:generate   # Generate migration
bun run db:migrate    # Apply migration
bun run db:studio     # View data
```

## Architecture Overview

```
VendPark/
├── apps/
│   └── api/              # ElysiaJS API server
│       ├── src/
│       │   ├── index.ts       # Main app with routes
│       │   └── cluster.ts     # Multi-core support
│       └── package.json
│
├── packages/
│   ├── database/        # Drizzle ORM + PostgreSQL
│   │   ├── src/
│   │   │   ├── schema.ts     # Database schema
│   │   │   ├── client.ts     # DB connection
│   │   │   └── index.ts
│   │   └── drizzle.config.ts
│   │
│   ├── billing/         # Stripe integration
│   │   ├── src/
│   │   │   ├── billing.ts    # Core functions
│   │   │   ├── stripe-client.ts
│   │   │   └── seed.ts
│   │   └── package.json
│   │
│   └── shared/          # Shared types
│       └── src/
│           └── index.ts
│
├── docs/                # Documentation
│   ├── architecture.md
│   ├── reporting.md
│   └── billing-lifecycle.md
│
├── docker-compose.yml   # PostgreSQL container
├── turbo.json          # Turborepo config
└── package.json        # Root workspace
```

## Key Technologies

- **ElysiaJS** - Ultra-fast web framework with built-in OpenAPI
- **Drizzle ORM** - Type-safe SQL ORM
- **PostgreSQL** - Robust relational database
- **Stripe** - Payment processing
- **Bun** - Fast JavaScript runtime
- **Turborepo** - High-performance monorepo tool
- **TypeScript** - Maximum type safety

## Resources

- 📖 [Full README](./README.md)
- 🏗️ [Architecture Documentation](./docs/architecture.md)
- 📊 [Reporting & Data Warehouse](./docs/reporting.md)
- 💳 [Billing Lifecycle](./docs/billing-lifecycle.md)
- 🦊 [ElysiaJS Docs](https://elysiajs.com)
- 🐉 [Drizzle ORM Docs](https://orm.drizzle.team)
- 💳 [Stripe API Docs](https://stripe.com/docs/api)

## Need Help?

If you encounter any issues:

1. Check the [Common Issues](#common-issues) section above
2. Review the logs: `docker logs vend-postgres`
3. Open an issue on GitHub

---

**Ready to build amazing parking subscription features! 🚀**
