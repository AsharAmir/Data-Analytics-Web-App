import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import apiClient from "../../lib/api";
import Sidebar from "../Layout/Sidebar";
import KPICard from "../ui/KPICard";
import ChartComponent from "../Charts/ChartComponent";
import DataTable from "../ui/DataTable";
import { logger } from "../../lib/logger";

import {
  DashboardWidget,
  MenuItem,
  ChartData,
  TableData,
  QueryResult,
} from "../../types";

interface Kpi {
  id: string;
  title: string;
  value: string;
  change: {
    value: number;
    type: "neutral" | "increase" | "decrease";
    period: string;
  };
  icon: React.ReactNode;
  color: "green" | "blue" | "purple" | "indigo";
}

interface BackendKPI {
  id: number;
  label: string;
  value: number | string;
}

const Dashboard: React.FC = () => {
  const router = useRouter();
  const { menu } = router.query;
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [widgetData, setWidgetData] = useState<Record<number, QueryResult>>({});
  const [currentMenuName, setCurrentMenuName] =
    useState<string>("Default Dashboard");
  const [backendKpis, setBackendKpis] = useState<BackendKPI[]>([]);
  /*
    Users can choose which widget should power the main summary metric KPI card.
    We no longer depend on a dedicated KPI API/table – instead we calculate the
    total directly from the data already fetched for each widget. The chosen
    widget id is persisted in localStorage so that the preference survives
    reloads.
  */
  const [summaryWidgetId, setSummaryWidgetId] = useState<number | null>(null);
  const [selectedView, setSelectedView] = useState<
    "overview" | "charts" | "tables"
  >("overview");
  const [widgetsLoading, setWidgetsLoading] = useState<Record<number, boolean>>(
    {},
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // KPI customization state
  const [kpiPrefs, setKpiPrefs] = useState<Record<string, boolean>>({
    totalRecords: true,
    activeCharts: true,
    dataTables: true,
    avgQueryTime: true,
  });
  const [showKpiConfig, setShowKpiConfig] = useState(false);

  // Dashboard widget visibility preferences (id -> visible)
  const [widgetPrefs, setWidgetPrefs] = useState<Record<number, boolean>>({});

  // Layout state and edit mode

  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);

  // Icon components
  const CurrencyIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
      />
    </svg>
  );

  const UsersIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
      />
    </svg>
  );

  const TrendingIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  );

  const ClockIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );

  const ChartIcon = () => (
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
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );

  const EyeIcon = () => (
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
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );

  // Load widget data with proper error handling and logging
  const loadWidgetData = useCallback(async (widgetId: number, isRefresh: boolean = false) => {
    setWidgetsLoading((prev) => ({ ...prev, [widgetId]: true }));

    try {
      logger.debug(`Loading widget data`, { widgetId, isRefresh });
      const data = await apiClient.getWidgetData(widgetId);
      
      if (data && data.success) {
        setWidgetData((prev) => ({ ...prev, [widgetId]: data }));
        logger.debug(`Widget data loaded successfully`, { widgetId, executionTime: data.execution_time });
      } else {
        logger.warn(`Widget returned unsuccessful response`, { widgetId, error: data?.error });
        setWidgetData((prev) => ({
          ...prev,
          [widgetId]: {
            success: false,
            error: data?.error || "Widget failed to load",
            execution_time: 0,
          },
        }));
      }
    } catch (error) {
      logger.error(`Error loading widget data`, { widgetId, error });
      setWidgetData((prev) => ({
        ...prev,
        [widgetId]: {
          success: false,
          error: "Failed to load widget data.",
          execution_time: 0,
        },
      }));
    } finally {
      setWidgetsLoading((prev) => ({ ...prev, [widgetId]: false }));
    }
  }, []);

  const loadDashboardData = React.useCallback(async () => {
    setLoading(true);
    try {
      // Parse menu ID from query parameter
      const menuId = menu ? parseInt(menu as string, 10) : undefined;

      // Load layout, menu, and KPIs first (fast operations)
      // Fetch KPI data from the correct backend endpoint. The backend exposes KPIs at `/api/kpis` (optionally filtered by `menu_id`)
      // rather than `/api/dashboard/kpis`. Pointing to the wrong URL resulted in a 404 error during runtime.
      // We keep the same conditional to append the menu filter when provided.
      const kpisUrl = menuId ? `/api/kpis?menu_id=${menuId}` : "/api/kpis";
      const [menuResponse, widgetsResponse, kpisResponse] = await Promise.all([
        apiClient.getMenuItems(),
        apiClient.getDashboardLayout(menuId),
        apiClient.get<BackendKPI[]>(kpisUrl).catch(() => []), // Fallback to empty array if fails
      ]);

      setMenuItems(menuResponse);
      setWidgets(widgetsResponse);
      setBackendKpis(kpisResponse);

      // Update current menu name
      if (menuId) {
        const selectedMenu = menuResponse.find((item) => item.id === menuId);
        setCurrentMenuName(selectedMenu?.name || `Dashboard #${menuId}`);
      } else {
        setCurrentMenuName("Default Dashboard");
      }
      // Load summary widget preference once
      if (summaryWidgetId === null && typeof window !== "undefined") {
        const stored = localStorage.getItem("dashboard.summaryWidget");
        if (stored) {
          setSummaryWidgetId(parseInt(stored, 10));
        }
      }

      // Show the UI immediately after getting widgets
      setLoading(false);

      // Ensure widgetPrefs has an entry for every widget we received
      setWidgetPrefs((prev) => {
        const updated: Record<number, boolean> = { ...prev };
        widgetsResponse.forEach((w) => {
          if (updated[w.id] === undefined) {
            updated[w.id] = true; // default to visible
          }
        });
        return updated;
      });

      // Load widget data for all widgets
      widgetsResponse.forEach((widget) => {
        loadWidgetData(widget.id);
      });
    } catch (error) {
      logger.error("Error loading dashboard data", { error, menu });
      setLoading(false);
    }
  }, [menu, summaryWidgetId, loadWidgetData]);

  // Refresh all widgets data
  const refreshWidgets = useCallback(async () => {
    if (widgets.length === 0) return;
    
    setIsRefreshing(true);
    logger.info("Refreshing all widgets", { widgetCount: widgets.length });
    
    try {
      // Refresh all widgets concurrently
      await Promise.all(widgets.map(widget => loadWidgetData(widget.id, true)));
      setLastRefresh(new Date());
      logger.info("All widgets refreshed successfully");
    } catch (error) {
      logger.error("Error refreshing widgets", { error });
    } finally {
      setIsRefreshing(false);
    }
  }, [widgets, loadWidgetData]);

  // Auto-refresh widgets every 5 minutes
  useEffect(() => {
    if (widgets.length === 0) return;
    
    const interval = setInterval(() => {
      refreshWidgets();
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(interval);
  }, [widgets, refreshWidgets]);

  useEffect(() => {
    if (!apiClient.isAuthenticated()) {
      router.push("/login");
      return;
    }
    loadDashboardData();
  }, [router, loadDashboardData]);

  // Calculate KPIs from actual widget data
  const calculateKPIs = () => {
    const kpis: Kpi[] = [];

    // 1) Add backend KPIs first (custom KPIs from admin panel)
    backendKpis.forEach((backendKpi) => {
      kpis.push({
        id: `backend-kpi-${backendKpi.id}`,
        title: backendKpi.label,
        value:
          typeof backendKpi.value === "number"
            ? backendKpi.value.toLocaleString()
            : String(backendKpi.value),
        change: { value: 0, type: "neutral" as const, period: "custom metric" },
        icon: <CurrencyIcon />,
        color: "green" as const,
      });
    });

    // 2) If user selected a specific widget as summary metric and we have its data
    if (summaryWidgetId !== null && widgetData[summaryWidgetId]) {
      const data = widgetData[summaryWidgetId];
      let total = 0;
      if (data.chart_type && data.data && "labels" in data.data) {
        const chartData = data.data as ChartData;
        chartData.datasets.forEach((ds) => {
          ds.data.forEach((v) => {
            if (typeof v === "number") total += v;
          });
        });
      } else if (data.data && "total_count" in data.data) {
        const tableData = data.data as TableData;
        total = tableData.total_count || tableData.data.length;
      }

      const widgetTitle =
        widgets.find((w) => w.id === summaryWidgetId)?.title || "Summary";
      kpis.push({
        id: "summaryMetric",
        title: widgetTitle,
        value: total.toLocaleString(),
        change: { value: 0, type: "neutral", period: "current snapshot" },
        icon: <CurrencyIcon />,
        color: "green",
      });
    }
    return kpis;
  };

  const renderWidget = (widget: DashboardWidget) => {
    const data = widgetData[widget.id];
    const isLoading = widgetsLoading[widget.id];

    // Show skeleton while loading
    if (isLoading || !data) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-5 bg-gray-200 rounded w-32 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="h-80 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      );
    }

    if (!data || !data.success) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-red-200">
          <div className="p-6 border-b border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {widget.title}
                </h3>
                <p className="text-sm text-red-600 mt-1">
                  {data?.error || "Failed to load widget data"}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => loadWidgetData(widget.id)}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded-md text-sm hover:bg-red-200 transition-colors"
                  title="Retry loading"
                >
                  <svg
                    className="w-4 h-4"
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
                </button>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-col items-center justify-center h-80 text-gray-500">
              <svg
                className="w-16 h-16 mb-4 text-red-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <p className="text-sm font-medium mb-2">Widget Error</p>
              <p className="text-xs text-center max-w-xs">
                This widget couldn&apos;t load properly. Click the retry button
                above or refresh the dashboard.
              </p>
            </div>
          </div>
        </div>
      );
    }

    const isChartData = data.chart_type && data.data && "labels" in data.data;

    if (isChartData) {
      return (
        <ChartComponent
          data={data.data as ChartData}
          type={
            data.chart_type as
              | "bar"
              | "line"
              | "pie"
              | "doughnut"
              | "scatter"
              | "bubble"
              | "polarArea"
              | "radar"
              | "area"
          }
          config={data.chart_config}
          title={widget.title}
          description={`Executed in ${(data.execution_time! * 1000).toFixed(2)}ms`}
          height={350}
          onDataPointClick={(datasetIndex, index, value) => {
            console.log("Data point clicked:", { datasetIndex, index, value });
          }}
        />
      );
    } else {
      return (
        <DataTable
          data={data.data as TableData}
          onSort={(column, direction) => {
            console.log("Sort:", column, direction);
          }}
          onExport={(format) => {
            console.log("Export:", format);
          }}
        />
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-lg text-gray-700 font-medium">
            Loading your dashboard...
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Preparing the latest analytics
          </p>
        </div>
      </div>
    );
  }

  const kpis = calculateKPIs();

  // Component for KPI configuration modal
  const KpiConfigModal = () => {
    if (!showKpiConfig) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
        <div className="bg-white rounded-xl shadow-lg p-4 lg:p-6 w-full max-w-sm lg:w-80 max-h-screen overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Customize Summary Widgets
            </h3>
            <button
              onClick={() => setShowKpiConfig(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              aria-label="Close modal"
            >
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="space-y-3">
            {Object.entries(kpiPrefs).map(([key, value]) => (
              <label key={key} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600"
                  checked={value}
                  onChange={() =>
                    setKpiPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                />
                <span className="capitalize text-sm text-gray-700">
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
              </label>
            ))}

            {/* Select summary metric based on existing widgets */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Summary Metric (choose widget)
              </label>
              <select
                className="w-full border-gray-300 rounded-md text-sm"
                value={summaryWidgetId ?? ""}
                onChange={(e) => {
                  const wid = parseInt(e.target.value, 10);
                  setSummaryWidgetId(wid);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(
                      "dashboard.summaryWidget",
                      String(wid),
                    );
                  }
                }}
              >
                <option value="">-- Default (Total Records) --</option>
                {widgets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Divider */}
            <hr className="my-3" />
            <h4 className="text-sm font-semibold text-gray-800 mb-2">
              Dashboard Widgets
            </h4>
            {widgets.map((w) => (
              <label
                key={`widget-toggle-${w.id}`}
                className="flex items-center space-x-2"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600"
                  checked={widgetPrefs[w.id] ?? true}
                  onChange={() =>
                    setWidgetPrefs((prev) => ({ ...prev, [w.id]: !prev[w.id] }))
                  }
                />
                <span className="text-sm text-gray-700">{w.title}</span>
              </label>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowKpiConfig(false)}
              className="px-4 py-3 lg:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm touch-manipulation"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex">
      {/* Sidebar */}
      <Sidebar
        menuItems={menuItems}
        currentPath="/dashboard"
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-0 min-w-0">
        {/* Enhanced Header */}
        <header className="bg-white shadow-lg border-b border-gray-100 relative overflow-hidden z-30">
          {/* Background decorative element */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/30 via-transparent to-indigo-50/30"></div>

          <div className="relative px-4 lg:px-6 py-3 lg:py-4">
            <div className="flex items-center justify-between">
              {/* Left side - Mobile hamburger + Logo */}
              <div className="flex items-center space-x-3">
                {/* Mobile hamburger menu */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                  aria-label="Toggle menu"
                >
                  <svg
                    className="w-6 h-6 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={
                        mobileMenuOpen
                          ? "M6 18L18 6M6 6l12 12"
                          : "M4 6h16M4 12h16M4 18h16"
                      }
                    />
                  </svg>
                </button>

                {/* Logo and title */}
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg
                      className="w-4 h-4 text-white"
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
                  </div>
                  <div className="hidden sm:block">
                    <h1 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-gray-900 via-blue-700 to-indigo-600 bg-clip-text text-transparent">
                      {currentMenuName}
                    </h1>
                    <p className="text-xs lg:text-sm text-gray-500 -mt-0.5 hidden md:block">
                      Real-time insights & reporting
                    </p>
                  </div>
                </div>

                {/* Compact status indicators - Hidden on small screens */}
                <div className="hidden xl:flex items-center space-x-4 ml-6">
                  <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Live</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      />
                    </svg>
                    <span>{widgets.length} widgets</span>
                  </div>
                </div>
              </div>

              {/* Right side - Actions */}
              <div className="flex items-center space-x-2">
                {/* Refresh Button */}
                <button
                  onClick={refreshWidgets}
                  disabled={isRefreshing}
                  className={`p-2 rounded-lg transition-colors touch-manipulation ${
                    isRefreshing
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "hover:bg-gray-100 text-gray-600 hover:text-blue-600"
                  }`}
                  title={lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : "Refresh all widgets"}
                  aria-label="Refresh widgets"
                >
                  <svg
                    className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
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
                </button>
                {/* View Toggle - Desktop only */}
                <div className="hidden lg:flex bg-gray-100 rounded-lg p-0.5">
                  {[
                    { key: "overview", label: "Overview", icon: EyeIcon },
                    { key: "charts", label: "Charts", icon: ChartIcon },
                    { key: "tables", label: "Tables", icon: UsersIcon },
                  ].map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() =>
                        setSelectedView(key as "overview" | "charts" | "tables")
                      }
                      className={`px-2 lg:px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all duration-200 text-xs font-medium ${
                        selectedView === key
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      <Icon />
                      <span className="hidden xl:inline">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Mobile View Dropdown */}
                <div className="lg:hidden">
                  <select
                    value={selectedView}
                    onChange={(e) =>
                      setSelectedView(
                        e.target.value as "overview" | "charts" | "tables",
                      )
                    }
                    className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 touch-manipulation"
                  >
                    <option value="overview">Overview</option>
                    <option value="charts">Charts</option>
                    <option value="tables">Tables</option>
                  </select>
                </div>

                {/* Primary Actions */}
                <div className="flex items-center space-x-1.5">
                  {/* Refresh Button */}
                  <button
                    onClick={() => loadDashboardData()}
                    className="px-2 lg:px-3 py-1.5 lg:py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center space-x-1 lg:space-x-1.5 shadow-md hover:shadow-lg text-xs lg:text-sm font-medium touch-manipulation"
                    title="Refresh data"
                  >
                    <TrendingIcon />
                    <span className="hidden md:inline">Refresh</span>
                  </button>

                  {/* Layout Actions Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        console.log(
                          "Dropdown button clicked, current state:",
                          showLayoutDropdown,
                        );
                        setShowLayoutDropdown(!showLayoutDropdown);
                      }}
                      className="px-2 lg:px-3 py-1.5 lg:py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200 flex items-center space-x-1 lg:space-x-1.5 shadow-sm text-xs lg:text-sm font-medium touch-manipulation"
                      title="Layout options"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                        />
                      </svg>
                      <span className="hidden md:inline">Layout</span>
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${showLayoutDropdown ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Global Dropdown Portal */}
                  {showLayoutDropdown && (
                    <>
                      {/* Backdrop to close dropdown */}
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => {
                          console.log("Backdrop clicked, closing dropdown");
                          setShowLayoutDropdown(false);
                        }}
                      ></div>

                      {/* Dropdown Content */}
                      <div
                        className="fixed w-48 lg:w-52 bg-white border border-gray-200 rounded-lg shadow-2xl z-[9999]"
                        style={{
                          top: window.innerWidth < 768 ? "60px" : "70px", // Adjusted for mobile header
                          right: window.innerWidth < 768 ? "8px" : "32px", // Closer to edge on mobile
                        }}
                      >
                        <div className="py-1">
                          <button
                            onClick={() => {
                              console.log("Customize Widgets clicked");
                              setShowKpiConfig(true);
                              setShowLayoutDropdown(false);
                            }}
                            className="w-full px-4 py-3 lg:py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 touch-manipulation"
                          >
                            <ClockIcon />
                            <span>Customize Widgets</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-4 lg:p-8 space-y-4 lg:space-y-8 overflow-x-hidden">
          {/* KPI Cards */}
          {selectedView === "overview" &&
            Object.keys(widgetData).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
                {kpis
                  .filter((kpi) => kpiPrefs[kpi.id] ?? true)
                  .map((kpi, index) => (
                    <KPICard
                      key={index}
                      title={kpi.title}
                      value={kpi.value}
                      change={kpi.change}
                      icon={kpi.icon}
                      color={kpi.color}
                    />
                  ))}
              </div>
            )}

          {/* Widgets Grid */}
          {widgets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {widgets
                .filter((w) => widgetPrefs[w.id])
                .filter((widget) => {
                  const data = widgetData[widget.id];
                  if (selectedView === "charts") {
                    return (
                      data?.chart_type && data.data && "labels" in data.data
                    );
                  } else if (selectedView === "tables") {
                    return data?.data && "columns" in data.data;
                  }
                  return true;
                })
                .map((widget) => (
                  <div key={widget.id}>{renderWidget(widget)}</div>
                ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No widgets in this dashboard
              </h3>
              <p className="text-gray-500 mb-4">
                {menu
                  ? "This custom dashboard doesn't have any widgets yet."
                  : "No default widgets are configured."}
              </p>
              <p className="text-sm text-gray-400">
                Visit the Admin Panel to create queries and add widgets to this
                dashboard.
              </p>
            </div>
          )}

          {/* Footer Info - Show real data metrics */}
          <div className="text-center py-4 lg:py-6 border-t border-gray-200">
            <p className="text-xs lg:text-sm text-gray-500 space-y-1">
              <span className="block sm:inline">
                Last updated: {new Date().toLocaleString()}
              </span>
              <span className="hidden sm:inline"> | </span>
              <span className="block sm:inline">
                Total widgets: {widgets.length}
              </span>
              <span className="hidden sm:inline"> | </span>
              <span className="block sm:inline">
                Active data sources: {Object.keys(widgetData).length}
              </span>
            </p>
          </div>
          {/* Modal Render */}
          <KpiConfigModal />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
