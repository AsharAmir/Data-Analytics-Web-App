import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import apiClient from "../../lib/api";
import DataTable from "../../components/ui/DataTable";
import ChartComponent from "../../components/Charts/ChartComponent";
import { Query, QueryResult, TableData, ChartData } from "../../types";
import { toast } from "react-hot-toast";
import FileImportModal from "../../components/Reports/FileImportModal";
import { logger } from "../../lib/logger";

const ReportDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<Query | null>(null);
  const [chartData, setChartData] = useState<QueryResult | null>(null);
  const [tableData, setTableData] = useState<QueryResult | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [error, setError] = useState<string>("");
  const [showImport, setShowImport] = useState(false);

  const loadReportData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const reportId = parseInt(id as string, 10);
      if (isNaN(reportId)) {
        setError("Invalid report ID");
        return;
      }

      // Get report details
      const reportResponse = await apiClient.getQueryDetail(reportId);
      if (!reportResponse.success || !reportResponse.data) {
        setError("Report not found");
        return;
      }

      setReport(reportResponse.data);

      // Load both chart and table data
      await Promise.all([loadChartData(reportId), loadTableData(reportId)]);

      // Set initial view mode based on report configuration
      if (
        reportResponse.data.chart_type &&
        reportResponse.data.chart_type !== "table"
      ) {
        setViewMode("chart");
        setChartType(reportResponse.data.chart_type as "bar" | "line" | "pie");
      } else {
        setViewMode("table");
      }
    } catch (err: any) {
      logger.error("Error loading report", { error: err, reportId: id });
      
      // Handle specific authorization errors
      if (err?.response?.status === 403) {
        setError("You are not authorized to view this report");
        toast.error("Access denied: You don't have permission to view this report");
      } else if (err?.response?.status === 404) {
        setError("Report not found");
        toast.error("The requested report could not be found");
      } else {
        setError("Failed to load report data");
        toast.error("Unable to load report. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!apiClient.isAuthenticated()) {
      router.replace("/login");
      return;
    }

    if (id) {
      loadReportData();
    }
  }, [id, loadReportData, router]);

  // Helper: determine if current user can import (admin for now)
  const canImport = (() => {
    const user = apiClient.getUser();
    return user?.role?.toString().toLowerCase() === "admin";
  })();

  const loadChartData = async (reportId: number) => {
    try {
      // Execute the query to get chart data (use the original query endpoint which respects chart_type)
      const response = await apiClient.executeQuery({
        query_id: reportId,
        limit: 1000,
      });
      setChartData(response);
    } catch (err: any) {
      logger.error("Error loading chart data", { error: err, reportId });
      if (err?.response?.status === 403) {
        toast.error("Access denied: You don't have permission to view this chart data");
      }
    }
  };

  const loadTableData = async (reportId: number) => {
    try {
      // Execute the query using filtered endpoint to get table data
      const response = await apiClient.executeFilteredQuery({
        query_id: reportId,
        limit: 1000,
        offset: 0,
      });
      setTableData(response);
    } catch (err: any) {
      logger.error("Error loading table data", { error: err, reportId });
      if (err?.response?.status === 403) {
        toast.error("Access denied: You don't have permission to view this table data");
      }
    }
  };

  const handleExport = (format: "excel" | "csv") => {
    if (!report) return;

    toast.loading(
      "Preparing export... This may take several minutes for large datasets.",
      {
        id: "export-toast",
        duration: Infinity,
      },
    );

    // Use the export API with unlimited timeout
    apiClient
      .exportData(
        {
          query_id: report.id,
          format,
          filename: `${report.name.replace(/\s+/g, "_")}_${
            new Date().toISOString().split("T")[0]
          }`,
        },
        0,
      ) // Unlimited timeout for exports
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const extension = format === "excel" ? "xlsx" : "csv";
        link.download = `${report.name.replace(/\s+/g, "_")}.${extension}`;
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
      });
  };

  const transformDataForChart = (tableData: TableData): ChartData => {
    if (!tableData.data || tableData.data.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Take first 20 rows for chart
    const chartData = tableData.data.slice(0, 20);

    // Try to find appropriate columns for chart
    const columns = tableData.columns;
    const labelColumnIndex = 0; // Use first column as labels
    const valueColumnIndex = columns.findIndex((col, index) => {
      if (index === 0) return false;
      const sampleValue = chartData[0]?.[index];
      return typeof sampleValue === "number" || !isNaN(Number(sampleValue));
    });

    if (valueColumnIndex === -1) {
      return { labels: [], datasets: [] };
    }

    const labels = chartData.map(
      (row) => row[labelColumnIndex]?.toString() || "",
    );
    const values = chartData.map((row) => {
      const val = row[valueColumnIndex];
      return typeof val === "number" ? val : parseFloat(val as string) || 0;
    });

    const colors = [
      "#3B82F6",
      "#EF4444",
      "#10B981",
      "#F59E0B",
      "#8B5CF6",
      "#EC4899",
      "#14B8A6",
      "#F97316",
      "#6366F1",
      "#84CC16",
    ];

    const safeLabel =
      columns[valueColumnIndex]?.toString().trim() || "Series 1";

    if (chartType === "pie") {
      return {
        labels,
        datasets: [
          {
            label: safeLabel,
            data: values,
            backgroundColor: colors.slice(0, values.length),
            borderWidth: 2,
          },
        ],
      };
    }

    return {
      labels,
      datasets: [
        {
          label: safeLabel,
          data: values,
          backgroundColor:
            chartType === "line"
              ? "rgba(59, 130, 246, 0.1)"
              : "rgba(59, 130, 246, 0.5)",
          borderColor: "#3B82F6",
          borderWidth: 2,
          fill: chartType === "line" ? false : true,
        },
      ],
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-lg text-gray-700 font-medium">Loading report...</p>
          <p className="text-sm text-gray-500 mt-2">Executing your query</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 text-red-500 mb-6">
            <svg
              className="h-full w-full"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 15.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Error Loading Report
          </h3>
          <p className="text-gray-500">{error}</p>
          <button
            onClick={() => window.close()}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200 backdrop-blur-sm bg-white/95">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-blue-600 bg-clip-text text-transparent">
                {report?.name}
              </h1>
              {report?.description && (
                <p className="text-gray-600 mt-1">{report.description}</p>
              )}
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                <span>Report ID: {report?.id}</span>
                <span>•</span>
                <span>
                  Created:{" "}
                  {report?.created_at
                    ? new Date(report.created_at).toLocaleDateString()
                    : ""}
                </span>
                {(chartData?.execution_time || tableData?.execution_time) && (
                  <>
                    <span>•</span>
                    <span>
                      Executed in{" "}
                      {(
                        (chartData?.execution_time ||
                          tableData?.execution_time ||
                          0) * 1000
                      ).toFixed(2)}
                      ms
                    </span>
                  </>
                )}
                {canImport && (
                  <>
                    <span>•</span>
                    <button
                      onClick={() => setShowImport(true)}
                      className="px-3 py-1 rounded-md text-xs bg-green-600 text-white hover:bg-green-700"
                    >
                      Import Data
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* View Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                {[
                  { key: "table", label: "Table" },
                  { key: "chart", label: "Chart" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setViewMode(key as "table" | "chart")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      viewMode === key
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Chart Type Selector */}
              {viewMode === "chart" && (
                <select
                  value={chartType}
                  onChange={(e) =>
                    setChartType(e.target.value as "bar" | "line" | "pie")
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="bar">Bar Chart</option>
                  <option value="line">Line Chart</option>
                  <option value="pie">Pie Chart</option>
                </select>
              )}

              {/* Export Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={() => handleExport("excel")}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  Export Excel
                </button>
                <button
                  onClick={() => handleExport("csv")}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Export CSV
                </button>
              </div>

              <button
                onClick={() => window.close()}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-8">
        <div className="space-y-6">
          {viewMode === "table" ? (
            // Table View
            tableData &&
            tableData.success &&
            tableData.data &&
            "columns" in tableData.data ? (
              <DataTable
                data={tableData.data as TableData}
                maxHeight="70vh"
                onSort={(column, direction) => {
                  console.log("Sort:", column, direction);
                }}
                onExport={handleExport}
              />
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <p className="text-gray-500">No table data available</p>
                {tableData && !tableData.success && (
                  <p className="text-red-500 mt-2">{tableData.error}</p>
                )}
              </div>
            )
          ) : // Chart View
          chartData && chartData.success && chartData.data ? (
            "labels" in chartData.data ? (
              // If chart data is already in chart format
              <ChartComponent
                data={chartData.data as ChartData}
                type={chartType}
                title={`${report?.name} - ${
                  chartType.charAt(0).toUpperCase() + chartType.slice(1)
                } Chart`}
                description={`Visualization of data from ${report?.name}`}
                height={500}
                onExport={(format) => {
                  console.log("Chart export:", format);
                }}
              />
            ) : // If chart data is in table format, transform it
            tableData &&
              tableData.success &&
              tableData.data &&
              "columns" in tableData.data ? (
              <ChartComponent
                data={transformDataForChart(tableData.data as TableData)}
                type={chartType}
                title={`${report?.name} - ${
                  chartType.charAt(0).toUpperCase() + chartType.slice(1)
                } Chart`}
                description={`Visualization of ${
                  (tableData.data as TableData).data.length
                } records`}
                height={500}
                onExport={(format) => {
                  console.log("Chart export:", format);
                }}
              />
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <p className="text-gray-500">No chart data available</p>
              </div>
            )
          ) : (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-500">No chart data available</p>
              {chartData && !chartData.success && (
                <p className="text-red-500 mt-2">{chartData.error}</p>
              )}
            </div>
          )}
        </div>
      </main>

      {showImport && (
        <FileImportModal
          visible={showImport}
          onClose={() => setShowImport(false)}
          tableName={report?.name || ""}
          onImported={() => loadReportData()}
        />
      )}
    </div>
  );
};

export default ReportDetailPage;
