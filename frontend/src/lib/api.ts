import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import Cookies from 'js-cookie';
import { toast } from 'react-hot-toast';
import {
  User,
  LoginRequest,
  AuthToken,
  MenuItem,
  DashboardWidget,
  QueryExecuteRequest,
  QueryResult,
  FilteredQueryRequest,
  ExportRequest,
  APIResponse,
  Query
} from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          this.removeToken();
          toast.error('Session expired. Please login again.');
          window.location.href = '/login';
        } else if (error.response?.status >= 500) {
          toast.error('Server error. Please try again later.');
        } else if (error.response?.data?.error) {
          toast.error(error.response.data.error);
        } else if (error.message) {
          toast.error(error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  // Token management
  private getToken(): string | null {
    return Cookies.get('auth_token') || localStorage.getItem('auth_token');
  }

  private setToken(token: string): void {
    Cookies.set('auth_token', token, { expires: 7, secure: true, sameSite: 'strict' });
    localStorage.setItem('auth_token', token);
  }

  private removeToken(): void {
    Cookies.remove('auth_token');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }

  // User management
  private setUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  }

  public getUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  // Authentication methods
  async login(credentials: LoginRequest): Promise<AuthToken> {
    try {
      const response: AxiosResponse<AuthToken> = await this.client.post('/auth/login', credentials);
      const { access_token, user } = response.data;
      
      this.setToken(access_token);
      this.setUser(user);
      
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    try {
      const response: AxiosResponse<User> = await this.client.get('/auth/me');
      this.setUser(response.data);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getAuthMode(): Promise<string> {
    try {
      const response: AxiosResponse<APIResponse<{ auth_mode: string }>> = await this.client.get('/auth/mode');
      return response.data.data?.auth_mode || 'form';
    } catch (error) {
      return 'form';
    }
  }

  logout(): void {
    this.removeToken();
    window.location.href = '/login';
  }

  // Health check
  async healthCheck(): Promise<APIResponse> {
    try {
      const response: AxiosResponse<APIResponse> = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Menu methods
  async getMenuItems(): Promise<MenuItem[]> {
    try {
      const response: AxiosResponse<MenuItem[]> = await this.client.get('/api/menu');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Dashboard methods
  async getDashboardLayout(): Promise<DashboardWidget[]> {
    try {
      const response: AxiosResponse<DashboardWidget[]> = await this.client.get('/api/dashboard');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getWidgetData(widgetId: number): Promise<QueryResult> {
    try {
      const response: AxiosResponse<QueryResult> = await this.client.post(`/api/dashboard/widget/${widgetId}/data`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Query methods
  async executeQuery(request: QueryExecuteRequest): Promise<QueryResult> {
    try {
      const response: AxiosResponse<QueryResult> = await this.client.post('/api/query/execute', request);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async executeFilteredQuery(request: FilteredQueryRequest): Promise<QueryResult> {
    try {
      const response: AxiosResponse<QueryResult> = await this.client.post('/api/query/filtered', request);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Export methods
  async exportData(request: ExportRequest): Promise<Blob> {
    try {
      const response: AxiosResponse<Blob> = await this.client.post('/api/export', request, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Reports methods
  async getReportsByMenu(menuItemId: number): Promise<APIResponse<Query[]>> {
    try {
      const response: AxiosResponse<APIResponse<Query[]>> = await this.client.get(`/api/reports/menu/${menuItemId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Query detail
  async getQueryDetail(queryId: number): Promise<APIResponse<Query>> {
    try {
      const response: AxiosResponse<APIResponse<Query>> = await this.client.get(`/api/query/${queryId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Generic methods for custom requests
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.get(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.post(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.put(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.delete(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Utility methods
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  async downloadFile(url: string, filename: string): Promise<void> {
    try {
      const response = await this.client.get(url, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      throw error;
    }
  }
}

// Create and export a singleton instance
const apiClient = new ApiClient();
export default apiClient;

// Export individual methods for convenience
export const {
  login,
  getCurrentUser,
  getAuthMode,
  logout,
  healthCheck,
  getMenuItems,
  getDashboardLayout,
  getWidgetData,
  executeQuery,
  executeFilteredQuery,
  exportData,
  getReportsByMenu,
  isAuthenticated,
  getUser,
  downloadFile,
  getQueryDetail
} = apiClient; 