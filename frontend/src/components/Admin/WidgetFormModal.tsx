import React, { useState, useEffect } from "react";
import { MenuItem } from "../../types";
import {
  XMarkIcon,
  PlayIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChartBarIcon,
  CubeIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import apiClient from "../../lib/api";

interface WidgetForm {
  title: string;
  query_id: number | null;
  position_x?: number;
  position_y?: number;
  width: number;
  height: number;
  // New fields for creating query inline
  create_new_query?: boolean;
  query_name?: string;
  sql_query?: string;
  chart_type?: string;
  menu_item_id?: number | null;
}

interface QueryOption {
  id: number;
  name: string;
  chart_type: string;
  menu_name?: string;
}

interface ValidationErrors {
  title?: string;
  query_id?: string;
  query_name?: string;
  sql_query?: string;
  query_test?: string;
}

const chartTypeOptions = [
  { value: "bar", label: "Bar Chart", icon: "📊" },
  { value: "line", label: "Line Chart", icon: "📈" },
  { value: "pie", label: "Pie Chart", icon: "🥧" },
  { value: "doughnut", label: "Doughnut Chart", icon: "🍩" },
  { value: "table", label: "Data Table", icon: "📋" },
];

const sizeOptions = [
  {
    value: "4x3",
    label: "Small (4 × 3)",
    width: 4,
    height: 3,
    description: "Compact KPI or small chart",
  },
  {
    value: "6x4",
    label: "Medium (6 × 4)",
    width: 6,
    height: 4,
    description: "Standard chart or table",
  },
  {
    value: "8x5",
    label: "Large (8 × 5)",
    width: 8,
    height: 5,
    description: "Detailed chart with legend",
  },
  {
    value: "12x6",
    label: "Extra Large (12 × 6)",
    width: 12,
    height: 6,
    description: "Full-width dashboard section",
  },
];

interface WidgetFormModalProps {
  visible: boolean;
  widgetForm: WidgetForm;
  setWidgetForm: React.Dispatch<React.SetStateAction<WidgetForm>>;
  queries: QueryOption[];
  menuItems: MenuItem[];
  onCreate: () => void;
  onClose: () => void;
}

const WidgetFormModal: React.FC<WidgetFormModalProps> = ({
  visible,
  widgetForm,
  setWidgetForm,
  queries,
  menuItems,
  onCreate,
  onClose,
}) => {
  const [currentTab, setCurrentTab] = useState<"basic" | "query" | "layout">(
    "basic",
  );
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );
  const [isTestingQuery, setIsTestingQuery] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [queryTested, setQueryTested] = useState(false);

  // Filter queries to show only those with dashboard assignments (including default)
  const availableQueries = queries.filter(
    (query) => query.menu_name, // Show all queries that have any menu assignment
  );

  useEffect(() => {
    // Reset tab when modal opens/closes
    if (visible) {
      setCurrentTab("basic");
      setValidationErrors({});
      setTestResult(null);
      setTestError(null);
      setQueryTested(false);
    }
  }, [visible]);

  useEffect(() => {
    // Reset query test status when SQL query changes
    setQueryTested(false);
    setTestResult(null);
    setTestError(null);
  }, [widgetForm.sql_query]);

  if (!visible) return null;

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!widgetForm.title.trim()) {
      errors.title = "Widget title is required";
    }

    if (widgetForm.create_new_query) {
      if (!widgetForm.query_name?.trim()) {
        errors.query_name = "Query name is required";
      }
      if (!widgetForm.sql_query?.trim()) {
        errors.sql_query = "SQL query is required";
      } else if (
        !widgetForm.sql_query.trim().toLowerCase().startsWith("select")
      ) {
        errors.sql_query = "Only SELECT statements are allowed";
      } else if (!queryTested || testError) {
        errors.query_test = "Please test your query and ensure it runs successfully";
      }
    } else {
      if (!widgetForm.query_id) {
        errors.query_id = "Please select a query or create a new one";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const testQuery = async () => {
    if (!widgetForm.sql_query?.trim()) return;

    setIsTestingQuery(true);
    setTestResult(null);
    setTestError(null);

    try {
      const response = await apiClient.post("/api/query/execute", {
        sql_query: widgetForm.sql_query,
        limit: 5,
      });
      setTestResult(response);
      setQueryTested(true);
    } catch (error: any) {
      setTestError(error.response?.data?.error || "Failed to execute query");
      setQueryTested(false);
    } finally {
      setIsTestingQuery(false);
    }
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onCreate();
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
    widgetForm.title.trim() &&
    (widgetForm.create_new_query
      ? widgetForm.query_name?.trim() && widgetForm.sql_query?.trim() && queryTested && !testError
      : widgetForm.query_id);

  const tabs = [
    { id: "basic", label: "Basic Info", icon: "ℹ️" },
    { id: "query", label: "Data Source", icon: "💾" },
    { id: "layout", label: "Layout", icon: "📐" },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                Create Dashboard Widget
              </h3>
              <p className="text-gray-500 text-sm">
                Add a new data visualization to your dashboard
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
                      Widget Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Monthly Sales Performance"
                      value={widgetForm.title}
                      onChange={(e) =>
                        setWidgetForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        validationErrors.title
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                    {validationErrors.title && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                        {validationErrors.title}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Choose a descriptive name that will appear as the widget
                      header
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-4">
                      Widget Size
                    </label>
                    <div className="grid grid-cols-1 gap-3">
                      {sizeOptions.map((option) => (
                        <label
                          key={option.value}
                          className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                            `${widgetForm.width}x${widgetForm.height}` ===
                            option.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="size"
                            value={option.value}
                            checked={
                              `${widgetForm.width}x${widgetForm.height}` ===
                              option.value
                            }
                            onChange={() => {
                              setWidgetForm((prev) => ({
                                ...prev,
                                width: option.width,
                                height: option.height,
                              }));
                            }}
                            className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 mr-3"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {option.label}
                            </div>
                            <div className="text-sm text-gray-500">
                              {option.description}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <EyeIcon className="h-5 w-5 mr-2" />
                    Widget Preview
                  </h4>
                  <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-lg font-medium text-gray-900 mb-2">
                        {widgetForm.title || "Widget Title"}
                      </div>
                      <div className="bg-gray-100 rounded-lg p-8 flex items-center justify-center">
                        <div className="text-center">
                          <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">
                            Size: {widgetForm.width} × {widgetForm.height}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <InformationCircleIcon className="h-4 w-4 inline mr-1" />
                      This shows how your widget will appear on the dashboard
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Query Tab */}
          {currentTab === "query" && (
            <div className="space-y-6">
              {/* Query Source Choice */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Choose Data Source
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label
                    className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      !widgetForm.create_new_query
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="querySource"
                      checked={!widgetForm.create_new_query}
                      onChange={() =>
                        setWidgetForm((prev) => ({
                          ...prev,
                          create_new_query: false,
                          query_name: "",
                          sql_query: "",
                          chart_type: "bar",
                          menu_item_id: null,
                        }))
                      }
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 mr-3"
                    />
                    <div>
                      <div className="font-medium text-gray-900">
                        Use Existing Query
                      </div>
                      <div className="text-sm text-gray-500">
                        Select from pre-built queries
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      widgetForm.create_new_query
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="querySource"
                      checked={widgetForm.create_new_query}
                      onChange={() =>
                        setWidgetForm((prev) => ({
                          ...prev,
                          create_new_query: true,
                          query_id: null,
                        }))
                      }
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 mr-3"
                    />
                    <div>
                      <div className="font-medium text-gray-900">
                        Create New Query
                      </div>
                      <div className="text-sm text-gray-500">
                        Build custom SQL query
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Existing Query Selection */}
              {!widgetForm.create_new_query && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Query *
                    </label>
                    {availableQueries.length > 0 ? (
                      <select
                        value={widgetForm.query_id || ""}
                        onChange={(e) =>
                          setWidgetForm((prev) => ({
                            ...prev,
                            query_id: e.target.value
                              ? parseInt(e.target.value)
                              : null,
                          }))
                        }
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                          validationErrors.query_id
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300"
                        }`}
                      >
                        <option value="">Select Query</option>
                        {availableQueries.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name} ({q.chart_type}) → {q.menu_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center">
                          <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 mr-2" />
                          <div>
                            <p className="text-sm font-medium text-amber-800">
                              No Dashboard Queries Available
                            </p>
                            <p className="text-sm text-amber-700">
                              Queries must be assigned to dashboards to appear
                              here. Create a new query instead.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {validationErrors.query_id && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                        {validationErrors.query_id}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* New Query Creation */}
              {widgetForm.create_new_query && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Query Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., Monthly Revenue Data"
                          value={widgetForm.query_name || ""}
                          onChange={(e) =>
                            setWidgetForm((prev) => ({
                              ...prev,
                              query_name: e.target.value,
                            }))
                          }
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                            validationErrors.query_name
                              ? "border-red-300 bg-red-50"
                              : "border-gray-300"
                          }`}
                        />
                        {validationErrors.query_name && (
                          <p className="mt-1 text-sm text-red-600 flex items-center">
                            <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                            {validationErrors.query_name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-700">
                          SQL Query *
                        </label>
                        <button
                          onClick={testQuery}
                          disabled={
                            !widgetForm.sql_query?.trim() || isTestingQuery
                          }
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
                        value={widgetForm.sql_query || ""}
                        onChange={(e) =>
                          setWidgetForm((prev) => ({
                            ...prev,
                            sql_query: e.target.value,
                          }))
                        }
                        className={`w-full px-4 py-3 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                          validationErrors.sql_query
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300"
                        }`}
                        rows={6}
                      />
                      {validationErrors.sql_query && (
                        <p className="text-sm text-red-600 flex items-center">
                          <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                          {validationErrors.sql_query}
                        </p>
                      )}
                      {validationErrors.query_test && (
                        <p className="text-sm text-red-600 flex items-center">
                          <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                          {validationErrors.query_test}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Chart Type
                          </label>
                          <select
                            value={widgetForm.chart_type || "bar"}
                            onChange={(e) =>
                              setWidgetForm((prev) => ({
                                ...prev,
                                chart_type: e.target.value,
                              }))
                            }
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          >
                            {chartTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Dashboard Assignment
                          </label>
                          <select
                            value={
                              widgetForm.menu_item_id === -1
                                ? "-1"
                                : widgetForm.menu_item_id || ""
                            }
                            onChange={(e) =>
                              setWidgetForm((prev) => ({
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
                            {menuItems
                              .filter(
                                (m) =>
                                  m.type === "dashboard" &&
                                  (!m.children || m.children.length === 0),
                              )
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  📄 {m.name}
                                </option>
                              ))}
                          </select>
                          <p className="mt-1 text-xs text-gray-500">
                            Choose which dashboard will display this widget
                          </p>
                          {!widgetForm.menu_item_id &&
                            widgetForm.menu_item_id !== -1 && (
                              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-xs text-amber-700 flex items-center">
                                  <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                                  Widget will be hidden without dashboard
                                  assignment
                                </p>
                              </div>
                            )}
                        </div>
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
                              <p className="text-sm text-red-800">
                                {testError}
                              </p>
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
            </div>
          )}

          {/* Layout Tab */}
          {currentTab === "layout" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-4 flex items-center">
                      <AdjustmentsHorizontalIcon className="h-5 w-5 mr-2" />
                      Advanced Position Settings
                    </label>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-amber-800">
                        <InformationCircleIcon className="h-4 w-4 inline mr-1" />
                        Leave empty for automatic positioning. Coordinates start
                        at (0,0) in the top-left.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Column Position
                        </label>
                        <input
                          type="number"
                          placeholder="Auto"
                          value={widgetForm.position_x ?? ""}
                          min={0}
                          max={12}
                          onChange={(e) =>
                            setWidgetForm((prev) => ({
                              ...prev,
                              position_x:
                                e.target.value === ""
                                  ? undefined
                                  : parseInt(e.target.value),
                            }))
                          }
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          0 = leftmost column
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Row Position
                        </label>
                        <input
                          type="number"
                          placeholder="Auto"
                          value={widgetForm.position_y ?? ""}
                          min={0}
                          onChange={(e) =>
                            setWidgetForm((prev) => ({
                              ...prev,
                              position_y:
                                e.target.value === ""
                                  ? undefined
                                  : parseInt(e.target.value),
                            }))
                          }
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          0 = top row
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-4">
                      Custom Size
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Width (columns)
                        </label>
                        <input
                          type="number"
                          value={widgetForm.width}
                          min={1}
                          max={12}
                          onChange={(e) =>
                            setWidgetForm((prev) => ({
                              ...prev,
                              width: parseInt(e.target.value) || 1,
                            }))
                          }
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Height (rows)
                        </label>
                        <input
                          type="number"
                          value={widgetForm.height}
                          min={1}
                          max={10}
                          onChange={(e) =>
                            setWidgetForm((prev) => ({
                              ...prev,
                              height: parseInt(e.target.value) || 1,
                            }))
                          }
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <CubeIcon className="h-5 w-5 mr-2" />
                    Layout Preview
                  </h4>
                  <div className="bg-white border border-gray-300 rounded-lg p-4">
                    <div className="grid grid-cols-12 gap-1 mb-4">
                      {Array.from({ length: 12 }, (_, i) => (
                        <div
                          key={i}
                          className={`aspect-square border rounded ${
                            widgetForm.position_x !== undefined &&
                            i >= widgetForm.position_x &&
                            i < widgetForm.position_x + widgetForm.width
                              ? "bg-blue-200 border-blue-400"
                              : "bg-gray-100 border-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="text-center text-sm text-gray-600">
                      <div>
                        Size: {widgetForm.width} × {widgetForm.height}
                      </div>
                      <div>
                        Position: {widgetForm.position_x ?? "Auto"},{" "}
                        {widgetForm.position_y ?? "Auto"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Blue area shows where your widget will be positioned
                    </p>
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
                  Complete all required fields to create widget
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
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {widgetForm.create_new_query
                  ? "Create Query & Widget"
                  : "Create Widget"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WidgetFormModal;
