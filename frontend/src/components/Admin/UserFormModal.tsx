import React, { useState, useEffect } from "react";
import { formatRoleLabel, describeRole, normalizeRoleCode } from "../../lib/roles";
import {
  XMarkIcon,
  UserIcon,
  EnvelopeIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

interface UserForm {
  username: string;
  email: string;
  password: string;
  role: string; // allow dynamic roles
  // Per-user feature visibility flags (codes: dashboard, data_explorer, excel_compare, processes)
  hidden_features: string[];
}

interface ValidationErrors {
  username?: string;
  email?: string;
  password?: string;
}

// Use shared helpers from lib/roles for labels and descriptions

interface UserFormModalProps {
  visible: boolean;
  editing: boolean;
  userForm: UserForm;
  setUserForm: React.Dispatch<React.SetStateAction<UserForm>>;
  onSubmit: () => void;
  onClose: () => void;
  availableRoles: string[]; // list of all role names
}

const UserFormModal: React.FC<UserFormModalProps> = ({
  visible,
  editing,
  userForm,
  setUserForm,
  onSubmit,
  onClose,
  availableRoles,
}) => {
  const [currentTab, setCurrentTab] = useState<
    "basic" | "security" | "permissions"
  >("basic");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Reset tab when modal opens/closes
    if (visible) {
      setCurrentTab("basic");
      setValidationErrors({});
      // Normalize role casing to match available options (uppercase)
      setUserForm((prev) => ({
        ...prev,
        role: normalizeRoleCode(prev.role || 'USER'),
        hidden_features: prev.hidden_features || [],
      }));
    }
  }, [visible, setUserForm]);

  if (!visible) return null;

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!userForm.username.trim()) {
      errors.username = "Username is required";
    } else if (userForm.username.length < 3) {
      errors.username = "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(userForm.username)) {
      errors.username =
        "Username can only contain letters, numbers, and underscores";
    }

    if (!userForm.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!editing) {
      // Only validate password for new users
      if (!userForm.password.trim()) {
        errors.password = "Password is required";
      } else if (userForm.password.length < 6) {
        errors.password = "Password must be at least 6 characters";
      }
    } else if (userForm.password && userForm.password.length < 6) {
      errors.password = "Password must be at least 6 characters if provided";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      await onSubmit();
    } catch (err) {
      // Error feedback is already shown via toast in parent, prevent crash
      console.error("User form submit failed", err);
    }
  };

  const handleClose = () => {
    setCurrentTab("basic");
    setValidationErrors({});
    setShowPassword(false);
    onClose();
  };

  const isFormValid =
    userForm.username.trim() &&
    userForm.email.trim() &&
    (editing || userForm.password.trim());

  const tabs = [
    { id: "basic", label: "Basic Info", icon: "👤" },
    { id: "security", label: "Security", icon: "🔒" },
    { id: "permissions", label: "Role & Access", icon: "🛡️" },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
              <UserIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {editing ? "Edit User" : "Create New User"}
              </h3>
              <p className="text-gray-500 text-sm">
                {editing
                  ? "Update user information and permissions"
                  : "Add a new team member to the system"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id as any)}
                className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                  currentTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Basic Info Tab */}
          {currentTab === "basic" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <UserIcon className="h-4 w-4 mr-2" />
                      Username *
                    </label>
                    <input
                      type="text"
                      placeholder="johndoe"
                      value={userForm.username}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          username: e.target.value,
                        }))
                      }
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        validationErrors.username
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                    {validationErrors.username && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                        {validationErrors.username}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Used for login. Only letters, numbers, and underscores
                      allowed.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <EnvelopeIcon className="h-4 w-4 mr-2" />
                      Email Address *
                    </label>
                    <input
                      type="email"
                      placeholder="john.doe@company.com"
                      value={userForm.email}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        validationErrors.email
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                    {validationErrors.email && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                        {validationErrors.email}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Used for notifications and account recovery.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <EyeIcon className="h-5 w-5 mr-2" />
                    User Preview
                  </h4>
                  <div className="bg-white border border-gray-300 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium text-lg">
                          {userForm.username.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {userForm.username || "Username"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {userForm.email || "email@example.com"}
                        </div>
                        <div className="text-xs text-blue-600 mt-1">{formatRoleLabel(userForm.role)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <InformationCircleIcon className="h-4 w-4 inline mr-1" />
                      This shows how the user will appear in the system
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {currentTab === "security" && (
            <div className="space-y-6">
              <div className="max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <LockClosedIcon className="h-4 w-4 mr-2" />
                    Password {editing ? "(leave empty to keep current)" : "*"}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        editing
                          ? "Enter new password to change"
                          : "Enter secure password"
                      }
                      value={userForm.password}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        validationErrors.password
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                      {validationErrors.password}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Minimum 6 characters. Use a strong password for security.
                  </p>
                </div>

                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <h5 className="text-sm font-medium text-amber-800 mb-2">
                    Security Guidelines
                  </h5>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>• Use at least 6 characters</li>
                    <li>• Include a mix of letters, numbers, and symbols</li>
                    <li>• Avoid common words or personal information</li>
                    <li>
                      •{" "}
                      {editing
                        ? "User will be required to change password on next login if updated"
                        : "User will be required to change password on first login"}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

        {/* Permissions Tab */}
        {currentTab === "permissions" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Role selection */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                  <ShieldCheckIcon className="h-5 w-5 mr-2 text-blue-600" />
                  Role & Access
                </h4>
                <p className="text-sm text-gray-600">
                  Assign the appropriate role to control what this user can
                  see and do within the platform.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User Role
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        role: normalizeRoleCode(e.target.value),
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>
                        {formatRoleLabel(r)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                  <div className="flex">
                    <InformationCircleIcon className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h5 className="text-sm font-medium text-blue-800 mb-1">
                        Role Permissions
                      </h5>
                      <div className="text-sm text-blue-700">
                        <p className="mb-2">
                          <strong>
                            Current selection: {formatRoleLabel(userForm.role)}
                          </strong>
                        </p>
                        <p>{describeRole(userForm.role)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature visibility toggles */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                  <InformationCircleIcon className="h-5 w-5 mr-2 text-blue-600" />
                  Feature Visibility
                </h4>
                <p className="text-sm text-gray-600">
                  Use these switches to hide or show key navigation items for
                  this specific user. Hidden features will not appear in their
                  left-hand menu.
                </p>

                <div className="mt-4 space-y-3">
                  {[
                    { code: "dashboard", label: "Dashboard" },
                    { code: "data_explorer", label: "Data Explorer" },
                    { code: "excel_compare", label: "Excel Compare" },
                    { code: "processes", label: "Processes" },
                  ].map((feature) => {
                    const isHidden = (userForm.hidden_features || []).some(
                      (f) => f.toLowerCase() === feature.code.toLowerCase(),
                    );
                    return (
                      <label
                        key={feature.code}
                        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:border-blue-300 transition-colors"
                      >
                        <div>
                          <span className="font-medium text-gray-900">
                            {feature.label}
                          </span>
                          <p className="text-xs text-gray-500">
                            {isHidden
                              ? "Currently hidden for this user."
                              : "Visible in the main navigation for this user."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setUserForm((prev) => {
                              const current = new Set(
                                (prev.hidden_features || []).map((f) =>
                                  f.toLowerCase(),
                                ),
                              );
                              if (current.has(feature.code)) {
                                current.delete(feature.code);
                              } else {
                                current.add(feature.code);
                              }
                              return {
                                ...prev,
                                hidden_features: Array.from(current),
                              };
                            })
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isHidden ? "bg-red-500" : "bg-green-500"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              isHidden ? "translate-x-1" : "translate-x-6"
                            }`}
                          />
                        </button>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {!isFormValid && (
                <div className="text-sm text-gray-500 flex items-center">
                  <ExclamationTriangleIcon className="h-4 w-4 mr-1 text-amber-500" />
                  Complete all required fields to{" "}
                  {editing ? "update" : "create"} user
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleClose}
                className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isFormValid}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {editing ? "Update User" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserFormModal;
