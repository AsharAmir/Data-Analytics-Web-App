import React from "react";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import KPIFormModal from "./KPIFormModal";
import apiClient from "../../lib/api";
import { MenuItem, UserRole } from "../../types";

export interface KPIItem {
  id: number;
  name: string;
  description: string;
  sql_query: string;
  menu_name?: string;
  created_at: string;
  role?: string;
}

interface KpiFormState {
  name: string;
  description: string;
  sql_query: string;
  menu_item_id: number | null;
  role: UserRole[];
}

interface KpisTabProps {
  kpis: KPIItem[];
  kpiForm: KpiFormState;
  setKpiForm: React.Dispatch<React.SetStateAction<KpiFormState>>;
  showKpiForm: boolean;
  setShowKpiForm: React.Dispatch<React.SetStateAction<boolean>>;
  editingKpiId: number | null;
  setEditingKpiId: React.Dispatch<React.SetStateAction<number | null>>;
  allMenuItems: MenuItem[];
  allRolesList: string[];
  roleDisplayNames: Record<UserRole, string>;
  createOrUpdateKpi: () => Promise<void>;
  deleteKpi: (id: number) => void;
  loadData: () => void;
}

const KpisTab: React.FC<KpisTabProps> = ({
  kpis,
  kpiForm,
  setKpiForm,
  showKpiForm,
  setShowKpiForm,
  editingKpiId,
  setEditingKpiId,
  allMenuItems,
  allRolesList,
  roleDisplayNames,
  createOrUpdateKpi,
  deleteKpi,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <span className="text-2xl mr-2">📊</span>
          Dashboard Stats/KPIs
        </h2>
        <button
          onClick={() => setShowKpiForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create KPI
        </button>
      </div>

      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>About KPIs:</strong> Key Performance Indicators are single numeric values displayed as statistics on your dashboards. Create SQL queries that return one number (like COUNT, SUM, AVG) and assign them to specific dashboards.
        </p>
      </div>

      {/* KPIs List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SQL Query</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dashboard</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {kpis.map((kpi) => (
              <tr key={kpi.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{kpi.name}</div>
                    <div className="text-sm text-gray-500">{kpi.description}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded max-w-xs overflow-hidden">
                    {kpi.sql_query.length > 50 ? `${kpi.sql_query.substring(0, 50)}...` : kpi.sql_query}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {kpi.menu_name || "Default Dashboard"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                    {kpi.role && typeof kpi.role === "string"
                      ? kpi.role
                          .split(",")
                          .map((r) => roleDisplayNames[r.trim() as UserRole] || r.trim())
                          .join(", ")
                      : "user"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(kpi.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex space-x-3">
                  <button
                    onClick={async () => {
                      try {
                        const kpiDetails = (await apiClient.get(`/api/admin/kpi/${kpi.id}`)) as any;
                        const kpiData = kpiDetails.data || kpiDetails;
                        setEditingKpiId(kpi.id);
                        setKpiForm({
                          name: kpiData.name,
                          description: kpiData.description || "",
                          sql_query: kpiData.sql_query || "",
                          menu_item_id: kpiData.menu_item_id || null,
                          role: kpiData.role
                            ? typeof kpiData.role === "string"
                              ? kpiData.role.split(",").map((r: string) => r.trim() as UserRole)
                              : kpiData.role
                            : [],
                        });
                        setShowKpiForm(true);
                      } catch (error) {
                        toast.error("Failed to load KPI details");
                        console.error(error);
                      }
                    }}
                    className="text-blue-600 hover:text-blue-800"
                    title="Edit"
                  >
                    <PencilSquareIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => deleteKpi(kpi.id)}
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

      {showKpiForm && (
        <KPIFormModal
          visible={showKpiForm}
          editing={editingKpiId !== null}
          onClose={() => {
            setShowKpiForm(false);
            setEditingKpiId(null);
            setKpiForm({ name: "", description: "", sql_query: "", menu_item_id: null, role: [] });
          }}
          onCreate={createOrUpdateKpi}
          kpiForm={kpiForm}
          setKpiForm={setKpiForm}
          menuItems={allMenuItems
            .filter((item) => !item.children || item.children.length === 0)
            .map((item) => ({ id: item.id, name: `${item.name} (${item.type})` }))}
          availableRoles={allRolesList}
        />
      )}
    </div>
  );
};

export default KpisTab; 