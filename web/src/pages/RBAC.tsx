import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Check, Plus, Shield, User, UserCog } from 'lucide-react';
import { useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';

export function RBAC() {
  const qc = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [form, setForm] = useState<{ userId: string; garageId: string; permissions: string }>({
    userId: '',
    garageId: '',
    permissions: '{"view_reports": true, "manage_passes": true, "manage_subscriptions": true}',
  });

  // Use selected userId for privileged calls
  useMemo(() => {
    apiClient.setUser(currentUserId);
    return null;
  }, [currentUserId]);

  const { data: garages } = useQuery({
    queryKey: ['garages'],
    queryFn: () => apiClient.listGarages(),
  });

  const { data: admins, isLoading } = useQuery({
    queryKey: ['garage-admins', currentUserId],
    queryFn: () => apiClient.listGarageAdmins(),
    enabled: !!currentUserId, // must impersonate super_admin
  });

  const createAssignment = useMutation({
    mutationFn: () => apiClient.createGarageAdminAssignment(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['garage-admins'] }),
  });

  const updatePerms = useMutation({
    mutationFn: (args: { userId: string; garageId: string; permissions: string }) =>
      apiClient.updateAssignmentPermissions(args.userId, args.garageId, args.permissions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['garage-admins'] }),
  });

  return (
    <div className="dashboard space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Role Based Access Control</h2>
          <p className="text-muted-foreground mt-1">Manage user permissions and garage access</p>
        </div>
        <Button variant="outline" asChild>
          <a href="#/global" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Global
          </a>
        </Button>
      </div>

      <Separator />

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Impersonation Mode</AlertTitle>
        <AlertDescription>
          Enter a super_admin user ID to manage role-based access control and assignments
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Authentication Context
          </CardTitle>
          <CardDescription>Set the x-user-id header for admin operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="userId">Super Admin User ID</Label>
            <Input
              id="userId"
              placeholder="Enter super_admin userId to manage RBAC"
              value={currentUserId || ''}
              onChange={(e) => setCurrentUserId(e.target.value || null)}
            />
            <p className="text-sm text-muted-foreground">
              {currentUserId ? (
                <span className="flex items-center gap-1 text-primary">
                  <Check className="h-3 w-3" /> Active as: {currentUserId}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Required for admin endpoints (mock auth)
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Admin Assignment
          </CardTitle>
          <CardDescription>Grant a user access to manage a specific garage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assignUserId">User ID</Label>
                <Input
                  id="assignUserId"
                  placeholder="Enter user ID"
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignGarage">Garage</Label>
                <Select
                  id="assignGarage"
                  value={form.garageId}
                  onChange={(e) => setForm({ ...form, garageId: e.target.value })}
                >
                  <option value="">Select Garage by Name</option>
                  {garages?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="permissions">Permissions (JSON)</Label>
              <Textarea
                id="permissions"
                value={form.permissions}
                onChange={(e) => setForm({ ...form, permissions: e.target.value })}
                rows={4}
                className="font-mono text-xs"
              />
            </div>

            <Button 
              onClick={() => createAssignment.mutate()} 
              disabled={!form.userId || !form.garageId || !currentUserId}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Assignment
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Admin Users & Capabilities
          </CardTitle>
          <CardDescription>View and manage user assignments and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          {!currentUserId ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Authentication Required</AlertTitle>
              <AlertDescription>
                Enter a super_admin user ID above to load admin users.
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>User</TH>
                    <TH>Email</TH>
                    <TH>Assignments</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {admins?.map((a) => (
                    <TR key={a.user.id}>
                      <TD>
                        <div className="font-medium">
                          {a.user.firstName} {a.user.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">ID: {a.user.id}</div>
                      </TD>
                      <TD>{a.user.email}</TD>
                      <TD>
                        <div className="space-y-3">
                          {a.assignments.map((as) => (
                            <div key={`${a.user.id}-${as.garageId}`} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{as.garage?.name || as.garageId}</Badge>
                              </div>
                              <Textarea
                                defaultValue={as.permissions}
                                rows={3}
                                className="font-mono text-xs"
                                onBlur={(e) =>
                                  updatePerms.mutate({ userId: a.user.id, garageId: as.garageId, permissions: e.target.value })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </TD>
                      <TD>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            apiClient.setUser(a.user.id);
                            window.location.hash = `#/admin`;
                          }}
                        >
                          <UserCog className="h-4 w-4 mr-2" />
                          Impersonate
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


