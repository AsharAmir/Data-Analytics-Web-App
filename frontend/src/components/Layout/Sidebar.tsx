import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MenuItem } from "../../types";

interface SidebarProps {
  menuItems: MenuItem[];
  currentPath: string;
  onMenuClick: (item: MenuItem) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  menuItems,
  currentPath,
  onMenuClick,
  collapsed = false,
  onToggleCollapse,
}) => {
  const router = useRouter();
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const sidebarWidth = collapsed ? "w-16" : "w-64";

  // Icon components
  const DashboardIcon = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2V7z" />
    </svg>
  );

  const ExplorerIcon = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );

  const ReportsIcon = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );

  const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <svg 
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );

  // Fixed navigation items
  const navigationItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: DashboardIcon,
    },
    {
      name: "Data Explorer", 
      path: "/data-explorer",
      icon: ExplorerIcon,
    },
  ];

  const toggleExpanded = (itemId: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const handleReportClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      router.push("/dashboard");
    } else if (item.type === "report") {
      router.push(`/reports?menu=${item.id}`);
    }
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const isActive = currentPath.includes(`menu=${item.id}`) || 
                    (currentPath === '/reports' && router.query.menu === item.id.toString());

    return (
      <div key={item.id}>
        <div
          className={`
            flex items-center px-3 py-2 text-sm font-medium cursor-pointer rounded-lg
            transition-all duration-200 group mb-1
            ${level > 0 ? "ml-4" : ""}
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
              handleReportClick(item);
            }
          }}
        >
          <div className="flex-shrink-0 mr-3">
            <ReportsIcon />
          </div>

          {!collapsed && (
            <>
              <span className="flex-1">{item.name}</span>
              {hasChildren && (
                <ChevronIcon expanded={isExpanded} />
              )}
            </>
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

  return (
    <div
      className={`${sidebarWidth} bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col transition-all duration-300 shadow-xl`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Analytics Pro
            </h2>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
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

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {/* Fixed Navigation Items */}
        {navigationItems.map((item) => {
          const isActive = currentPath === item.path;
          const IconComponent = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`flex items-center space-x-3 px-3 py-3 rounded-lg transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg"
                    : "hover:bg-gray-700"
                }`}
              >
                <IconComponent />
                {!collapsed && (
                  <span className="font-medium">{item.name}</span>
                )}
              </div>
            </Link>
          );
        })}

        {/* Reports Section */}
        {menuItems.length > 0 && (
          <>
            {!collapsed && (
              <div className="pt-4 pb-2">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Reports
                </h3>
              </div>
            )}
            
            {/* Dynamic Menu Items */}
            {menuItems.filter((item) => item.type !== "dashboard").map((item) => renderMenuItem(item))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        {!collapsed && (
          <div className="text-xs text-gray-400 text-center">
            <p>Analytics Platform v2.0</p>
            <p className="mt-1">© 2024 Financial Systems</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
