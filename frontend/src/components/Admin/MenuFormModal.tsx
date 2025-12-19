import React, { useMemo, useCallback, useState } from "react";
import { formatRoleLabel } from "../../lib/roles";

interface MenuForm {
  name: string;
  type: "dashboard" | "report";
  icon: string;
  parent_id: number | null;
  sort_order: number;
  role: string[];
  // When true, this menu represents an interactive dashboard and uses the
  // HTML template below to render a custom layout.
  is_interactive_dashboard?: boolean;
  interactive_template?: string;
}

interface MenuFormModalProps {
  visible: boolean;
  editing: boolean;
  menuForm: MenuForm;
  setMenuForm: React.Dispatch<React.SetStateAction<MenuForm>>;
  onSubmit: () => void;
  onClose: () => void;
  availableRoles: string[];
}

interface FormErrors {
  name?: string;
  sort_order?: string;
}

const MenuFormModal: React.FC<MenuFormModalProps> = ({
  visible,
  editing,
  menuForm,
  setMenuForm,
  onSubmit,
  onClose,
  availableRoles,
}) => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Memoize role options to avoid recreating on every render
  const roleOptions = useMemo(
    () =>
      availableRoles.map((role) => ({
        value: role,
        label: formatRoleLabel(role),
      })),
    [availableRoles],
  );

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!menuForm.name.trim()) {
      newErrors.name = "Name is required";
    } else if (menuForm.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    if (menuForm.sort_order < 0) {
      newErrors.sort_order = "Sort order must be 0 or greater";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [menuForm]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      await onSubmit();
    } catch (err) {
      console.error("Menu form submit failed", err);
    } finally {
      setLoading(false);
    }
  }, [validateForm, onSubmit]);

  // Handle role toggle
  const handleRoleToggle = useCallback(
    (role: string, checked: boolean) => {
      setMenuForm((prev) => ({
        ...prev,
        role: checked
          ? [...prev.role, role]
          : prev.role.filter((r) => r !== role),
      }));
    },
    [setMenuForm],
  );

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof MenuForm, value: any) => {
      setMenuForm((prev) => ({ ...prev, [field]: value }));
      // Clear error when user starts typing
      if (errors[field as keyof FormErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [setMenuForm, errors],
  );

  // Don't render if not visible (true optimization - no DOM elements)
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 rounded-t-xl flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {editing
                ? "Edit Menu"
                : menuForm.parent_id
                  ? "Add Submenu"
                  : "Add Menu"}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {editing
                ? "Update menu item settings"
                : menuForm.parent_id
                  ? "Create a new submenu item"
                  : "Create a new menu item"}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h4 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
              Basic Information
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={menuForm.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.name ? "border-red-300 bg-red-50" : "border-gray-300"
                  }`}
                  placeholder="Enter menu name"
                  disabled={loading}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <select
                  value={menuForm.type}
                  onChange={(e) =>
                    handleInputChange(
                      "type",
                      e.target.value as "dashboard" | "report",
                    )
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={loading}
                >
                  <option value="dashboard">Dashboard</option>
                  <option value="report">Report</option>
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort Order
                </label>
                <input
                  type="number"
                  min="0"
                  value={menuForm.sort_order}
                  onChange={(e) =>
                    handleInputChange(
                      "sort_order",
                      parseInt(e.target.value) || 0,
                    )
                  }
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.sort_order
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  placeholder="0"
                  disabled={loading}
                />
                {errors.sort_order && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {errors.sort_order}
                  </p>
                )}
              </div>
            </div>

            {/* Icon */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icon <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={menuForm.icon}
                onChange={(e) => handleInputChange("icon", e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter icon name or emoji"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">
                You can use emoji or icon names (e.g., &ldquo;📊&rdquo;,
                &ldquo;dashboard&rdquo;, &ldquo;chart&rdquo;)
              </p>
            </div>

            {/* Interactive dashboard toggle (only for top-level dashboards) */}
            {menuForm.type === "dashboard" && !menuForm.parent_id && (
              <div className="space-y-2">
                <label className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
                    checked={!!menuForm.is_interactive_dashboard}
                    onChange={(e) =>
                      handleInputChange("is_interactive_dashboard", e.target.checked)
                    }
                    disabled={loading}
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">Interactive dashboard</span>
                    <span className="block text-xs text-gray-500">
                      When enabled, this menu will render a custom interactive
                      dashboard layout defined by the template below. Use query
                      IDs and data attributes (e.g.{" "}
                      <code>data-query-id</code>, <code>data-column</code>,
                      <code>data-operator</code>) to bind filters and widgets.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {/* Interactive layout template */}
            {menuForm.type === "dashboard" && menuForm.is_interactive_dashboard && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Interactive Layout Template (HTML)
                </label>
                <textarea
                  value={menuForm.interactive_template || ""}
                  onChange={(e) =>
                    handleInputChange("interactive_template", e.target.value)
                  }
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={`<div class="grid grid-cols-2 gap-4">
  <div data-query-id="101" data-widget-type="chart" data-chart-type="bar"></div>
  <div data-query-id="102" data-widget-type="chart" data-chart-type="line"></div>
  <div>
    <label>Status</label>
    <select data-filter data-query-id="101" data-column="STATUS" data-operator="eq">
      <option value="">All</option>
      <option value="OPEN">Open</option>
      <option value="CLOSED">Closed</option>
    </select>
  </div>
</div>`}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">
                  Use{" "}
                  <code className="bg-gray-100 px-1 rounded">
                    data-query-id
                  </code>{" "}
                  on container elements to bind them to existing queries
                  (created in the Queries tab). Use{" "}
                  <code className="bg-gray-100 px-1 rounded">data-filter</code>,{" "}
                  <code className="bg-gray-100 px-1 rounded">data-column</code>,{" "}
                  and{" "}
                  <code className="bg-gray-100 px-1 rounded">data-operator</code>{" "}
                  on inputs to create interactive controls that drive those
                  queries.
                </p>
              </div>
            )}
          </div>

          {/* Role Access */}
          <div className="space-y-4">
            <h4 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
              Access Control
            </h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Role Access{" "}
                <span className="text-gray-400">
                  (leave empty for all roles)
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {roleOptions.map((roleOption) => (
                  <label
                    key={roleOption.value}
                    className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={menuForm.role.includes(roleOption.value)}
                      onChange={(e) =>
                        handleRoleToggle(roleOption.value, e.target.checked)
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      disabled={loading}
                    />
                    <span className="ml-3 text-sm font-medium text-gray-700">
                      {roleOption.label}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 flex items-start">
                  <svg
                    className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  If no roles are selected, this menu will be visible to all
                  users. Select specific roles to restrict access.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-xl flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !menuForm.name.trim()}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {editing ? "Updating..." : "Creating..."}
              </>
            ) : editing ? (
              "Update Menu"
            ) : (
              "Create Menu"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MenuFormModal;
