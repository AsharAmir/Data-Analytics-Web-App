import React, { useState } from "react";
import Sidebar from "../components/Layout/Sidebar";
import { MenuItem } from "../types";
import { toast } from "react-hot-toast";
import apiClient from "../lib/api";
import { logger } from "../lib/logger";

interface ComparisonResult {
  sheet: string;
  cell_id: string;
  value1: string;
  value2: string;
  status: "matched" | "not matched";
  differences?: Array<{
    sheet: string;
    cell_id: string;
    value1: string;
    value2: string;
    status: string;
  }>;
}

interface ExcelCompareResponse {
  success: boolean;
  total_sheets: number;
  matched_sheets: number;
  comparison_results: ComparisonResult[];
  summary: string;
}

const ExcelComparePage: React.FC = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // File upload states
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ExcelCompareResponse | null>(null);
  const [comparing, setComparing] = useState(false);

  // Load menu items
  React.useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const response = await apiClient.getMenuItems();
        setMenuItems(response);
        logger.info("Menu items loaded for excel compare", { count: response.length });
      } catch (error) {
        logger.error("Error fetching menu for excel compare", { error });
      }
    };

    fetchMenuItems();
  }, []);

  const handleFileUpload = (fileNumber: 1 | 2, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
        toast.error("Please select an Excel file (.xlsx or .xls)");
        return;
      }

      if (fileNumber === 1) {
        setFile1(file);
      } else {
        setFile2(file);
      }
    }
  };

  const compareFiles = async () => {
    if (!file1 || !file2) {
      toast.error("Please select both Excel files");
      return;
    }

    setComparing(true);
    setComparisonResult(null);

    try {
      const formData = new FormData();
      formData.append("file1", file1);
      formData.append("file2", file2);

      const response = await apiClient.post("/api/excel-compare", formData, {
        headers: {
          'Content-Type': undefined, // Remove default Content-Type to let browser set multipart/form-data
        },
      });

      if ((response as any).success) {
        const result = (response as any).data;
        setComparisonResult(result);
        
        logger.info("Excel comparison completed", {
          totalSheets: result.total_sheets,
          matchedSheets: result.matched_sheets,
          hasResults: result.comparison_results?.length > 0
        });
        
        // Provide detailed success message based on comparison results
        const differences = result.total_sheets - result.matched_sheets;
        const message = differences === 0 
          ? `All ${result.total_sheets} sheets matched perfectly!` 
          : `Comparison complete: ${result.matched_sheets} sheets matched, ${differences} had differences`;
        
        toast.success(message, { duration: 5000 });
      } else {
        logger.error("Excel comparison API returned failure", { response: response });
        const errorMsg = (response as any).message || "Unknown error occurred";
        toast.error("Comparison failed: " + errorMsg);
      }
    } catch (error: any) {
      logger.error("Excel comparison error", { error, file1Name: file1?.name, file2Name: file2?.name });
      
      // Handle different error response formats
      let errorMessage = "Failed to compare Excel files";
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle validation errors (array of error objects)
        if (Array.isArray(detail)) {
          errorMessage = detail.map((err: any) => {
            if (typeof err === 'string') return err;
            if (err.msg) return err.msg;
            if (err.message) return err.message;
            return JSON.stringify(err);
          }).join('. ');
        } 
        // Handle string error messages
        else if (typeof detail === 'string') {
          errorMessage = detail;
        }
        // Handle object error messages
        else if (detail.message) {
          errorMessage = detail.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setComparing(false);
    }
  };

  const exportResults = () => {
    if (!comparisonResult) return;

    logger.info("Exporting excel comparison results", {
      totalSheets: comparisonResult.total_sheets,
      matchedSheets: comparisonResult.matched_sheets,
      resultCount: comparisonResult.comparison_results.length
    });

    // Create CSV content
    let csvContent = "Sheet,Cell ID,Value1,Value2,Status\n";

    comparisonResult.comparison_results.forEach((result) => {
      if (result.status === "matched") {
        csvContent += `${result.sheet},${result.cell_id},${result.value1},${result.value2},${result.status}\n`;
      } else {
        // Add summary row for sheet with differences
        csvContent += `${result.sheet},multiple,multiple,multiple,${result.status}\n`;
        
        // Add individual differences if available
        if (result.differences) {
          result.differences.forEach((diff) => {
            csvContent += `${diff.sheet},${diff.cell_id},"${diff.value1}","${diff.value2}",${diff.status}\n`;
          });
        }
      }
    });

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "excel_comparison_report.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        menuItems={menuItems}
        currentPath="/excel-compare"
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-900">Excel Compare</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Compare Two Excel Files
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* File 1 Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Excel File 1
                  </label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                    <div className="space-y-1 text-center">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                        aria-hidden="true"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="file1-upload"
                          className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                        >
                          <span>Upload file</span>
                          <input
                            id="file1-upload"
                            name="file1-upload"
                            type="file"
                            className="sr-only"
                            accept=".xlsx,.xls"
                            onChange={(e) => handleFileUpload(1, e)}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">Excel files (.xlsx, .xls)</p>
                      {file1 && (
                        <p className="text-sm text-green-600 font-medium">{file1.name}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* File 2 Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Excel File 2
                  </label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                    <div className="space-y-1 text-center">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                        aria-hidden="true"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="file2-upload"
                          className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                        >
                          <span>Upload file</span>
                          <input
                            id="file2-upload"
                            name="file2-upload"
                            type="file"
                            className="sr-only"
                            accept=".xlsx,.xls"
                            onChange={(e) => handleFileUpload(2, e)}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">Excel files (.xlsx, .xls)</p>
                      {file2 && (
                        <p className="text-sm text-green-600 font-medium">{file2.name}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compare Button */}
              <div className="flex justify-center mb-6">
                <button
                  onClick={compareFiles}
                  disabled={!file1 || !file2 || comparing}
                  className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {comparing ? "Comparing..." : "Compare Files"}
                </button>
              </div>

              {/* Results */}
              {comparisonResult && (
                <div className="border-t pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Comparison Results
                    </h3>
                    <button
                      onClick={exportResults}
                      className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      Export Results
                    </button>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-gray-700">{comparisonResult.summary}</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sheet
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Cell ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value 1
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value 2
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {comparisonResult.comparison_results.map((result, index) => (
                          <React.Fragment key={index}>
                            <tr>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {result.sheet}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {result.cell_id}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {result.value1}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {result.value2}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    result.status === "matched"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {result.status}
                                </span>
                              </td>
                            </tr>
                            {/* Show individual differences for sheets that don't match */}
                            {result.status === "not matched" && result.differences && result.differences.slice(0, 10).map((diff, diffIndex) => (
                              <tr key={`${index}-${diffIndex}`} className="bg-red-50">
                                <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 pl-12">
                                  {diff.sheet}
                                </td>
                                <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">
                                  {diff.cell_id}
                                </td>
                                <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate">
                                  {diff.value1}
                                </td>
                                <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate">
                                  {diff.value2}
                                </td>
                                <td className="px-6 py-2 whitespace-nowrap">
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                    {diff.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {result.status === "not matched" && result.differences && result.differences.length > 10 && (
                              <tr className="bg-red-50">
                                <td colSpan={5} className="px-6 py-2 text-sm text-gray-500 text-center italic">
                                  ... and {result.differences.length - 10} more differences (see exported report for full details)
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ExcelComparePage;