# Part 4: Data Warehouse & Reporting Design - Breakdown

## 📋 Overview

Part 4 asks you to design a data warehouse and reporting system that serves two distinct audiences:
- **Vend Leadership** (Global admins) - Need system-wide insights
- **Garage Admins** - Need garage-specific insights only

## 🎯 Core Questions to Answer

### 1. **Data Warehouse Schema Design**
   - What fact and dimension tables do you need?
   - How do you structure the data for efficient querying?
   - What's the star schema or snowflake schema?

### 2. **Access Control Strategy**
   - How do garage admins only see their data?
   - How do super admins see everything?
   - What security mechanisms ensure data isolation?

### 3. **Data Freshness**
   - How often does data sync from operational DB to warehouse?
   - Which reports need real-time data?
   - Which reports can tolerate delay?

### 4. **Data Flow Architecture**
   - How does data move from source → warehouse → dashboard?
   - What ETL tools are used?
   - What transformations happen where?

### 5. **Report & Dashboard Design**
   - What KPIs matter most to leadership?
   - What KPIs matter most to garage admins?
   - What visualizations best represent this data?

---

## 🔍 Step-by-Step Approach

### Step 1: Identify Your Data Sources
**Current Database Tables:**
- `users` - User profiles and Stripe customer IDs
- `garages` - Garage locations and Stripe account IDs
- `passes` - Monthly pass products with pricing
- `subscriptions` - Active, canceled, past_due subscriptions
- `payments` - Successful payment records with fees
- `pass_price_history` - Audit trail of price changes
- `garage_admins` - RBAC mappings
- `parked` - Entry/exit events for occupancy tracking
- `garage_daily_occupancy` - Pre-aggregated hourly occupancy

### Step 2: Define Your Fact Tables
**Facts** are measurable events that happened:
- **Fact: Payments** - Revenue, fees, net amounts
- **Fact: Subscriptions** - Subscription lifecycle events
- **Fact: Parking Events** - Entry/exit occupancy data

### Step 3: Define Your Dimension Tables
**Dimensions** provide context about facts:
- **Dim: Date** - Calendar dimensions (day, month, quarter, year)
- **Dim: Users** - Customer demographics
- **Dim: Garages** - Location and capacity info
- **Dim: Passes** - Product catalog
- **Dim: Time** - Hourly time dimensions for occupancy

### Step 4: Design Access Control
**Multi-Tenant Strategy:**
- All queries filter by `garage_id`
- Row-level security policies in database
- API middleware enforces user role checks
- Snowflake secure views for external analytics

### Step 5: Determine Data Freshness Requirements
**Real-time (Postgres) - <1 min latency:**
- Current active subscriptions
- Today's revenue
- Current occupancy levels
- Recent payment failures

**Near-real-time (Postgres Materialized Views) - <5 min latency:**
- Last 30 days revenue trends
- Last 7 days subscription changes
- Current month P&L

**Batch/Historical (Snowflake) - 6 hour latency:**
- Year-over-year comparisons
- Cohort analysis
- Long-term trend analysis
- Executive dashboards

### Step 6: Design Your Reports

#### **For Garage Admins:**
1. **Monthly P&L Statement**
   - Gross revenue
   - Stripe fees
   - Platform fees
   - Net profit
   - Active subscribers

2. **Subscription Health Dashboard**
   - Active subscriptions
   - Cancellations this month
   - Churn rate
   - Average subscription value

3. **Occupancy Analytics**
   - Current occupancy vs capacity
   - Peak hours analysis
   - Utilization rate
   - Week-over-week trends

4. **Payment Monitoring**
   - Failed payments requiring attention
   - Successful payments this month
   - Revenue by pass type

#### **For Vend Leadership:**
1. **Executive Dashboard**
   - Total platform revenue
   - Revenue per garage
   - Total active subscriptions across all garages
   - Platform growth metrics (MoM, YoY)

2. **Garage Performance Ranking**
   - Top performing garages by revenue
   - Bottom performing garages
   - Average revenue per garage
   - Garage capacity utilization

3. **Financial Analytics**
   - Total platform fees collected
   - Stripe fees across platform
   - Net revenue trends
   - Revenue forecasting

4. **Customer Analytics**
   - Total unique customers
   - Average subscription lifetime
   - Churn analysis by garage
   - Customer acquisition cost

### Step 7: Choose Your Tech Stack

**Hot Path (Real-time):**
- PostgreSQL operational database
- PostgreSQL materialized views (refresh every 5 minutes)
- ElysiaJS API serving JSON
- React dashboards with real-time updates

**Cold Path (Historical):**
- Snowflake data warehouse
- Fivetran/Airbyte ETL (sync every 6 hours)
- DBT for transformations
- Pre-computed reports for fast access

---

## 💡 Key Design Principles

### 1. **Hybrid Architecture**
- Store recent/hot data in Postgres for fast access
- Archive old/cold data to Snowflake for cost efficiency
- Query Postgres for today, Snowflake for historical trends

### 2. **Pre-Aggregation**
- Don't scan millions of payment rows on every dashboard load
- Create summary tables: `monthly_garage_revenue`, `daily_subscription_counts`
- Refresh these tables on a schedule (nightly or hourly)

### 3. **Security by Design**
- Never trust the client - always validate user role in API
- Garage admins should NEVER see other garage's data
- Use database-level security policies as second layer

### 4. **Performance Optimization**
- Index all foreign keys (`garage_id`, `user_id`, `subscription_id`)
- Index date columns for time-range queries
- Use composite indexes for multi-column filters
- Cluster tables in Snowflake by `garage_id` and `date`

---

## 📊 Sample KPIs to Track

### Financial KPIs
- **MRR (Monthly Recurring Revenue)**: Sum of all active subscription amounts
- **ARPU (Average Revenue Per User)**: Total revenue / active users
- **Revenue Growth Rate**: (This month - Last month) / Last month × 100%
- **Platform Fee Revenue**: Total revenue × 10%

### Operational KPIs
- **Active Subscriptions**: Count of status='active'
- **Churn Rate**: (Canceled this month / Active start of month) × 100%
- **Payment Success Rate**: Succeeded payments / Total payment attempts × 100%
- **Subscription Renewal Rate**: (Renewals / Expirations) × 100%

### Usage KPIs
- **Average Occupancy Rate**: Current parked / Total capacity × 100%
- **Peak Hour Utilization**: Max hourly occupancy / Capacity
- **Average Visit Duration**: AVG(exited_at - entered_at)
- **Unique Visitors per Day**: DISTINCT user_id per day

---

## 🛠️ Implementation Checklist

- [ ] Define fact and dimension tables in Snowflake
- [ ] Create staging layer for data cleaning
- [ ] Create marts layer for business logic
- [ ] Create reports layer for pre-aggregated reports
- [ ] Set up Fivetran/Airbyte ETL pipeline
- [ ] Configure DBT models for transformations
- [ ] Create PostgreSQL materialized views for hot data
- [ ] Implement row-level security policies
- [ ] Build API endpoints for each report
- [ ] Create React dashboard components
- [ ] Add real-time refresh capabilities
- [ ] Implement caching strategy
- [ ] Set up monitoring and alerting
- [ ] Document all reports and KPIs

---

## 🎨 Visualization Recommendations

### Chart Types by Use Case

**Revenue Trends** → Line chart (time series)  
**Garage Comparison** → Bar chart (horizontal bars)  
**Subscription Distribution** → Pie/Donut chart  
**Occupancy Over Time** → Area chart  
**Payment Success Rate** → Gauge/Progress bar  
**Top Performers** → Leaderboard table  
**Churn Analysis** → Cohort retention heatmap  
**Daily Activity** → Heatmap (hour × day of week)

---

## 📝 Documentation Requirements

Your `reporting.md` should include:

1. **Architecture Overview** - High-level system design
2. **Data Flow Diagram** - Source → ETL → Warehouse → Dashboard
3. **ERD (Entity Relationship Diagram)** - Fact and dimension tables
4. **Schema Definitions** - SQL for all tables and views
5. **Access Control Strategy** - How multi-tenancy is enforced
6. **Report Catalog** - List of all reports with purpose and audience
7. **Sample Queries** - SQL examples for key reports
8. **Performance Optimization** - Indexing, clustering, caching
9. **Cost Analysis** - Estimated infrastructure costs
10. **Future Enhancements** - What you'd add with more time

---

## ✅ Success Criteria

Your design should demonstrate:

✅ **Clear separation** between operational DB and analytics warehouse  
✅ **Strong access control** for multi-tenant data isolation  
✅ **Performance optimization** through indexing and pre-aggregation  
✅ **Scalability** to handle millions of transactions  
✅ **Business insight** through well-chosen KPIs  
✅ **Visual clarity** in diagrams and documentation  
✅ **Practical implementation** with realistic tools and costs

---

## 💭 Design Trade-offs to Consider

### Real-time vs. Batch
- **Real-time**: Expensive, complex, but provides instant insights
- **Batch**: Cheaper, simpler, but data has latency

### Postgres vs. Snowflake
- **Postgres**: Fast for recent data, limited scalability
- **Snowflake**: Scales infinitely, but costs more and has latency

### Pre-aggregation vs. On-demand
- **Pre-aggregated**: Fast queries, but requires maintenance
- **On-demand**: Flexible, but can be slow for large datasets

### Star Schema vs. Snowflake Schema
- **Star**: Simpler, faster queries, some data duplication
- **Snowflake**: Normalized, saves space, more complex joins

---

## 🚀 Bonus Points

If you have extra time:
- Add machine learning predictions (churn prediction, revenue forecasting)
- Implement real-time CDC (Change Data Capture) with Kafka
- Add anomaly detection for unusual patterns
- Create mobile-optimized dashboards
- Add export functionality (PDF, Excel)
- Implement custom date range filters
- Add drill-down capabilities (click on metric → see details)
- Create email alerts for critical metrics

