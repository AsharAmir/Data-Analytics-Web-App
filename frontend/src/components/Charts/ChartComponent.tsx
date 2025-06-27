import React from "react";
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
import { ChartData, ChartConfig } from "../../types";

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
  RadialLinearScale
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
    | "radar";
  config?: ChartConfig;
  height?: number;
  className?: string;
}

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "top" as const,
    },
    title: {
      display: false,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

const ChartComponent = React.forwardRef<HTMLCanvasElement, ChartComponentProps>(
  (
    { data, type, config = {}, height = 400, className = "" },
    ref
  ) => {
    // Merge default options with provided config
    const options = {
      ...defaultOptions,
      ...config,
      plugins: {
        ...defaultOptions.plugins,
        ...config.plugins,
      },
      scales:
        type === "pie" || type === "doughnut"
          ? undefined
          : {
              ...defaultOptions.scales,
              ...config.scales,
            },
    };

    const chartProps = {
      data,
      options,
      height,
    };

    const renderChart = () => {
      switch (type) {
        case "bar":
          return <Bar {...chartProps} />;
        case "line":
          return <Line {...chartProps} />;
        case "pie":
          return <Pie {...chartProps} />;
        case "doughnut":
          return <Doughnut {...chartProps} />;
        case "scatter":
          return <Scatter {...chartProps} />;
        case "bubble":
          return <Bubble {...chartProps} />;
        case "polarArea":
          return <PolarArea {...chartProps} />;
        case "radar":
          return <Radar {...chartProps} />;
        default:
          return <Bar {...chartProps} />;
      }
    };

    return (
      <div className={`relative ${className}`} style={{ height: `${height}px` }}>
        {React.cloneElement(renderChart() as React.ReactElement, { ref })}
      </div>
    );
  }
);

ChartComponent.displayName = "ChartComponent";

export default ChartComponent;
