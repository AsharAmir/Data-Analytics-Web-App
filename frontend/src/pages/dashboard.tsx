import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import Sidebar from "../components/Layout/Sidebar";
import ChartComponent from "../components/Charts/ChartComponent";
import { DashboardWidget, MenuItem, ChartData, TableData } from "../types";

const DashboardPage: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [widgetData, setWidgetData] = useState<Record<number, any>>({});

  useEffect(() => {
    // Check authentication
    if (!apiClient.isAuthenticated()) {
      router.push("/login");
      return;
    }

    loadDashboardData();
  }, [router]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load menu items and dashboard layout in parallel
      const [menuResponse, widgetsResponse] = await Promise.all([
        apiClient.getMenuItems(),
        apiClient.getDashboardLayout(),
      ]);

      setMenuItems(menuResponse);
      setWidgets(widgetsResponse);

      // Load data for each widget
      const widgetDataPromises = widgetsResponse.map(async (widget) => {
        try {
          const data = await apiClient.getWidgetData(widget.id);
          return { widgetId: widget.id, data };
        } catch (error) {
          console.error(`Error loading data for widget ${widget.id}:`, error);
          return { widgetId: widget.id, data: null };
        }
      });

      const widgetDataResults = await Promise.all(widgetDataPromises);
      const widgetDataMap: Record<number, any> = {};

      widgetDataResults.forEach((result) => {
        if (result.data && result.data.success) {
          widgetDataMap[result.widgetId] = result.data;
        }
      });

      setWidgetData(widgetDataMap);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      // Already on dashboard, maybe refresh or scroll to top
      window.scrollTo(0, 0);
    } else if (item.type === "report") {
      router.push(`/reports?menu=${item.id}`);
    }
  };

  const renderWidget = (widget: DashboardWidget) => {
    const data = widgetData[widget.id];

    if (!data || !data.success) {
      return (
        <div className="bg-white rounded-lg shadow p-6 min-h-[300px] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading chart data...</p>
          </div>
        </div>
      );
    }

    const isChartData = data.chart_type && data.data && "labels" in data.data;

    return (
      <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {widget.title}
          </h3>
          {data.execution_time && (
            <p className="text-xs text-gray-500">
              Executed in {(data.execution_time * 1000).toFixed(2)}ms
            </p>
          )}
        </div>
        <div className="p-4">
          {isChartData ? (
            <ChartComponent
              data={data.data as ChartData}
              type={data.chart_type}
              config={data.chart_config}
              height={300}
            />
          ) : (
            <div className="min-h-[300px] flex items-center justify-center">
              <p className="text-gray-500">No chart data available</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar
        menuItems={menuItems}
        currentPath="/dashboard"
        onMenuClick={handleMenuClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-600">Financial Analytics Overview</p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={loadDashboardData}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors duration-200 flex items-center space-x-2"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Refresh</span>
                </button>
                <div className="text-sm text-gray-500">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-6">
          {widgets.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {widgets.map((widget) => (
                <div
                  key={widget.id}
                  className={`
                    col-span-1
                    ${widget.width >= 12 ? "lg:col-span-2 xl:col-span-3" : ""}
                    ${widget.width >= 8 ? "lg:col-span-2" : ""}
                  `}
                >
                  {renderWidget(widget)}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No widgets configured
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by configuring your dashboard widgets.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;
