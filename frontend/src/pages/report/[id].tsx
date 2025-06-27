import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import apiClient from "../../lib/api";
import Sidebar from "../../components/Layout/Sidebar";
import ChartComponent from "../../components/Charts/ChartComponent";
import {
  MenuItem,
  Query,
  ChartData,
  TableData,
  QueryResult,
  TableFilter,
  FilterCondition,
} from "../../types";
import { jsPDF } from "jspdf";

interface PaginationState {
  page: number;
  pageSize: number;
}

const ReportViewPage: React.FC = () => {
  const router = useRouter();
  const chartRef = useRef<any>(null);
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [queryMeta, setQueryMeta] = useState<Query | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 1000 });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /* -------------------------- Data loading -------------------------- */
  useEffect(() => {
    if (!id || Array.isArray(id)) return;

    const queryId = parseInt(id, 10);
    if (isNaN(queryId)) return;

    const load = async () => {
      setLoading(true);
      try {
        const [menuRes, detailRes] = await Promise.all([
          apiClient.getMenuItems(),
          apiClient.getQueryDetail(queryId),
        ]);

        setMenuItems(menuRes);
        if (detailRes.success && detailRes.data) {
          setQueryMeta(detailRes.data);
        }

        await fetchData(queryId, pagination.pageSize, (pagination.page - 1) * pagination.pageSize, filters);
      } catch (err) {
        console.error("Error loading report", err);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchData = async (queryId: number, limit: number, offset: number, filterMap: Record<string, string>) => {
    try {
      let requestBody: any = { query_id: queryId, limit, offset };

      const conditions: FilterCondition[] = [];
      Object.entries(filterMap).forEach(([col, val]) => {
        if (val !== "") {
          conditions.push({ column: col, operator: "like", value: val });
        }
      });
      if (conditions.length) {
        requestBody.filters = { conditions, logic: "AND" } as TableFilter;
      }

      const res = await apiClient.executeFilteredQuery(requestBody);
      setResult(res);
    } catch (e) {
      console.error("Execute query failed", e);
    }
  };

  /* -------------------------- Filtering -------------------------- */
  const handleFilterChange = (col: string, value: string) => {
    setFilters((prev) => ({ ...prev, [col]: value }));
  };

  const applyFilters = () => {
    if (!queryMeta) return;
    setPagination({ ...pagination, page: 1 });
    fetchData(queryMeta.id, pagination.pageSize, 0, filters);
  };

  /* -------------------------- Pagination -------------------------- */
  const changePage = (newPage: number) => {
    if (!queryMeta) return;
    const offset = (newPage - 1) * pagination.pageSize;
    setPagination({ ...pagination, page: newPage });
    fetchData(queryMeta.id, pagination.pageSize, offset, filters);
  };

  /* -------------------------- Export -------------------------- */
  const handleExport = async (format: "csv" | "excel") => {
    if (!queryMeta) return;
    try {
      const blob = await apiClient.exportData({ query_id: queryMeta.id, format });
      const filename = `${queryMeta.name}.${format === "csv" ? "csv" : "xlsx"}`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  const exportChartPDF = () => {
    if (!result || !result.chart_type || !result.data || !chartRef.current) return;

    const chartCanvas = chartRef.current.canvas as HTMLCanvasElement;
    const imgData = chartCanvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: chartCanvas.width > chartCanvas.height ? "l" : "p" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, "PNG", 10, 10, pageWidth - 20, (chartCanvas.height / chartCanvas.width) * (pageWidth - 20));
    pdf.save(`${queryMeta?.name}.pdf`);
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") router.push("/dashboard");
    else if (item.type === "report") router.push(`/reports?menu=${item.id}`);
  };

  /* -------------------------- Render helpers -------------------------- */
  const renderTable = (table: TableData) => {
    return (
      <div className="overflow-x-auto border rounded">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {table.columns.map((col) => (
                <th key={col} className="px-3 py-2 text-left font-medium text-gray-600">
                  {col}
                </th>
              ))}
            </tr>
            <tr>
              {table.columns.map((col) => (
                <th key={col} className="p-1">
                  <input
                    type="text"
                    className="w-full border-gray-300 rounded text-xs px-1 py-0.5"
                    placeholder="filter"
                    value={filters[col] || ""}
                    onChange={(e) => handleFilterChange(col, e.target.value)}
                  />
                </th>
              ))}
              <th className="p-1">
                <button
                  onClick={applyFilters}
                  className="px-2 py-1 bg-primary-600 text-white text-xs rounded"
                >
                  Apply
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {row.map((cell, cidx) => (
                  <td key={cidx} className="px-3 py-1 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Pagination controls */}
        {table.total_count > pagination.pageSize && (
          <div className="flex items-center justify-between p-2 text-xs text-gray-600">
            <div>
              Page {pagination.page} of {Math.ceil(table.total_count / pagination.pageSize)}
            </div>
            <div className="space-x-1">
              <button
                disabled={pagination.page === 1}
                onClick={() => changePage(pagination.page - 1)}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={pagination.page >= Math.ceil(table.total_count / pagination.pageSize)}
                onClick={() => changePage(pagination.page + 1)}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* -------------------------- Main render -------------------------- */
  if (loading || !queryMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading report...</p>
        </div>
      </div>
    );
  }

  const isChart = result?.chart_type && result?.data && "labels" in (result.data as any);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        menuItems={menuItems}
        currentPath="/reports"
        onMenuClick={handleMenuClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">{queryMeta.name}</h1>
            <div className="space-x-2">
              {isChart && (
                <button
                  onClick={exportChartPDF}
                  className="px-3 py-1 bg-primary-600 text-white text-xs rounded"
                >
                  Export PDF
                </button>
              )}
              <button
                onClick={() => handleExport("excel")}
                className="px-3 py-1 bg-primary-600 text-white text-xs rounded"
              >
                Export Excel
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="px-3 py-1 bg-primary-600 text-white text-xs rounded"
              >
                Export CSV
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">
          {isChart && result?.data ? (
            <ChartComponent
              ref={chartRef}
              data={result.data as ChartData}
              type={result.chart_type as any}
              config={result.chart_config}
              height={400}
            />
          ) : result?.data ? (
            renderTable(result.data as TableData)
          ) : (
            <p className="text-gray-500">No data available</p>
          )}
        </main>
      </div>
    </div>
  );
};

export default ReportViewPage; 