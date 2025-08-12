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

// Activity Tracker for monitoring user interactions
class ActivityTracker {
  private callback: () => void;
  private events: string[] = [
    'mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'
  ];
  private throttleDelay: number = 30000; // 30 seconds throttle
  private lastTrigger: number = 0;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  private handleActivity = (): void => {
    const now = Date.now();
    
    // Throttle activity updates to avoid excessive calls
    if (now - this.lastTrigger > this.throttleDelay) {
      this.lastTrigger = now;
      this.callback();
      logger.debug("User activity detected");
    }
  };

  start(): void {
    if (typeof window === "undefined") return;
    
    this.events.forEach(event => {
      window.addEventListener(event, this.handleActivity, { passive: true });
    });
    
    logger.debug("Activity tracker started");
  }

  stop(): void {
    if (typeof window === "undefined") return;
    
    this.events.forEach(event => {
      window.removeEventListener(event, this.handleActivity);
    });
    
    logger.debug("Activity tracker stopped");
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private client: AxiosInstance;
  private refreshTimer: NodeJS.Timeout | null = null;
  private activityTracker: ActivityTracker | null = null;
  private lastActivity: number = Date.now();
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
    // Fallback – assume the payload itself is the data we need.
    return payload as T;
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",  // CSRF protection
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
      },
      withCredentials: true,  // Include cookies in requests
    });

    // Auto-refresh timer
    this.setupTokenRefresh();

    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        logger.debug(`API → ${config.method?.toUpperCase()} ${config.url}`);
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        config.headers["X-Request-ID"] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        config.headers["X-Client-Version"] = "1.0.0";
        
        // Add timestamp for request freshness validation
        config.headers["X-Timestamp"] = new Date().toISOString();
        
        // Track API requests as user activity
        this.lastActivity = Date.now();
        
        return config;
      },
      (error) => {
        logger.error("Request interceptor error", error);
        return Promise.reject(error);
      },
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`API ← ${response.config.method?.toUpperCase()} ${response.config.url} ${response.status}`);
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
    
    const token = sessionStorage.getItem("auth_token") || 
                  Cookies.get("auth_token") || 
                  localStorage.getItem("auth_token");
    
    if (!token) return null;
    
    try {
      const metadataStr = localStorage.getItem("token_metadata");
      if (metadataStr) {
        const metadata = JSON.parse(metadataStr);
        
        // Check if token is from same user agent (prevent token theft)
        if (metadata.userAgent !== navigator.userAgent) {
          logger.warn("Token user agent mismatch - possible token theft");
          this.removeToken();
          return null;
        }
        
        const tokenAge = Date.now() - metadata.issued;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (tokenAge > maxAge) {
          logger.warn("Token expired due to age");
          this.removeToken();
          return null;
        }
      }
    } catch (error) {
      logger.warn("Error validating token metadata", error);
      // Continue with token if metadata check fails (don't break functionality)
    }
    
    return token;
  }

  private setToken(token: string): void {
    if (typeof window === "undefined") return; // SSR safeguard
    
    const isSecure = window.location.protocol === "https:";
    const domain = window.location.hostname;
    
    // Set httpOnly-like behavior by using sessionStorage as primary and localStorage as backup
    Cookies.set("auth_token", token, {
      expires: 1,
      secure: isSecure,
      sameSite: "strict",
      domain: domain === "localhost" ? undefined : domain, // Set domain for production
      path: "/", // Limit cookie scope
    });
    
    // Store in sessionStorage (more secure) and localStorage (fallback)
    sessionStorage.setItem("auth_token", token);
    localStorage.setItem("auth_token", token);
    
    // Add token validation metadata
    const tokenMetadata = {
      issued: Date.now(),
      userAgent: navigator.userAgent,
      domain: domain,
    };
    localStorage.setItem("token_metadata", JSON.stringify(tokenMetadata));
  }

  private removeToken(): void {
    if (typeof window === "undefined") return; // SSR safeguard
    
    Cookies.remove("auth_token");
    Cookies.remove("auth_token", { path: "/" }); // Ensure removal with path
    
    sessionStorage.removeItem("auth_token");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    localStorage.removeItem("token_metadata");
    
    this.clearRefreshTimer();
    
    // Clear any other sensitive data
    try {
      sessionStorage.clear();
    } catch (error) {
      logger.warn("Failed to clear sessionStorage", error);
    }
  }

  private setupTokenRefresh(): void {
    if (typeof window === "undefined") return; // SSR safeguard
    
    // RACE CONDITION FIX: Clear any existing timer first
    this.clearRefreshTimer();
    
    // Only set up refresh if we have a valid token
    if (this.isAuthenticated() && this.getToken()) {
      // Set up activity tracking if not already done
      if (!this.activityTracker) {
        this.activityTracker = new ActivityTracker(() => {
          this.lastActivity = Date.now();
        });
        this.activityTracker.start();
      }
      
      // RACE CONDITION FIX: Check if timer is already set to prevent duplicates
      if (this.refreshTimer === null) {
        // Check for refresh more frequently but only refresh for active users
        this.refreshTimer = setTimeout(() => {
          this.checkAndRefreshToken();
        }, 20 * 60 * 1000); // Check every 20 minutes
      }
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    if (this.activityTracker) {
      this.activityTracker.stop();
      this.activityTracker = null;
    }
  }

  private async checkAndRefreshToken(): Promise<void> {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    const inactivityThreshold = 10 * 60 * 1000; // 10 minutes of inactivity
    
    // If user has been inactive for too long, don't refresh and let them get logged out naturally
    if (timeSinceActivity > inactivityThreshold) {
      logger.info("User inactive for too long, skipping token refresh", { 
        timeSinceActivity: Math.round(timeSinceActivity / 1000 / 60) + " minutes" 
      });
      // Set up next check in case they become active again
      this.setupTokenRefresh();
      return;
    }
    
    // User is active, refresh the token
    await this.refreshToken();
  }

  private async refreshToken(): Promise<void> {
    if (this.isRefreshing) {
      logger.debug("Token refresh already in progress, skipping");
      return;
    }
    
    this.isRefreshing = true;
    
    try {
      logger.info("Refreshing token for active user");
      const response = await this.client.post<AuthToken>("/auth/refresh");
      const { access_token, user } = response.data;
      
      this.setToken(access_token);
      this.setUser(user);
      
      // Update last activity since refresh is a sign of usage
      this.lastActivity = Date.now();
      
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

  async login(credentials: LoginRequest): Promise<AuthToken> {
    try {
      logger.info("Attempting login", { username: credentials.username });
      
      // Create a timeout promise to prevent hanging - shorter for better UX
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Login request timed out")), 6000);
      });
      
      const loginPromise = this.client.post("/auth/login", credentials, {
        timeout: 6000, // 6 second timeout for login specifically - should be fast
      });
      
      const response: AxiosResponse<AuthToken> = await Promise.race([
        loginPromise,
        timeoutPromise
      ]);
      
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

  // Manual activity update method
  updateActivity(): void {
    this.lastActivity = Date.now();
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

  async deleteQuery(queryId: number): Promise<APIResponse> {
    try {
      const response = await this.client.delete(`/api/admin/query/${queryId}`);
      return response.data;
    } catch (error: unknown) {
      throw error;
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
  updateActivity,
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
  // Process endpoints
  listProcesses,
  createProcess,
  updateProcess,
  deleteProcess,
  runProcess,
  listAvailableScripts,
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
