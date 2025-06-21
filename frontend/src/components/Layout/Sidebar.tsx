import React, { useState } from "react";
import {
  ChartBarIcon,
  HomeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { MenuItem } from "../../types";

interface SidebarProps {
  menuItems: MenuItem[];
  currentPath: string;
  onMenuClick: (item: MenuItem) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const iconMap: Record<string, any> = {
  dashboard: HomeIcon,
  "chart-bar": ChartBarIcon,
  "chart-line": ChartBarIcon,
  "shield-exclamation": ChartBarIcon,
  // Add more icons as needed
};

const Sidebar: React.FC<SidebarProps> = ({
  menuItems,
  currentPath,
  onMenuClick,
  collapsed = false,
  onToggleCollapse,
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleExpanded = (itemId: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const IconComponent = iconMap[item.icon || "chart-bar"] || ChartBarIcon;
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const isActive = currentPath.includes(item.name.toLowerCase());

    return (
      <div key={item.id} className="relative">
        <div
          className={`
            flex items-center px-4 py-3 text-sm font-medium cursor-pointer
            transition-colors duration-200 group
            ${level > 0 ? "pl-8" : ""}
            ${
              isActive
                ? "bg-primary-100 text-primary-900 border-r-2 border-primary-500"
                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            }
          `}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.id);
            } else {
              onMenuClick(item);
            }
          }}
        >
          <IconComponent
            className={`
              h-5 w-5 mr-3 flex-shrink-0
              ${
                isActive
                  ? "text-primary-600"
                  : "text-gray-400 group-hover:text-gray-500"
              }
              ${collapsed ? "mr-0" : "mr-3"}
            `}
          />

          {!collapsed && (
            <>
              <span className="flex-1">{item.name}</span>
              {hasChildren && (
                <div className="ml-auto">
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Render children */}
        {hasChildren && isExpanded && !collapsed && (
          <div className="bg-gray-50">
            {item.children.map((child) => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`
      bg-white shadow-lg border-r border-gray-200 transition-all duration-300
      ${collapsed ? "w-16" : "w-64"}
      h-full flex flex-col
    `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          {collapsed ? (
            <Bars3Icon className="h-5 w-5 text-gray-600" />
          ) : (
            <XMarkIcon className="h-5 w-5 text-gray-600" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        <div className="py-2">
          {menuItems.map((item) => renderMenuItem(item))}
        </div>
      </nav>

      {/* User section */}
      {!collapsed && (
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">U</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">User</p>
              <p className="text-xs text-gray-500">Admin</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
