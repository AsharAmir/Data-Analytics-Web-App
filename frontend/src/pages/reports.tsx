import React, { useEffect, useState } from "react";
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

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!apiClient.isAuthenticated()) {
      router.push("/login");
      return;
    }
  }, [router]);

  // Load menus and reports
  useEffect(() => {
    if (!menu) return;

    const menuId = parseInt(menu as string, 10);
    if (isNaN(menuId)) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [menuRes, reportsRes] = await Promise.all([
          apiClient.getMenuItems(),
          apiClient.getReportsByMenu(menuId),
        ]);

        setMenuItems(menuRes);
        if (reportsRes.success && reportsRes.data) {
          setReports(reportsRes.data);
        }
      } catch (err) {
        console.error("Error loading reports", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [menu]);

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      router.push("/dashboard");
    } else if (item.type === "report") {
      router.push(`/reports?menu=${item.id}`);
    }
  };

  const renderReportLink = (report: Query) => {
    return (
      <li key={report.id} className="py-1">
        <a
          href={`/report/${report.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:underline"
        >
          {report.name}
        </a>
      </li>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 space-y-6">
          {reports.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Section Reports</h2>
              <ul className="list-disc list-inside">
                {reports.map(renderReportLink)}
              </ul>
            </div>
          ) : (
            <p className="text-gray-500">No reports available for this section.</p>
          )}
        </main>
      </div>
    </div>
  );
};

export default ReportsPage; 