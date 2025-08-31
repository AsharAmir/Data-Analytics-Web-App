import React, { useState, Fragment, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, PlusIcon, TrashIcon, FolderOpenIcon } from "@heroicons/react/24/outline";
import { ParameterInputType, ProcessCreate, ProcessParameter, ScriptFile } from "../../types";
import apiClient from "../../lib/api";
import { formatRoleLabel } from "../../lib/roles";

interface ProcessFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  processForm: ProcessCreate;
  setProcessForm: React.Dispatch<React.SetStateAction<ProcessCreate>>;
  onSubmit: () => Promise<void>;
  availableRoles: string[];
}

const ProcessFormModal: React.FC<ProcessFormModalProps> = ({
  isOpen,
  onClose,
  processForm,
  setProcessForm,
  onSubmit,
  availableRoles,
}) => {
  const [newParam, setNewParam] = useState<ProcessParameter>({
    name: "",
    label: "",
    input_type: "text",
    default_value: "",
    dropdown_values: [],
  });
  const [dropdownInput, setDropdownInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availableScripts, setAvailableScripts] = useState<ScriptFile[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);

  // Load available scripts when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAvailableScripts();
    }
  }, [isOpen]);

  const loadAvailableScripts = async () => {
    setLoadingScripts(true);
    try {
      const scripts = await apiClient.listAvailableScripts();
      setAvailableScripts(scripts || []);
    } catch (error) {
      console.error("Failed to load scripts:", error);
      setAvailableScripts([]);
    } finally {
      setLoadingScripts(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!processForm.name?.trim()) {
      newErrors.name = "Name is required";
    }
    
    if (!processForm.script_path?.trim()) {
      newErrors.script_path = "Script path is required";
    }
    
    if (!processForm.role || (Array.isArray(processForm.role) && processForm.role.length === 0)) {
      newErrors.role = "At least one role must be selected";
    }

    // Validate parameters
    processForm.parameters?.forEach((param, index) => {
      if (!param.name?.trim()) {
        newErrors[`param_${index}_name`] = "Parameter name is required";
      }
      if (!param.label?.trim()) {
        newErrors[`param_${index}_label`] = "Parameter label is required";
      }
      if (param.input_type === "dropdown" && (!param.dropdown_values || param.dropdown_values.length === 0)) {
        newErrors[`param_${index}_dropdown`] = "Dropdown options are required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addParameter = () => {
    if (!newParam.name.trim() || !newParam.label.trim()) {
      setErrors({ newParam: "Name and label are required" });
      return;
    }

    if (newParam.input_type === "dropdown" && (!newParam.dropdown_values || newParam.dropdown_values.length === 0)) {
      setErrors({ newParam: "Add at least one dropdown option" });
      return;
    }

    setProcessForm((prev) => ({
      ...prev,
      parameters: [...(prev.parameters || []), { ...newParam }],
    }));
    
    setNewParam({ 
      name: "", 
      label: "", 
      input_type: "text", 
      default_value: "",
      dropdown_values: [] 
    });
    setDropdownInput("");
    setErrors({});
  };

  const removeParam = (idx: number) => {
    setProcessForm((prev) => ({
      ...prev,
      parameters: (prev.parameters || []).filter((_, i) => i !== idx),
    }));
  };

  const addDropdownOption = () => {
    if (!dropdownInput.trim()) return;
    
    setNewParam(prev => ({
      ...prev,
      dropdown_values: [...(prev.dropdown_values || []), dropdownInput.trim()]
    }));
    setDropdownInput("");
  };

  const removeDropdownOption = (optionIndex: number) => {
    setNewParam(prev => ({
      ...prev,
      dropdown_values: (prev.dropdown_values || []).filter((_, i) => i !== optionIndex)
    }));
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-4 sm:w-full sm:max-w-3xl sm:p-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 pb-3 sticky top-0 bg-white z-10">
                  <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900">
                    {processForm.name ? "Edit Process" : "Create New Process"}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Form Content */}
                <div className="mt-4 space-y-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Process Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="block w-full rounded-lg border-gray-300 shadow-sm py-3 px-4 text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors"
                        placeholder="Enter process name"
                        value={processForm.name}
                        onChange={(e) => setProcessForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                      {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Python Script <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          className="block w-full rounded-lg border-gray-300 shadow-sm py-3 px-4 pr-10 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors appearance-none"
                          value={processForm.script_path}
                          onChange={(e) => setProcessForm(prev => ({ ...prev, script_path: e.target.value }))}
                          disabled={loadingScripts}
                        >
                          <option value="">
                            {loadingScripts ? "Loading scripts..." : "Select a Python script"}
                          </option>
                          {Array.isArray(availableScripts) && availableScripts.map((script) => (
                            <option key={script.path} value={script.path}>
                              {script.display}
                            </option>
                          ))}
                        </select>
                        <FolderOpenIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                      </div>
                      {availableScripts.length === 0 && !loadingScripts && (
                        <p className="mt-1 text-sm text-gray-500">
                          No Python scripts found in backend/scripts/ directory. 
                          <br />
                          Add .py files to backend/scripts/ and refresh.
                        </p>
                      )}
                      {errors.script_path && <p className="mt-1 text-sm text-red-600">{errors.script_path}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Description</label>
                    <textarea
                      rows={2}
                      className="block w-full rounded-lg border-gray-300 shadow-sm py-3 px-4 text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors resize-none"
                      placeholder="Describe what this process does..."
                      value={processForm.description}
                      onChange={(e) => setProcessForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  {/* Role Access Control */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Access Control</label>
                    <p className="text-sm text-gray-600 mb-3">Select which roles can run this process</p>
                    <div className="space-y-2">
                      {availableRoles.map((role) => (
                        <label key={role} className="flex items-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            checked={Array.isArray(processForm.role) ? processForm.role.includes(role) : processForm.role === role}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const currentRoles = Array.isArray(processForm.role) ? processForm.role : (processForm.role ? [processForm.role] : []);
                                setProcessForm(prev => ({ 
                                  ...prev, 
                                  role: [...currentRoles, role] 
                                }));
                              } else {
                                const currentRoles = Array.isArray(processForm.role) ? processForm.role : (processForm.role ? [processForm.role] : []);
                                setProcessForm(prev => ({ 
                                  ...prev, 
                                  role: currentRoles.filter(r => r !== role) 
                                }));
                              }
                            }}
                          />
                          <span className="ml-2 text-sm text-gray-900">{formatRoleLabel(role)}</span>
                        </label>
                      ))}
                    </div>
                    {(!processForm.role || (Array.isArray(processForm.role) && processForm.role.length === 0)) && (
                      <p className="mt-2 text-sm text-amber-600">⚠️ No roles selected - only admins will be able to run this process</p>
                    )}
                    {errors.role && <p className="mt-2 text-sm text-red-600">{errors.role}</p>}
                  </div>

                  {/* Parameters Section */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">Parameters</h3>
                      <p className="text-sm text-gray-600">Define input parameters for your process</p>
                    </div>

                    {/* Existing Parameters */}
                    {(processForm.parameters || []).length > 0 && (
                      <div className="space-y-2 mb-4">
                        {(processForm.parameters || []).map((param, idx) => (
                          <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200 shadow-sm">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <div className="flex-1">
                                  <span className="font-medium text-gray-900">{param.name}</span>
                                  <span className="mx-2 text-gray-400 font-light">→</span>
                                  <span className="text-gray-700">{param.label}</span>
                                </div>
                                <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800 border border-indigo-200">
                                  {param.input_type}
                                </span>
                              </div>
                              {param.input_type === "dropdown" && param.dropdown_values && (
                                <div className="mt-2 text-sm text-gray-600">
                                  <span className="font-medium">Options:</span> {param.dropdown_values.join(", ")}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeParam(idx)}
                              className="ml-4 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add New Parameter */}
                    <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-5">
                      <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
                        <PlusIcon className="h-5 w-5 mr-2 text-indigo-600" />
                        Add New Parameter
                      </h4>
                      
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border-gray-300 shadow-sm py-2.5 px-3 text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors"
                            placeholder="param_name"
                            value={newParam.name}
                            onChange={(e) => setNewParam(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Label</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border-gray-300 shadow-sm py-2.5 px-3 text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors"
                            placeholder="Display Name"
                            value={newParam.label}
                            onChange={(e) => setNewParam(prev => ({ ...prev, label: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                          <select
                            className="w-full rounded-lg border-gray-300 shadow-sm py-2.5 px-3 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors"
                            value={newParam.input_type}
                            onChange={(e) => setNewParam(prev => ({ 
                              ...prev, 
                              input_type: e.target.value as ParameterInputType,
                              dropdown_values: e.target.value === "dropdown" ? [] : undefined 
                            }))}
                          >
                            <option value="text">📝 Text</option>
                            <option value="dropdown">📋 Dropdown</option>
                            <option value="date">📅 Date</option>
                          </select>
                        </div>
                      </div>

                      {/* Default Value */}
                      <div className="mt-3">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Default Value</label>
                        <input
                          type="text"
                          className="w-full rounded-lg border-gray-300 shadow-sm py-2.5 px-3 text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors"
                          placeholder="Optional default value"
                          value={newParam.default_value || ""}
                          onChange={(e) => setNewParam(prev => ({ ...prev, default_value: e.target.value }))}
                        />
                      </div>

                      {/* Dropdown Options */}
                      {newParam.input_type === "dropdown" && (
                        <div className="mt-3">
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Dropdown Options</label>
                          
                          {(newParam.dropdown_values || []).length > 0 && (
                            <div className="mb-2 space-y-1">
                              {(newParam.dropdown_values || []).map((option, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-gray-100 px-3 py-2 rounded-lg text-sm border">
                                  <span className="text-gray-900 font-medium">{option}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeDropdownOption(idx)}
                                    className="text-red-500 hover:text-red-700 ml-2 p-1 rounded-full hover:bg-red-50 transition-colors"
                                  >
                                    <XMarkIcon className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              className="flex-1 rounded-lg border-gray-300 shadow-sm py-2.5 px-3 text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-colors"
                              placeholder="Enter option value"
                              value={dropdownInput}
                              onChange={(e) => setDropdownInput(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addDropdownOption()}
                            />
                            <button
                              type="button"
                              onClick={addDropdownOption}
                              className="px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 border border-indigo-200 font-medium transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      {errors.newParam && <p className="mt-2 text-sm text-red-600">{errors.newParam}</p>}

                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={addParameter}
                          className="inline-flex items-center px-4 py-2.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
                        >
                          <PlusIcon className="h-4 w-4 mr-2" />
                          Add Parameter
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-200 pt-3 sticky bottom-0 bg-white">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? "Saving..." : "Save Process"}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

export default ProcessFormModal; 
