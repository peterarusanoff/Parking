import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Car, CreditCard, DollarSign, PieChart as PieChartIcon, TrendingUp, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';

const CHART_COLORS = {
  primary: 'hsl(var(--chart-1))',
  secondary: 'hsl(var(--chart-2))',
  tertiary: 'hsl(var(--chart-3))',
  quaternary: 'hsl(var(--chart-4))',
};

export function AdminPage() {
  const [selectedGarageId, setSelectedGarageId] = useState<string | null>(null);

  // Initialize from hash param if provided
  useEffect(() => {
    const u = new URL(window.location.href.replace('#/admin', ''));
    const gid = u.searchParams.get('garageId');
    if (gid) setSelectedGarageId(gid);
  }, []);

  const { data: garages } = useQuery({
    queryKey: ['garages'],
    queryFn: () => apiClient.listGarages(),
  });

  useEffect(() => {
    if (!selectedGarageId && garages && garages.length > 0) {
      setSelectedGarageId(garages[0].id);
    }
  }, [garages, selectedGarageId]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data: metrics } = useQuery({
    queryKey: ['metrics', selectedGarageId],
    queryFn: () => apiClient.getGarageMetrics(selectedGarageId!),
    enabled: !!selectedGarageId,
  });

  const { data: pl } = useQuery({
    queryKey: ['pl', selectedGarageId],
    queryFn: () => apiClient.getGaragePL(selectedGarageId!),
    enabled: !!selectedGarageId,
  });

  const { data: occupancyToday } = useQuery({
    queryKey: ['occ-today', selectedGarageId, todayStr],
    queryFn: () => apiClient.getDailyOccupancy(selectedGarageId!, todayStr),
    enabled: !!selectedGarageId,
  });

  const { data: occCompare } = useQuery({
    queryKey: ['occ-compare', selectedGarageId, todayStr],
    queryFn: () => apiClient.getOccupancyComparison(selectedGarageId!),
    enabled: !!selectedGarageId,
  });

  const { data: garage } = useQuery({
    queryKey: ['garage', selectedGarageId],
    queryFn: () => apiClient.getGarage(selectedGarageId!),
    enabled: !!selectedGarageId,
  });

  const { data: activeParkedCount } = useQuery({
    queryKey: ['active-parked', selectedGarageId],
    queryFn: () => apiClient.getActiveParkedCount(selectedGarageId!),
    enabled: !!selectedGarageId,
  });

  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const todaySeries = (occupancyToday?.hourly || []).map((v, i) => ({
    hour: hours[i],
    occupancy: v,
  }));

  const compareSeries = hours.map((h, i) => ({
    hour: h,
    current:
      occCompare?.currentWeek?.[
        new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
      ]?.[i] || 0,
    avg: occCompare?.priorTwoWeekAvg?.[i] || 0,
  }));

  const subs = Number(metrics?.metrics.activeSubscriptions || 0);
  const capacity = Number(
    (garage as any)?.capacity || (garage && (garage as any).capacity) || 0
  );
  const subsDonutData = [
    { name: 'Subscribed', value: subs },
    { name: 'Available', value: Math.max(0, capacity - subs) },
  ];

  const isLoading = !metrics || !selectedGarageId;

  return (
    <div className="dashboard space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Garage Admin Dashboard</h2>
          <p className="text-muted-foreground mt-1">Monitor performance and analytics for your garage</p>
        </div>
        <Button variant="outline" asChild>
          <a href="#/global" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Global
          </a>
        </Button>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Select Garage</CardTitle>
          <CardDescription>Choose a garage to view its detailed metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedGarageId || ''}
            onChange={(e) => setSelectedGarageId(e.target.value)}
          >
            <option value="">Select a garage...</option>
            {garages?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {metrics?.metrics.activeSubscriptions ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Current subscribers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MRR</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">
                  ${(metrics?.metrics.monthlyRecurringRevenue || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Monthly recurring revenue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Payments This Month</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics?.metrics.currentMonthPayments ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">
                  ${(metrics?.metrics.currentMonthRevenue || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Current month total
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Today's Hourly Occupancy</CardTitle>
              <CardDescription>Real-time parking occupancy throughout the day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={todaySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="hour" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="occupancy"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Occupancy Comparison</CardTitle>
              <CardDescription>Today's occupancy vs 2-week average</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={compareSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="hour" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name="Today"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    name="2-Week Avg"
                    stroke={CHART_COLORS.secondary}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>P&L Summary</CardTitle>
                <CardDescription>Financial overview for the current period</CardDescription>
              </CardHeader>
              <CardContent>
                {pl ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">Total Gross Revenue</span>
                      <span className="font-semibold">${pl.financials.totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">Total Fees</span>
                      <span className="font-semibold text-destructive">
                        -${pl.financials.totalFees.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">Total Net Revenue</span>
                      <span className="font-bold text-emerald-500">
                        ${pl.financials.netRevenue.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-sm text-muted-foreground">Payment Count</span>
                      <span className="font-semibold">{pl.financials.paymentCount}</span>
                    </div>
                  </div>
                ) : (
                  <Skeleton className="h-48" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  Capacity Usage
                </CardTitle>
                <CardDescription>Current subscribers vs available capacity</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={subsDonutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                    >
                      <Cell fill={CHART_COLORS.primary} />
                      <Cell fill={CHART_COLORS.tertiary} />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Active Parked Vehicles
              </CardTitle>
              <CardDescription>Real-time parking status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col space-y-2 p-4 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Currently Parked</span>
                  <span className="text-3xl font-bold text-primary">{activeParkedCount ?? 0}</span>
                </div>
                <div className="flex flex-col space-y-2 p-4 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Total Capacity</span>
                  <span className="text-3xl font-bold">{capacity || 'N/A'}</span>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Occupancy Rate</span>
                  <span className="font-medium">
                    {capacity ? `${Math.round((activeParkedCount || 0) / capacity * 100)}%` : 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary rounded-full h-2 transition-all"
                    style={{ width: capacity ? `${Math.min((activeParkedCount || 0) / capacity * 100, 100)}%` : '0%' }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
