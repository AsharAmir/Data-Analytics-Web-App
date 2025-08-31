import React from "react";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import ProcessFormModal from "./ProcessFormModal";
import apiClient from "../../lib/api";
import { Process } from "../../types";

interface ProcessFormState {
  name: string;
  description?: string;
  script_path: string;
  parameters: any[];
  role: string[];
}

interface ProcessesTabProps {
  processes: Process[];
  processForm: ProcessFormState;
  setProcessForm: React.Dispatch<React.SetStateAction<ProcessFormState>>;
  showProcessForm: boolean;
  setShowProcessForm: React.Dispatch<React.SetStateAction<boolean>>;
  editingProcessId: number | null;
  setEditingProcessId: React.Dispatch<React.SetStateAction<number | null>>;
  loadData: () => void;
  availableRoles: string[];
}

const ProcessesTab: React.FC<ProcessesTabProps> = ({
  processes,
  processForm,
  setProcessForm,
  showProcessForm,
  setShowProcessForm,
  editingProcessId,
  setEditingProcessId,
  loadData,
  availableRoles,
}) => {
  const createOrUpdateProcess = async () => {
    try {
      const payload = {
        ...processForm,
        role: (processForm.role || []).map((r) => r.toUpperCase()),
      } as any;
      if (editingProcessId) {
        await apiClient.updateProcess(editingProcessId, payload);
        toast.success("Process updated!");
      } else {
        await apiClient.createProcess(payload);
        toast.success("Process created!");
      }
      setShowProcessForm(false);
      setEditingProcessId(null);
      setProcessForm({ name: "", description: "", script_path: "", parameters: [], role: [] });
      loadData();
    } catch (err) {
      toast.error("Failed to save process");
      console.error(err);
    }
  };

  const deleteProcess = async (id: number) => {
    if (!confirm("Delete this process?")) return;
    try {
      await apiClient.deleteProcess(id);
      toast.success("Process deleted");
      loadData();
    } catch (error) {
      console.error("Error deleting process:", error);
      toast.error("Failed to delete process");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Processes</h2>
        <button
          onClick={() => setShowProcessForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" /> Create Process
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Script</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {processes.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4 whitespace-nowrap">{p.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.script_path}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button
                    onClick={() => {
                      setEditingProcessId(p.id);
                      setProcessForm({
                        name: p.name,
                        description: p.description,
                        script_path: p.script_path,
                        parameters: p.parameters || [],
                        role: typeof p.role === "string" ? (p.role as any).split(",") : (p.role as any) || [],
                      });
                      setShowProcessForm(true);
                    }}
                  >
                    <PencilSquareIcon className="h-5 w-5 text-indigo-600" />
                  </button>
                  <button onClick={() => deleteProcess(p.id)}>
                    <TrashIcon className="h-5 w-5 text-red-600" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProcessFormModal
        isOpen={showProcessForm}
        onClose={() => setShowProcessForm(false)}
        processForm={processForm as any}
        setProcessForm={setProcessForm as any}
        onSubmit={createOrUpdateProcess}
        availableRoles={availableRoles}
      />
    </div>
  );
};

export default ProcessesTab; 
