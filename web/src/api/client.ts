/**
 * API Client for Vend Parking Backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface GarageInfo {
  id: string;
  name: string;
  address: string;
}

export interface GaragePL {
  garage: GarageInfo;
  period: {
    startDate: string;
    endDate: string;
  };
  financials: {
    totalRevenue: number;
    totalFees: number;
    netRevenue: number;
    paymentCount: number | string;
  };
}

export interface GarageMetrics {
  garage: {
    id: string;
    name: string;
  };
  metrics: {
    activeSubscriptions: number | string;
    monthlyRecurringRevenue: number;
    currentMonthPayments: number | string;
    currentMonthRevenue: number;
  };
}

export interface BillingReport {
  garage: string;
  activeSubscriptions: number;
  monthlyRevenue: number;
}

export interface Garage {
  id: string;
  name: string;
  address: string;
  capacity?: number;
}

export interface AdminUser {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role: string;
  };
  assignments: Array<{
    garageId: string;
    permissions: string; // JSON string
    assignedAt: string;
    garage?: { id: string; name: string; address: string };
  }>;
}

export interface DailyOccupancy {
  garage: { id: string; name: string };
  date: string; // ISO day
  hourly: number[]; // 24 values
}

export interface OccupancyComparison {
  garage: { id: string; name: string };
  weekStart: string; // ISO day (Monday)
  currentWeek: number[][]; // 7 arrays of 24 values
  priorTwoWeekAvg: number[]; // 24 values
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

class ApiClient {
  private baseUrl: string;
  private userId: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setUser(userId: string | null) {
    this.userId = userId;
  }

  private async fetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.userId) headers['x-user-id'] = this.userId;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as any) },
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const data: ApiResponse<T> = await response.json();
    
    if (!data.success) {
      throw new Error('API request failed');
    }

    return data.data;
  }

  async getGaragePL(
    garageId: string,
    startDate?: string,
    endDate?: string
  ): Promise<GaragePL> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.fetch<GaragePL>(`/api/garages/${garageId}/pl${query}`);
  }

  async getGarageMetrics(garageId: string): Promise<GarageMetrics> {
    return this.fetch<GarageMetrics>(`/api/garages/${garageId}/metrics`);
  }

  async getBillingReport(): Promise<BillingReport[]> {
    return this.fetch<BillingReport[]>('/api/billing/report');
  }

  async listGarages(): Promise<Garage[]> {
    return this.fetch<Garage[]>('/api/garages/');
  }

  async getGarage(garageId: string): Promise<Garage> {
    return this.fetch<Garage>(`/api/garages/${garageId}`);
  }

  async getDailyOccupancy(garageId: string, date?: string): Promise<DailyOccupancy> {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.fetch<DailyOccupancy>(`/api/garages/${garageId}/occupancy/daily${query}`);
  }

  async getOccupancyComparison(
    garageId: string,
    weekStart?: string
  ): Promise<OccupancyComparison> {
    const params = new URLSearchParams();
    if (weekStart) params.append('weekStart', weekStart);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.fetch<OccupancyComparison>(
      `/api/garages/${garageId}/occupancy/comparison${query}`
    );
  }

  // RBAC admin endpoints (require x-user-id)
  async listGarageAdmins(garageId?: string): Promise<AdminUser[]> {
    const params = new URLSearchParams();
    if (garageId) params.append('garageId', garageId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.fetch<AdminUser[]>(`/api/admin/garage-admins${query}`);
  }

  async createGarageAdminAssignment(args: {
    userId: string;
    garageId: string;
    permissions?: string;
  }): Promise<any> {
    return this.fetch<any>(`/api/admin/garage-admins`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
  }

  async updateGarageAdminUser(
    userId: string,
    body: Partial<{ firstName: string; lastName: string; email: string; phone: string }>
  ): Promise<any> {
    return this.fetch<any>(`/api/admin/garage-admins/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async updateAssignmentPermissions(
    userId: string,
    garageId: string,
    permissions: string
  ): Promise<any> {
    return this.fetch<any>(
      `/api/admin/garage-admins/${userId}/assignments/${garageId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }
    );
  }

  async getActiveParkedCount(garageId: string): Promise<number> {
    const rows = await this.fetch<any[]>(
      `/api/parked?garageId=${encodeURIComponent(garageId)}&active=true&limit=500`
    );
    return rows.length;
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

