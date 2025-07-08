import React, { useState, useMemo } from "react";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { TableData, FilterCondition } from "../../types";

interface DataTableProps {
  data: TableData;
  loading?: boolean;
  onSort?: (column: string, direction: "ASC" | "DESC") => void;
  onFilter?: (filters: FilterCondition[]) => void;
  onExport?: (format: "excel" | "csv") => void;
  className?: string;
  pageSize?: number;
  maxHeight?: string;
}

const DataTable: React.FC<DataTableProps> = ({
  data,
  loading = false,
  onSort,
  onFilter,
  onExport,
  className = "",
  pageSize = 25,
  maxHeight = "500px",
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("ASC");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Filter and search data
  const filteredData = useMemo(() => {
    if (!data.data) return [];

    return data.data.filter((row) => {
      // Search filter
      const searchMatch =
        !searchTerm ||
        row.some((cell) =>
          cell?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        );

      // Column filters
      const filterMatch = Object.entries(filters).every(
        ([columnIndex, filterValue]) => {
          if (!filterValue) return true;
          const cellValue =
            row[parseInt(columnIndex)]?.toString().toLowerCase() || "";
          return cellValue.includes(filterValue.toLowerCase());
        }
      );

      return searchMatch && filterMatch;
    });
  }, [data.data, searchTerm, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = filteredData.slice(startIndex, startIndex + pageSize);

  const handleSort = (column: string, index: number) => {
    const newDirection =
      sortColumn === column && sortDirection === "ASC" ? "DESC" : "ASC";
    setSortColumn(column);
    setSortDirection(newDirection);
    onSort?.(column, newDirection);
  };

  const handleFilterChange = (columnIndex: number, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [columnIndex]: value,
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm("");
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col ${className}`}
    >
      {/* Header Controls */}
      <div className="p-4 lg:p-6 border-b border-gray-200 flex-shrink-0">
        <div className="flex flex-col space-y-4">
          {/* Title and Stats Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Data Table
              </h3>
              <span className="text-sm text-gray-500">
                {filteredData.length} of {data.total_count} records
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {/* Export */}
              {onExport && (
                <div className="relative group">
                  <button className="px-3 py-2 border border-gray-300 rounded-lg flex items-center space-x-2 text-gray-700 hover:bg-gray-50 transition-colors">
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                  <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                    <button
                      onClick={() => onExport("excel")}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Excel
                    </button>
                    <button
                      onClick={() => onExport("csv")}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      CSV
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Search and Filter Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search across all columns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 border rounded-lg flex items-center space-x-2 transition-colors text-sm ${
                showFilters
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <FunnelIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {Object.values(filters).filter(Boolean).length > 0 && (
                <span className="bg-blue-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] h-5 flex items-center justify-center">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Column Filters */}
          {showFilters && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">
                  Column Filters
                </h4>
                <button
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Clear All
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {data.columns.map((column, index) => (
                  <div key={index}>
                    <label
                      className="block text-xs font-medium text-gray-700 mb-1 truncate"
                      title={column}
                    >
                      {column}
                    </label>
                    <input
                      type="text"
                      placeholder={`Filter ${column}...`}
                      value={filters[index] || ""}
                      onChange={(e) =>
                        handleFilterChange(index, e.target.value)
                      }
                      className="w-full px-3 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Table Container */}
      <div className="flex-1 overflow-hidden">
        <div
          className="overflow-auto border-b border-gray-200"
          style={{ maxHeight }}
        >
          <table className="min-w-full divide-y divide-gray-200">
            {/* Sticky Header */}
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {data.columns.map((column, index) => (
                  <th
                    key={index}
                    className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-200"
                    onClick={() => handleSort(column, index)}
                  >
                    <div className="flex items-center space-x-1 min-w-0">
                      <span className="truncate" title={column}>
                        {column}
                      </span>
                      {sortColumn === column && (
                        <div className="flex-shrink-0">
                          {sortDirection === "ASC" ? (
                            <ChevronUpIcon className="h-4 w-4 text-blue-600" />
                          ) : (
                            <ChevronDownIcon className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.length > 0 ? (
                paginatedData.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="px-4 lg:px-6 py-3 text-sm text-gray-900"
                      >
                        <div
                          className="max-w-xs truncate"
                          title={cell?.toString() || "-"}
                        >
                          {cell?.toString() || "-"}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={data.columns.length}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No data found matching your criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 lg:px-6 py-3 bg-gray-50 border-t border-gray-200 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
            <span className="font-medium">
              {Math.min(startIndex + pageSize, filteredData.length)}
            </span>{" "}
            of <span className="font-medium">{filteredData.length}</span>{" "}
            results
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors flex items-center"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Previous</span>
            </button>

            <span className="text-sm text-gray-700 px-2">
              Page <span className="font-medium">{currentPage}</span> of{" "}
              <span className="font-medium">{totalPages}</span>
            </span>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors flex items-center"
            >
              <span className="hidden sm:inline mr-1">Next</span>
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
