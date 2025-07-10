import React, { useState, useEffect } from "react";
import { UserRole } from "../../types";
import {
  XMarkIcon,
  PlayIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChartBarIcon,
  CircleStackIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import apiClient from "../../lib/api";

interface KPIForm {
  name: string;
  description: string;
  sql_query: string;
  menu_item_id: number | null;
  role: UserRole[];
}

interface MenuItemOption {
  id: number;
  name: string;
}

interface ValidationErrors {
  name?: string;
  sql_query?: string;
  role?: string;
}

const roleDisplayNames: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.CEO]: "CEO",
  [UserRole.FINANCE_USER]: "Finance",
  [UserRole.TECH_USER]: "Tech",
  [UserRole.USER]: "User",
};

interface KPIFormModalProps {
  visible: boolean;
  editing?: boolean;
  kpiForm: KPIForm;
  setKpiForm: React.Dispatch<React.SetStateAction<KPIForm>>;
  menuItems: MenuItemOption[];
  onCreate: () => void;
  onClose: () => void;
}

const KPIFormModal: React.FC<KPIFormModalProps> = ({
  visible,
  editing = false,
  kpiForm,
  setKpiForm,
  menuItems,
  onCreate,
  onClose,
}) => {
  const [currentTab, setCurrentTab] = useState<
    "basic" | "query" | "permissions"
  >("basic");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );
  const [isTestingQuery, setIsTestingQuery] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    // Reset tab when modal opens/closes
    if (visible) {
      setCurrentTab("basic");
      setValidationErrors({});
      setTestResult(null);
      setTestError(null);
    }
  }, [visible]);

  if (!visible) return null;

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!kpiForm.name.trim()) {
      errors.name = "KPI name is required";
    }

    if (!kpiForm.sql_query.trim()) {
      errors.sql_query = "SQL query is required";
    } else if (!kpiForm.sql_query.trim().toLowerCase().startsWith("select")) {
      errors.sql_query = "Only SELECT statements are allowed";
    }

    if (kpiForm.role.length === 0) {
      errors.role = "At least one role must be selected";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const testQuery = async () => {
    if (!kpiForm.sql_query.trim()) return;

    setIsTestingQuery(true);
    setTestResult(null);
    setTestError(null);

    try {
      const response = await apiClient.post("/api/query/execute", {
        sql_query: kpiForm.sql_query,
        limit: 1,
      });
      setTestResult(response);
    } catch (error: any) {
      setTestError(error.response?.data?.error || "Failed to execute query");
    } finally {
      setIsTestingQuery(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      await onCreate();
    } catch (err) {
      console.error("KPI form submit failed", err);
    }
  };

  const handleClose = () => {
    setCurrentTab("basic");
    setValidationErrors({});
    setTestResult(null);
    setTestError(null);
    onClose();
  };

  const isFormValid =
    kpiForm.name.trim() && kpiForm.sql_query.trim() && kpiForm.role.length > 0;

  const tabs = [
    { id: "basic", label: "Basic Info", icon: "📊" },
    { id: "query", label: "SQL Query", icon: "💾" },
    { id: "permissions", label: "Access Control", icon: "🛡️" },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {editing ? "Edit KPI/Stat" : "Create New KPI/Stat"}
              </h3>
              <p className="text-gray-500 text-sm">
                Define a key performance indicator for your dashboards
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id as any)}
                className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                  currentTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Basic Info Tab */}
          {currentTab === "basic" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      KPI Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Total Revenue, Active Users, Monthly Sales"
                      value={kpiForm.name}
                      onChange={(e) =>
                        setKpiForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        validationErrors.name
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                    {validationErrors.name && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                        {validationErrors.name}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Choose a clear, descriptive name for your KPI
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      placeholder="What does this KPI measure? How is it calculated?"
                      value={kpiForm.description}
                      onChange={(e) =>
                        setKpiForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      rows={3}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Optional description to help others understand this metric
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dashboard Assignment
                    </label>
                    <select
                      value={
                        kpiForm.menu_item_id === -1
                          ? "-1"
                          : kpiForm.menu_item_id || ""
                      }
                      onChange={(e) =>
                        setKpiForm((prev) => ({
                          ...prev,
                          menu_item_id:
                            e.target.value === "-1"
                              ? -1
                              : e.target.value
                                ? parseInt(e.target.value)
                                : null,
                        }))
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">⚠️ No Assignment (Hidden)</option>
                      <option value="-1">
                        📊 Default Dashboard (Recommended)
                      </option>
                      {menuItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          📄 {item.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Choose which dashboard will display this KPI
                    </p>
                    {!kpiForm.menu_item_id && kpiForm.menu_item_id !== -1 && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-700 flex items-center">
                          <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                          KPI will be hidden without dashboard assignment
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <EyeIcon className="h-5 w-5 mr-2" />
                    KPI Preview
                  </h4>
                  <div className="bg-white border border-gray-300 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-lg font-medium text-gray-900 mb-2">
                        {kpiForm.name || "KPI Name"}
                      </div>
                      <div className="text-3xl font-bold text-blue-600 mb-1">
                        {testResult &&
                        testResult.data &&
                        testResult.data.data &&
                        testResult.data.data[0] &&
                        testResult.data.data[0][0] !== undefined
                          ? new Intl.NumberFormat().format(
                              testResult.data.data[0][0],
                            )
                          : "12,345"}
                      </div>
                      <div className="text-sm text-gray-500">
                        {kpiForm.description || "Sample KPI description"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <InformationCircleIcon className="h-4 w-4 inline mr-1" />
                      This shows how your KPI will appear on the dashboard
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Query Tab */}
          {currentTab === "query" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 flex items-center">
                      <CircleStackIcon className="h-4 w-4 mr-2" />
                      SQL Query *
                    </label>
                    <button
                      onClick={testQuery}
                      disabled={!kpiForm.sql_query.trim() || isTestingQuery}
                      className="inline-flex items-center space-x-2 px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isTestingQuery ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <PlayIcon className="h-4 w-4" />
                          <span>Test Query</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h5 className="text-sm font-medium text-blue-800 mb-2">
                      KPI Query Guidelines
                    </h5>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Must return a single numeric value</li>
                      <li>
                        • Use aggregate functions: COUNT(), SUM(), AVG(), etc.
                      </li>
                      <li>
                        • Example:{" "}
                        <code className="bg-blue-100 px-1 rounded">
                          SELECT COUNT(*) FROM orders
                        </code>
                      </li>
                      <li>
                        • Example:{" "}
                        <code className="bg-blue-100 px-1 rounded">
                          SELECT SUM(amount) FROM sales
                        </code>
                      </li>
                    </ul>
                  </div>

                  <textarea
                    placeholder="SELECT COUNT(*) FROM table_name&#10;or&#10;SELECT SUM(column_name) FROM table_name WHERE condition"
                    value={kpiForm.sql_query}
                    onChange={(e) =>
                      setKpiForm((prev) => ({
                        ...prev,
                        sql_query: e.target.value,
                      }))
                    }
                    className={`w-full px-4 py-3 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      validationErrors.sql_query
                        ? "border-red-300 bg-red-50"
                        : "border-gray-300"
                    }`}
                    rows={8}
                  />
                  {validationErrors.sql_query && (
                    <p className="text-sm text-red-600 flex items-center">
                      <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                      {validationErrors.sql_query}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Query Test Results
                  </label>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[200px]">
                    {testResult && (
                      <div>
                        <div className="flex items-center space-x-2 mb-3">
                          <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          <span className="text-sm font-medium text-green-700">
                            Query executed successfully
                          </span>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-300">
                          <div className="text-center">
                            <div className="text-xs text-gray-500 mb-1">
                              Result:
                            </div>
                            <div className="text-2xl font-bold text-blue-600">
                              {testResult.data &&
                              testResult.data.data &&
                              testResult.data.data[0] &&
                              testResult.data.data[0][0] !== undefined
                                ? new Intl.NumberFormat().format(
                                    testResult.data.data[0][0],
                                  )
                                : "No result"}
                            </div>
                            {testResult.execution_time && (
                              <div className="text-xs text-gray-500 mt-1">
                                Executed in {testResult.execution_time}ms
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {testError && (
                      <div>
                        <div className="flex items-center space-x-2 mb-3">
                          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                          <span className="text-sm font-medium text-red-700">
                            Query failed
                          </span>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-800">{testError}</p>
                        </div>
                      </div>
                    )}
                    {!testResult && !testError && (
                      <div className="flex items-center justify-center h-32">
                        <div className="text-center">
                          <EyeIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">
                            Test your query to see results here
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h5 className="text-sm font-medium text-amber-800 mb-2">
                      Common KPI Examples
                    </h5>
                    <div className="text-sm text-amber-700 space-y-2">
                      <div>
                        <div className="font-medium">Total Users:</div>
                        <code className="text-xs bg-amber-100 px-1 rounded">
                          SELECT COUNT(*) FROM users
                        </code>
                      </div>
                      <div>
                        <div className="font-medium">Monthly Revenue:</div>
                        <code className="text-xs bg-amber-100 px-1 rounded">
                          SELECT SUM(amount) FROM orders WHERE MONTH(created_at)
                          = MONTH(NOW())
                        </code>
                      </div>
                      <div>
                        <div className="font-medium">Average Order Value:</div>
                        <code className="text-xs bg-amber-100 px-1 rounded">
                          SELECT AVG(amount) FROM orders
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Permissions Tab */}
          {currentTab === "permissions" && (
            <div className="space-y-6">
              <div className="max-w-4xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-4 flex items-center">
                    <ShieldCheckIcon className="h-5 w-5 mr-2" />
                    Visible to Roles *
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.values(UserRole).map((role) => (
                      <label
                        key={role}
                        className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                          kpiForm.role.includes(role)
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={kpiForm.role.includes(role)}
                          onChange={() => {
                            setKpiForm((prev) => {
                              const newRoles = prev.role.includes(role)
                                ? prev.role.filter((r) => r !== role)
                                : [...prev.role, role];
                              return { ...prev, role: newRoles };
                            });
                          }}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3"
                        />
                        <div>
                          <div className="font-medium text-gray-900">
                            {roleDisplayNames[role]}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {validationErrors.role && (
                    <p className="mt-2 text-sm text-red-600 flex items-center">
                      <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                      {validationErrors.role}
                    </p>
                  )}
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex">
                    <InformationCircleIcon className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h5 className="text-sm font-medium text-blue-800 mb-1">
                        Role Access Control
                      </h5>
                      <p className="text-sm text-blue-700">
                        Select which user roles can view this KPI on their
                        dashboards. At least one role must be selected for the
                        KPI to be visible.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-gray-900 mb-2">
                    Selected Roles Summary
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {kpiForm.role.length > 0 ? (
                      kpiForm.role.map((role) => (
                        <span
                          key={role}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {roleDisplayNames[role]}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500 italic">
                        No roles selected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {!isFormValid && (
                <div className="text-sm text-gray-500 flex items-center">
                  <ExclamationTriangleIcon className="h-4 w-4 mr-1 text-amber-500" />
                  Complete all required fields to{" "}
                  {editing ? "update" : "create"} KPI
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleClose}
                className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isFormValid}
                className="px-6 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {editing ? "Update KPI" : "Create KPI"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPIFormModal;
