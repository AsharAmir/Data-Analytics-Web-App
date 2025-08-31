import { NextRouter } from "next/router";
import apiClient from "./api";
import { isAdmin as isAdminRole, normalizeRoleCode } from "./roles";
import { User } from "../types";
import { logger } from "./logger";

export interface ResourcePermission {
  resource: string;
  action: string;
  resourceId?: string | number;
}

export class SecurityManager {
  private static instance: SecurityManager;
  private user: User | null = null;

  private constructor() {}

  static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  setUser(user: User): void {
    this.user = user;
  }

  getUser(): User | null {
    return this.user || apiClient.getUser();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return apiClient.isAuthenticated() && this.getUser() !== null;
  }

  /**
   * Check if user has admin role
   */
  isAdmin(): boolean {
    const user = this.getUser();
    return isAdminRole(user?.role as any);
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: string): boolean {
    const user = this.getUser();
    if (!user) return false;
    const target = normalizeRoleCode(role);
    const current = normalizeRoleCode(user.role as any);
    return current === target || this.isAdmin();
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    const user = this.getUser();
    if (!user) return false;
    if (this.isAdmin()) return true;
    const current = normalizeRoleCode(user.role as any);
    const set = new Set(roles.map((r) => normalizeRoleCode(r)));
    return set.has(current);
  }

  /**
   * Check resource-level permissions
   */
  async canAccessResource(
    resourceType: string,
    resourceId: string | number,
    action: string = "read"
  ): Promise<boolean> {
    try {
      if (!this.isAuthenticated()) {
        logger.warn("Unauthenticated access attempt", { resourceType, resourceId, action });
        return false;
      }

      if (this.isAdmin()) {
        return true; // Admins can access everything
      }

      // Resource-specific permission checks
      switch (resourceType) {
        case "report":
        case "query":
          return await this.canAccessQuery(resourceId);
        
        case "dashboard":
          return await this.canAccessDashboard(resourceId);
        
        case "process":
          return await this.canAccessProcess(resourceId);
        
        default:
          logger.warn("Unknown resource type", { resourceType, resourceId, action });
          return false;
      }
    } catch (error) {
      logger.error("Error checking resource permission", { error, resourceType, resourceId, action });
      return false;
    }
  }

  /**
   * Check if user can access a specific query/report
   */
  private async canAccessQuery(queryId: string | number): Promise<boolean> {
    try {
      const response = await apiClient.getQueryDetail(Number(queryId));
      return response.success; // If API call succeeds, user has access
    } catch (error: any) {
      if (error?.response?.status === 403) {
        logger.warn("Access denied to query", { queryId, userRole: this.getUser()?.role });
        return false;
      }
      logger.error("Error checking query access", { error, queryId });
      return false;
    }
  }

  /**
   * Check if user can access a specific dashboard
   */
  private async canAccessDashboard(dashboardId: string | number): Promise<boolean> {
    try {
      // Dashboard access is typically role-based
      const user = this.getUser();
      if (!user) return false;
      
      // This can be extended with specific dashboard permissions
      return true;
    } catch (error) {
      logger.error("Error checking dashboard access", { error, dashboardId });
      return false;
    }
  }

  /**
   * Check if user can access a specific process
   */
  private async canAccessProcess(processId: string | number): Promise<boolean> {
    try {
      // Process access is typically role-based
      // This would need to be implemented based on process permissions
      const user = this.getUser();
      if (!user) return false;
      
      return true;
    } catch (error) {
      logger.error("Error checking process access", { error, processId });
      return false;
    }
  }

  /**
   * Enhanced route guard with resource-level checks
   */
  async canAccessRoute(pathname: string, query: any = {}): Promise<boolean> {
    if (!this.isAuthenticated()) {
      logger.warn("Unauthenticated route access attempt", { pathname, query });
      return false;
    }

    // Extract resource information from route
    const routeInfo = this.parseRoute(pathname, query);
    
    if (routeInfo.requiresResourceCheck) {
      return await this.canAccessResource(
        routeInfo.resourceType!,
        routeInfo.resourceId!,
        routeInfo.action
      );
    }

    return true;
  }

  /**
   * Parse route to extract resource information
   */
  private parseRoute(pathname: string, query: any = {}): {
    requiresResourceCheck: boolean;
    resourceType?: string;
    resourceId?: string | number;
    action: string;
  } {
    // Report detail pages
    if (pathname.startsWith("/report/") && query.id) {
      return {
        requiresResourceCheck: true,
        resourceType: "report",
        resourceId: query.id,
        action: "read"
      };
    }

    // Dashboard pages with specific dashboard ID
    if (pathname.startsWith("/dashboard") && query.dashboardId) {
      return {
        requiresResourceCheck: true,
        resourceType: "dashboard",
        resourceId: query.dashboardId,
        action: "read"
      };
    }

    // Process pages with specific process ID
    if (pathname.startsWith("/process/") && query.id) {
      return {
        requiresResourceCheck: true,
        resourceType: "process",
        resourceId: query.id,
        action: "read"
      };
    }

    // Admin routes
    if (pathname.startsWith("/admin")) {
      return {
        requiresResourceCheck: false,
        action: "admin"
      };
    }

    return {
      requiresResourceCheck: false,
      action: "read"
    };
  }

  /**
   * Redirect to appropriate page based on authorization failure
   */
  handleUnauthorizedAccess(router: NextRouter, pathname: string): void {
    if (!this.isAuthenticated()) {
      logger.warn("Redirecting to login due to unauthenticated access", { pathname });
      router.replace("/login");
    } else {
      logger.warn("Access denied - insufficient permissions", { 
        pathname, 
        userRole: this.getUser()?.role 
      });
      router.replace("/dashboard?error=access_denied");
    }
  }

  /**
   * Sanitize and validate input to prevent XSS
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, "") // Remove potential script tags
      .replace(/javascript:/gi, "") // Remove javascript: protocols
      .replace(/on\w+=/gi, "") // Remove event handlers
      .trim();
  }

  /**
   * Generate secure headers for requests
   */
  getSecurityHeaders(): Record<string, string> {
    return {
      "X-Requested-With": "XMLHttpRequest",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
  }
}

// Export singleton instance
export const securityManager = SecurityManager.getInstance();

// Utility functions for components
export const requireAuth = (router: NextRouter): boolean => {
  if (!securityManager.isAuthenticated()) {
    router.replace("/login");
    return false;
  }
  return true;
};

export const requireRole = (router: NextRouter, role: string): boolean => {
  if (!requireAuth(router)) return false;
  
  if (!securityManager.hasRole(role)) {
    securityManager.handleUnauthorizedAccess(router, router.pathname);
    return false;
  }
  return true;
};

export const requireAdmin = (router: NextRouter): boolean => {
  return requireRole(router, "admin");
};
