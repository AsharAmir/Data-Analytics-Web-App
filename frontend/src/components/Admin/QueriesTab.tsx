import React from "react";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import QueryFormModal from "./QueryFormModal"; // adjust path later maybe
import apiClient from "../../lib/api";
import { MenuItem, UserRole } from "../../types";

/*
  Props accepted by QueriesTab mimic the state & helpers previously living in AdminPage.
*/
export interface Query {
  id: number;
  name: string;
  description: string;
  chart_type: string;
  menu_name?: string;
  created_at: string;
  role?: string;
}

interface QueryFormState {
  name: string;
  description: string;
  sql_query: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  menu_item_id: number | null;
  menu_item_ids: number[];
  role: UserRole[];
}

interface QueriesTabProps {
  queries: Query[];
  queryForm: QueryFormState;
  setQueryForm: React.Dispatch<React.SetStateAction<QueryFormState>>;
  showQueryForm: boolean;
  setShowQueryForm: React.Dispatch<React.SetStateAction<boolean>>;
  editingQueryId: number | null;
  setEditingQueryId: React.Dispatch<React.SetStateAction<number | null>>;
  allMenuItems: MenuItem[];
  allRolesList: string[];
  roleDisplayNames: Record<UserRole, string>;
  createOrUpdateQuery: () => Promise<void>;
  loadData: () => void;
}

const QueriesTab: React.FC<QueriesTabProps> = ({
  queries,
  queryForm,
  setQueryForm,
  showQueryForm,
  setShowQueryForm,
  editingQueryId,
  setEditingQueryId,
  allMenuItems,
  allRolesList,
  roleDisplayNames,
  createOrUpdateQuery,
  loadData,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Available Queries</h2>
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
                    <div className="text-sm font-medium text-gray-900">{query.name}</div>
                    <div className="text-sm text-gray-500">{query.description}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    {query.chart_type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {query.menu_name || "Default Dashboard"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                    {query.role && typeof query.role === "string"
                      ? query.role
                          .split(",")
                          .map((r) => {
                            const normalizedRole = r.trim();
                            // Handle case variations for known roles
                            if (normalizedRole.toLowerCase() === "user") {
                              return roleDisplayNames[UserRole.USER] || "User";
                            }
                            if (normalizedRole.toLowerCase() === "admin") {
                              return roleDisplayNames[UserRole.ADMIN] || "Admin";
                            }
                            // Use display name if available, otherwise return normalized role
                            return roleDisplayNames[normalizedRole as UserRole] || normalizedRole;
                          })
                          .filter((role, index, array) => 
                            // Remove duplicates based on lowercase comparison
                            array.findIndex(r => r.toLowerCase() === role.toLowerCase()) === index
                          )
                          .join(", ")
                      : "User"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(query.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex space-x-3">
                  <button
                    onClick={async () => {
                      try {
                        const queryDetails = (await apiClient.get(`/api/admin/query/${query.id}`)) as any;
                        const queryData = queryDetails.data || queryDetails;
                        setEditingQueryId(query.id);
                        
                        // Parse current roles
                        const currentRoles = queryData.role
                          ? typeof queryData.role === "string"
                            ? queryData.role.split(",").map((r: string) => r.trim() as UserRole)
                            : queryData.role
                          : [];
                        
                        setQueryForm({
                          name: queryData.name,
                          description: queryData.description || "",
                          sql_query: queryData.sql_query || "",
                          chart_type: queryData.chart_type || "bar",
                          chart_config: queryData.chart_config || {},
                          menu_item_id: queryData.menu_item_id || null,
                          menu_item_ids: queryData.menu_item_ids || [],
                          role: currentRoles,
                        });
                        setShowQueryForm(true);
                      } catch (error) {
                        toast.error("Failed to load query details");
                        console.error(error);
                      }
                    }}
                    className="text-blue-600 hover:text-blue-800"
                    title="Edit"
                  >
                    <PencilSquareIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete this query?")) return;
                      try {
                        await apiClient.deleteQuery(query.id);
                        toast.success("Query deleted");
                        loadData();
                      } catch (error: any) {
                        console.error("Delete query error:", error);
                        let errorMessage = "Failed to delete query";
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
                        console.error("Query delete failed:", errorMessage);
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

      {/* Query Form Modal */}
      {showQueryForm && (
        <QueryFormModal
          visible={showQueryForm}
          editing={editingQueryId !== null}
          onClose={() => {
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
          }}
          onCreate={createOrUpdateQuery}
          queryForm={queryForm}
          setQueryForm={setQueryForm}
          menuItems={allMenuItems
            .filter((item) => !item.children || item.children.length === 0)
            .map((item) => ({ id: item.id, name: `${item.name} (${item.type})` }))}
          availableRoles={allRolesList}
        />
      )}
    </div>
  );
};

export default QueriesTab; 