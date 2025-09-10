import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { PlayIcon, DocumentTextIcon, CalendarIcon, ChevronDownIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Sidebar from "../components/Layout/Sidebar";
import RunProcessModal from "../components/Processes/RunProcessModal";
import apiClient from "../lib/api";
import { Process } from "../types";

const ProcessesPage: React.FC = () => {
  const router = useRouter();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  // const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [processesRes, menuRes] = await Promise.all([
        apiClient.listProcesses(),
        apiClient.getMenuItems(),
      ]);
      
      setProcesses(Array.isArray(processesRes) ? processesRes : (processesRes as any)?.data ?? []);
      setMenuItems(Array.isArray(menuRes) ? menuRes : (menuRes as any)?.data ?? []);
    } catch (error) {
      toast.error("Failed to load processes");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUserAccess = useCallback(async () => {
    try {
      const user = apiClient.getUser();
      // setCurrentUser(user);
      
      // The backend will filter processes based on role
      if (!user) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      
      loadData();
    } catch (error) {
      console.error("Access check failed:", error);
      setAccessDenied(true);
      setLoading(false);
    }
  }, [loadData]);

  useEffect(() => {
    checkUserAccess();
  }, [checkUserAccess]);

  const handleRunProcess = async (params: Record<string, any>) => {
    if (!selectedProcess) return;
    
    try {
      const result = await apiClient.runProcess(selectedProcess.id, params);
      toast.success("Process executed successfully!");
      
      // Return the result so the modal can display it
      return result;
    } catch (error) {
      toast.error("Failed to run process");
      console.error(error);
      throw error;
    }
  };

  const getParameterIcon = (inputType: string) => {
    switch (inputType) {
      case "date":
        return <CalendarIcon className="h-4 w-4" />;
      case "dropdown":
        return <ChevronDownIcon className="h-4 w-4" />;
      default:
        return <DocumentTextIcon className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        menuItems={menuItems}
        currentPath={router.pathname}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <h1 className="ml-3 text-2xl font-semibold text-gray-900">Processes</h1>
              </div>
              <div className="text-sm text-gray-500">
                {processes.length} available processes
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : accessDenied ? (
            <div className="text-center py-12">
              <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">Access Denied</h3>
              <p className="mt-1 text-sm text-gray-500">
                You don&apos;t have permission to access processes. Contact your administrator.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          ) : processes.length === 0 ? (
            <div className="text-center py-12">
              <PlayIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No processes available</h3>
              <p className="mt-1 text-sm text-gray-500">
                Contact your administrator to set up processes you can run.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {processes.map((process) => (
                <div
                  key={process.id}
                  className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200 hover:shadow-md transition-shadow duration-200"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {process.name}
                      </h3>
                      <PlayIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    
                    {process.description && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                        {process.description}
                      </p>
                    )}

                    {/* Parameters Preview */}
                    {process.parameters && process.parameters.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                          Parameters ({process.parameters.length})
                        </h4>
                        <div className="space-y-1">
                          {process.parameters.slice(0, 3).map((param, idx) => (
                            <div key={idx} className="flex items-center text-xs text-gray-500">
                              {getParameterIcon(param.input_type)}
                              <span className="ml-2 truncate">{param.label}</span>
                            </div>
                          ))}
                          {process.parameters.length > 3 && (
                            <div className="text-xs text-gray-400">
                              +{process.parameters.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Button */}
                    <div className="mt-6">
                      <button
                        onClick={() => {
                          setSelectedProcess(process);
                          setShowRunModal(true);
                        }}
                        className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                      >
                        <PlayIcon className="h-4 w-4 mr-2" />
                        Run Process
                      </button>
                    </div>

                    {/* Meta Info */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center text-xs text-gray-500">
                        <span className="truncate">{process.script_path}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Created {new Date(process.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Run Process Modal */}
      <RunProcessModal
        process={selectedProcess}
        isOpen={showRunModal}
        onClose={() => {
          setShowRunModal(false);
          setSelectedProcess(null);
        }}
        onRun={handleRunProcess}
      />
    </div>
  );
};

export default ProcessesPage; 