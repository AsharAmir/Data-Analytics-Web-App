import React from "react";
import { UserRole } from "../../types";

interface QueryForm {
  name: string;
  description: string;
  sql_query: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  menu_item_id: number | null;
  role: UserRole[];
}

interface MenuItemOption {
  id: number;
  name: string;
}

const roleDisplayNames: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.CEO]: "CEO",
  [UserRole.FINANCE_USER]: "Finance",
  [UserRole.TECH_USER]: "Tech",
  [UserRole.USER]: "User",
};

interface QueryFormModalProps {
  visible: boolean;
  queryForm: QueryForm;
  setQueryForm: React.Dispatch<React.SetStateAction<QueryForm>>;
  menuItems: MenuItemOption[];
  onCreate: () => void;
  onClose: () => void;
}

const QueryFormModal: React.FC<QueryFormModalProps> = ({
  visible,
  queryForm,
  setQueryForm,
  menuItems,
  onCreate,
  onClose,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium mb-4">Create New Query</h3>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Query Name"
            value={queryForm.name}
            onChange={(e) => setQueryForm((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          <textarea
            placeholder="Description (optional)"
            value={queryForm.description}
            onChange={(e) => setQueryForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            rows={2}
          />
          <textarea
            placeholder="SQL Query (SELECT statements only)"
            value={queryForm.sql_query}
            onChange={(e) => setQueryForm((prev) => ({ ...prev, sql_query: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
            rows={6}
          />
          <div className="grid grid-cols-2 gap-4">
            <select
              value={queryForm.chart_type}
              onChange={(e) => setQueryForm((prev) => ({ ...prev, chart_type: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="bar">Bar Chart</option>
              <option value="line">Line Chart</option>
              <option value="pie">Pie Chart</option>
              <option value="doughnut">Doughnut Chart</option>
              <option value="table">Table</option>
            </select>
            <select
              value={queryForm.menu_item_id || ""}
              onChange={(e) => setQueryForm((prev) => ({ ...prev, menu_item_id: e.target.value ? parseInt(e.target.value) : null }))}
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
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Roles</label>
            <div className="p-3 border border-gray-300 rounded-lg space-y-2 max-h-40 overflow-y-auto bg-gray-50">
              {Object.values(UserRole).map((role) => (
                <label key={role} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-1 rounded">
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
                  <span className="text-gray-800 text-sm">{roleDisplayNames[role]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Create Query
          </button>
        </div>
      </div>
    </div>
  );
};

export default QueryFormModal; 