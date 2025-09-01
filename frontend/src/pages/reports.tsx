import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import Sidebar from "../components/Layout/Sidebar";
import { MenuItem, Query } from "../types";

const ReportsPage: React.FC = () => {
  const router = useRouter();
  const { menu } = router.query;

  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [reports, setReports] = useState<Query[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const menuResponse = await apiClient.getMenuItems();
      setMenuItems(menuResponse);

      if (menu) {
        const menuId = parseInt(menu as string, 10);
        if (!isNaN(menuId)) {
          const reportsResponse = await apiClient.getReportsByMenu(menuId);
          if (reportsResponse.success && reportsResponse.data) {
            setReports(reportsResponse.data);
            const selectedMenu = menuResponse.find(
              (item) => item.id === menuId,
            );
            setSelectedSection(selectedMenu?.name || "");
          }
        }
      } else {
        // Load all reports for overview
        setReports([]);
        setSelectedSection("");
      }
    } catch (err) {
      console.error("Error loading reports", err);
    } finally {
      setLoading(false);
    }
  }, [menu]);

  useEffect(() => {
    if (!apiClient.isAuthenticated()) {
      router.push("/login");
      return;
    }
    loadData();
  }, [router, loadData]);

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      router.push("/dashboard");
    } else if (item.type === "report") {
      router.push(`/reports?menu=${item.id}`);
    }
    // Close mobile menu after navigation
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  };

  const handleReportClick = (report: Query) => {
    // Open report in new tab
    window.open(`/report/${report.id}`, "_blank");
  };

  const renderReportCard = (report: Query) => {
    return (
      <div
        key={report.id}
        onClick={() => handleReportClick(report)}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-105"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {report.name}
            </h3>
            {report.description && (
              <p className="text-gray-600 text-sm mb-4">{report.description}</p>
            )}
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span className="flex items-center">
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                {report.chart_type || "Table"}
              </span>
              <span className="flex items-center">
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
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {new Date(report.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="ml-4">
            <svg
              className="h-6 w-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </div>
        </div>
      </div>
    );
  };

  const renderSectionCard = (menuItem: MenuItem) => {
    const reportCount = menuItem.children?.length || 0;
    return (
      <div
        key={menuItem.id}
        onClick={() => router.push(`/reports?menu=${menuItem.id}`)}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-105"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {menuItem.name}
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              {reportCount} report{reportCount !== 1 ? "s" : ""} available
            </p>
            <div className="flex items-center text-xs text-gray-500">
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
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              {menuItem.type === "dashboard"
                ? "Dashboard Category"
                : "Report Category"}
            </div>
          </div>
          <div className="ml-4">
            <svg
              className="h-8 w-8 text-blue-500"
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
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-lg text-gray-700 font-medium">
            Loading reports...
          </p>
          <p className="text-sm text-gray-500 mt-2">Preparing your analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex">
      <Sidebar
        menuItems={menuItems}
        currentPath="/reports"
        onMenuClick={handleMenuClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-lg border-b border-gray-100 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/30 via-transparent to-indigo-50/30"></div>

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

                <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-md">
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
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-purple-700 to-blue-600 bg-clip-text text-transparent">
                    {selectedSection ? `${selectedSection} Reports` : "Reports"}
                  </h1>
                  <p className="text-sm text-gray-500 -mt-0.5">
                    {selectedSection
                      ? `Browse ${selectedSection} reports`
                      : "Browse all available reports"}
                  </p>
                </div>
              </div>

              {selectedSection && (
                <button
                  onClick={() => router.push("/reports")}
                  className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200 flex items-center space-x-1.5 shadow-md hover:shadow-lg text-sm font-medium"
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
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                  <span>Back to All</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {menu && reports.length > 0 ? (
            // Show specific section reports
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Available Reports
                </h2>
                <p className="text-gray-600">
                  Click on any report to open it in a new tab with full data
                  analysis capabilities.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map(renderReportCard)}
              </div>
            </div>
          ) : !menu && menuItems.length > 0 ? (
            // Show all report sections
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Available Reports
                </h2>
                <p className="text-gray-600">
                  Select a category to view all reports within that area.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {menuItems.map(renderSectionCard)}
              </div>
            </div>
          ) : (
            // No reports available
            <div className="text-center py-20">
              <div className="mx-auto h-24 w-24 text-gray-300 mb-6">
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {selectedSection
                  ? `No reports in ${selectedSection}`
                  : "No reports available"}
              </h3>
              <p className="text-gray-500">
                {selectedSection
                  ? "This section does not contain any reports yet."
                  : "Contact your administrator to set up report sections and reports."}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ReportsPage;
