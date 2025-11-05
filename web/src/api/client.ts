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

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    
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
}

export const apiClient = new ApiClient(API_BASE_URL);

