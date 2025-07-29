import React, { Fragment, useState, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, PlayIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Process } from "../../types";

interface RunProcessModalProps {
  process: Process | null;
  isOpen: boolean;
  onClose: () => void;
  onRun: (params: Record<string, any>) => Promise<void>;
}

const RunProcessModal: React.FC<RunProcessModalProps> = ({ process, isOpen, onClose, onRun }) => {
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  // Reset state when modal opens/closes or process changes
  useEffect(() => {
    if (!isOpen || !process) {
      setParamValues({});
      setOutput("");
      setError("");
      setSuccess(false);
      return;
    }

    // Initialize with default values
    const defaultValues: Record<string, any> = {};
    process.parameters?.forEach(param => {
      if (param.default_value) {
        defaultValues[param.name] = param.default_value;
      }
    });
    setParamValues(defaultValues);
  }, [isOpen, process]);

  if (!process) return null;

  const handleRun = async () => {
    setRunning(true);
    setOutput("");
    setError("");
    setSuccess(false);
    
    try {
      // Call the onRun function and capture any result
      const result: any = await onRun(paramValues);
      
      // Try to extract meaningful output from the result
      if (result && typeof result === 'object') {
        if ('data' in result && result.data && 'output' in result.data) {
          setOutput(result.data.output || "Process completed successfully (no output)");
        } else if ('output' in result) {
          setOutput(result.output || "Process completed successfully");
        } else {
          setOutput(JSON.stringify(result, null, 2));
        }
      } else if (typeof result === 'string') {
        setOutput(result);
      } else {
        setOutput("Process completed successfully");
      }
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to run process");
      setSuccess(false);
    } finally {
      setRunning(false);
    }
  };

  const isValid = () => {
    // Check if all required parameters have values
    return process.parameters?.every(param => {
      const value = paramValues[param.name];
      return value !== undefined && value !== null && value.toString().trim() !== "";
    }) ?? true;
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                  <div className="flex items-center">
                    <PlayIcon className="h-6 w-6 text-indigo-600 mr-3" />
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      Run {process.name}
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={onClose}
                    disabled={running}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Description */}
                {process.description && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-md">
                    <p className="text-sm text-gray-600">{process.description}</p>
                  </div>
                )}

                {/* Parameters form */}
                {(process.parameters || []).length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Parameters</h3>
                    <div className="space-y-4">
                      {(process.parameters || []).map((param) => {
                        const val = paramValues[param.name] || "";
                        
                        if (param.input_type === "dropdown" && param.dropdown_values) {
                          return (
                            <div key={param.name}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {param.label}
                              </label>
                              <select
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                value={val}
                                onChange={(e) => setParamValues((p) => ({ ...p, [param.name]: e.target.value }))}
                                disabled={running}
                              >
                                <option value="">Select an option</option>
                                {param.dropdown_values.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        
                        if (param.input_type === "date") {
                          return (
                            <div key={param.name}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {param.label}
                              </label>
                              <input
                                type="date"
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                value={val}
                                onChange={(e) => setParamValues((p) => ({ ...p, [param.name]: e.target.value }))}
                                disabled={running}
                              />
                            </div>
                          );
                        }
                        
                        return (
                          <div key={param.name}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {param.label}
                            </label>
                            <input
                              type="text"
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                              value={val}
                              onChange={(e) => setParamValues((p) => ({ ...p, [param.name]: e.target.value }))}
                              disabled={running}
                              placeholder={param.default_value ? `Default: ${param.default_value}` : ""}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Results/Output */}
                {(output || error) && (
                  <div className="mt-6">
                    <div className="flex items-center mb-3">
                      {success ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                      ) : (
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
                      )}
                      <h3 className="text-sm font-medium text-gray-900">
                        {success ? "Process Output" : "Error"}
                      </h3>
                    </div>
                    
                    <div className={`rounded-md p-4 ${success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-60 font-mono">
                        {success ? output : error}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {running && (
                  <div className="mt-6 flex items-center justify-center p-4 bg-blue-50 rounded-md">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-3"></div>
                    <span className="text-sm text-indigo-700">Running process...</span>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-8 flex justify-end space-x-3 border-t border-gray-200 pt-4">
                  <button
                    onClick={onClose}
                    disabled={running}
                    className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {running ? "Running..." : "Close"}
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={running || !isValid()}
                    className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <PlayIcon className="h-4 w-4 mr-2" />
                    {running ? "Running..." : "Run Process"}
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

export default RunProcessModal; 