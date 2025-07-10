import React from "react";
import {
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import WidgetFormModal from "./WidgetFormModal";

// Types replicated from admin page for local use
interface Widget {
  id: number;
  title: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  query_name: string;
  chart_type: string;
  created_at: string;
}

interface QueryOption {
  id: number;
  name: string;
  chart_type: string;
}

interface WidgetForm {
  title: string;
  query_id: number | null;
  position_x?: number;
  position_y?: number;
  width: number;
  height: number;
}

interface WidgetsSectionProps {
  widgets: Widget[];
  queries: QueryOption[];

  // Modal + form state
  showWidgetForm: boolean;
  setShowWidgetForm: (val: boolean) => void;
  widgetForm: WidgetForm;
  setWidgetForm: React.Dispatch<React.SetStateAction<WidgetForm>>;
  showAdvanced: boolean;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;

  // CRUD handlers
  createWidget: () => void;
  deleteWidget: (id: number) => void;
}

const WidgetsSection: React.FC<WidgetsSectionProps> = ({
  widgets,
  queries,
  showWidgetForm,
  setShowWidgetForm,
  widgetForm,
  setWidgetForm,
  showAdvanced,
  setShowAdvanced,
  createWidget,
  deleteWidget,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Dashboard Widgets</h2>
        <button
          onClick={() => setShowWidgetForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Widget
        </button>
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {widgets.map((widget) => (
          <div key={widget.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">{widget.title}</h3>
              <button
                onClick={() => deleteWidget(widget.id)}
                className="text-red-500 hover:text-red-700"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                <strong>Query:</strong> {widget.query_name}
              </p>
              <p>
                <strong>Chart Type:</strong> {widget.chart_type}
              </p>
              <p>
                <strong>Position:</strong> ({widget.position_x}, {widget.position_y})
              </p>
              <p>
                <strong>Size:</strong> {widget.width} × {widget.height}
              </p>
              <p>
                <strong>Created:</strong> {new Date(widget.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Widget Form Modal */}
      {showWidgetForm && (
        <WidgetFormModal
          visible={showWidgetForm}
          onClose={() => setShowWidgetForm(false)}
          onCreate={createWidget}
          widgetForm={widgetForm}
          setWidgetForm={setWidgetForm}
          queries={queries}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
        />
      )}
    </div>
  );
};

export default WidgetsSection; 