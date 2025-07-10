import React, { useState, useEffect } from "react";

interface CustomQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, query: string) => void;
  editQuery?: { name: string; query: string } | null;
}

const CustomQueryModal: React.FC<CustomQueryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editQuery,
}) => {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (editQuery) {
      setName(editQuery.name);
      setQuery(editQuery.query);
    } else {
      setName("");
      setQuery("");
    }
  }, [editQuery, isOpen]);

  const handleSave = () => {
    if (name.trim() && query.trim()) {
      onSave(name.trim(), query.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {editQuery ? "Edit Custom Query" : "Add Custom Query"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
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
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Query Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a descriptive name for your query..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SQL Query
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={8}
              placeholder="SELECT * FROM SAMPLE_BT WHERE..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-800 mb-2">
              Query Tips:
            </h4>
            <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
              <li>
                Use uppercase for table names and columns (SAMPLE_BT, DAY_OF,
                CT_MAIN)
              </li>
              <li>Only SELECT statements are allowed for security</li>
              <li>Use ROWNUM to limit results for better performance</li>
              <li>GROUP BY clauses can help create meaningful aggregations</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !query.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {editQuery ? "Update Query" : "Save Query"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomQueryModal;
