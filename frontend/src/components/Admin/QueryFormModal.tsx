import React, { useState, useEffect } from "react";
import { UserRole } from "../../types";
import {
  XMarkIcon,
  PlayIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import apiClient from "../../lib/api";

interface QueryForm {
  name: string;
  description: string;
  sql_query: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  menu_item_id: number | null;
  menu_item_ids: number[];
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

const chartTypeOptions = [
  { value: "bar", label: "Bar Chart", icon: "📊" },
  { value: "line", label: "Line Chart", icon: "📈" },
  { value: "pie", label: "Pie Chart", icon: "🥧" },
  { value: "doughnut", label: "Doughnut Chart", icon: "🍩" },
  { value: "table", label: "Data Table", icon: "📋" },
];

interface QueryFormModalProps {
  visible: boolean;
  editing?: boolean;
  queryForm: QueryForm;
  setQueryForm: React.Dispatch<React.SetStateAction<QueryForm>>;
  menuItems: MenuItemOption[];
  onCreate: () => void;
  onClose: () => void;
}

const QueryFormModal: React.FC<QueryFormModalProps> = ({
  visible,
  editing = false,
  queryForm,
  setQueryForm,
  menuItems,
  onCreate,
  onClose,
}) => {
  const [currentTab, setCurrentTab] = useState<
    "basic" | "sql" | "visualization" | "permissions"
  >("basic");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );
  const [isTestingQuery, setIsTestingQuery] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [sqlLineCount, setSqlLineCount] = useState(6);

  useEffect(() => {
    if (queryForm.sql_query) {
      const lines = queryForm.sql_query.split("\n").length;
      setSqlLineCount(Math.max(6, Math.min(20, lines + 2)));
    }
  }, [queryForm.sql_query]);

  if (!visible) return null;

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!queryForm.name.trim()) {
      errors.name = "Query name is required";
    }

    if (!queryForm.sql_query.trim()) {
      errors.sql_query = "SQL query is required";
    } else if (!queryForm.sql_query.trim().toLowerCase().startsWith("select")) {
      errors.sql_query = "Only SELECT statements are allowed";
    }

    if (queryForm.role.length === 0) {
      errors.role = "At least one role must be selected";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const testQuery = async () => {
    if (!queryForm.sql_query.trim()) return;

    setIsTestingQuery(true);
    setTestResult(null);
    setTestError(null);

    try {
      const response = await apiClient.post("/api/query/execute", {
        sql_query: queryForm.sql_query,
        limit: 5,
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
      console.error("Query form submit failed", err);
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
    queryForm.name.trim() &&
    queryForm.sql_query.trim() &&
    queryForm.role.length > 0;

  const tabs = [
    { id: "basic", label: "Basic Info", icon: "ℹ️" },
    { id: "sql", label: "SQL Query", icon: "💾" },
    { id: "visualization", label: "Chart", icon: "📊" },
    { id: "permissions", label: "Access", icon: "🔐" },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg">📊</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {editing ? "Edit Query" : "Create New Query"}
              </h3>
              <p className="text-gray-500 text-sm">
                {editing
                  ? "Modify existing query configuration"
                  : "Build a new database query for your dashboard"}
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
                      Query Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Sales Performance Report"
                      value={queryForm.name}
                      onChange={(e) =>
                        setQueryForm((prev) => ({
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      placeholder="Describe what this query does and when to use it..."
                      value={queryForm.description}
                      onChange={(e) =>
                        setQueryForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      rows={4}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Assign to Dashboard Pages
                    </label>
                    <span className="text-xs text-gray-500">
                      {queryForm.menu_item_ids.length +
                        (queryForm.menu_item_id === -1 ? 1 : 0)}{" "}
                      page
                      {queryForm.menu_item_ids.length +
                        (queryForm.menu_item_id === -1 ? 1 : 0) !==
                      1
                        ? "s"
                        : ""}{" "}
                      selected
                    </span>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto">
                    <div className="space-y-3">
                      {/* Default Dashboard Option */}
                      <label className="flex items-center space-x-3 p-3 border-2 border-dashed border-blue-300 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors bg-blue-25">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          checked={queryForm.menu_item_id === -1}
                          onChange={(e) => {
                            setQueryForm((prev) => ({
                              ...prev,
                              menu_item_id: e.target.checked ? -1 : null,
                            }));
                          }}
                        />
                        <div className="flex items-center space-x-2">
                          <span className="text-blue-600 text-sm font-medium">
                            📊 Default Dashboard
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Recommended
                          </span>
                        </div>
                      </label>

                      {/* Separator */}
                      {menuItems.length > 0 && (
                        <div className="flex items-center my-4">
                          <div className="flex-1 border-t border-gray-300"></div>
                          <span className="px-3 text-xs text-gray-500 bg-gray-50">
                            Custom Pages
                          </span>
                          <div className="flex-1 border-t border-gray-300"></div>
                        </div>
                      )}

                      {/* Menu Items */}
                      {menuItems.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-center space-x-3 cursor-pointer hover:bg-white p-2 rounded-lg transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            checked={queryForm.menu_item_ids.includes(item.id)}
                            onChange={(e) => {
                              const newMenuIds = e.target.checked
                                ? [...queryForm.menu_item_ids, item.id]
                                : queryForm.menu_item_ids.filter(
                                    (id) => id !== item.id,
                                  );
                              setQueryForm((prev) => ({
                                ...prev,
                                menu_item_ids: newMenuIds,
                              }));
                            }}
                          />
                          <span className="text-gray-800 text-sm font-medium">
                            {item.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Status Information */}
                  <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                    <h5 className="text-sm font-medium text-gray-900 mb-2">
                      Assignment Summary
                    </h5>
                    <div className="space-y-2">
                      {queryForm.menu_item_id === -1 && (
                        <div className="flex items-center text-sm text-blue-700">
                          <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                          Will appear on the Default Dashboard
                        </div>
                      )}
                      {queryForm.menu_item_ids.map((menuId) => {
                        const menuItem = menuItems.find(
                          (item) => item.id === menuId,
                        );
                        return menuItem ? (
                          <div
                            key={menuId}
                            className="flex items-center text-sm text-gray-700"
                          >
                            <span className="w-2 h-2 bg-gray-500 rounded-full mr-2"></span>
                            Will appear on &ldquo;{menuItem.name}&rdquo;
                          </div>
                        ) : null;
                      })}
                      {queryForm.menu_item_id !== -1 &&
                        queryForm.menu_item_ids.length === 0 && (
                          <div className="flex items-center text-sm text-amber-700">
                            <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                            No pages selected - query will be hidden from
                            dashboards
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SQL Query Tab */}
          {currentTab === "sql" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">
                      SQL Query *
                    </label>
                    <button
                      onClick={testQuery}
                      disabled={!queryForm.sql_query.trim() || isTestingQuery}
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
                  <textarea
                    placeholder="SELECT column1, column2 FROM table_name WHERE condition..."
                    value={queryForm.sql_query}
                    onChange={(e) =>
                      setQueryForm((prev) => ({
                        ...prev,
                        sql_query: e.target.value,
                      }))
                    }
                    className={`w-full px-4 py-3 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      validationErrors.sql_query
                        ? "border-red-300 bg-red-50"
                        : "border-gray-300"
                    }`}
                    rows={sqlLineCount}
                  />
                  {validationErrors.sql_query && (
                    <p className="text-sm text-red-600 flex items-center">
                      <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                      {validationErrors.sql_query}
                    </p>
                  )}
                  <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <strong>Tips:</strong>
                    <ul className="mt-1 space-y-1">
                      <li>• Only SELECT statements are allowed</li>
                      <li>
                        • Use meaningful column aliases for better chart labels
                      </li>
                      <li>• Test your query before saving</li>
                      <li>• Consider adding LIMIT for large datasets</li>
                    </ul>
                  </div>
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
                        <div className="bg-white rounded-lg p-3 overflow-auto">
                          <pre className="text-xs text-gray-800">
                            {JSON.stringify(testResult, null, 2)}
                          </pre>
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
                </div>
              </div>
            </div>
          )}

          {/* Visualization Tab */}
          {currentTab === "visualization" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Choose Visualization Type
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {chartTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        setQueryForm((prev) => ({
                          ...prev,
                          chart_type: option.value,
                        }))
                      }
                      className={`p-4 border-2 rounded-lg text-center transition-all hover:shadow-md ${
                        queryForm.chart_type === option.value
                          ? "border-blue-500 bg-blue-50 shadow-lg"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="text-2xl mb-2">{option.icon}</div>
                      <div className="text-sm font-medium text-gray-900">
                        {option.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">
                  Chart Configuration Tips
                </h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>
                    • <strong>Bar/Line Charts:</strong> First column = labels,
                    subsequent columns = data series
                  </li>
                  <li>
                    • <strong>Pie/Doughnut:</strong> Two columns recommended
                    (category, value)
                  </li>
                  <li>
                    • <strong>Tables:</strong> All columns will be displayed
                    as-is
                  </li>
                  <li>
                    • Use meaningful column names for better chart legends
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Permissions Tab */}
          {currentTab === "permissions" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  User Roles with Access *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.values(UserRole).map((role) => (
                    <label
                      key={role}
                      className={`flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                        queryForm.role.includes(role)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        checked={queryForm.role.includes(role)}
                        onChange={() => {
                          setQueryForm((prev) => {
                            const newRoles = prev.role.includes(role)
                              ? prev.role.filter((r) => r !== role)
                              : [...prev.role, role];
                            return { ...prev, role: newRoles };
                          });
                        }}
                      />
                      <span className="text-gray-800 font-medium">
                        {roleDisplayNames[role]}
                      </span>
                    </label>
                  ))}
                </div>
                {validationErrors.role && (
                  <p className="text-sm text-red-600 flex items-center">
                    <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                    {validationErrors.role}
                  </p>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-amber-900 mb-2">
                  Access Control
                </h4>
                <p className="text-sm text-amber-800">
                  Only users with the selected roles will be able to view this
                  query and its results. Choose carefully based on data
                  sensitivity.
                </p>
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
                  Complete all required fields to save
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
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {editing ? "Update Query" : "Create Query"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueryFormModal;
