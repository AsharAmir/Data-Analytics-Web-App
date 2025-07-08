import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import {
  PlusIcon,
  TrashIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  EyeIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import apiClient from "../lib/api";
import Sidebar from "../components/Layout/Sidebar";
import { MenuItem, User as UserType } from "../types";

interface Query {
  id: number;
  name: string;
  description: string;
  chart_type: string;
  menu_name: string;
  created_at: string;
}

interface Widget {
  id: number;
  title: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  query_name: string;
  chart_type: string;
  created_at: string;
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  is_admin: boolean;
}

const AdminPage: React.FC = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"widgets" | "queries" | "users">(
    "widgets"
  );
  const [queries, setQueries] = useState<Query[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Form states
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [showWidgetForm, setShowWidgetForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [queryForm, setQueryForm] = useState({
    name: "",
    description: "",
    sql_query: "",
    chart_type: "bar",
    chart_config: {},
    menu_item_id: null as number | null,
  });
  const [widgetForm, setWidgetForm] = useState({
    title: "",
    query_id: null as number | null,
    position_x: 0,
    position_y: 0,
    width: 6,
    height: 4,
  });
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [queriesRes, widgetsRes, menuRes, usersRes] = await Promise.all([
        apiClient.get("/api/admin/queries"),
        apiClient.get("/api/admin/dashboard/widgets"),
        apiClient.get("/api/menu"),
        apiClient.get("/api/admin/users"),
      ]);

      setQueries(queriesRes.data.data || []);
      setWidgets(widgetsRes.data.data || []);
      setMenuItems(menuRes.data || []);
      setUsers(usersRes.data.data || []);
    } catch (error) {
      toast.error("Failed to load admin data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createQuery = async () => {
    try {
      await apiClient.post("/api/admin/query", queryForm);
      toast.success("Query created successfully!");
      setShowQueryForm(false);
      setQueryForm({
        name: "",
        description: "",
        sql_query: "",
        chart_type: "bar",
        chart_config: {},
        menu_item_id: null,
      });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Failed to create query");
    }
  };

  const createWidget = async () => {
    try {
      await apiClient.post("/api/admin/dashboard/widget", widgetForm);
      toast.success("Widget created successfully!");
      setShowWidgetForm(false);
      setWidgetForm({
        title: "",
        query_id: null,
        position_x: 0,
        position_y: 0,
        width: 6,
        height: 4,
      });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Failed to create widget");
    }
  };

  const deleteWidget = async (widgetId: number) => {
    if (!confirm("Are you sure you want to delete this widget?")) return;

    try {
      await apiClient.delete(`/api/admin/dashboard/widget/${widgetId}`);
      toast.success("Widget deleted successfully!");
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Failed to delete widget");
    }
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === "dashboard") {
      router.push("/dashboard");
    } else {
      router.push(`/report/${item.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        menuItems={menuItems}
        currentPath="/admin"
        onMenuClick={handleMenuClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                  <Cog6ToothIcon className="h-7 w-7 mr-2 text-blue-600" />
                  Admin Dashboard
                </h1>
                <p className="text-gray-600">
                  Manage dashboard widgets and queries
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab("widgets")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "widgets"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <ChartBarIcon className="h-5 w-5 inline mr-2" />
                  Dashboard Widgets ({widgets.length})
                </button>
                <button
                  onClick={() => setActiveTab("queries")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "queries"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <DocumentTextIcon className="h-5 w-5 inline mr-2" />
                  Queries ({queries.length})
                </button>
                <button
                  onClick={() => setActiveTab("users")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "users"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <EyeIcon className="h-5 w-5 inline mr-2" />
                  Users ({users.length})
                </button>
              </nav>
            </div>
          </div>

          {/* Widgets Tab */}
          {activeTab === "widgets" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  Dashboard Widgets
                </h2>
                <button
                  onClick={() => setShowWidgetForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Create Widget
                </button>
              </div>

              {/* Widgets Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {widgets.map((widget) => (
                  <div
                    key={widget.id}
                    className="bg-white rounded-lg shadow p-6"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        {widget.title}
                      </h3>
                      <button
                        onClick={() => deleteWidget(widget.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <p>
                        <strong>Query:</strong> {widget.query_name}
                      </p>
                      <p>
                        <strong>Chart Type:</strong> {widget.chart_type}
                      </p>
                      <p>
                        <strong>Position:</strong> ({widget.position_x},{" "}
                        {widget.position_y})
                      </p>
                      <p>
                        <strong>Size:</strong> {widget.width} × {widget.height}
                      </p>
                      <p>
                        <strong>Created:</strong>{" "}
                        {new Date(widget.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Widget Form Modal */}
              {showWidgetForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md">
                    <h3 className="text-lg font-medium mb-4">
                      Create Dashboard Widget
                    </h3>
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Widget Title"
                        value={widgetForm.title}
                        onChange={(e) =>
                          setWidgetForm({
                            ...widgetForm,
                            title: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <select
                        value={widgetForm.query_id || ""}
                        onChange={(e) =>
                          setWidgetForm({
                            ...widgetForm,
                            query_id: parseInt(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">Select Query</option>
                        {queries.map((query) => (
                          <option key={query.id} value={query.id}>
                            {query.name} ({query.chart_type})
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          type="number"
                          placeholder="Position X"
                          value={widgetForm.position_x}
                          onChange={(e) =>
                            setWidgetForm({
                              ...widgetForm,
                              position_x: parseInt(e.target.value),
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="number"
                          placeholder="Position Y"
                          value={widgetForm.position_y}
                          onChange={(e) =>
                            setWidgetForm({
                              ...widgetForm,
                              position_y: parseInt(e.target.value),
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="number"
                          placeholder="Width"
                          value={widgetForm.width}
                          onChange={(e) =>
                            setWidgetForm({
                              ...widgetForm,
                              width: parseInt(e.target.value),
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="number"
                          placeholder="Height"
                          value={widgetForm.height}
                          onChange={(e) =>
                            setWidgetForm({
                              ...widgetForm,
                              height: parseInt(e.target.value),
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                      <button
                        onClick={() => setShowWidgetForm(false)}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={createWidget}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Create Widget
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Queries Tab */}
          {activeTab === "queries" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  Available Queries
                </h2>
                <button
                  onClick={() => setShowQueryForm(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Create Query
                </button>
              </div>

              {/* Queries List */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Chart Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Menu
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {queries.map((query) => (
                      <tr key={query.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {query.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {query.description}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            {query.chart_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {query.menu_name || "No menu"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(query.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Query Form Modal */}
              {showQueryForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-medium mb-4">
                      Create New Query
                    </h3>
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Query Name"
                        value={queryForm.name}
                        onChange={(e) =>
                          setQueryForm({ ...queryForm, name: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <textarea
                        placeholder="Description (optional)"
                        value={queryForm.description}
                        onChange={(e) =>
                          setQueryForm({
                            ...queryForm,
                            description: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        rows={2}
                      />
                      <textarea
                        placeholder="SQL Query (SELECT statements only)"
                        value={queryForm.sql_query}
                        onChange={(e) =>
                          setQueryForm({
                            ...queryForm,
                            sql_query: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
                        rows={6}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <select
                          value={queryForm.chart_type}
                          onChange={(e) =>
                            setQueryForm({
                              ...queryForm,
                              chart_type: e.target.value,
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="bar">Bar Chart</option>
                          <option value="line">Line Chart</option>
                          <option value="pie">Pie Chart</option>
                          <option value="doughnut">Doughnut Chart</option>
                        </select>
                        <select
                          value={queryForm.menu_item_id || ""}
                          onChange={(e) =>
                            setQueryForm({
                              ...queryForm,
                              menu_item_id: parseInt(e.target.value) || null,
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="">No Menu</option>
                          {menuItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                      <button
                        onClick={() => setShowQueryForm(false)}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={createQuery}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Create Query
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  Available Users
                </h2>
                <button
                  onClick={() => setShowUserForm(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Create User
                </button>
              </div>

              {/* Users List */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Active
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Admin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {user.username}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm text-gray-900">
                              {user.email}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm text-gray-900">
                              {user.is_active ? "Yes" : "No"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm text-gray-900">
                              {user.is_admin ? "Yes" : "No"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* User Form Modal */}
              {showUserForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-medium mb-4">
                      Create New User
                    </h3>
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Username"
                        value={userForm.username}
                        onChange={(e) =>
                          setUserForm({ ...userForm, username: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={userForm.email}
                        onChange={(e) =>
                          setUserForm({ ...userForm, email: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={userForm.password}
                        onChange={(e) =>
                          setUserForm({ ...userForm, password: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                      <button
                        onClick={() => setShowUserForm(false)}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          // Implement user creation logic here
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Create User
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
