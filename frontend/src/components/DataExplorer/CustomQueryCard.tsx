import React from "react";

interface CustomQueryCardProps {
  query: { name: string; query: string };
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const CustomQueryCard: React.FC<CustomQueryCardProps> = ({ query, onSelect, onEdit, onDelete }) => {
  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 mb-1">{query.name}</h3>
          <p className="text-sm text-gray-600 font-mono truncate">
            {query.query.length > 60 ? `${query.query.substring(0, 60)}...` : query.query}
          </p>
        </div>
        <div className="flex items-center space-x-2 ml-3">
          <button
            onClick={onSelect}
            className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >
            Use
          </button>
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title="Edit Query"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete Query"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomQueryCard; 