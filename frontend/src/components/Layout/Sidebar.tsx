import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MenuItem, User as UserType } from "../../types";
import apiClient from "../../lib/api";
import { isAdmin as isAdminRole, normalizeRoleCode } from "../../lib/roles";

// Helper function to filter active menu items recursively
const filterActiveMenuItems = (items: MenuItem[]): MenuItem[] => {
  if (!items || !Array.isArray(items)) {
    return [];
  }
  
  return items
    .filter((it) => it && it.is_active)
    .map((it) => ({
      ...it,
      // Recursively filter children
      children: it.children ? filterActiveMenuItems(it.children) : [],
    }));
};

interface SidebarProps {
  /**
   * Hierarchical list of menu items returned from the backend.
   */
  menuItems: MenuItem[];
  /**
   * Current pathname (used for active link highlighting).
   */
  currentPath: string;
  /**
   * Optional callback invoked whenever the hamburger / chevron icon is
   * clicked to collapse or expand the sidebar.
   */
  onToggleCollapse?: () => void;
  /**
   * Optional external click-handler. If provided, this will be used when a
   * menu item without children is clicked. This allows parent components
   * (e.g. pages) to decide the navigation behaviour themselves.
   */
  onMenuClick?: (item: MenuItem) => void;
  /**
   * Whether the sidebar is currently collapsed (small width).
   */
  collapsed?: boolean;
  /**
   * Whether the mobile overlay is open.
   */
  mobileOpen?: boolean;
  /**
   * Callback to set mobile overlay state.
   */
  onMobileToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  menuItems,
  currentPath,
  collapsed = false,
  onToggleCollapse,
  onMenuClick,
  mobileOpen = false,
  onMobileToggle,
}) => {
  const router = useRouter();
  
  // Initialize expanded items from localStorage
  const [expandedItems, setExpandedItems] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("sidebar-expanded");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const sidebarWidth = collapsed ? "w-16" : "w-64";

  // Icon components
  const DashboardIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2V7z"
      />
    </svg>
  );

  const ExplorerIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );

  const ReportsIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );

  const FolderIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2V7z"
      />
    </svg>
  );

  const DocumentIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );

  const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <svg
      className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
        expanded ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );

  const ProcessIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-7 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
      />
    </svg>
  );

  const AdminIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );

  const LogoutIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );

  const ExcelCompareIcon = () => (
    <svg
      className="h-5 w-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
      />
    </svg>
  );

  // Get current user info (client-side only to avoid SSR mismatch)
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  useEffect(() => {
    setCurrentUser(apiClient.getUser());
  }, []);

  const roleUc = normalizeRoleCode(currentUser?.role as any);
  const isAdmin = isAdminRole(currentUser?.role as any);

  // Get appropriate icon for menu item
  const getMenuItemIcon = (item: MenuItem) => {
    if (item.type === "dashboard") {
      return DashboardIcon;
    } else if (item.type === "report") {
      // If it has children, it's a folder/category
      if (item.children && item.children.length > 0) {
        return FolderIcon;
      } else {
        return DocumentIcon;
      }
    } else if (item.type === "process") {
      return ProcessIcon;
    } else if (item.type === "excel-compare") {
      return ExcelCompareIcon;
    }
    return ReportsIcon; // Default fallback
  };

  // Helper: check if a high-level feature is hidden for the current user
  const isFeatureHidden = (code: string): boolean => {
    if (!currentUser || !Array.isArray((currentUser as any).hidden_features)) {
      return false;
    }
    const hidden = new Set(
      ((currentUser as any).hidden_features as string[]).map((f) =>
        f.toLowerCase(),
      ),
    );
    return hidden.has(code.toLowerCase());
  };

  // Handle logout
  const handleLogout = () => {
    apiClient.logout();
  };

  // Fixed navigation items
  const navigationItems = [
    !isFeatureHidden("dashboard") && {
      name: "Dashboard",
      path: "/dashboard",
      icon: DashboardIcon,
    },
    !isFeatureHidden("data_explorer") && {
      name: "Data Explorer",
      path: "/data-explorer",
      icon: ExplorerIcon,
    },
    !isFeatureHidden("excel_compare") && {
      name: "Excel Compare",
      path: "/excel-compare",
      icon: ExcelCompareIcon,
    },
    ...(currentUser &&
    (isAdmin || roleUc === "IT_USER" || roleUc === "TECH_USER") &&
    !isFeatureHidden("processes")
      ? [
          {
            name: "Processes",
            path: "/processes",
            icon: ProcessIcon,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            name: "Admin Panel",
            path: "/admin",
            icon: AdminIcon,
          },
        ]
      : []),
  ].filter(Boolean) as {
    name: string;
    path: string;
    icon: React.FC;
  }[];

  const toggleExpanded = (itemId: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
    
    // Persist to localStorage
    try {
      localStorage.setItem("sidebar-expanded", JSON.stringify(Array.from(newExpanded)));
    } catch (e) {
      console.warn("Failed to save sidebar state:", e);
    }
  };

  /**
   * Default navigation handler if the caller did **not** supply an
   * `onMenuClick` prop (for backward compatibility). Falls back to the
   * original behaviour that was hard-coded in this component.
   */
  const defaultMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      router.push(`/dashboard?menu=${item.id}`);
    } else if (item.type === "report") {
      router.push(`/reports?menu=${item.id}`);
    } else if (item.type === "process") {
      router.push(`/processes`);
    } else if (item.type === "excel-compare") {
      router.push(`/excel-compare`);
    }
    // Close mobile menu after navigation
    if (onMobileToggle && mobileOpen) {
      onMobileToggle();
    }
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const isActive =
      currentPath.includes(`menu=${item.id}`) ||
      (currentPath === "/reports" &&
        router.query.menu === item.id.toString()) ||
      (currentPath === "/dashboard" &&
        router.query.menu === item.id.toString());

    const IconComponent = getMenuItemIcon(item);

    return (
      <div key={item.id}>
        <div
          className={`
            flex items-center text-sm font-medium cursor-pointer rounded-lg
            transition-all duration-200 group mb-1 relative
            ${level > 0 && !collapsed ? "ml-4" : ""}
            ${collapsed ? "justify-center px-3 py-3" : "px-3 py-2"}
            ${
              isActive
                ? "bg-blue-600 text-white shadow-lg"
                : "text-gray-300 hover:bg-gray-700 hover:text-white"
            }
          `}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.id);
            } else {
              // Prefer external handler if present so pages can decide
              // custom navigation; otherwise fall back to default logic.
              (onMenuClick ?? defaultMenuClick)(item);
            }
          }}
          title={collapsed ? item.name : undefined}
        >
          <div className={`flex-shrink-0 ${!collapsed ? "mr-3" : ""}`}>
            <IconComponent />
          </div>

          {!collapsed && (
            <>
              <span className="flex-1 truncate">{item.name}</span>
              {hasChildren && (
                <div className="ml-2">
                  <ChevronIcon expanded={isExpanded} />
                </div>
              )}
            </>
          )}

          {/* Tooltip for collapsed state */}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
              {item.name}
              <div className="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-gray-900 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
            </div>
          )}
        </div>

        {/* Render children */}
        {hasChildren && isExpanded && !collapsed && (
          <div className="ml-2">
            {item.children.map((child) => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Memoise the result so we only recompute when `menuItems` actually changes.
  const activeMenuItems = useMemo(
    () => filterActiveMenuItems(menuItems),
    [menuItems],
  );

  return (
    <>
      {/* Mobile backdrop overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
          onClick={onMobileToggle}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          ${sidebarWidth} bg-gradient-to-b from-gray-900 to-gray-800 text-white shadow-xl overflow-hidden
          lg:fixed lg:inset-y-0 lg:left-0 lg:translate-x-0 lg:transition-all lg:duration-300
          fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ 
          height: "100vh",
          minHeight: "100vh",
          position: "fixed",
          top: 0,
          bottom: 0
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Analytics Pro
              </h2>
            )}
            <button
              onClick={() => {
                // On mobile, use mobile toggle, on desktop use collapse
                if (window.innerWidth < 1024 && onMobileToggle) {
                  onMobileToggle();
                } else if (onToggleCollapse) {
                  onToggleCollapse();
                }
              }}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors touch-manipulation"
            >
              <svg
                className={`h-5 w-5 transition-transform duration-300 ${
                  collapsed ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 flex flex-col" style={{ height: "calc(100vh - 64px - 160px)" }}>
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
            <nav className="p-4 space-y-2 pb-8">
              {/* Fixed Navigation Items */}
              {navigationItems.map((item) => {
                // For dashboard, only highlight if we're on dashboard page with no menu parameter
                const isActive =
                  item.path === "/dashboard"
                    ? currentPath === item.path && !router.query.menu
                    : currentPath === item.path;
                const IconComponent = item.icon;
                return (
                  <Link key={item.path} href={item.path}>
                    <div
                      onClick={() => {
                        // Close mobile menu after navigation
                        if (onMobileToggle && mobileOpen) {
                          onMobileToggle();
                        }
                      }}
                      className={`flex items-center rounded-lg transition-all duration-200 cursor-pointer relative group touch-manipulation ${
                        collapsed
                          ? "justify-center px-3 py-3"
                          : "space-x-3 px-3 py-3"
                      } ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg"
                          : "hover:bg-gray-700"
                      }`}
                      title={collapsed ? item.name : undefined}
                    >
                      <IconComponent />
                      {!collapsed && (
                        <span className="font-medium">{item.name}</span>
                      )}

                      {/* Tooltip for collapsed state */}
                      {collapsed && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                          {item.name}
                          <div className="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-gray-900 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}

              {/* Reports Section */}
              {activeMenuItems.length > 0 && (
                <>
                  {!collapsed && (
                    <div className="pt-4 pb-2">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                        Custom
                      </h3>
                    </div>
                  )}

                  {/* Dynamic Menu Items */}
                  {activeMenuItems.map((item) => renderMenuItem(item))}
                </>
              )}
            </nav>
          </div>
        </div>

        {/* Logout Button - Fixed to bottom with absolute positioning */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700 bg-gradient-to-b from-gray-900 to-gray-800">
          {/* User info - only show if not collapsed and current user exists */}
          {!collapsed && currentUser && (
            <div className="mb-3 p-2 bg-gray-800 rounded-lg">
              <p className="text-sm font-medium text-white truncate">
                {currentUser.username}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {currentUser.email}
              </p>
            </div>
          )}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium text-gray-300 hover:bg-red-600 hover:text-white rounded-lg transition-all duration-200 relative group ${
              collapsed ? "justify-center" : "space-x-3"
            }`}
            title={collapsed ? "Logout" : undefined}
          >
            <LogoutIcon />
            {!collapsed && <span>Logout</span>}

            {/* Tooltip for collapsed state */}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                Logout
                <div className="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-gray-900 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
              </div>
            )}
          </button>

          {/* Version info - only if not collapsed */}
          {!collapsed && (
            <div className="text-xs text-gray-400 text-center mt-3">
              <p>Analytics Platform v2.0</p>
              <p className="mt-1">© 2024 Financial Systems</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
