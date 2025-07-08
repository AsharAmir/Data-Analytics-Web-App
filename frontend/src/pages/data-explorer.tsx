import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import Sidebar from "../components/Layout/Sidebar";
import DataTable from "../components/ui/DataTable";
import ChartComponent from "../components/Charts/ChartComponent";
import { MenuItem, QueryResult, TableData, ChartData } from "../types";

const DataExplorerPage: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sqlQuery, setSqlQuery] = useState(
    "SELECT * FROM SAMPLE_BT WHERE ROWNUM <= 100"
  );
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");

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

  const executeQuery = async () => {
    setLoading(true);
    try {
      const result = await apiClient.executeQuery({
        sql_query: sqlQuery,
        limit: 1000,
      });
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

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      router.push("/dashboard");
    } else if (item.type === "report") {
      router.push(`/reports?menu=${item.id}`);
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

  const handleExport = (format: "excel" | "csv") => {
    if (!queryResult?.success || !queryResult.data) {
      console.error("No data to export");
      return;
    }

    // Use the export API
    apiClient
      .exportData({
        sql_query: sqlQuery,
        format,
        filename: `data_export_${new Date().toISOString().split("T")[0]}`,
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `data_export_${
          new Date().toISOString().split("T")[0]
        }.${format === "excel" ? "xlsx" : "csv"}`;
        link.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error("Export failed:", err);
      });
  };

  const transformDataForChart = (tableData: TableData): ChartData => {
    if (!tableData.data || tableData.data.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Take first 10 rows for chart
    const chartData = tableData.data.slice(0, 10);
    const labels = chartData.map((row, index) => `Row ${index + 1}`);

    // Use first numeric column for values
    const numericColumnIndex = tableData.data[0].findIndex((cell, index) => {
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
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        menuItems={menuItems}
        currentPath="/data-explorer"
        onMenuClick={handleMenuClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Data Explorer
                </h1>
                <p className="text-gray-600">
                  Interactive data analysis and exploration
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 space-y-6">
          {/* Query Builder */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">SQL Query Builder</h2>
              <div className="flex space-x-2">
                {sampleQueries.map((sample, index) => (
                  <button
                    key={index}
                    onClick={() => setSqlQuery(sample.query)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="Enter your SQL query here..."
              />

              <div className="flex items-center justify-between">
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

                <button
                  onClick={executeQuery}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Executing..." : "Execute Query"}
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {queryResult && (
            <div className="space-y-6">
              {queryResult.success ? (
                <>
                  {viewMode === "table" &&
                  queryResult.data &&
                  "columns" in queryResult.data ? (
                    <DataTable
                      data={queryResult.data as TableData}
                      maxHeight="600px"
                      onExport={handleExport}
                    />
                  ) : viewMode === "chart" &&
                    queryResult.data &&
                    "columns" in queryResult.data ? (
                    <ChartComponent
                      data={transformDataForChart(
                        queryResult.data as TableData
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
    </div>
  );
};

export default DataExplorerPage;
