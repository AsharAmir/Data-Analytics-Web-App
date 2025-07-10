import React, { useRef, useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
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
} from "chart.js";
import {
  Bar,
  Line,
  Pie,
  Doughnut,
  Scatter,
  Bubble,
  PolarArea,
  Radar,
} from "react-chartjs-2";
import type {
  ChartEvent,
  ActiveElement,
  TooltipItem,
  ChartType,
} from "chart.js";
import { ChartData, ChartConfig } from "../../types";
import {
  ArrowsPointingOutIcon,
  ArrowDownTrayIcon,
  Cog6ToothIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import jsPDF from "jspdf";

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
  Filler,
);

interface ChartComponentProps {
  data: ChartData;
  type:
    | "bar"
    | "line"
    | "pie"
    | "doughnut"
    | "scatter"
    | "bubble"
    | "polarArea"
    | "radar"
    | "area";
  config?: ChartConfig;
  height?: number;
  className?: string;
  title?: string;
  description?: string;
  loading?: boolean;
  onDataPointClick?: (
    datasetIndex: number,
    index: number,
    value: number,
  ) => void;
  onExport?: (format: "png" | "pdf") => void;
}

const ChartComponent: React.FC<ChartComponentProps> = ({
  data,
  type,
  config = {},
  height = 400,
  className = "",
  title,
  description,
  loading = false,
  onDataPointClick,
  onExport,
}) => {
  const chartRef = useRef<ChartJS | null>(null);
  const overlayChartRef = useRef<ChartJS | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Prevent body scroll when fullscreen overlay is open
  useEffect(() => {
    if (isFullscreen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isFullscreen]);

  // Enhanced default options (memoized)
  const defaultOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index" as const,
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top" as const,
          labels: {
            usePointStyle: true,
            padding: 20,
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "white",
          bodyColor: "white",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            title: function (context: TooltipItem<ChartType>[]) {
              return context[0]?.label || "";
            },
            label: function (context: TooltipItem<ChartType>) {
              const label = context.dataset.label || "";
              const value =
                typeof context.parsed.y !== "undefined"
                  ? context.parsed.y
                  : context.parsed;
              if (typeof value === "number") {
                const formattedValue =
                  value >= 1000000
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
      scales:
        type !== "pie" && type !== "doughnut" && type !== "polarArea"
          ? {
              y: {
                beginAtZero: true,
                grid: {
                  color: "rgba(0, 0, 0, 0.05)",
                },
                ticks: {
                  font: {
                    size: 11,
                  },
                  callback: function (value: string | number) {
                    if (typeof value === "number") {
                      if (value >= 1000000) {
                        return "$" + (value / 1000000).toFixed(1) + "M";
                      } else if (value >= 1000) {
                        return "$" + (value / 1000).toFixed(0) + "K";
                      } else {
                        return "$" + value.toLocaleString();
                      }
                    }
                    return value;
                  },
                },
              },
              x: {
                grid: {
                  color: "rgba(0, 0, 0, 0.05)",
                },
                ticks: {
                  font: {
                    size: 11,
                  },
                },
              },
            }
          : undefined,
      onClick: (event: ChartEvent, elements: ActiveElement[]) => {
        if (elements.length > 0 && onDataPointClick) {
          const datasetIndex = elements[0].datasetIndex;
          const index = elements[0].index;
          const value = data.datasets[datasetIndex].data[index];
          onDataPointClick(datasetIndex, index, value);
        }
      },
    }),
    [type, data, onDataPointClick],
  );

  // Merge options (memoized)
  const options = useMemo(
    () => ({
      ...defaultOptions,
      ...config,
      plugins: {
        ...defaultOptions.plugins,
        ...(config.plugins || {}),
      },
      scales:
        type !== "pie" && type !== "doughnut" && type !== "polarArea"
          ? {
              ...defaultOptions.scales,
              ...(config.scales || {}),
            }
          : config.scales,
    }),
    [defaultOptions, config, type],
  );

  // Prepare data for area charts (memoized)
  const processedData = useMemo(() => {
    if (type === "area") {
      return {
        ...data,
        datasets: data.datasets.map((dataset) => ({
          ...dataset,
          fill: true,
          // Keep provided backgroundColor; if missing, apply a subtle default tint
          backgroundColor:
            dataset.backgroundColor ||
            (Array.isArray(dataset.borderColor)
              ? dataset.borderColor.map((c) => `${c}33`)
              : typeof dataset.borderColor === "string"
                ? `${dataset.borderColor}33`
                : "rgba(0,0,0,0.1)"),
        })),
      };
    }
    return data;
  }, [type, data]);

  const exportChart = (format: "png" | "pdf") => {
    const chart = isFullscreen ? overlayChartRef.current : chartRef.current;
    if (chart) {
      const canvas = chart.canvas;
      const url = canvas.toDataURL("image/png", 1.0);

      if (format === "png") {
        const link = document.createElement("a");
        link.download = `chart-${new Date().getTime()}.png`;
        link.href = url;
        link.click();
      } else if (format === "pdf") {
        // Generate professional PDF using jsPDF
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        // Page dimensions
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;

        // Add header
        pdf.setFontSize(20);
        pdf.setTextColor(40, 40, 40);
        pdf.text(title || "Chart Export", margin, margin + 10);

        // Add timestamp
        pdf.setFontSize(10);
        pdf.setTextColor(120, 120, 120);
        const timestamp = new Date().toLocaleString();
        pdf.text(`Generated on: ${timestamp}`, margin, margin + 20);

        // Add description if available
        if (description) {
          pdf.setFontSize(12);
          pdf.setTextColor(80, 80, 80);
          const splitDescription = pdf.splitTextToSize(
            description,
            pageWidth - 2 * margin,
          );
          pdf.text(splitDescription, margin, margin + 35);
        }

        // Calculate chart dimensions to fit page
        const chartY = margin + (description ? 50 : 35);
        const availableHeight = pageHeight - chartY - margin;
        const availableWidth = pageWidth - 2 * margin;

        // Calculate aspect ratio and sizing
        const canvasAspect = canvas.width / canvas.height;
        let chartWidth = availableWidth;
        let chartHeight = chartWidth / canvasAspect;

        if (chartHeight > availableHeight) {
          chartHeight = availableHeight;
          chartWidth = chartHeight * canvasAspect;
        }

        // Center the chart horizontally
        const chartX = (pageWidth - chartWidth) / 2;

        // Add chart
        pdf.addImage(url, "PNG", chartX, chartY, chartWidth, chartHeight);

        // Add footer
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          "Generated by Financial Analytics Dashboard",
          margin,
          pageHeight - 10,
        );

        pdf.save(
          `${(title || "chart").replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().getTime()}.pdf`,
        );
      }
    }
    onExport?.(format);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const renderChart = (
    ref: React.RefObject<ChartJS | null>,
    targetHeight: number,
  ) => {
    const chartType = type === "area" ? "line" : type;

    switch (chartType) {
      case "bar":
        return (
          <Bar
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      case "line":
        return (
          <Line
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      case "pie":
        return (
          <Pie
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      case "doughnut":
        return (
          <Doughnut
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      case "scatter":
        return (
          <Scatter
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      case "bubble":
        return (
          <Bubble
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      case "polarArea":
        return (
          <PolarArea
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      case "radar":
        return (
          <Radar
            ref={ref as any}
            data={processedData as any}
            options={options}
            height={targetHeight}
          />
        );
      default:
        return <p>Unsupported chart type: {type}</p>;
    }
  };

  if (loading) {
    return (
      <div
        className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}
      >
        <div className="animate-pulse">
          {title && <div className="h-6 bg-gray-200 rounded mb-2 w-1/3"></div>}
          {description && (
            <div className="h-4 bg-gray-200 rounded mb-4 w-2/3"></div>
          )}
          <div
            className="bg-gray-200 rounded"
            style={{ height: `${height}px` }}
          ></div>
        </div>
      </div>
    );
  }

  const chartContent = (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}
    >
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
                  onClick={() => exportChart("png")}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export PNG
                </button>
                <button
                  onClick={() => exportChart("pdf")}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export PDF
                </button>
              </div>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              <ArrowsPointingOutIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Chart Config Panel */}
        {showConfig && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              Chart Configuration
            </h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-medium text-gray-600">Type:</span>
                <span className="ml-2 text-gray-900 capitalize">{type}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Datasets:</span>
                <span className="ml-2 text-gray-900">
                  {data.datasets.length}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Data Points:</span>
                <span className="ml-2 text-gray-900">{data.labels.length}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Interactive:</span>
                <span className="ml-2 text-gray-900">
                  {onDataPointClick ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="p-6">
        <div className="relative" style={{ height: `${height}px` }}>
          {renderChart(chartRef, height)}
        </div>
      </div>
    </div>
  );

  // Fullscreen overlay (separate window on same page)

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
          <div className="relative" style={{ height: "80vh" }}>
            {renderChart(overlayChartRef, 600)}
          </div>
        </div>,
        document.body,
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
