import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom"; // Import createPortal
import { useRouter } from "next/router";
import Sidebar from "../components/Layout/Sidebar";
import apiClient from "../lib/api";
import { MenuItem, QueryResult, TableData, ChartData } from "../types";
import DataTable from "../components/ui/DataTable";
import ChartComponent from "../components/Charts/ChartComponent";
import { toast } from "react-hot-toast";
import { logger } from "../lib/logger";

type WidgetBinding = {
  queryId: number;
  widgetType: "chart" | "table" | "kpi" | "html";
  chartType?: "bar" | "line" | "pie" | "doughnut";
  container: HTMLElement;
};

const InteractiveDashboardPage: React.FC = () => {
  const router = useRouter();
  const { menu } = router.query;

  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [currentMenu, setCurrentMenu] = useState<MenuItem | null>(null);
  const [bindings, setBindings] = useState<WidgetBinding[]>([]);
  const [results, setResults] = useState<Record<number, QueryResult>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  const loadMenuAndLayout = useCallback(async () => {
    setLoading(true);
    try {
      const items = await apiClient.getMenuItems();
      setMenuItems(items);

      const id = parseInt((menu as string) || "", 10);
      const selected =
        !isNaN(id) && items.find((m) => m.id === id)
          ? (items.find((m) => m.id === id) as MenuItem)
          : null;
      setCurrentMenu(selected ?? null);

      if (!selected || !selected.is_interactive_dashboard) {
        setBindings([]);
        setResults({});
        return;
      }
    } catch (err) {
      logger.error("Failed to load interactive dashboard menu", { err, menu });
      toast.error("Unable to load interactive dashboard");
    } finally {
      setLoading(false);
    }
  }, [menu]);

  // Parse the interactive template into widget and filter bindings
  const parseLayout = useCallback(() => {
    if (!currentMenu?.interactive_template || !layoutRef.current) {
      setBindings([]);
      return;
    }

    const container = layoutRef.current;
    // Clear any previous content
    container.innerHTML = "";
    container.innerHTML = currentMenu.interactive_template || "";

    const widgetNodes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-query-id]"),
    );

    const parsed: WidgetBinding[] = [];

    widgetNodes.forEach((el) => {
      const qid = parseInt(el.getAttribute("data-query-id") || "", 10);
      if (isNaN(qid)) return;

      const widgetType =
        (el.getAttribute("data-widget-type") as WidgetBinding["widgetType"]) ||
        "chart";
      const chartTypeAttr = el.getAttribute(
        "data-chart-type",
      ) as WidgetBinding["chartType"];

      parsed.push({
        queryId: qid,
        widgetType,
        chartType:
          chartTypeAttr === "line" || chartTypeAttr === "pie"
            ? chartTypeAttr
            : "bar",
        container: el,
      });
    });

    setBindings(parsed);
  }, [currentMenu]);

  // Load menu + layout on first render / menu change
  useEffect(() => {
    if (!apiClient.isAuthenticated()) {
      router.replace("/login");
      return;
    }
    loadMenuAndLayout();
  }, [loadMenuAndLayout, router]);

  // When currentMenu or its template changes, re-parse the DOM
  useEffect(() => {
    if (!currentMenu?.interactive_template) return;
    parseLayout();
  }, [currentMenu, parseLayout]);

  // Fetch data for all bound queries, taking into account active filters
  const refreshData = useCallback(async () => {
    if (!bindings.length) return;
    if (!currentMenu) return;

    try {
      const newResults: Record<number, QueryResult> = { ...results };

      // Build filters per query from inputs with data-filter attribute
      const filterRoot = layoutRef.current;
      const filterControls = filterRoot
        ? Array.from(
          filterRoot.querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          >("[data-filter][data-query-id][data-column]"),
        )
        : [];

      const filtersByQuery: Record<
        number,
        { column: string; operator: string; value: any }[]
      > = {};

      filterControls.forEach((el) => {
        const qid = parseInt(el.getAttribute("data-query-id") || "", 10);
        if (isNaN(qid)) return;
        const column = (el.getAttribute("data-column") || "").trim();
        const operator = (el.getAttribute("data-operator") || "eq").toLowerCase();
        const value = (el as any).value;
        if (!column || value === "" || value === null || value === undefined)
          return;
        if (!filtersByQuery[qid]) filtersByQuery[qid] = [];
        filtersByQuery[qid].push({ column, operator, value });
      });

      await Promise.all(
        bindings.map(async (b) => {
          try {
            const conditions = (filtersByQuery[b.queryId] || []).map((f) => ({
              column: f.column,
              operator: f.operator as any,
              value: f.value,
            }));

            const res = await apiClient.executeFilteredQuery({
              query_id: b.queryId,
              filters: conditions.length
                ? { conditions, logic: "AND" as const }
                : undefined,
              limit: 1000,
              offset: 0,
            });
            newResults[b.queryId] = res;
          } catch (err) {
            logger.error("Interactive dashboard query failed", {
              queryId: b.queryId,
              error: err,
            });
          }
        }),
      );

      setResults(newResults);
    } catch (err) {
      logger.error("Failed to refresh interactive dashboard data", { err });
      toast.error("Failed to refresh dashboard data");
    }
  }, [bindings, currentMenu, results]);

  // Attach global handler for filter form submissions and input changes
  useEffect(() => {
    const root = layoutRef.current;
    if (!root) return;

    const onSubmit = (e: Event) => {
      if ((e.target as HTMLElement).tagName.toLowerCase() === "form") {
        e.preventDefault();
        refreshData();
      }
    };

    const onChange = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.hasAttribute("data-filter")) {
        refreshData();
      }
    };

    root.addEventListener("submit", onSubmit);
    root.addEventListener("change", onChange);
    return () => {
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("change", onChange);
    };
  }, [refreshData, layoutRef.current]);

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      if (item.is_interactive_dashboard) {
        router.push(`/interactive-dashboard?menu=${item.id}`);
      } else {
        router.push(`/dashboard?menu=${item.id}`);
      }
    } else if (item.type === "report") {
      router.push(`/reports?menu=${item.id}`);
    }
    if (mobileMenuOpen) setMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-lg text-gray-700 font-medium">
            Loading interactive dashboard...
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Preparing widgets and data sources
          </p>
        </div>
      </div>
    );
  }

  if (!currentMenu || !currentMenu.is_interactive_dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">
          No interactive dashboard is configured for this menu.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex">
      <Sidebar
        menuItems={menuItems}
        currentPath="/interactive-dashboard"
        onMenuClick={handleMenuClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
          }`}
      >
        <header className="bg-white shadow-sm border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {currentMenu.name}
              </h1>
              <p className="text-sm text-gray-500">
                Interactive dashboard powered by custom HTML layout and saved
                queries.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={refreshData}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700"
            >
              <svg
                className="h-4 w-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9H4m0 0V4m16 16v-5h-.582m-15.356-2A8.001 8.001 0 0019.418 15H20m0 0v5"
                />
              </svg>
              Refresh Data
            </button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <div
            ref={layoutRef}
            className="bg-white rounded-xl shadow-md p-4 min-h-[400px]"
          />

          {/* Use Portals to render into the containers found in parseLayout */}
          {bindings.map((b) => {
            const result = results[b.queryId];
            if (!result || !result.data) return null;

            // Ensure container is still in document
            if (!document.body.contains(b.container)) return null;

            let content = null;

            if (b.widgetType === "table") {
              const table = result.data as TableData;
              content = <DataTable data={table} loading={false} />;
            } else if (b.widgetType === "chart") {
              const data = result.data as ChartData;
              content = (
                <ChartComponent
                  type={b.chartType || "bar"}
                  data={data}
                  config={result.chart_config}
                />
              );
            }

            return content ? createPortal(content, b.container) : null;
          })}
        </main>
      </div>
    </div>
  );
};

export default InteractiveDashboardPage;
