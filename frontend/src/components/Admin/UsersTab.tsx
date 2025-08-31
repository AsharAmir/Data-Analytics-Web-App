import React from "react";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import apiClient from "../../lib/api";
import UserFormModal from "./UserFormModal";
import { UserRole } from "../../types";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  role: string; // dynamic roles may be any case
}

interface UserFormState {
  username: string;
  email: string;
  password: string;
  role: string;
}

interface UsersTabProps {
  users: AdminUser[];
  userForm: UserFormState;
  setUserForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  showUserForm: boolean;
  setShowUserForm: React.Dispatch<React.SetStateAction<boolean>>;
  editingUserId: number | null;
  setEditingUserId: React.Dispatch<React.SetStateAction<number | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  allRolesList: string[];
  roleDisplayNames: Record<UserRole, string>;
  loadData: () => void;
}

const UsersTab: React.FC<UsersTabProps> = ({
  users,
  userForm,
  setUserForm,
  showUserForm,
  setShowUserForm,
  editingUserId,
  setEditingUserId,
  setLoading,
  allRolesList,
  roleDisplayNames,
  loadData,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Available Users</h2>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Active
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {user.username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.is_active ? "Yes" : "No"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {roleDisplayNames[user.role as UserRole] || user.role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex space-x-3">
                  <button
                    onClick={() => {
                      setEditingUserId(user.id);
                      // Prefer a role option matching availableRoles (case-insensitive)
                      const matchedRole = allRolesList.find(
                        (r) => r.toLowerCase() === (user.role || "").toLowerCase(),
                      ) || user.role;
                      setUserForm({
                        username: user.username,
                        email: user.email,
                        password: "",
                        role: matchedRole,
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
                      } catch (error: any) {
                        const errorMessage =
                          error?.response?.data?.detail || "Failed to delete user";
                        toast.error(errorMessage);
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
                const payload = { ...userForm, role: (userForm.role || '').toUpperCase() } as any;
                await apiClient.updateUser(editingUserId, payload);
                toast.success("User updated successfully");
              } else {
                const payload = { ...userForm, role: (userForm.role || '').toUpperCase() } as any;
                await apiClient.post("/api/admin/user", payload);
                toast.success("User created successfully");
              }
              setShowUserForm(false);
              setEditingUserId(null);
              setUserForm({ username: "", email: "", password: "", role: "user" });
              loadData();
            } catch (error: any) {
              const errMsg = error?.response?.data?.detail || "Operation failed";
              toast.error(errMsg);
            } finally {
              setLoading(false);
            }
          }}
          onClose={() => {
            setShowUserForm(false);
            setEditingUserId(null);
            setUserForm({ username: "", email: "", password: "", role: "user" });
          }}
          availableRoles={allRolesList}
        />
      )}
    </div>
  );
};

export default UsersTab; 
