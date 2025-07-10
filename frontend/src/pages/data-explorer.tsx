import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import Sidebar from "../components/Layout/Sidebar";
import DataTable from "../components/ui/DataTable";
import ChartComponent from "../components/Charts/ChartComponent";
import { MenuItem, QueryResult, TableData, ChartData } from "../types";
import ExportModal from "../components/DataExplorer/ExportModal";
import CustomQueryModal from "../components/DataExplorer/CustomQueryModal";
import CustomQueryCard from "../components/DataExplorer/CustomQueryCard";
import { toast } from "react-hot-toast";

// Export Options Modal Component
// Components extracted to separate files

// Custom Query Modal Component
// Components extracted to separate files

// Custom Query Management Component
// Components extracted to separate files

const DataExplorerPage: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sqlQuery, setSqlQuery] = useState(
    "SELECT * FROM SAMPLE_BT WHERE ROWNUM <= 100",
  );
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [limit, setLimit] = useState(1000);
  const [offset, setOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [customQueries, setCustomQueries] = useState<
    { name: string; query: string }[]
  >([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuery, setEditingQuery] = useState<{
    name: string;
    query: string;
    index: number;
  } | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"excel" | "csv">("csv");
  const [exportLoading, setExportLoading] = useState(false);

  // Load custom queries from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("customQueries");
    if (saved) {
      try {
        setCustomQueries(JSON.parse(saved));
      } catch {
        console.warn("Failed to parse saved custom queries");
      }
    }
  }, []);

  useEffect(() => {
    if (!apiClient.isAuthenticated()) {
      router.push("/login");
      return;
    }
    loadMenuItems();
  }, [router]);

  const loadMenuItems = async () => {
    try {
      const menuResponse = await apiClient.getMenuItems();
      setMenuItems(menuResponse);
    } catch (error) {
      console.error("Error loading menu items:", error);
    }
  };

  const executeQuery = async (newOffset = 0, newLimit = limit) => {
    setLoading(true);
    try {
      const result = await apiClient.executeQuery({
        sql_query: sqlQuery,
        limit: newLimit,
        offset: newOffset,
      });
      setLimit(newLimit);
      setOffset(newOffset);
      setQueryResult(result);
    } catch (error) {
      console.error("Error executing query:", error);
      setQueryResult({
        success: false,
        error: "Failed to execute query",
      });
    } finally {
      setLoading(false);
    }
  };

  const sampleQueries = [
    {
      name: "All Financial Data",
      query: "SELECT * FROM SAMPLE_BT WHERE ROWNUM <= 100",
    },
    {
      name: "Contract Summary",
      query:
        "SELECT CT_PRINACT, COUNT(*) as count, AVG(FCC_ION) as avg_ion FROM SAMPLE_BT GROUP BY CT_PRINACT HAVING COUNT(*) > 5",
    },
    {
      name: "Risk Analysis",
      query:
        "SELECT BT_AS_PRAP_IN_RO, SUM(FCC_BKV) as total_value FROM SAMPLE_BT GROUP BY BT_AS_PRAP_IN_RO ORDER BY total_value DESC",
    },
    {
      name: "Daily Summary",
      query:
        "SELECT DAY_OF, CT_MAIN, SUM(FCC_BKV) as total_bkv FROM SAMPLE_BT GROUP BY DAY_OF, CT_MAIN ORDER BY DAY_OF, CT_MAIN",
    },
  ];

  // ---------- Custom Queries Helpers ----------
  const saveCustomQueries = (queries: { name: string; query: string }[]) => {
    setCustomQueries(queries);
    localStorage.setItem("customQueries", JSON.stringify(queries));
  };

  const addCustomQuery = (name: string, query: string) => {
    saveCustomQueries([...customQueries, { name, query }]);
  };

  const editCustomQuery = (index: number, name: string, query: string) => {
    const updated = [...customQueries];
    updated[index] = { name, query };
    saveCustomQueries(updated);
    setEditingQuery(null);
  };

  const deleteCustomQuery = (index: number) => {
    if (!confirm("Are you sure you want to delete this custom query?")) return;
    const updated = customQueries.filter((_, i) => i !== index);
    saveCustomQueries(updated);
  };

  const handleModalSave = (name: string, query: string) => {
    if (editingQuery !== null) {
      editCustomQuery(editingQuery.index, name, query);
    } else {
      addCustomQuery(name, query);
    }
  };

  const openEditModal = (
    query: { name: string; query: string },
    index: number,
  ) => {
    setEditingQuery({ ...query, index });
    setIsModalOpen(true);
  };

  /**
   * Helper to export the data currently visible in the table (after local search / filter / pagination).
   * Only CSV is fully supported client-side; Excel falls back to CSV with .xlsx extension for convenience.
   */
  const exportCurrentView = (format: "excel" | "csv") => {
    if (
      !queryResult?.success ||
      !queryResult.data ||
      !("columns" in queryResult.data)
    ) {
      console.error("No data available for current view export");
      return;
    }

    const tableData = queryResult.data as TableData;

    // Build CSV content
    const rows: string[] = [];
    rows.push(
      tableData.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(","),
    );
    tableData.data.forEach((row) => {
      rows.push(
        row
          .map((cell) => {
            const value =
              cell === null || cell === undefined ? "" : cell.toString();
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(","),
      );
    });

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    link.download = `data_export_${dateStr}.${format === "excel" ? "xlsx" : "csv"}`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = (format: "excel" | "csv") => {
    if (!queryResult?.success || !queryResult.data) {
      console.error("No data to export");
      return;
    }

    // Open custom modal to choose export type
    setExportFormat(format);
    setIsExportModalOpen(true);
  };

  const handleExportChoice = (
    type: "complete" | "current",
    format: "excel" | "csv",
  ) => {
    if (type === "complete") {
      // Export entire dataset via backend for optimal performance.
      setExportLoading(true);

      toast.loading(
        "Preparing export... This may take several minutes for large datasets.",
        {
          id: "export-toast",
          duration: Infinity,
        },
      );

      apiClient
        .exportData(
          {
            sql_query: sqlQuery,
            format,
            filename: `data_export_${new Date().toISOString().split("T")[0]}`,
          },
          0,
        ) // Unlimited timeout for exports
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `data_export_${
            new Date().toISOString().split("T")[0]
          }.${format === "excel" ? "xlsx" : "csv"}`;
          link.click();
          window.URL.revokeObjectURL(url);

          toast.success("Export completed successfully!", {
            id: "export-toast",
            duration: 5000,
          });
        })
        .catch((err) => {
          console.error("Export failed:", err);
          const errorMsg = err?.message?.includes("timeout")
            ? "Export timed out. Try exporting a smaller dataset or adding filters."
            : "Export failed. Please try again.";
          toast.error(errorMsg, { id: "export-toast" });
        })
        .finally(() => {
          setExportLoading(false);
        });
    } else {
      // Export only the current table view (client-side).
      exportCurrentView(format);
    }
  };

  const transformDataForChart = (tableData: TableData): ChartData => {
    if (!tableData.data || tableData.data.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Take first 10 rows for chart
    const chartData = tableData.data.slice(0, 10);
    const labels = chartData.map((row, index) => `Row ${index + 1}`);

    // Use first numeric column for values
    const numericColumnIndex = tableData.data[0].findIndex((cell) => {
      return typeof cell === "number" || !isNaN(Number(cell));
    });

    if (numericColumnIndex === -1) {
      return { labels: [], datasets: [] };
    }

    const values = chartData.map((row) => {
      const val = row[numericColumnIndex];
      return typeof val === "number" ? val : parseFloat(val as string) || 0;
    });

    return {
      labels,
      datasets: [
        {
          label: tableData.columns[numericColumnIndex] || "Value",
          data: values,
          backgroundColor: "rgba(59, 130, 246, 0.5)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 2,
        },
      ],
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-hidden">
      <Sidebar
        menuItems={menuItems}
        currentPath="/data-explorer"
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-lg border-b border-gray-100 relative overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-green-50/30 via-transparent to-blue-50/30"></div>

          <div className="relative px-6 py-4">
            <div className="flex items-center justify-between">
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

                <div className="w-8 h-8 bg-gradient-to-br from-green-600 to-blue-600 rounded-lg flex items-center justify-center shadow-md">
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-green-700 to-blue-600 bg-clip-text text-transparent">
                    Data Explorer
                  </h1>
                  <p className="text-sm text-gray-500 -mt-0.5">
                    Interactive data analysis and exploration
                  </p>
                </div>

                {/* Query status indicator */}
                <div className="flex items-center space-x-1.5 text-xs text-gray-500 ml-6">
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
                      d="M4 7v10c0 2.21 1.79 4 4 4h8c0 2.21 1.79 4 4 4h8c0-2.21-1.79-4-4-4V7c0-2.21-1.79-4-4-4H8c-2.21 0-4 1.79-4 4z"
                    />
                  </svg>
                  <span>
                    {queryResult ? "Results loaded" : "Ready to query"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 space-y-6 overflow-hidden min-w-0">
          {/* Query Builder */}
          <div className="bg-white rounded-lg shadow p-6 flex-shrink-0 w-full max-w-full">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold mr-4">SQL Query Builder</h2>
              {sampleQueries.map((sample, index) => (
                <button
                  key={`sample-${index}`}
                  onClick={() => setSqlQuery(sample.query)}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  {sample.name}
                </button>
              ))}

              <button
                onClick={() => {
                  setEditingQuery(null);
                  setSqlQuery("");
                  setIsModalOpen(true);
                }}
                className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors flex items-center gap-1"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Custom Query
              </button>
            </div>

            {/* Custom Queries Section */}
            {customQueries.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Your Custom Queries
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customQueries.map((custom, idx) => (
                    <CustomQueryCard
                      key={`custom-${idx}`}
                      query={custom}
                      onSelect={() => setSqlQuery(custom.query)}
                      onEdit={() => openEditModal(custom, idx)}
                      onDelete={() => deleteCustomQuery(idx)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="Enter your SQL query here..."
              />

              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => executeQuery(0)}
                  disabled={loading}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 order-first transition-colors"
                >
                  {loading ? "Executing..." : "Execute"}
                </button>

                {/* Pagination fetch controls */}
                <div className="flex items-center justify-end space-x-3">
                  {offset > 0 && (
                    <button
                      onClick={() => executeQuery(Math.max(0, offset - limit))}
                      className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-sm transition-colors"
                    >
                      Prev {limit}
                    </button>
                  )}
                  {queryResult?.success &&
                    queryResult.data &&
                    "data" in queryResult &&
                    (queryResult.data as TableData).data.length === limit && (
                      <button
                        onClick={() => executeQuery(offset + limit)}
                        className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-sm transition-colors"
                      >
                        Next {limit}
                      </button>
                    )}
                  <button
                    onClick={() => executeQuery(0, undefined)}
                    className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-sm transition-colors"
                  >
                    Show All
                  </button>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">
                      View:
                    </label>
                    <select
                      value={viewMode}
                      onChange={(e) =>
                        setViewMode(e.target.value as "table" | "chart")
                      }
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="table">Table</option>
                      <option value="chart">Chart</option>
                    </select>
                  </div>

                  {viewMode === "chart" && (
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">
                        Chart Type:
                      </label>
                      <select
                        value={chartType}
                        onChange={(e) =>
                          setChartType(e.target.value as "bar" | "line" | "pie")
                        }
                        className="px-3 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="pie">Pie</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          {queryResult && (
            <div className="space-y-6 min-w-0 overflow-hidden flex-shrink min-h-0">
              {queryResult.success ? (
                <>
                  {viewMode === "table" &&
                  queryResult.data &&
                  "columns" in queryResult.data ? (
                    <div className="overflow-hidden">
                      <DataTable
                        data={queryResult.data as TableData}
                        maxHeight="600px"
                        onExport={(fmt) => handleExport(fmt)}
                      />
                    </div>
                  ) : viewMode === "chart" &&
                    queryResult.data &&
                    "columns" in queryResult.data ? (
                    <ChartComponent
                      data={transformDataForChart(
                        queryResult.data as TableData,
                      )}
                      type={chartType}
                      title="Query Results Visualization"
                      description={`${
                        (queryResult.data as TableData).data.length
                      } records visualized`}
                      height={400}
                    />
                  ) : (
                    <div className="bg-white rounded-lg shadow p-6 text-center">
                      <p className="text-gray-500">No data to display</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-red-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-sm font-medium text-red-800">
                        Query Error
                      </h3>
                      <p className="text-sm text-red-700 mt-1">
                        {queryResult.error}
                      </p>

                      <div className="mt-3 p-3 bg-red-100 rounded-md">
                        <h4 className="text-sm font-medium text-red-800 mb-2">
                          Common Solutions:
                        </h4>
                        <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                          <li>
                            Check column names are correct and use uppercase
                            (DAY_OF, CT_MAIN, FCC_BKV)
                          </li>
                          <li>Ensure table name is SAMPLE_BT (uppercase)</li>
                          <li>
                            Try one of the sample queries above to test
                            connectivity
                          </li>
                          <li>Remove semicolon (;) at the end if present</li>
                          <li>
                            Only SELECT statements are allowed for security
                          </li>
                        </ul>
                      </div>

                      {queryResult.execution_time && (
                        <p className="text-xs text-red-600 mt-2">
                          Query failed after{" "}
                          {queryResult.execution_time.toFixed(2)}s
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportChoice}
        format={exportFormat}
        loading={exportLoading}
      />

      {/* Custom Query Modal */}
      <CustomQueryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingQuery(null);
        }}
        onSave={handleModalSave}
        editQuery={editingQuery}
      />
    </div>
  );
};

export default DataExplorerPage;
