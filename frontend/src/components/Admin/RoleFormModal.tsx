import React, { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface RoleFormModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (roleName: string) => Promise<void>;
}

const RoleFormModal: React.FC<RoleFormModalProps> = ({ visible, onClose, onCreate }) => {
  const [roleName, setRoleName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const handleSubmit = async () => {
    if (!roleName.trim()) {
      setError("Role name is required");
      return;
    }
    setError(null);
    try {
      setLoading(true);
      await onCreate(roleName.trim());
      setRoleName("");
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || "Failed to create role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Add New Role</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role Name
            </label>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. FINANCE_ANALYST"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleFormModal; 