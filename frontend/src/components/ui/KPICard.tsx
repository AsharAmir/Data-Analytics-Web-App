import React from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
    period: string;
  };
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'indigo';
  loading?: boolean;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-500',
    text: 'text-blue-600',
    lightBg: 'bg-blue-50',
    iconBg: 'bg-blue-100'
  },
  green: {
    bg: 'bg-green-500',
    text: 'text-green-600',
    lightBg: 'bg-green-50',
    iconBg: 'bg-green-100'
  },
  red: {
    bg: 'bg-red-500',
    text: 'text-red-600',
    lightBg: 'bg-red-50',
    iconBg: 'bg-red-100'
  },
  yellow: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-600',
    lightBg: 'bg-yellow-50',
    iconBg: 'bg-yellow-100'
  },
  purple: {
    bg: 'bg-purple-500',
    text: 'text-purple-600',
    lightBg: 'bg-purple-50',
    iconBg: 'bg-purple-100'
  },
  indigo: {
    bg: 'bg-indigo-500',
    text: 'text-indigo-600',
    lightBg: 'bg-indigo-50',
    iconBg: 'bg-indigo-100'
  }
};

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  change,
  icon,
  color = 'blue',
  loading = false
}) => {
  const colors = colorClasses[color];

  const ArrowUpIcon = () => (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  );

  const ArrowDownIcon = () => (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-300">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
            <div className="h-8 w-8 bg-gray-200 rounded-lg"></div>
          </div>
          <div className="h-8 bg-gray-200 rounded w-32 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-20"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all duration-300 ${colors.lightBg} hover:scale-105`}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">
          {title}
        </div>
        {icon && (
          <div className={`p-2 rounded-lg ${colors.iconBg}`}>
            <div className={`h-5 w-5 ${colors.text}`}>
              {icon}
            </div>
          </div>
        )}
      </div>
      
      <div className="mb-2">
        <div className="text-2xl font-bold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      </div>

      {change && !(change.type === 'neutral' && change.value === 0) && (
        <div className="flex items-center">
          <div className={`flex items-center ${
            change.type === 'increase' 
              ? 'text-green-600' 
              : change.type === 'decrease' 
                ? 'text-red-600' 
                : 'text-gray-600'
          }`}>
            {change.type === 'increase' && <ArrowUpIcon />}
            {change.type === 'decrease' && <ArrowDownIcon />}
            {change.type === 'neutral' && (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-sm font-medium ml-1">
              {Math.abs(change.value)}%
            </span>
          </div>
          <span className="text-sm text-gray-500 ml-2">
            {change.period}
          </span>
        </div>
      )}
    </div>
  );
};

export default KPICard; 