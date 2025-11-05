# Data Warehouse & Reporting Architecture

## Overview

This document outlines the complete data warehouse architecture using **Snowflake** and **DBT** for analytical reporting and business intelligence.

## Architecture Flow

```
PostgreSQL (OLTP)
    ↓
ETL Tool (Fivetran/Airbyte)
    ↓ Every 6 hours
Snowflake RAW Layer
    ↓
DBT Transformation
    ↓
┌─────────────────────────────────┐
│  STAGING → MARTS → REPORTS      │
└─────────────────────────────────┘
    ↓
BI Tools (Metabase, Looker, Tableau)
```

## Why Snowflake?

### Benefits

1. **Columnar Storage** - Optimized for analytical queries
2. **Compute-Storage Separation** - Scale independently
3. **Multi-tenant Security** - Row-level access policies
4. **Time Travel** - Query historical data (up to 90 days)
5. **Zero-copy Cloning** - Fast environment duplication
6. **Automatic Scaling** - Warehouse auto-suspend and resume

### Cost Efficiency

- Pay only for compute time used
- Automatic warehouse suspension after 5 minutes idle
- Clustering reduces data scanned
- Materialized views for frequently accessed data

## Snowflake Schema Design

### 1. RAW Layer (`raw` schema)

Mirror of PostgreSQL tables - no transformations, just landing zone.

```sql
-- RAW.USERS
CREATE TABLE raw.users (
    id VARCHAR(36) PRIMARY KEY,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ,
    _fivetran_synced TIMESTAMP_NTZ
);

-- RAW.GARAGES
CREATE TABLE raw.garages (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255),
    address VARCHAR(500),
    stripe_account_id VARCHAR(255),
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ,
    _fivetran_synced TIMESTAMP_NTZ
);

-- RAW.PASSES
CREATE TABLE raw.passes (
    id VARCHAR(36) PRIMARY KEY,
    garage_id VARCHAR(36),
    name VARCHAR(255),
    description VARCHAR(1000),
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    monthly_amount DECIMAL(10,2),
    active BOOLEAN,
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ,
    _fivetran_synced TIMESTAMP_NTZ
);

-- RAW.SUBSCRIPTIONS
CREATE TABLE raw.subscriptions (
    id VARCHAR(36) PRIMARY KEY,
    stripe_subscription_id VARCHAR(255),
    user_id VARCHAR(36),
    garage_id VARCHAR(36),
    pass_id VARCHAR(36),
    stripe_price_id VARCHAR(255),
    status VARCHAR(50),
    current_period_start TIMESTAMP_NTZ,
    current_period_end TIMESTAMP_NTZ,
    cancel_at_period_end BOOLEAN,
    canceled_at TIMESTAMP_NTZ,
    monthly_amount DECIMAL(10,2),
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ,
    _fivetran_synced TIMESTAMP_NTZ
);

-- RAW.PAYMENTS
CREATE TABLE raw.payments (
    id VARCHAR(36) PRIMARY KEY,
    stripe_payment_intent_id VARCHAR(255),
    subscription_id VARCHAR(36),
    garage_id VARCHAR(36),
    amount DECIMAL(10,2),
    stripe_fee DECIMAL(10,2),
    net_amount DECIMAL(10,2),
    status VARCHAR(50),
    currency VARCHAR(3),
    payment_date TIMESTAMP_NTZ,
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ,
    _fivetran_synced TIMESTAMP_NTZ
);
```

### 2. STAGING Layer (`staging` schema)

Clean and type-cast raw data.

```sql
-- STAGING.STG_USERS
CREATE VIEW staging.stg_users AS
SELECT
    id AS user_id,
    TRIM(first_name) AS first_name,
    TRIM(last_name) AS last_name,
    LOWER(TRIM(email)) AS email,
    phone,
    stripe_customer_id,
    created_at,
    updated_at
FROM raw.users
WHERE id IS NOT NULL;

-- STAGING.STG_GARAGES
CREATE VIEW staging.stg_garages AS
SELECT
    id AS garage_id,
    TRIM(name) AS garage_name,
    TRIM(address) AS garage_address,
    stripe_account_id,
    created_at,
    updated_at
FROM raw.garages
WHERE id IS NOT NULL;

-- STAGING.STG_SUBSCRIPTIONS
CREATE VIEW staging.stg_subscriptions AS
SELECT
    id AS subscription_id,
    stripe_subscription_id,
    user_id,
    garage_id,
    pass_id,
    LOWER(TRIM(status)) AS status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    monthly_amount,
    created_at,
    updated_at
FROM raw.subscriptions
WHERE id IS NOT NULL
  AND status IS NOT NULL;

-- STAGING.STG_PAYMENTS
CREATE VIEW staging.stg_payments AS
SELECT
    id AS payment_id,
    stripe_payment_intent_id,
    subscription_id,
    garage_id,
    amount,
    stripe_fee,
    net_amount,
    LOWER(TRIM(status)) AS status,
    LOWER(TRIM(currency)) AS currency,
    payment_date,
    created_at
FROM raw.payments
WHERE id IS NOT NULL
  AND status = 'succeeded';  -- Only successful payments
```

### 3. MARTS Layer (`marts` schema)

Dimensional model (star schema).

```sql
-- MARTS.DIM_GARAGES
CREATE TABLE marts.dim_garages 
CLUSTER BY (garage_id)
AS
SELECT
    garage_id,
    garage_name,
    garage_address,
    stripe_account_id,
    created_at AS garage_created_at
FROM staging.stg_garages;

-- MARTS.DIM_USERS
CREATE TABLE marts.dim_users
CLUSTER BY (user_id)
AS
SELECT
    user_id,
    first_name,
    last_name,
    email,
    phone,
    stripe_customer_id,
    created_at AS user_created_at
FROM staging.stg_users;

-- MARTS.DIM_PASSES
CREATE TABLE marts.dim_passes
CLUSTER BY (garage_id, pass_id)
AS
SELECT
    p.pass_id,
    p.garage_id,
    g.garage_name,
    p.pass_name,
    p.description,
    p.monthly_amount,
    p.active,
    p.created_at
FROM staging.stg_passes p
LEFT JOIN marts.dim_garages g ON p.garage_id = g.garage_id;

-- MARTS.DIM_DATE
CREATE TABLE marts.dim_date AS
WITH date_range AS (
    SELECT 
        DATEADD(day, SEQ4(), '2020-01-01'::DATE) AS date_day
    FROM TABLE(GENERATOR(ROWCOUNT => 3650))  -- 10 years
)
SELECT
    date_day,
    YEAR(date_day) AS year,
    QUARTER(date_day) AS quarter,
    MONTH(date_day) AS month,
    MONTHNAME(date_day) AS month_name,
    DAY(date_day) AS day,
    DAYNAME(date_day) AS day_name,
    DAYOFWEEK(date_day) AS day_of_week,
    WEEK(date_day) AS week_of_year,
    DATE_TRUNC('month', date_day) AS first_day_of_month,
    LAST_DAY(date_day) AS last_day_of_month
FROM date_range;

-- MARTS.FACT_SUBSCRIPTIONS
CREATE TABLE marts.fact_subscriptions
CLUSTER BY (garage_id, subscription_start_date)
AS
SELECT
    s.subscription_id,
    s.stripe_subscription_id,
    s.user_id,
    s.garage_id,
    s.pass_id,
    s.status,
    s.monthly_amount,
    s.current_period_start AS subscription_start_date,
    s.current_period_end AS subscription_end_date,
    s.canceled_at,
    s.cancel_at_period_end,
    DATE_TRUNC('month', s.created_at) AS subscription_month,
    u.first_name,
    u.last_name,
    u.email,
    g.garage_name,
    p.pass_name
FROM staging.stg_subscriptions s
LEFT JOIN marts.dim_users u ON s.user_id = u.user_id
LEFT JOIN marts.dim_garages g ON s.garage_id = g.garage_id
LEFT JOIN marts.dim_passes p ON s.pass_id = p.pass_id;

-- MARTS.FACT_PAYMENTS
CREATE TABLE marts.fact_payments
CLUSTER BY (garage_id, payment_month)
AS
SELECT
    p.payment_id,
    p.stripe_payment_intent_id,
    p.subscription_id,
    p.garage_id,
    p.amount AS gross_amount,
    p.stripe_fee,
    p.net_amount,
    p.amount * 0.10 AS platform_fee,  -- 10% to Vend
    p.net_amount - (p.amount * 0.10) AS garage_profit,
    p.currency,
    p.payment_date,
    DATE_TRUNC('month', p.payment_date) AS payment_month,
    DATE_TRUNC('year', p.payment_date) AS payment_year,
    g.garage_name,
    s.user_id,
    u.email AS user_email
FROM staging.stg_payments p
LEFT JOIN marts.dim_garages g ON p.garage_id = g.garage_id
LEFT JOIN marts.fact_subscriptions s ON p.subscription_id = s.subscription_id
LEFT JOIN marts.dim_users u ON s.user_id = u.user_id;
```

### 4. REPORTS Layer (`reports` schema)

Pre-aggregated reports for dashboards.

```sql
-- REPORTS.RPT_GARAGE_MONTHLY_PL ⭐ CRITICAL REPORT
CREATE TABLE reports.rpt_garage_monthly_pl
CLUSTER BY (garage_id, month_date)
AS
WITH monthly_payments AS (
    SELECT
        garage_id,
        payment_month AS month_date,
        COUNT(DISTINCT payment_id) AS payment_count,
        SUM(gross_amount) AS gross_revenue,
        SUM(stripe_fee) AS total_stripe_fees,
        SUM(platform_fee) AS total_platform_fees,
        SUM(garage_profit) AS garage_profit
    FROM marts.fact_payments
    WHERE payment_date >= DATEADD(year, -2, CURRENT_DATE())
    GROUP BY garage_id, payment_month
),
monthly_subscriptions AS (
    SELECT
        garage_id,
        subscription_month AS month_date,
        COUNT(DISTINCT subscription_id) AS subscription_count,
        COUNT(DISTINCT user_id) AS unique_customers
    FROM marts.fact_subscriptions
    WHERE status = 'active'
    GROUP BY garage_id, subscription_month
)
SELECT
    g.garage_id,
    g.garage_name,
    COALESCE(p.month_date, s.month_date) AS month,
    TO_CHAR(COALESCE(p.month_date, s.month_date), 'YYYY-MM') AS month_key,
    COALESCE(p.gross_revenue, 0) AS gross_revenue,
    COALESCE(p.total_stripe_fees, 0) AS total_stripe_fees,
    COALESCE(p.total_platform_fees, 0) AS total_platform_fees,
    COALESCE(p.garage_profit, 0) AS garage_profit,
    COALESCE(s.subscription_count, 0) AS subscription_count,
    COALESCE(s.unique_customers, 0) AS unique_customers,
    CASE 
        WHEN s.unique_customers > 0 
        THEN p.gross_revenue / s.unique_customers 
        ELSE 0 
    END AS arpu,  -- Average Revenue Per User
    CASE 
        WHEN s.subscription_count > 0 
        THEN p.gross_revenue / s.subscription_count 
        ELSE 0 
    END AS revenue_per_subscription,
    -- Month-over-month growth
    LAG(p.gross_revenue) OVER (
        PARTITION BY g.garage_id 
        ORDER BY COALESCE(p.month_date, s.month_date)
    ) AS previous_month_revenue,
    CASE 
        WHEN LAG(p.gross_revenue) OVER (
            PARTITION BY g.garage_id 
            ORDER BY COALESCE(p.month_date, s.month_date)
        ) > 0
        THEN ((p.gross_revenue - LAG(p.gross_revenue) OVER (
            PARTITION BY g.garage_id 
            ORDER BY COALESCE(p.month_date, s.month_date)
        )) / LAG(p.gross_revenue) OVER (
            PARTITION BY g.garage_id 
            ORDER BY COALESCE(p.month_date, s.month_date)
        )) * 100
        ELSE 0
    END AS revenue_growth_pct
FROM marts.dim_garages g
LEFT JOIN monthly_payments p ON g.garage_id = p.garage_id
LEFT JOIN monthly_subscriptions s ON g.garage_id = s.garage_id 
    AND p.month_date = s.month_date
WHERE COALESCE(p.month_date, s.month_date) IS NOT NULL
ORDER BY g.garage_id, month DESC;

-- REPORTS.RPT_EXECUTIVE_DASHBOARD
CREATE TABLE reports.rpt_executive_dashboard AS
SELECT
    month,
    month_key,
    COUNT(DISTINCT garage_id) AS active_garages,
    SUM(gross_revenue) AS total_gross_revenue,
    SUM(total_stripe_fees) AS total_stripe_fees,
    SUM(total_platform_fees) AS total_platform_fees,
    SUM(garage_profit) AS total_garage_profit,
    SUM(subscription_count) AS total_subscriptions,
    SUM(unique_customers) AS total_customers,
    AVG(arpu) AS avg_arpu,
    SUM(gross_revenue) / NULLIF(SUM(unique_customers), 0) AS revenue_per_customer
FROM reports.rpt_garage_monthly_pl
GROUP BY month, month_key
ORDER BY month DESC;

-- REPORTS.RPT_SUBSCRIPTION_LIFECYCLE
CREATE TABLE reports.rpt_subscription_lifecycle AS
SELECT
    garage_id,
    DATE_TRUNC('month', subscription_start_date) AS cohort_month,
    COUNT(*) AS cohort_size,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
    SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS canceled_count,
    SUM(CASE WHEN status = 'past_due' THEN 1 ELSE 0 END) AS past_due_count,
    AVG(monthly_amount) AS avg_subscription_value,
    AVG(DATEDIFF(day, subscription_start_date, 
        COALESCE(canceled_at, CURRENT_DATE()))) AS avg_lifetime_days
FROM marts.fact_subscriptions
GROUP BY garage_id, cohort_month
ORDER BY garage_id, cohort_month;
```

## DBT Project Structure

```
packages/snowflake-dbt/
├── dbt_project.yml
├── models/
│   ├── staging/
│   │   ├── _staging.yml
│   │   ├── stg_users.sql
│   │   ├── stg_garages.sql
│   │   ├── stg_passes.sql
│   │   ├── stg_subscriptions.sql
│   │   └── stg_payments.sql
│   ├── intermediate/
│   │   ├── _intermediate.yml
│   │   ├── int_active_subscriptions.sql
│   │   └── int_subscription_lifecycle.sql
│   ├── marts/
│   │   ├── _marts.yml
│   │   ├── dim_garages.sql
│   │   ├── dim_users.sql
│   │   ├── dim_passes.sql
│   │   ├── dim_date.sql
│   │   ├── fact_subscriptions.sql
│   │   └── fact_payments.sql
│   └── reports/
│       ├── _reports.yml
│       ├── rpt_garage_monthly_pl.sql
│       ├── rpt_executive_dashboard.sql
│       └── rpt_subscription_lifecycle.sql
├── macros/
│   └── currency_conversion.sql
└── tests/
    └── assert_positive_revenue.sql
```

### DBT Configuration

```yaml
# dbt_project.yml
name: 'vend_analytics'
version: '1.0.0'
config-version: 2

profile: 'vend_snowflake'

model-paths: ["models"]
test-paths: ["tests"]
macro-paths: ["macros"]

models:
  vend_analytics:
    staging:
      +materialized: view
      +schema: staging
    
    intermediate:
      +materialized: view
      +schema: intermediate
    
    marts:
      +materialized: table
      +schema: marts
      dim_:
        +materialized: table
      fact_:
        +materialized: incremental
        +unique_key: id
        +on_schema_change: append_new_columns
        +cluster_by: ['garage_id']
    
    reports:
      +materialized: table
      +schema: reports
      +cluster_by: ['garage_id', 'month']
```

## Multi-Tenant Access Control

### Row Access Policies

```sql
-- Create role hierarchy
CREATE ROLE vend_admin;
CREATE ROLE garage_admin;
CREATE ROLE garage_viewer;

-- Row access policy for garage data
CREATE ROW ACCESS POLICY garage_access_policy AS (garage_id VARCHAR)
RETURNS BOOLEAN ->
  CASE
    -- Vend admins see everything
    WHEN CURRENT_ROLE() = 'VEND_ADMIN' THEN TRUE
    -- Garage admins see only their garage
    WHEN CURRENT_ROLE() = 'GARAGE_ADMIN' 
      AND garage_id = CURRENT_USER_GARAGE_ID() THEN TRUE
    ELSE FALSE
  END;

-- Apply policy to sensitive tables
ALTER TABLE reports.rpt_garage_monthly_pl
ADD ROW ACCESS POLICY garage_access_policy ON (garage_id);

ALTER TABLE marts.fact_payments
ADD ROW ACCESS POLICY garage_access_policy ON (garage_id);
```

### Secure Views

```sql
-- Create secure view for garage-specific data
CREATE SECURE VIEW reports.vw_my_garage_pl AS
SELECT *
FROM reports.rpt_garage_monthly_pl
WHERE garage_id = CURRENT_USER_GARAGE_ID();

-- Grant access to garage viewers
GRANT SELECT ON reports.vw_my_garage_pl TO ROLE garage_viewer;
```

## ETL Strategy

### Fivetran Configuration

```yaml
connector: postgres
host: vend-db.xxxxx.us-west-2.rds.amazonaws.com
port: 5432
database: vend_assessment
user: fivetran_user
schema: public

destination:
  warehouse: VEND_WH
  schema: RAW

sync_frequency: every_6_hours
selected_tables:
  - users
  - garages
  - passes
  - subscriptions
  - payments

# Incremental sync on updated_at
incremental_columns:
  - updated_at
```

### Alternative: Airbyte (Open Source)

```yaml
source:
  type: postgres
  host: vend-db.xxxxx.us-west-2.rds.amazonaws.com
  port: 5432
  database: vend_assessment
  schemas: [public]
  ssl: true

destination:
  type: snowflake
  host: vendaccount.snowflakecomputing.com
  role: ACCOUNTADMIN
  warehouse: VEND_WH
  database: VEND_ANALYTICS
  schema: RAW

schedule:
  type: cron
  cron_expression: "0 */6 * * *"  # Every 6 hours
```

## Performance Optimization

### 1. Clustering

```sql
-- Cluster frequently queried tables
ALTER TABLE marts.fact_payments 
CLUSTER BY (garage_id, payment_month);

ALTER TABLE reports.rpt_garage_monthly_pl 
CLUSTER BY (garage_id, month);
```

### 2. Materialized Views

```sql
-- For frequently accessed aggregations
CREATE MATERIALIZED VIEW reports.mv_daily_revenue AS
SELECT
    DATE(payment_date) AS date,
    garage_id,
    SUM(gross_amount) AS daily_revenue
FROM marts.fact_payments
GROUP BY DATE(payment_date), garage_id;
```

### 3. Incremental Models

```sql
-- DBT incremental model for payments
{{ config(
    materialized='incremental',
    unique_key='payment_id',
    cluster_by=['garage_id', 'payment_month']
) }}

SELECT *
FROM staging.stg_payments
{% if is_incremental() %}
WHERE payment_date > (SELECT MAX(payment_date) FROM {{ this }})
{% endif %}
```

## Cost Optimization

### Warehouse Sizing

```sql
-- Create warehouses for different workloads
CREATE WAREHOUSE ETL_WH
  WAREHOUSE_SIZE = 'MEDIUM'
  AUTO_SUSPEND = 300  -- 5 minutes
  AUTO_RESUME = TRUE;

CREATE WAREHOUSE DBT_WH
  WAREHOUSE_SIZE = 'SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;

CREATE WAREHOUSE BI_WH
  WAREHOUSE_SIZE = 'X-SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;
```

### Query Optimization

1. **Use clustering** for large tables
2. **Partition** by date for time-series data
3. **Avoid SELECT \*** - select only needed columns
4. **Use result caching** - identical queries return cached results
5. **Compress** data with Snowflake native compression

## Monitoring & Alerts

### Key Metrics

```sql
-- Query performance
SELECT
    query_id,
    query_text,
    warehouse_name,
    execution_time,
    bytes_scanned
FROM snowflake.account_usage.query_history
WHERE execution_time > 60000  -- Queries over 1 minute
ORDER BY execution_time DESC;

-- Credit usage
SELECT
    warehouse_name,
    SUM(credits_used) AS total_credits
FROM snowflake.account_usage.warehouse_metering_history
WHERE start_time >= DATEADD(day, -7, CURRENT_DATE())
GROUP BY warehouse_name;

-- Data freshness
SELECT
    table_schema,
    table_name,
    MAX(_fivetran_synced) AS last_sync
FROM raw.information_schema.columns
WHERE column_name = '_fivetran_synced'
GROUP BY table_schema, table_name;
```

## Sample Queries

### Get P&L for specific garage

```sql
SELECT
    month,
    gross_revenue,
    total_stripe_fees,
    total_platform_fees,
    garage_profit,
    subscription_count,
    unique_customers,
    arpu,
    revenue_growth_pct
FROM reports.rpt_garage_monthly_pl
WHERE garage_id = 'xxx-xxx-xxx'
  AND month >= DATEADD(month, -6, CURRENT_DATE())
ORDER BY month DESC;
```

### Top performing garages

```sql
SELECT
    garage_name,
    SUM(gross_revenue) AS total_revenue,
    AVG(subscription_count) AS avg_subscriptions,
    AVG(arpu) AS avg_arpu
FROM reports.rpt_garage_monthly_pl
WHERE month >= DATEADD(month, -3, CURRENT_DATE())
GROUP BY garage_name
ORDER BY total_revenue DESC
LIMIT 10;
```

## Conclusion

This architecture provides:

✅ **Scalability** - Handle millions of transactions  
✅ **Performance** - Sub-second query response times  
✅ **Cost Efficiency** - Pay only for what you use  
✅ **Multi-tenant Security** - Row-level data isolation  
✅ **Data Quality** - DBT tests and documentation  
✅ **Business Insights** - Pre-built dashboards and reports

**Estimated Cost**: $500-800/month for small to medium scale operations.

