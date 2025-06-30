import React from 'react';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/solid';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down';
    label: string;
  };
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'indigo';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  color = 'blue',
  size = 'medium',
  loading = false
}) => {
  const sizeClasses = {
    small: 'p-4',
    medium: 'p-6',
    large: 'p-8'
  };

  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    purple: 'border-purple-200 bg-purple-50',
    indigo: 'border-indigo-200 bg-indigo-50'
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${sizeClasses[size]} hover:shadow-lg transition-shadow duration-300`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-3 w-20"></div>
          <div className="h-8 bg-gray-200 rounded mb-2 w-24"></div>
          {subtitle && <div className="h-3 bg-gray-200 rounded w-16"></div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border ${colorClasses[color]} ${sizeClasses[size]} hover:shadow-lg transition-all duration-300 hover:scale-105`}>
      <div className="text-sm font-medium text-gray-600 mb-2">
        {title}
      </div>
      
      <div className="text-3xl font-bold text-gray-900 mb-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {subtitle && (
        <div className="text-sm text-gray-500 mb-2">
          {subtitle}
        </div>
      )}

      {trend && (
        <div className="flex items-center space-x-1">
          {trend.direction === 'up' ? (
            <ArrowTrendingUpIcon className="h-4 w-4 text-green-600" />
          ) : (
            <ArrowTrendingDownIcon className="h-4 w-4 text-red-600" />
          )}
          <span className={`text-sm font-medium ${
            trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend.value}%
          </span>
          <span className="text-sm text-gray-500">{trend.label}</span>
        </div>
      )}
    </div>
  );
};

export default MetricCard; 