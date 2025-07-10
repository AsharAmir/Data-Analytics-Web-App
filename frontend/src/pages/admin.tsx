import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import {
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  EyeIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import apiClient from "../lib/api";
import Sidebar from "../components/Layout/Sidebar";
import { MenuItem, UserRole } from "../types";
import QueryFormModal from "../components/Admin/QueryFormModal";
import UserFormModal from "../components/Admin/UserFormModal";
import MenuFormModal from "../components/Admin/MenuFormModal";
import WidgetsSection from "../components/Admin/WidgetsSection";

interface Query {
  id: number;
  name: string;
  description: string;
  chart_type: string;
  menu_name: string;
  created_at: string;
  role: string;
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
  role: UserRole;
}

const roleDisplayNames: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.CEO]: "CEO",
  [UserRole.FINANCE_USER]: "Finance",
  [UserRole.TECH_USER]: "Tech",
  [UserRole.USER]: "User",
};

const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"widgets" | "queries" | "users" | "menus">(
    "widgets"
  );
  const [queries, setQueries] = useState<Query[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form states
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [showWidgetForm, setShowWidgetForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [queryForm, setQueryForm] = useState({
    name: "",
    description: "",
    sql_query: "",
    chart_type: "bar",
    chart_config: {},
    menu_item_id: null as number | null,
    role: [] as UserRole[],
  });
  const [widgetForm, setWidgetForm] = useState({
    title: "",
    query_id: null as number | null,
    position_x: 0,
    position_y: 0,
    width: 6,
    height: 4,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    password: "",
    role: UserRole.USER,
  });
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [menuForm, setMenuForm] = useState({
    name: "",
    type: "dashboard" as "dashboard" | "report",
    icon: "",
    parent_id: null as number | null,
    sort_order: 0,
  });

  const flattenMenuItems = (items: MenuItem[]): MenuItem[] => {
    const flat: MenuItem[] = [];
    items.forEach((item) => {
      flat.push(item);
      if (item.children && item.children.length > 0) {
        flat.push(...flattenMenuItems(item.children));
      }
    });
    return flat;
  };
  // Pre-compute a flattened view for easy rendering in the table
  const allMenuItems = flattenMenuItems(menuItems);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [queriesRes, widgetsRes, menuRes, usersRes] = await Promise.all([
        apiClient.get<{ data?: Query[] } | Query[]>("/api/admin/queries"),
        apiClient.get<{ data?: Widget[] } | Widget[]>("/api/admin/dashboard/widgets"),
        apiClient.get<{ data?: MenuItem[] } | MenuItem[]>("/api/menu"),
        apiClient.get<{ data?: AdminUser[] } | AdminUser[]>("/api/admin/users"),
      ]);

      // Endpoints return different shapes; normalize here
      setQueries((queriesRes as { data?: Query[] }).data ?? (queriesRes as Query[]) ?? []);
      setWidgets((widgetsRes as { data?: Widget[] }).data ?? (widgetsRes as Widget[]) ?? []);
      setMenuItems((menuRes as { data?: MenuItem[] }).data ?? (menuRes as MenuItem[]) ?? []);
      setUsers((usersRes as { data?: AdminUser[] }).data ?? (usersRes as AdminUser[]) ?? []);
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
        role: [],
      });
      loadData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error 
        ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
        : "Failed to create query";
      toast.error(errorMessage || "Failed to create query");
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error 
        ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
        : "Failed to create widget";
      toast.error(errorMessage || "Failed to create widget");
    }
  };

  const deleteWidget = async (widgetId: number) => {
    if (!confirm("Are you sure you want to delete this widget?")) return;

    try {
      await apiClient.delete(`/api/admin/dashboard/widget/${widgetId}`);
      toast.success("Widget deleted successfully!");
      loadData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error 
        ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
        : "Failed to delete widget";
      toast.error(errorMessage || "Failed to delete widget");
    }
  };


  const createOrUpdateMenu = async () => {
    try {
      if (editingMenuId) {
        await apiClient.put(`/api/admin/menu/${editingMenuId}`, menuForm);
        toast.success("Menu updated successfully!");
      } else {
        await apiClient.post("/api/admin/menu", menuForm);
        toast.success("Menu created successfully!");
      }
      setShowMenuForm(false);
      setEditingMenuId(null);
      setMenuForm({ name: "", type: "dashboard", icon: "", parent_id: null, sort_order: 0 });
      loadData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error 
        ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
        : "Failed to save menu";
      toast.error(errorMessage || "Failed to save menu");
    }
  };

  const deleteMenu = async (menuId: number) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    try {
      await apiClient.delete(`/api/admin/menu/${menuId}`);
      toast.success("Menu deleted successfully!");
      loadData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error 
        ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
        : "Failed to delete menu";
      toast.error(errorMessage || "Failed to delete menu");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        menuItems={menuItems}
        currentPath="/admin"
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      <div className="flex-1 flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-60 flex items-center justify-center z-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
          </div>
        )}
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {/* Mobile hamburger menu */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                  aria-label="Toggle menu"
                >
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                  </svg>
                </button>

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
                <button
                  onClick={() => setActiveTab("menus")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "menus"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Cog6ToothIcon className="h-5 w-5 inline mr-2" />
                  Menus ({menuItems.length})
                </button>
              </nav>
            </div>
          </div>

          {/* Widgets Tab */}
          {activeTab === "widgets" && (
            <WidgetsSection
              widgets={widgets}
              queries={queries}
              showWidgetForm={showWidgetForm}
              setShowWidgetForm={setShowWidgetForm}
              widgetForm={widgetForm}
              setWidgetForm={setWidgetForm}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              createWidget={createWidget}
              deleteWidget={deleteWidget}
            />
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
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            {query.role && typeof query.role === 'string'
                              ? query.role
                                  .split(',')
                                  .map((r) => roleDisplayNames[r.trim() as UserRole] || r.trim())
                                  .join(', ')
                              : 'user'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(query.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button
                            onClick={async () => {
                              if (!confirm("Delete this query?")) return;
                              try {
                                await apiClient.deleteQuery(query.id);
                                toast.success("Query deleted");
                                loadData();
                              } catch (error: unknown) {
                                const errorMessage = error instanceof Error && 'response' in error 
                                  ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
                                  : "Failed to delete query";
                                toast.error(errorMessage || "Failed to delete query");
                              }
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Query Form Modal */}
              {showQueryForm && (
                <QueryFormModal
                  visible={showQueryForm}
                  onClose={() => setShowQueryForm(false)}
                  onCreate={createQuery}
                  queryForm={queryForm}
                  setQueryForm={setQueryForm}
                  menuItems={menuItems}
                />
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
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
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
                              {roleDisplayNames[user.role]}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex space-x-3">
                          <button
                            onClick={() => {
                              setEditingUserId(user.id);
                              setUserForm({
                                username: user.username,
                                email: user.email,
                                password: "",
                                role: user.role,
                              });
                              setShowUserForm(true);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit"
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("Delete this user?")) return;
                              try {
                                await apiClient.deleteUser(user.id);
                                toast.success("User deleted");
                                loadData();
                              } catch (error: unknown) {
                                const errorMessage = error instanceof Error && 'response' in error 
                                  ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
                                  : "Failed to delete user";
                                toast.error(errorMessage || "Failed to delete user");
                              }
                            }}
                            className="text-red-600 hover:text-red-800"
                            title="Delete"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* User Form Modal */}
              {showUserForm && (
                <UserFormModal
                  visible={showUserForm}
                  editing={editingUserId !== null}
                  userForm={userForm}
                  setUserForm={setUserForm}
                  onSubmit={async () => {
                    try {
                      setLoading(true);
                      if (editingUserId) {
                        await apiClient.updateUser(editingUserId, userForm);
                        toast.success("User updated successfully");
                      } else {
                        await apiClient.post("/api/admin/user", userForm);
                        toast.success("User created successfully");
                      }
                      setShowUserForm(false);
                      setEditingUserId(null);
                      setUserForm({ username: "", email: "", password: "", role: UserRole.USER });
                      loadData();
                    } catch (error: unknown) {
                      const errorMessage = error instanceof Error && 'response' in error 
                        ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail 
                        : "Operation failed";
                      toast.error(errorMessage || "Operation failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  onClose={() => {
                    setShowUserForm(false);
                    setEditingUserId(null);
                    setUserForm({ username: "", email: "", password: "", role: UserRole.USER });
                  }}
                />
              )}
            </div>
          )}

          {/* Menus Tab */}
          {activeTab === "menus" && (
            <div>
              <div className="flex justify-between mb-4">
                <h2 className="text-xl font-semibold">Menu Items</h2>
                <button
                  onClick={() => {
                    setEditingMenuId(null);
                    setMenuForm({ name: "", type: "dashboard", icon: "", parent_id: null, sort_order: 0 });
                    setShowMenuForm(true);
                  }}
                  className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <PlusIcon className="h-5 w-5 mr-1" /> Add Menu
                </button>
              </div>

              <div className="overflow-x-auto bg-white shadow rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allMenuItems.map((menu) => (
                      <tr key={menu.id}>
                        <td className="px-6 py-3 whitespace-nowrap">{menu.name}</td>
                        <td className="px-6 py-3 whitespace-nowrap">{menu.type}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right space-x-3">
                          <button
                            onClick={() => {
                              setEditingMenuId(menu.id);
                              setMenuForm({
                                name: menu.name,
                                type: menu.type as "dashboard" | "report",
                                icon: menu.icon || "",
                                parent_id: menu.parent_id,
                                sort_order: menu.sort_order,
                              });
                              setShowMenuForm(true);
                            }}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteMenu(menu.id)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Menu Form Modal */}
              {showMenuForm && (
                <MenuFormModal
                  visible={showMenuForm}
                  editing={editingMenuId !== null}
                  menuForm={menuForm}
                  setMenuForm={setMenuForm}
                  menuItems={menuItems}
                  onSubmit={createOrUpdateMenu}
                  onClose={() => setShowMenuForm(false)}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
