import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../api/client';

interface DashboardProps {
  garageId: string;
}

// Real garage IDs from database (ordered by name)
const getGarageIdFromIndex = (index: string): string => {
  const garageIds = [
    '51d23992-8854-44ae-ab81-0eec7c154cf0', // Airport Long-term Parking
    '6dc6893d-6d59-47ba-a1fe-3a4918f3bb00', // Downtown Parking Garage
    'de6bcc95-9bd2-443e-a889-e6e2add7969f', // Financial District Garage
  ];
  return garageIds[parseInt(index)] || garageIds[0];
};

export function Dashboard({ garageId }: DashboardProps) {
  const actualGarageId = getGarageIdFromIndex(garageId);

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics', actualGarageId],
    queryFn: () => apiClient.getGarageMetrics(actualGarageId),
  });

  const { data: plData, isLoading: plLoading } = useQuery({
    queryKey: ['pl', actualGarageId],
    queryFn: () => apiClient.getGaragePL(actualGarageId),
  });

  if (metricsLoading || plLoading) {
    return <div className="loading">Loading dashboard data...</div>;
  }

  if (!metrics || !plData) {
    return <div className="error">Failed to load dashboard data</div>;
  }

  // Format data for chart
  const chartData = [
    {
      name: 'Revenue',
      'Gross Revenue': plData.financials.totalRevenue,
      'Stripe Fees': plData.financials.totalFees,
      'Net Revenue': plData.financials.netRevenue,
    },
  ];

  return (
    <div className="dashboard">
      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card subscriptions">
          <div className="label">Active Subscriptions</div>
          <div className="value">{metrics.metrics.activeSubscriptions}</div>
        </div>

        <div className="metric-card revenue">
          <div className="label">Monthly Recurring Revenue</div>
          <div className="value">
            ${metrics.metrics.monthlyRecurringRevenue.toLocaleString()}
          </div>
        </div>

        <div className="metric-card">
          <div className="label">Current Month Payments</div>
          <div className="value">{metrics.metrics.currentMonthPayments}</div>
        </div>

        <div className="metric-card revenue">
          <div className="label">Current Month Revenue</div>
          <div className="value">
            ${metrics.metrics.currentMonthRevenue.toLocaleString()}
          </div>
        </div>
      </div>

      {/* P&L Chart */}
      <div className="chart-card">
        <h3>Profit & Loss Breakdown</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip
              formatter={(value: number) =>
                `$${value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              }
            />
            <Legend />
            <Bar dataKey="Gross Revenue" fill="#10b981" />
            <Bar dataKey="Stripe Fees" fill="#ef4444" />
            <Bar dataKey="Net Revenue" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Financial Summary */}
      <div className="chart-card">
        <h3>Financial Summary</h3>
        <div style={{ padding: '1rem 0' }}>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Period:</strong> {new Date(plData.period.startDate).toLocaleDateString()} -{' '}
            {new Date(plData.period.endDate).toLocaleDateString()}
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Total Gross Revenue:</strong> $
            {plData.financials.totalRevenue.toLocaleString()}
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Total Stripe Fees:</strong> $
            {plData.financials.totalFees.toLocaleString()}
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Total Net Revenue:</strong> $
            {plData.financials.netRevenue.toLocaleString()}
          </div>
          <div>
            <strong>Payment Count:</strong> {plData.financials.paymentCount}
          </div>
        </div>
      </div>
    </div>
  );
}

