import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { logger } from "./logger";
import Cookies from "js-cookie";
import { toast } from "react-hot-toast";
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
  Query,
  QueryFormData,
  KPI,
} from "../types";
import { Role } from "../types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        logger.debug("API →", config.method?.toUpperCase(), config.url);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(
          "API ←",
          response.config.method?.toUpperCase(),
          response.config.url,
          response.status,
        );
        return response;
      },
      (error) => {
        if (process.env.NODE_ENV !== "production") {
          console.debug("API Client interceptor - Full error:", error);
          console.debug(
            "API Client interceptor - Response data:",
            error.response?.data,
          );
          console.debug(
            "API Client interceptor - Status:",
            error.response?.status,
          );
        }

        if (error.response?.status === 401) {
          logger.warn("401 unauthorised – redirecting to login");
          const originalUrl = error.config?.url || "";
          // Skip handling for the login endpoint itself to avoid loops
          if (!originalUrl.includes("/auth/login")) {
            this.removeToken();
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
          }
          // Return a non-resolving promise to halt further error propagation
          return new Promise(() => {});
        } else if (error.response?.status >= 500) {
          logger.error("Server error", error.response?.status);
          toast.error("Server error. Please try again later.", {
            duration: 5000,
          });
        } else if (
          error.response?.status >= 400 &&
          error.response?.status < 500
        ) {
          if (error.response?.data?.error && !error.response?.data?.detail) {
            const errorMsg =
              typeof error.response.data.error === "string"
                ? error.response.data.error
                : "An error occurred";
            toast.error(errorMsg, { duration: 5000 });
          }
          // Else: silently pass it to caller
        } else if (error.response?.data?.error) {
          // Ensure we only pass strings to toast.error()
          const errorMsg =
            typeof error.response.data.error === "string"
              ? error.response.data.error
              : "An error occurred";
          toast.error(errorMsg, { duration: 5000 });
        } else if (error.message) {
          toast.error(error.message, { duration: 5000 });
        }
        return Promise.reject(error);
      },
    );
  }

  // Token management
  private getToken(): string | null {
    if (typeof window === "undefined") {
      return null; // SSR safeguard
    }
    return Cookies.get("auth_token") || localStorage.getItem("auth_token");
  }

  private setToken(token: string): void {
    if (typeof window === "undefined") return; // SSR safeguard
    // Set cookie with proper settings for development/production
    const isSecure = window.location.protocol === "https:";
    Cookies.set("auth_token", token, {
      expires: 7,
      secure: isSecure,
      sameSite: isSecure ? "strict" : "lax",
    });
    localStorage.setItem("auth_token", token);
  }

  private removeToken(): void {
    if (typeof window === "undefined") return; // SSR safeguard
    Cookies.remove("auth_token");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
  }

  // User management
  private setUser(user: User): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(user));
    }
  }

  public getUser(): User | null {
    if (typeof window === "undefined") return null; // SSR safeguard

    const userStr = localStorage.getItem("user");
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
      const response: AxiosResponse<AuthToken> = await this.client.post(
        "/auth/login",
        credentials,
      );
      const { access_token, user } = response.data;

      this.setToken(access_token);
      this.setUser(user);

      // If user must change password, redirect immediately
      if (user.must_change_password) {
        if (typeof window !== "undefined") {
          window.location.href = "/change-password";
        }
      }

      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    try {
      const response: AxiosResponse<User> = await this.client.get("/auth/me");
      this.setUser(response.data);
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async getAuthMode(): Promise<string> {
    try {
      const response: AxiosResponse<APIResponse<{ auth_mode: string }>> =
        await this.client.get("/auth/mode");
      return response.data.data?.auth_mode || "form";
    } catch {
      return "form";
    }
  }

  logout(): void {
    this.removeToken();
    window.location.href = "/login";
  }

  // Health check
  async healthCheck(): Promise<APIResponse> {
    try {
      const response: AxiosResponse<APIResponse> =
        await this.client.get("/health");
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Menu methods
  async getMenuItems(): Promise<MenuItem[]> {
    try {
      const response: AxiosResponse<MenuItem[]> =
        await this.client.get("/api/menu");
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Dashboard methods
  async getDashboardLayout(menuId?: number): Promise<DashboardWidget[]> {
    try {
      const params = menuId ? { menu_id: menuId } : {};
      const response: AxiosResponse<DashboardWidget[]> = await this.client.get(
        "/api/dashboard",
        { params },
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async getWidgetData(widgetId: number): Promise<QueryResult> {
    try {
      const response: AxiosResponse<QueryResult> = await this.client.post(
        `/api/dashboard/widget/${widgetId}/data`,
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async getKpis(): Promise<KPI[]> {
    try {
      const response: AxiosResponse<KPI[]> = await this.client.get("/api/kpis");
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Update widget layout (position/size)
  async updateWidget(
    widgetId: number,
    data: Partial<{
      position_x: number;
      position_y: number;
      width: number;
      height: number;
      title: string;
    }>,
  ): Promise<APIResponse> {
    try {
      const response: AxiosResponse<APIResponse> = await this.client.put(
        `/api/admin/dashboard/widget/${widgetId}`,
        data,
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Query methods
  async executeQuery(request: QueryExecuteRequest): Promise<QueryResult> {
    try {
      const response: AxiosResponse<QueryResult> = await this.client.post(
        "/api/query/execute",
        request,
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async executeFilteredQuery(
    request: FilteredQueryRequest,
  ): Promise<QueryResult> {
    try {
      const response: AxiosResponse<QueryResult> = await this.client.post(
        "/api/query/filtered",
        request,
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Export methods
  async exportData(request: ExportRequest, timeout: number = 0): Promise<Blob> {
    try {
      const response: AxiosResponse<Blob> = await this.client.post(
        "/api/export",
        request,
        {
          responseType: "blob",
          timeout: timeout, // 0 means unlimited timeout for exports
        },
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Reports methods
  async getReportsByMenu(menuItemId: number): Promise<APIResponse<Query[]>> {
    try {
      const response: AxiosResponse<APIResponse<Query[]>> =
        await this.client.get(`/api/reports/menu/${menuItemId}`);
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Query detail
  async getQueryDetail(queryId: number): Promise<APIResponse<Query>> {
    try {
      const response: AxiosResponse<APIResponse<Query>> = await this.client.get(
        `/api/query/${queryId}`,
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  // Generic methods for custom requests
  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.get(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.post(
        url,
        data,
        config,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.put(
        url,
        data,
        config,
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
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
        responseType: "blob",
      });

      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error: unknown) {
      throw error;
    }
  }

  // User admin methods
  async updateUser(userId: number, data: Partial<User>): Promise<APIResponse> {
    try {
      const response = await this.client.put(`/api/admin/user/${userId}`, data);
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async deleteUser(userId: number): Promise<APIResponse> {
    try {
      const response = await this.client.delete(`/api/admin/user/${userId}`);
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async deleteQuery(queryId: number): Promise<APIResponse> {
    try {
      const response = await this.client.delete(`/api/admin/query/${queryId}`);
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  }

  async changePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<APIResponse> {
    const currentUser = this.getUser();
    if (!currentUser) {
      throw new Error("Not authenticated");
    }
    const payload = {
      username: currentUser.username,
      password: oldPassword,
      new_password: newPassword,
    };
    const response: AxiosResponse<APIResponse> = await this.client.post(
      "/auth/change-password",
      payload,
    );
    // After successful change clear must_change_password flag locally
    if (response.data.success) {
      const updatedUser = {
        ...currentUser,
        must_change_password: false,
      } as User;
      this.setUser(updatedUser);
    }
    return response.data;
  }

  // -----------------------------
  // Roles (dynamic)
  // -----------------------------

  async listRoles(): Promise<Role[]> {
    const response = await this.client.get<Role[]>("/api/roles");
    return (response as any).data ?? response;
  }

  async createRole(roleName: string): Promise<Role> {
    const response = await this.client.post<Role>("/api/roles", {
      role_name: roleName,
    });
    return (response as any).data ?? response;
  }

  /**
   * Delete a role. If `newRole` is provided users are reassigned automatically.
   * Returns the full backend response so the caller can check success / ROLE_IN_USE
   */
  async deleteRole(roleName: string, newRole?: string) {
    const config: any = {};
    if (newRole) {
      config.data = { new_role: newRole };
      // axios delete with body needs `data` prop
    }
    const response = await this.client.delete(`/api/roles/${roleName}`, config);
    return response.data;
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
  getQueryDetail,
  updateUser,
  deleteUser,
  deleteQuery,
  changePassword,
  // Role endpoints
  listRoles,
  createRole,
  deleteRole,
} = apiClient;

export async function createQuery(data: QueryFormData & { role?: string[] }) {
  const response = await apiClient.post<APIResponse<Query>>(
    "/api/admin/query",
    { ...data, role: data.role || ["user"] },
  );
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || "Failed to create query");
}
