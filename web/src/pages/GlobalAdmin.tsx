import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, CreditCard, DollarSign, TrendingUp, Users } from 'lucide-react';
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
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';

export function GlobalAdmin() {
  const { data: garages, isLoading: garagesLoading } = useQuery({
    queryKey: ['garages'],
    queryFn: () => apiClient.listGarages(),
  });

  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ['billingReport'],
    queryFn: () => apiClient.getBillingReport(),
  });

  const metricsQueries = useQueries({
    queries:
      garages?.map((g) => ({
        queryKey: ['metrics', g.id],
        queryFn: () => apiClient.getGarageMetrics(g.id),
      })) || [],
  });

  const loading = garagesLoading || billingLoading || metricsQueries.some((q) => q.isLoading);

  const totalMRR = metricsQueries.reduce((sum, q) => sum + Number(q.data?.metrics.monthlyRecurringRevenue || 0), 0);
  const totalSubs = metricsQueries.reduce((sum, q) => sum + Number(q.data?.metrics.activeSubscriptions || 0), 0);
  const totalRevenue = metricsQueries.reduce((sum, q) => sum + Number(q.data?.metrics.currentMonthRevenue || 0), 0);

  return (
    <div className="dashboard space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Global Admin Overview</h2>
          <p className="text-muted-foreground mt-1">Manage all parking garages and monitor performance</p>
        </div>
      </div>

      <Separator />

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total MRR</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalMRR.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Monthly recurring revenue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSubs}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across all garages
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Current month total
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue by Garage</CardTitle>
              <CardDescription>Monthly revenue and active subscriptions per location</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={billing || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="garage" 
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
                    formatter={(value: number) =>
                      `$${value.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    }
                  />
                  <Legend />
                  <Bar dataKey="monthlyRevenue" name="Monthly Revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="activeSubscriptions" name="Active Subs" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Garages</h3>
            <div className="grid gap-4">
              {garages?.map((g, idx) => {
                const mq = metricsQueries[idx];
                const metrics = mq?.data?.metrics;
                return (
                  <Card key={g.id} className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-lg">{g.name}</CardTitle>
                            <Badge variant="secondary">{metrics?.activeSubscriptions ?? 0} active</Badge>
                          </div>
                          <CardDescription>{g.address}</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`#/admin?garageId=${g.id}`} className="gap-1">
                            View Details <ArrowRight className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" /> Subscriptions
                          </p>
                          <p className="text-2xl font-bold text-primary">
                            {metrics?.activeSubscriptions ?? 0}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> MRR
                          </p>
                          <p className="text-2xl font-bold text-emerald-500">
                            ${(metrics?.monthlyRecurringRevenue || 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <CreditCard className="h-3 w-3" /> Payments
                          </p>
                          <p className="text-2xl font-bold">
                            {metrics?.currentMonthPayments ?? 0}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Revenue
                          </p>
                          <p className="text-2xl font-bold text-emerald-500">
                            ${(metrics?.currentMonthRevenue || 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


