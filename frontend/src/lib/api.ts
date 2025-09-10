import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { logger } from "./logger";
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
  private tabId: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;
  /**
   * Helper to unwrap our standard APIResponse envelope and return the contained
   * `data` field. Falls back gracefully when the backend returns the raw data
   * instead of the envelope (e.g. legacy endpoints).
   */
  private extractData<T>(response: AxiosResponse<import("../types").APIResponse<T>>): T {
    const payload: any = response.data;
    if (payload && typeof payload === "object" && "data" in payload) {
      return payload.data as T;
    }
    return payload as T;
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    // Auto-refresh timer based on JWT exp
    this.setupTokenRefresh();
    // Track open tabs and clear auth on last tab close
    this.setupCrossTabSession();

    // Cross-tab logout sync: if another tab removes the token, redirect here too
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === "auth_token" && e.newValue === null) {
          window.location.href = "/login";
        }
      });
    }

          this.client.interceptors.request.use(
        (config) => {
          const token = this.getToken();
          const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Add timing information
          (config as any).metadata = { startTime: Date.now(), requestId };
          

          // Log API request to file
          logger.apiRequest(config.method || 'GET', config.url || '', {
            requestId,
            hasAuth: !!token,
            timeout: config.timeout
          });
          
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          
          config.headers["X-Request-ID"] = requestId;
          config.headers["X-Client-Version"] = "1.0.0";
          
          // Add timestamp for request freshness validation
          config.headers["X-Timestamp"] = new Date().toISOString();
          
          return config;
        },
      (error) => {
        logger.error("Request interceptor error", { 
          message: error.message,
          stack: error.stack,
          config: error.config ? {
            method: error.config.method,
            url: error.config.url
          } : undefined
        });
        return Promise.reject(error);
      },
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        const duration = (response.config as any).metadata?.startTime 
          ? Date.now() - (response.config as any).metadata.startTime 
          : undefined;
        const requestId = (response.config as any).metadata?.requestId;
        
        // Log API response to file
        logger.apiResponse(
          response.config.method || 'GET', 
          response.config.url || '', 
          response.status, 
          duration,
          {
            requestId,
            responseSize: JSON.stringify(response.data).length,
            contentType: response.headers['content-type']
          }
        );
        return response;
      },
      (error) => {
        const duration = (error.config as any)?.metadata?.startTime 
          ? Date.now() - (error.config as any).metadata.startTime 
          : undefined;
        const requestId = (error.config as any)?.metadata?.requestId;
        
        // Log API error to file
        logger.error(`API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
          requestId,
          status: error.response?.status,
          statusText: error.response?.statusText,
          duration,
          responseData: error.response?.data,
          errorMessage: error.message,
          isNetworkError: !error.response,
          isTimeoutError: error.code === 'ECONNABORTED'
        });

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
          logger.warn("401 unauthorised – handling per-endpoint policy");
          const originalUrl = error.config?.url || "";
          if (originalUrl.includes("/auth/login") || originalUrl.includes("/auth/change-password")) {
            return Promise.reject(error);
          }
          // For other endpoints, clear auth and redirect to login
          this.removeToken();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          // Propagate error so callers can handle/cleanup
          return Promise.reject(error);
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
    // Single source of truth: localStorage (shared across tabs)
    const token = localStorage.getItem("auth_token");
    return token || null;
  }

  private setToken(token: string): void {
    if (typeof window === "undefined") return; // SSR safeguard
    // Store in localStorage so tabs share auth within the same browser session
    localStorage.setItem("auth_token", token);
  }

  private removeToken(): void {
    if (typeof window === "undefined") return; // SSR safeguard
    // Remove stored auth artifacts we own
    // Clear both storages for safety (handles older versions)
    try { sessionStorage.removeItem("auth_token"); } catch {}
    try { sessionStorage.removeItem("user"); } catch {}
    try { localStorage.removeItem("auth_token"); } catch {}
    try { localStorage.removeItem("user"); } catch {}
    
    this.clearRefreshTimer();
  }

  private setupTokenRefresh(): void {
    if (typeof window === "undefined") return; // SSR safeguard

    // Clear any existing timer first
    this.clearRefreshTimer();

    const token = this.getToken();
    if (!token) return;

    const expiryMs = this.getTokenExpiryMs(token);
    if (!expiryMs) return;

    const now = Date.now();
    const leewayMs = 90_000; // refresh ~90s before expiry
    const delay = Math.max(0, expiryMs - now - leewayMs);

    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, delay);
  }

  private getTokenExpiryMs(token: string): number | null {
    try {
      const [, payload] = token.split(".");
      if (!payload) return null;
      const decoded = JSON.parse(atob(payload));
      if (typeof decoded.exp === "number") {
        return decoded.exp * 1000; // seconds -> ms
      }
      return null;
    } catch {
      return null;
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async refreshToken(): Promise<void> {
    if (this.isRefreshing) {
      logger.debug("Token refresh already in progress, skipping");
      return;
    }
    
    this.isRefreshing = true;
    
    try {
      logger.info("Refreshing token automatically");
      const response = await this.client.post<AuthToken>("/auth/refresh");
      const { access_token, user } = response.data;
      
      this.setToken(access_token);
      this.setUser(user);
      
      // Set up next refresh
      this.setupTokenRefresh();
      
      logger.info("Token refreshed successfully");
    } catch (error) {
      logger.warn("Token refresh failed, redirecting to login", { error });
      this.removeToken();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } finally {
      this.isRefreshing = false;
    }
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

  private setupCrossTabSession(): void {
    if (typeof window === "undefined") return;
    try {
      this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const OPEN_TABS_KEY = "open_tabs";
      const LAST_CLOSE_KEY = "last_close_at";
      const getTabs = (): string[] => {
        try {
          const raw = localStorage.getItem(OPEN_TABS_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      };
      const setTabs = (tabs: string[]) => {
        try { localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs)); } catch {}
      };

      // If the previous session indicated a last-tab close, and sufficient time
      // has passed (not a quick reload), clear auth now.
      try {
        const lastCloseStr = localStorage.getItem(LAST_CLOSE_KEY);
        if (lastCloseStr) {
          const lastCloseAt = parseInt(lastCloseStr, 10) || 0;
          if (Date.now() - lastCloseAt > 5000) {
            this.removeToken();
          }
          localStorage.removeItem(LAST_CLOSE_KEY);
        }
      } catch {}

      // Register this tab
      const tabs = getTabs();
      if (this.tabId && !tabs.includes(this.tabId)) {
        setTabs([...tabs, this.tabId]);
      }

      // On tab close, remove this tab; if no tabs remain, clear auth
      window.addEventListener("beforeunload", () => {
        const current = getTabs();
        const remaining = this.tabId ? current.filter((t) => t !== this.tabId) : current;
        if (remaining.length === 0) {
          // Mark time of last-tab close; token will be cleared on next load
          try { localStorage.setItem(LAST_CLOSE_KEY, String(Date.now())); } catch {}
        }
        setTabs(remaining);
      });
    } catch {}
  }

  async login(credentials: LoginRequest): Promise<AuthToken> {
    try {
      logger.info("Attempting login", { username: credentials.username });
      const response: AxiosResponse<AuthToken> = await this.client.post(
        "/auth/login",
        credentials,
        { timeout: 6000 }
      );
      
      const { access_token, user } = response.data;

      this.setToken(access_token);
      this.setUser(user);
      
      logger.info("Login successful", { username: user.username, role: user.role });
      
      // Set up token refresh
      this.setupTokenRefresh();

      // If user must change password, redirect immediately
      if (user.must_change_password) {
        if (typeof window !== "undefined") {
          window.location.href = "/change-password";
        }
      }

      return response.data;
    } catch (error: unknown) {
      logger.error("Login failed", { 
        error, 
        username: credentials.username,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
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

  async changePassword(currentPassword: string, newPassword: string): Promise<APIResponse> {
    try {
      logger.info("Attempting password change");
      
      const user = this.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const response: AxiosResponse<APIResponse> = await this.client.post(
        "/auth/change-password",
        {
          username: user.username,
          password: currentPassword,
          new_password: newPassword,
        }
      );
      
      logger.info("Password changed successfully");
      return response.data;
    } catch (error: unknown) {
      logger.error("Password change failed", { error });
      throw error;
    }
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

  // Manual activity update method (simplified)
  updateActivity(): void {
    logger.debug("Activity updated manually");
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

  // --------------------------------------------
  // Bulk import API (Scenario-2)
  // --------------------------------------------

  /**
   * Upload a CSV/TXT or single-sheet Excel file to import data into a table.
   * @param tableName Target table name in the database
   * @param file      File object (csv, txt, xlsx, xls)
   * @param mode      Behaviour on validation error: 'skip_failed' | 'abort_on_error'
   */
  async importTableData(
    tableName: string,
    file: File,
    mode: "skip_failed" | "abort_on_error" = "abort_on_error",
  ) {
    const form = new FormData();
    form.append("mode", mode);
    form.append("file", file);

    try {
      const response = await this.client.post(
        `/api/report/${tableName}/import`,
        form,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return response as any; // Caller handles structure
    } catch (error) {
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

  async deleteQuery(queryId: number): Promise<{ success: boolean; data?: APIResponse; error?: string }> {
    try {
      const response = await this.client.delete<APIResponse>(`/api/admin/query/${queryId}`);
      return { success: true, data: response.data };
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        const errorMessage = error.response.data?.detail || error.response.data?.message || 'Failed to delete query';
        return { success: false, error: errorMessage };
      }
      return { success: false, error: 'An unknown error occurred while deleting the query.' };
    }
  }


  // -----------------------------
  // Roles (dynamic)
  // -----------------------------

  async listRoles(): Promise<Role[]> {
    const response = await this.client.get<import("../types").APIResponse<Role[]>>("/api/roles");
    return this.extractData<Role[]>(response);
  }

  async createRole(roleName: string): Promise<Role> {
    const response = await this.client.post<import("../types").APIResponse<Role>>("/api/roles", {
      role_name: roleName,
    });
    return this.extractData<Role>(response);
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

  // -----------------------------
  // Processes (Scenario 3)
  // -----------------------------

  async listProcesses() {
    const response = await this.client.get<import("../types").APIResponse<any[]>>("/api/processes");
    return this.extractData<any[]>(response);
  }

  async createProcess(data: import("../types").ProcessCreate) {
    const response = await this.client.post("/api/process", data);
    return response as any;
  }

  async updateProcess(processId: number, data: import("../types").ProcessCreate) {
    const response = await this.client.put(`/api/process/${processId}`, data);
    return response as any;
  }

  async deleteProcess(processId: number) {
    const response = await this.client.delete(`/api/process/${processId}`);
    return response as any;
  }

  async runProcess(processId: number, params: Record<string, any> = {}) {
    const response = await this.client.post(`/api/process/${processId}/run`, params);
    return response as any;
  }

  async listAvailableScripts() {
    const response = await this.client.get<import("../types").APIResponse<import("../types").ScriptFile[]>>("/api/scripts");
    return this.extractData<import("../types").ScriptFile[]>(response);
  }
}

// Create and export a singleton instance
const apiClient = new ApiClient();
export default apiClient;

// Prefer using the default export `apiClient` to avoid losing `this` context

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
