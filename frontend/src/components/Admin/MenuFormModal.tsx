import React from "react";

interface MenuForm {
  name: string;
  type: "dashboard" | "report";
  icon: string;
  parent_id: number | null;
  sort_order: number;
}

interface MenuItemOption {
  id: number;
  name: string;
}

interface MenuFormModalProps {
  visible: boolean;
  editing: boolean;
  menuForm: MenuForm;
  setMenuForm: React.Dispatch<React.SetStateAction<MenuForm>>;
  menuItems: MenuItemOption[];
  onSubmit: () => void;
  onClose: () => void;
}

const MenuFormModal: React.FC<MenuFormModalProps> = ({
  visible,
  editing,
  menuForm,
  setMenuForm,
  menuItems,
  onSubmit,
  onClose,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">
            {editing ? "Edit Menu" : "Add Menu"}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={menuForm.name}
              onChange={(e) => setMenuForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={menuForm.type}
              onChange={(e) => setMenuForm((prev) => ({ ...prev, type: e.target.value as "dashboard" | "report" }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="dashboard">Dashboard</option>
              <option value="report">Report</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icon (optional)</label>
            <input
              type="text"
              value={menuForm.icon}
              onChange={(e) => setMenuForm((prev) => ({ ...prev, icon: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Menu (optional)</label>
            <select
              value={menuForm.parent_id ?? ""}
              onChange={(e) => setMenuForm((prev) => ({ ...prev, parent_id: e.target.value ? parseInt(e.target.value) : null }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">None</option>
              {menuItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
            <input
              type="number"
              value={menuForm.sort_order}
              onChange={(e) => setMenuForm((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {editing ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MenuFormModal; 