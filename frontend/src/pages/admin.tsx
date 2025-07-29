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
import { MenuItem, UserRole, Role } from "../types";
import MenuFormModal from "../components/Admin/MenuFormModal";
import ProcessesTab from "../components/Admin/ProcessesTab";
import WidgetsTab from "../components/Admin/WidgetsTab";
import QueriesTab from "../components/Admin/QueriesTab";
import KpisTab from "../components/Admin/KpisTab";
import UsersTab from "../components/Admin/UsersTab";
import RolesTab from "../components/Admin/RolesTab";

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

interface KPI {
  id: number;
  name: string;
  description: string;
  sql_query: string;
  menu_name: string;
  created_at: string;
  role: string;
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
  const [activeTab, setActiveTab] = useState<
    "widgets" | "queries" | "processes" | "users" | "menus" | "kpis" | "roles"
  >("widgets");
  const [queries, setQueries] = useState<Query[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form states
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [editingQueryId, setEditingQueryId] = useState<number | null>(null);
  const [editingProcessId, setEditingProcessId] = useState<number | null>(null);
  const [showWidgetForm, setShowWidgetForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [editingKpiId, setEditingKpiId] = useState<number | null>(null);
  const [queryForm, setQueryForm] = useState({
    name: "",
    description: "",
    sql_query: "",
    chart_type: "bar",
    chart_config: {},
    menu_item_id: null as number | null,
    menu_item_ids: [] as number[],
    role: [] as UserRole[],
  });
  const [widgetForm, setWidgetForm] = useState({
    title: "",
    query_id: null as number | null,
    position_x: 0,
    position_y: 0,
    width: 6,
    height: 4,
    create_new_query: true, // Default to the simplified workflow
    query_name: "",
    sql_query: "",
    chart_type: "bar",
    menu_item_id: null as number | null,
  });

  const [userForm, setUserForm] = useState<{username:string;email:string;password:string;role:string}>({
    username: "",
    email: "",
    password: "",
    role: "user",
  });
  const [kpiForm, setKpiForm] = useState({
    name: "",
    description: "",
    sql_query: "",
    menu_item_id: null as number | null,
    role: [] as UserRole[],
  });
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [menuForm, setMenuForm] = useState({
    name: "",
    type: "dashboard" as "dashboard" | "report",
    icon: "",
    parent_id: null as number | null,
    sort_order: 0,
    role: [] as UserRole[],
  });
  const [processForm, setProcessForm] = useState({
    name: "",
    description: "",
    script_path: "",
    parameters: [] as any[],
    role: [] as string[],
  });

  // Roles modal & reassignment states
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string>("");
  const [usersToReassign, setUsersToReassign] = useState<{ id: number; username: string }[]>([]);

  // Helper lists for role dropdowns
  // Merge backend role names with fixed enum roles, case-insensitive de-dupe preferring backend
  const backendRoleNames = roles.map((r) => r.name);
  const enumRoleNames = Object.values(UserRole).filter(
    (er) => !backendRoleNames.some((br) => br.toLowerCase() === er.toLowerCase()),
  );
  const allRolesList = [...backendRoleNames, ...enumRoleNames];

  // For reassignment modal exclude current deleting / system
  const otherRoleNames = roles
    .filter((r) => !r.is_system && r.name !== roleToDelete)
    .map((r) => r.name);

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

  // Create a hierarchical display list that maintains parent-child relationships
  const createHierarchicalMenuList = (
    items: MenuItem[],
  ): (MenuItem & { level: number })[] => {
    const hierarchical: (MenuItem & { level: number })[] = [];

    const addItemsRecursively = (menuItems: MenuItem[], level: number = 0) => {
      // Sort by sort_order at each level
      const sortedItems = [...menuItems].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
      );

      sortedItems.forEach((item) => {
        hierarchical.push({ ...item, level });
        if (item.children && item.children.length > 0) {
          addItemsRecursively(item.children, level + 1);
        }
      });
    };

    addItemsRecursively(items);
    return hierarchical;
  };

  // Pre-compute a flattened view for easy rendering in the table
  const allMenuItems = flattenMenuItems(menuItems);
  // Pre-compute hierarchical view for display
  const hierarchicalMenuItems = createHierarchicalMenuList(menuItems);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [queriesRes, processesRes, widgetsRes, menuRes, usersRes, kpisRes, rolesRes] =
        await Promise.all([
          apiClient.get<{ data?: Query[] } | Query[]>("/api/admin/queries"),
          apiClient.listProcesses(),
          apiClient.get<{ data?: Widget[] } | Widget[]>(
            "/api/admin/dashboard/widgets",
          ),
          apiClient.get<{ data?: MenuItem[] } | MenuItem[]>("/api/menu"),
          apiClient.get<{ data?: AdminUser[] } | AdminUser[]>(
            "/api/admin/users",
          ),
          apiClient.get<{ data?: KPI[] } | KPI[]>("/api/admin/kpis"),
          apiClient.listRoles(),
        ]);

      // Endpoints return different shapes; normalize here
      setQueries(
        (queriesRes as { data?: Query[] }).data ??
          (queriesRes as Query[]) ??
          [],
      );
      setProcesses(processesRes?.data ?? processesRes ?? []);
      setWidgets(
        (widgetsRes as { data?: Widget[] }).data ??
          (widgetsRes as Widget[]) ??
          [],
      );
      setMenuItems(
        (menuRes as { data?: MenuItem[] }).data ??
          (menuRes as MenuItem[]) ??
          [],
      );
      setUsers(
        (usersRes as { data?: AdminUser[] }).data ??
          (usersRes as AdminUser[]) ??
          [],
      );
      setKpis((kpisRes as { data?: KPI[] }).data ?? (kpisRes as KPI[]) ?? []);
      setRoles((rolesRes as any)?.data ?? rolesRes ?? []);
    } catch (error) {
      toast.error("Failed to load admin data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createOrUpdateQuery = async () => {
    try {
      if (editingQueryId) {
        await apiClient.put(`/api/admin/query/${editingQueryId}`, queryForm);
        toast.success("Query updated successfully!");
      } else {
        await apiClient.post("/api/admin/query", queryForm);
        toast.success("Query created successfully!");
      }
      setShowQueryForm(false);
      setEditingQueryId(null);
      setQueryForm({
        name: "",
        description: "",
        sql_query: "",
        chart_type: "bar",
        chart_config: {},
        menu_item_id: null,
        menu_item_ids: [],
        role: [],
      });
      loadData();
    } catch (error: unknown) {
      // Handle different error response structures
      let errorMessage = editingQueryId
        ? "Failed to update query"
        : "Failed to create query";

      if (error instanceof Error && "response" in error) {
        const responseError = error as { response?: { data?: any } };
        const errorData = responseError.response?.data;

        if (errorData) {
          // FastAPI validation errors have detail as an array of error objects
          if (Array.isArray(errorData.detail)) {
            const validationErrors = errorData.detail.map((err: any) => {
              if (err.msg && err.loc) {
                const field = Array.isArray(err.loc)
                  ? err.loc.join(".")
                  : err.loc;
                return `${field}: ${err.msg}`;
              }
              return err.msg || err.toString();
            });
            errorMessage = validationErrors.join("; ");
          }
          // Standard FastAPI error with detail as string
          else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          }
          // Generic error field
          else if (errorData.error) {
            errorMessage = errorData.error;
          }
          // Fallback to message
          else if (errorData.message) {
            errorMessage = errorData.message;
          }
        }
      }

      toast.error(errorMessage);
    }
  };

  const createWidget = async () => {
    try {
      if (widgetForm.create_new_query) {
        // First create the query, then create the widget with that query
        const queryData = {
          name: widgetForm.query_name,
          description: `Auto-generated query for widget: ${widgetForm.title}`,
          sql_query: widgetForm.sql_query,
          chart_type: widgetForm.chart_type,
          chart_config: {},
          menu_item_id: widgetForm.menu_item_id,
          role: [],
        };

        const queryResponse = await apiClient.post(
          "/api/admin/query",
          queryData,
        );
        console.log("Query creation response:", queryResponse);

        // Extract query ID from response - check both direct ID and nested data.id
        let queryId: number;
        if (typeof queryResponse === "object" && queryResponse !== null) {
          if ("id" in queryResponse) {
            queryId = (queryResponse as { id: number }).id;
          } else if (
            "data" in queryResponse &&
            queryResponse.data &&
            typeof queryResponse.data === "object" &&
            "id" in queryResponse.data
          ) {
            queryId = (queryResponse.data as { id: number }).id;
          } else {
            throw new Error("No query ID returned from query creation");
          }
        } else {
          throw new Error("Invalid response from query creation");
        }

        console.log("Extracted query ID:", queryId);

        // Now create the widget with the new query ID
        const widgetData = {
          title: widgetForm.title,
          query_id: queryId,
          position_x: widgetForm.position_x,
          position_y: widgetForm.position_y,
          width: widgetForm.width,
          height: widgetForm.height,
        };

        console.log("Widget data to send:", widgetData);
        await apiClient.post("/api/admin/dashboard/widget", widgetData);
        toast.success("Query and widget created successfully!");
      } else {
        // Just create the widget with existing query
        const widgetData = {
          title: widgetForm.title,
          query_id: widgetForm.query_id,
          position_x: widgetForm.position_x,
          position_y: widgetForm.position_y,
          width: widgetForm.width,
          height: widgetForm.height,
        };
        await apiClient.post("/api/admin/dashboard/widget", widgetData);
        toast.success("Widget created successfully!");
      }

      setShowWidgetForm(false);
      setWidgetForm({
        title: "",
        query_id: null,
        position_x: 0,
        position_y: 0,
        width: 6,
        height: 4,
        create_new_query: true,
        query_name: "",
        sql_query: "",
        chart_type: "bar",
        menu_item_id: null,
      });
      loadData();
    } catch (error: unknown) {
      console.error("Widget creation error:", error);
      console.error(
        "Error response data:",
        error instanceof Error && "response" in error
          ? (error as { response?: { data?: any } }).response?.data
          : "No response data",
      );

      // Handle different error response structures
      let errorMessage = "Failed to create widget";

      if (error instanceof Error && "response" in error) {
        const responseError = error as { response?: { data?: any } };
        const errorData = responseError.response?.data;

        if (errorData) {
          // FastAPI validation errors have detail as an array of error objects
          if (Array.isArray(errorData.detail)) {
            const validationErrors = errorData.detail.map((err: any) => {
              if (err.msg && err.loc) {
                const field = Array.isArray(err.loc)
                  ? err.loc.join(".")
                  : err.loc;
                return `${field}: ${err.msg}`;
              }
              return err.msg || err.toString();
            });
            errorMessage = validationErrors.join("; ");
          }
          // Standard FastAPI error with detail as string
          else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          }
          // Generic error field
          else if (errorData.error) {
            errorMessage = errorData.error;
          }
          // Fallback to message
          else if (errorData.message) {
            errorMessage = errorData.message;
          }
        }
      }

      console.error("Extracted error message:", errorMessage);
      toast.error(errorMessage);
    }
  };

  const deleteWidget = async (widgetId: number) => {
    if (!confirm("Are you sure you want to delete this widget?")) return;

    try {
      await apiClient.delete(`/api/admin/dashboard/widget/${widgetId}`);
      toast.success("Widget deleted successfully!");
      loadData();
    } catch (error: any) {
      console.error("Delete widget error:", error);
      let errorMessage = "Failed to delete widget";

      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
      console.error("Widget delete failed:", errorMessage);
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
      setMenuForm({
        name: "",
        type: "dashboard",
        icon: "",
        parent_id: null,
        sort_order: 0,
        role: [],
      });
      loadData();
    } catch (error: unknown) {
      // Handle different error response structures
      let errorMessage = editingMenuId
        ? "Failed to update menu"
        : "Failed to create menu";

      if (error instanceof Error && "response" in error) {
        const responseError = error as { response?: { data?: any } };
        const errorData = responseError.response?.data;

        if (errorData) {
          // FastAPI validation errors have detail as an array of error objects
          if (Array.isArray(errorData.detail)) {
            const validationErrors = errorData.detail.map((err: any) => {
              if (err.msg && err.loc) {
                const field = Array.isArray(err.loc)
                  ? err.loc.join(".")
                  : err.loc;
                return `${field}: ${err.msg}`;
              }
              return err.msg || err.toString();
            });
            errorMessage = validationErrors.join("; ");
          }
          // Standard FastAPI error with detail as string
          else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          }
          // Generic error field
          else if (errorData.error) {
            errorMessage = errorData.error;
          }
          // Fallback to message
          else if (errorData.message) {
            errorMessage = errorData.message;
          }
        }
      }

      toast.error(errorMessage);
      throw error; // Re-throw to let modal handle loading state
    }
  };

  const deleteMenu = async (menuId: number) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    try {
      await apiClient.delete(`/api/admin/menu/${menuId}`);
      toast.success("Menu deleted successfully!");
      loadData();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error && "response" in error
          ? (error as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : "Failed to delete menu";
      toast.error(errorMessage || "Failed to delete menu");
    }
  };

  const createOrUpdateKpi = async () => {
    try {
      if (editingKpiId) {
        await apiClient.put(`/api/admin/kpi/${editingKpiId}`, kpiForm);
        toast.success("KPI updated successfully!");
      } else {
        await apiClient.post("/api/admin/kpi", kpiForm);
        toast.success("KPI created successfully!");
      }
      setShowKpiForm(false);
      setEditingKpiId(null);
      setKpiForm({
        name: "",
        description: "",
        sql_query: "",
        menu_item_id: null,
        role: [],
      });
      loadData();
    } catch (error: unknown) {
      // Handle different error response structures
      let errorMessage = editingKpiId
        ? "Failed to update KPI"
        : "Failed to create KPI";

      if (error instanceof Error && "response" in error) {
        const responseError = error as { response?: { data?: any } };
        const errorData = responseError.response?.data;

        if (errorData) {
          // FastAPI validation errors have detail as an array of error objects
          if (Array.isArray(errorData.detail)) {
            const validationErrors = errorData.detail.map((err: any) => {
              if (err.msg && err.loc) {
                const field = Array.isArray(err.loc)
                  ? err.loc.join(".")
                  : err.loc;
                return `${field}: ${err.msg}`;
              }
              return err.msg || err.toString();
            });
            errorMessage = validationErrors.join("; ");
          }
          // Standard FastAPI error with detail as string
          else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          }
          // Generic error field
          else if (errorData.error) {
            errorMessage = errorData.error;
          }
          // Fallback to message
          else if (errorData.message) {
            errorMessage = errorData.message;
          }
        }
      }

      toast.error(errorMessage);
    }
  };

  const deleteKpi = async (kpiId: number) => {
    if (!confirm("Are you sure you want to delete this KPI?")) return;
    try {
      await apiClient.delete(`/api/admin/kpi/${kpiId}`);
      toast.success("KPI deleted successfully!");
      loadData();
    } catch (error: any) {
      console.error("Delete KPI error:", error);
      let errorMessage = "Failed to delete KPI";

      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
      console.error("KPI delete failed:", errorMessage);
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
                  onClick={() => setActiveTab("processes")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "processes"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Cog6ToothIcon className="h-5 w-5 inline mr-2" />
                  Processes ({processes.length})
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
                  onClick={() => setActiveTab("kpis")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "kpis"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <span className="text-lg inline mr-2">📊</span>
                  Stats/KPIs ({kpis.length})
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
                  Menus ({allMenuItems.length})
                </button>
                <button onClick={()=>setActiveTab("roles")} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === "roles"?"border-blue-500 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}>Roles ({roles.length})</button>
              </nav>
            </div>
          </div>

          {/* Widgets Tab */}
          {activeTab === "widgets" && (
            <WidgetsTab
              widgets={widgets}
              queries={queries.map((q) => ({
                id: q.id,
                name: q.name,
                chart_type: q.chart_type,
                menu_name: q.menu_name,
              }))}
              menuItems={menuItems}
              showWidgetForm={showWidgetForm}
              setShowWidgetForm={setShowWidgetForm}
              widgetForm={widgetForm}
              setWidgetForm={setWidgetForm}
              createWidget={createWidget}
              deleteWidget={deleteWidget}
            />
          )}

          {/* Queries Tab */}
          {activeTab === "queries" && (
            <QueriesTab
              queries={queries}
              queryForm={queryForm}
              setQueryForm={setQueryForm}
              showQueryForm={showQueryForm}
              setShowQueryForm={setShowQueryForm}
              editingQueryId={editingQueryId}
              setEditingQueryId={setEditingQueryId}
              allMenuItems={allMenuItems}
              allRolesList={allRolesList}
              roleDisplayNames={roleDisplayNames}
              createOrUpdateQuery={createOrUpdateQuery}
              loadData={loadData}
            />
          )}

          {/* KPIs Tab */}
          {activeTab === "kpis" && (
            <KpisTab
              kpis={kpis}
              kpiForm={kpiForm}
              setKpiForm={setKpiForm}
              showKpiForm={showKpiForm}
              setShowKpiForm={setShowKpiForm}
              editingKpiId={editingKpiId}
              setEditingKpiId={setEditingKpiId}
              allMenuItems={allMenuItems}
              allRolesList={allRolesList}
              roleDisplayNames={roleDisplayNames}
              createOrUpdateKpi={createOrUpdateKpi}
              deleteKpi={deleteKpi}
              loadData={loadData}
            />
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <UsersTab
              users={users}
              userForm={userForm}
              setUserForm={setUserForm}
              showUserForm={showUserForm}
              setShowUserForm={setShowUserForm}
              editingUserId={editingUserId}
              setEditingUserId={setEditingUserId}
              setLoading={setLoading}
              allRolesList={allRolesList}
              roleDisplayNames={roleDisplayNames}
              loadData={loadData}
            />
          )}

          {/* Menus Tab */}
          {activeTab === "menus" && (
            <div>
              <div className="flex justify-between mb-4">
                <h2 className="text-xl font-semibold">Menu Items</h2>
                <button
                  onClick={() => {
                    setEditingMenuId(null);
                    setMenuForm({
                      name: "",
                      type: "dashboard",
                      icon: "",
                      parent_id: null,
                      sort_order: 0,
                      role: [],
                    });
                    setShowMenuForm(true);
                  }}
                  className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <PlusIcon className="h-5 w-5 mr-1" /> Add Menu
                </button>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Menu Details
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type & Order
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Access Control
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {hierarchicalMenuItems.map((menu) => (
                        <tr
                          key={menu.id}
                          className={`hover:bg-gray-50 transition-colors ${
                            menu.level > 0
                              ? "bg-gray-25 border-l-4 border-l-blue-100"
                              : ""
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div
                              className="flex items-center"
                              style={{ marginLeft: `${menu.level * 24}px` }}
                            >
                              {menu.level > 0 && (
                                <div className="flex items-center mr-2 text-gray-400">
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.5}
                                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                                    />
                                  </svg>
                                </div>
                              )}
                              <div>
                                <div
                                  className={`text-sm font-medium ${menu.level > 0 ? "text-gray-700" : "text-gray-900"}`}
                                >
                                  {menu.name}
                                  {menu.level > 0 && (
                                    <span className="ml-2 inline-flex px-2 py-1 text-xs leading-4 font-medium rounded bg-gray-100 text-gray-600">
                                      Submenu
                                    </span>
                                  )}
                                </div>
                                {menu.level === 0 &&
                                  menu.children &&
                                  menu.children.length > 0 && (
                                    <div className="text-xs text-gray-500">
                                      {menu.children.length} submenu
                                      {menu.children.length !== 1 ? "s" : ""}
                                    </div>
                                  )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="inline-flex px-2 py-1 text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 mb-1">
                                {menu.type}
                              </span>
                              <span className="text-xs text-gray-500">
                                {menu.level > 0 ? "Sub-order" : "Order"}:{" "}
                                {menu.sort_order}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {menu.role && menu.role.length > 0 ? (
                                (Array.isArray(menu.role)
                                  ? menu.role
                                  : [menu.role]
                                ).map((role) => (
                                  <span
                                    key={role}
                                    className="inline-flex px-2 py-1 text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800"
                                  >
                                    {roleDisplayNames[role as UserRole] || role}
                                  </span>
                                ))
                              ) : (
                                <span className="inline-flex px-2 py-1 text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                  All roles
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex justify-center space-x-2">
                              {menu.level === 0 &&
                                menu.type !== "dashboard" && (
                                  <button
                                    onClick={() => {
                                      setEditingMenuId(null);
                                      setMenuForm({
                                        name: "",
                                        type: "report", // Default to report for submenus
                                        icon: "",
                                        parent_id: menu.id, // Set parent to current menu
                                        sort_order:
                                          (menu.children?.length || 0) + 1, // Auto-increment sort order
                                        role: [],
                                      });
                                      setShowMenuForm(true);
                                    }}
                                    className="inline-flex items-center p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Add submenu"
                                  >
                                    <PlusIcon className="h-4 w-4" />
                                  </button>
                                )}
                              <button
                                onClick={() => {
                                  setEditingMenuId(menu.id);
                                  setMenuForm({
                                    name: menu.name,
                                    type: menu.type as "dashboard" | "report",
                                    icon: menu.icon || "",
                                    parent_id: menu.parent_id,
                                    sort_order: menu.sort_order,
                                    role: menu.role
                                      ? Array.isArray(menu.role)
                                        ? menu.role
                                        : [menu.role]
                                      : [],
                                  });
                                  setShowMenuForm(true);
                                }}
                                className="inline-flex items-center p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit menu"
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => deleteMenu(menu.id)}
                                className="inline-flex items-center p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete menu"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Menu Form Modal */}
              {showMenuForm && (
                <MenuFormModal
                  visible={showMenuForm}
                  editing={editingMenuId !== null}
                  menuForm={menuForm}
                  setMenuForm={setMenuForm}
                  onSubmit={createOrUpdateMenu}
                  onClose={() => {
                    setShowMenuForm(false);
                    setEditingMenuId(null);
                    setMenuForm({
                      name: "",
                      type: "dashboard",
                      icon: "",
                      parent_id: null,
                      sort_order: 0,
                      role: [],
                    });
                  }}
                  availableRoles={allRolesList}
                />
              )}
            </div>
          )}

          {/* Roles Tab */}
          {activeTab === "roles" && (
            <RolesTab
              roles={roles}
              otherRoleNames={otherRoleNames}
              showRoleForm={showRoleForm}
              setShowRoleForm={setShowRoleForm}
              showReassignModal={showReassignModal}
              setShowReassignModal={setShowReassignModal}
              roleToDelete={roleToDelete}
              setRoleToDelete={setRoleToDelete}
              usersToReassign={usersToReassign}
              setUsersToReassign={setUsersToReassign}
              loadData={loadData}
            />
          )}

          {/* Processes Tab */}
          {activeTab === "processes" && (
            <ProcessesTab
              processes={processes as any}
              processForm={processForm as any}
              setProcessForm={setProcessForm as any}
              showProcessForm={showProcessForm}
              setShowProcessForm={setShowProcessForm}
              editingProcessId={editingProcessId}
              setEditingProcessId={setEditingProcessId}
              loadData={loadData}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
