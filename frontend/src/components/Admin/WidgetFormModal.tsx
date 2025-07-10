import React from "react";

interface WidgetForm {
  title: string;
  query_id: number | null;
  position_x?: number;
  position_y?: number;
  width: number;
  height: number;
}

interface QueryOption {
  id: number;
  name: string;
  chart_type: string;
}

interface WidgetFormModalProps {
  visible: boolean;
  widgetForm: WidgetForm;
  setWidgetForm: React.Dispatch<React.SetStateAction<WidgetForm>>;
  queries: QueryOption[];
  showAdvanced: boolean;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  onCreate: () => void;
  onClose: () => void;
}

const WidgetFormModal: React.FC<WidgetFormModalProps> = ({
  visible,
  widgetForm,
  setWidgetForm,
  queries,
  showAdvanced,
  setShowAdvanced,
  onCreate,
  onClose,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium mb-4">Create Dashboard Widget</h3>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Widget Title"
            value={widgetForm.title}
            onChange={(e) =>
              setWidgetForm((prev) => ({ ...prev, title: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />

          {/* Query Select */}
          <select
            value={widgetForm.query_id || ""}
            onChange={(e) =>
              setWidgetForm((prev) => ({
                ...prev,
                query_id: e.target.value ? parseInt(e.target.value) : null,
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">Select Query</option>
            {queries.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name} ({q.chart_type})
              </option>
            ))}
          </select>

          {/* Size */}
          <select
            value={`${widgetForm.width}x${widgetForm.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              setWidgetForm((prev) => ({ ...prev, width: w, height: h }));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="4x3">Small (4 × 3)</option>
            <option value="6x4">Medium (6 × 4)</option>
            <option value="12x6">Large (12 × 6)</option>
          </select>

          {/* Advanced options */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showAdvanced ? "Hide" : "Show"} advanced options
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4">
              <input
                type="number"
                placeholder="Column (0 = leftmost)"
                value={widgetForm.position_x ?? ""}
                min={0}
                onChange={(e) =>
                  setWidgetForm((prev) => ({
                    ...prev,
                    position_x:
                      e.target.value === "" ? undefined : parseInt(e.target.value),
                  }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                type="number"
                placeholder="Row (0 = top)"
                value={widgetForm.position_y ?? ""}
                min={0}
                onChange={(e) =>
                  setWidgetForm((prev) => ({
                    ...prev,
                    position_y:
                      e.target.value === "" ? undefined : parseInt(e.target.value),
                  }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Widget
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetFormModal; 