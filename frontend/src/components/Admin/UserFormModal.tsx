import React from "react";
import { UserRole } from "../../types";

interface UserForm {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

const roleDisplayNames: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.CEO]: "CEO",
  [UserRole.FINANCE_USER]: "Finance",
  [UserRole.TECH_USER]: "Tech",
  [UserRole.USER]: "User",
};

interface UserFormModalProps {
  visible: boolean;
  editing: boolean;
  userForm: UserForm;
  setUserForm: React.Dispatch<React.SetStateAction<UserForm>>;
  onSubmit: () => void;
  onClose: () => void;
}

const UserFormModal: React.FC<UserFormModalProps> = ({
  visible,
  editing,
  userForm,
  setUserForm,
  onSubmit,
  onClose,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium mb-4">
          {editing ? "Edit User" : "Create New User"}
        </h3>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={userForm.username}
            onChange={(e) => setUserForm((prev) => ({ ...prev, username: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="email"
            placeholder="Email"
            value={userForm.email}
            onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="password"
            placeholder="Password"
            value={userForm.password}
            onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          <select
            value={userForm.role}
            onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            {Object.values(UserRole).map((role) => (
              <option key={role} value={role}>
                {roleDisplayNames[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            {editing ? "Update User" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserFormModal; 