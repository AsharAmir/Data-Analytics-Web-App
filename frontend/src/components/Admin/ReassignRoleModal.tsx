import React, { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface UserBrief {
  id: number;
  username: string;
}

interface ReassignRoleModalProps {
  visible: boolean;
  roleName: string;
  users: UserBrief[];
  existingRoles: string[]; // names of other roles
  onConfirm: (newRole: string) => Promise<void>;
  onCancel: () => void;
}

const ReassignRoleModal: React.FC<ReassignRoleModalProps> = ({
  visible,
  roleName,
  users,
  existingRoles,
  onConfirm,
  onCancel,
}) => {
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const handleSubmit = async () => {
    if (!selectedRole) {
      setError("Please select a replacement role");
      return;
    }
    try {
      setLoading(true);
      await onConfirm(selectedRole);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Reassign Users</h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-gray-700">
            The role <strong>{roleName}</strong> is still assigned to the following users. Choose a new role to assign before deletion.
          </p>
          <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
            {users.map((u) => (
              <li key={u.id}>{u.username}</li>
            ))}
          </ul>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select role --</option>
              {existingRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
          <button
            onClick={onCancel}
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
            {loading ? "Saving..." : "Reassign & Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReassignRoleModal; 