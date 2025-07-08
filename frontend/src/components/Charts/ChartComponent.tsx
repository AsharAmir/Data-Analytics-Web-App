import React, { useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  Filler,
} from 'chart.js';
import {
  Bar,
  Line,
  Pie,
  Doughnut,
  Scatter,
  Bubble,
  PolarArea,
  Radar,
} from 'react-chartjs-2';
import { ChartData, ChartConfig } from '../../types';
import { 
  ArrowsPointingOutIcon, 
  ArrowDownTrayIcon,
  EyeIcon,
  Cog6ToothIcon,
  XMarkIcon 
} from '@heroicons/react/24/outline';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  Filler
);

interface ChartComponentProps {
  data: ChartData;
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'bubble' | 'polarArea' | 'radar' | 'area';
  config?: ChartConfig;
  height?: number;
  className?: string;
  title?: string;
  description?: string;
  loading?: boolean;
  onDataPointClick?: (datasetIndex: number, index: number, value: any) => void;
  onExport?: (format: 'png' | 'pdf') => void;
}

const ChartComponent: React.FC<ChartComponentProps> = ({
  data,
  type,
  config = {},
  height = 400,
  className = '',
  title,
  description,
  loading = false,
  onDataPointClick,
  onExport,
}) => {
  const chartRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Prevent body scroll when fullscreen overlay is open
  useEffect(() => {
    if (isFullscreen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isFullscreen]);

  // Enhanced default options (memoized)
  const defaultOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: function(context: any) {
            return context[0]?.label || '';
          },
          label: function(context: any) {
            const label = context.dataset.label || '';
            const value = typeof context.parsed.y !== 'undefined' ? context.parsed.y : context.parsed;
            if (typeof value === 'number') {
              const formattedValue = value >= 1000000 
                ? `$${(value / 1000000).toFixed(2)}M`
                : value >= 1000
                ? `$${(value / 1000).toFixed(0)}K`
                : `$${value.toLocaleString()}`;
              return `${label}: ${formattedValue}`;
            }
            return `${label}: ${value}`;
          },
        },
      },
    },
    scales: type !== 'pie' && type !== 'doughnut' && type !== 'polarArea' ? {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          font: {
            size: 11,
          },
          callback: function(value: any) {
            if (typeof value === 'number') {
              if (value >= 1000000) {
                return '$' + (value / 1000000).toFixed(1) + 'M';
              } else if (value >= 1000) {
                return '$' + (value / 1000).toFixed(0) + 'K';
              } else {
                return '$' + value.toLocaleString();
              }
            }
            return value;
          },
        },
      },
      x: {
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          font: {
            size: 11,
          },
        },
      },
    } : undefined,
    onClick: (event: any, elements: any) => {
      if (elements.length > 0 && onDataPointClick) {
        const datasetIndex = elements[0].datasetIndex;
        const index = elements[0].index;
        const value = data.datasets[datasetIndex].data[index];
        onDataPointClick(datasetIndex, index, value);
      }
    },
  }), [type, data, onDataPointClick]);

  // Merge options (memoized)
  const options = useMemo(() => ({
    ...defaultOptions,
    ...config,
    plugins: {
      ...defaultOptions.plugins,
      ...(config.plugins || {}),
    },
    scales: type !== 'pie' && type !== 'doughnut' && type !== 'polarArea' ? {
      ...defaultOptions.scales,
      ...(config.scales || {}),
    } : config.scales,
  }), [defaultOptions, config, type]);

  // Prepare data for area charts (memoized)
  const processedData = useMemo(() => {
    if (type === 'area') {
      return {
        ...data,
        datasets: data.datasets.map(dataset => ({
          ...dataset,
          fill: true,
          // Keep provided backgroundColor; if missing, apply a subtle default tint
          backgroundColor:
            dataset.backgroundColor ||
            (Array.isArray(dataset.borderColor)
              ? dataset.borderColor.map((c) => `${c}33`)
              : typeof dataset.borderColor === 'string'
              ? `${dataset.borderColor}33`
              : 'rgba(0,0,0,0.1)'),
        })),
      };
    }
    return data;
  }, [type, data]);

  const exportChart = (format: 'png' | 'pdf') => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas;
      const url = canvas.toDataURL('image/png');
      
      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `chart-${new Date().getTime()}.png`;
        link.href = url;
        link.click();
      }
    }
    onExport?.(format);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const renderChart = (ref: any, targetHeight: number) => {
    const chartProps = {
      ref,
      data: processedData,
      options,
      height: targetHeight,
    } as any;

    switch (type) {
      case 'bar':
        return <Bar {...chartProps} />;
      case 'line':
      case 'area':
        return <Line {...chartProps} />;
      case 'pie':
        return <Pie {...chartProps} />;
      case 'doughnut':
        return <Doughnut {...chartProps} />;
      case 'scatter':
        return <Scatter {...chartProps} />;
      case 'bubble':
        return <Bubble {...chartProps} />;
      case 'polarArea':
        return <PolarArea {...chartProps} />;
      case 'radar':
        return <Radar {...chartProps} />;
      default:
        return <Bar {...chartProps} />;
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse">
          {title && <div className="h-6 bg-gray-200 rounded mb-2 w-1/3"></div>}
          {description && <div className="h-4 bg-gray-200 rounded mb-4 w-2/3"></div>}
          <div className="bg-gray-200 rounded" style={{ height: `${height}px` }}></div>
        </div>
      </div>
    );
  }

  const chartContent = (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}> 
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm text-gray-600">{description}</p>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Chart Settings"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
            
            <div className="relative group">
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <ArrowDownTrayIcon className="h-5 w-5" />
              </button>
              <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                <button
                  onClick={() => exportChart('png')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export PNG
                </button>
                <button
                  onClick={() => exportChart('pdf')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export PDF
                </button>
              </div>
            </div>
            
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              <ArrowsPointingOutIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Chart Config Panel */}
        {showConfig && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Chart Configuration</h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-medium text-gray-600">Type:</span>
                <span className="ml-2 text-gray-900 capitalize">{type}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Datasets:</span>
                <span className="ml-2 text-gray-900">{data.datasets.length}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Data Points:</span>
                <span className="ml-2 text-gray-900">{data.labels.length}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Interactive:</span>
                <span className="ml-2 text-gray-900">{onDataPointClick ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="p-6">
        <div 
          className="relative" 
          style={{ height: `${height}px` }}
        >
          {renderChart(chartRef, height)}
        </div>
      </div>
    </div>
  );

  // Fullscreen overlay (separate window on same page)
  const overlayChartRef = useRef<any>(null);

  const fullscreenOverlay = isFullscreen
    ? createPortal(
        <div className="fixed inset-0 z-50 bg-white p-6 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            {title && (
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            )}
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="relative" style={{ height: '80vh' }}>
            {renderChart(overlayChartRef, 600)}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {chartContent}
      {fullscreenOverlay}
    </>
  );
}; 

export default React.memo(ChartComponent); 