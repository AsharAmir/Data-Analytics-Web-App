import React from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import apiClient from "../../lib/api";
import RoleFormModal from "./RoleFormModal";
import ReassignRoleModal from "./ReassignRoleModal";

interface RoleItem {
  name: string;
  is_system: boolean;
}

interface UserInfo {
  id: number;
  username: string;
}

interface RolesTabProps {
  roles: RoleItem[];
  otherRoleNames: string[];
  showRoleForm: boolean;
  setShowRoleForm: React.Dispatch<React.SetStateAction<boolean>>;
  showReassignModal: boolean;
  setShowReassignModal: React.Dispatch<React.SetStateAction<boolean>>;
  roleToDelete: string;
  setRoleToDelete: React.Dispatch<React.SetStateAction<string>>;
  usersToReassign: UserInfo[];
  setUsersToReassign: React.Dispatch<React.SetStateAction<UserInfo[]>>;
  loadData: () => void;
}

const RolesTab: React.FC<RolesTabProps> = ({
  roles,
  otherRoleNames,
  showRoleForm,
  setShowRoleForm,
  showReassignModal,
  setShowReassignModal,
  roleToDelete,
  setRoleToDelete,
  usersToReassign,
  setUsersToReassign,
  loadData,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Roles</h2>
        <button
          onClick={() => setShowRoleForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Role
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                System
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {roles.map((r) => (
              <tr key={r.name}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {r.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {r.is_system ? "Yes" : "No"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                  {!r.is_system && (
                    <button
                      onClick={async () => {
                        try {
                          const resp: any = await apiClient.deleteRole(r.name);
                          if (resp.success === false && resp.error === "ROLE_IN_USE") {
                            setRoleToDelete(r.name);
                            setUsersToReassign(resp.data || []);
                            setShowReassignModal(true);
                          } else {
                            toast.success(`Role ${r.name} deleted`);
                            loadData();
                          }
                        } catch (e: any) {
                          toast.error(e?.response?.data?.detail || "Failed");
                        }
                      }}
                      className="text-red-600 hover:text-red-800"
                      title="Delete"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showRoleForm && (
        <RoleFormModal
          visible={showRoleForm}
          onClose={() => setShowRoleForm(false)}
          onCreate={async (roleName) => {
            await apiClient.createRole(roleName);
            toast.success("Role created");
            setShowRoleForm(false);
            loadData();
          }}
        />
      )}

      {showReassignModal && (
        <ReassignRoleModal
          visible={showReassignModal}
          roleName={roleToDelete}
          users={usersToReassign}
          existingRoles={otherRoleNames}
          onConfirm={async (newRole) => {
            await apiClient.deleteRole(roleToDelete, newRole);
            toast.success("Role deleted");
            setShowReassignModal(false);
            loadData();
          }}
          onCancel={() => setShowReassignModal(false)}
        />
      )}
    </div>
  );
};

export default RolesTab; 