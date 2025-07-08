import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import apiClient from '../../lib/api';
import Sidebar from '../Layout/Sidebar';
import KPICard from '../ui/KPICard';
import ChartComponent from '../Charts/ChartComponent';
import DataTable from '../ui/DataTable';
import { 
  DashboardWidget, 
  MenuItem, 
  ChartData, 
  TableData,
  QueryResult 
} from '../../types';

const Dashboard: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [widgetData, setWidgetData] = useState<Record<number, QueryResult>>({});
  const [selectedView, setSelectedView] = useState<'overview' | 'charts' | 'tables'>('overview');

  // KPI customization state
  const [kpiPrefs, setKpiPrefs] = useState<Record<string, boolean>>({
    totalRecords: true,
    activeCharts: true,
    dataTables: true,
    avgQueryTime: true,
  });
  const [showKpiConfig, setShowKpiConfig] = useState(false);

  // Icon components
  const CurrencyIcon = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
    </svg>
  );

  const UsersIcon = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );

  const TrendingIcon = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );

  const ClockIcon = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const ChartIcon = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );

  const EyeIcon = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );

  useEffect(() => {
    if (!apiClient.isAuthenticated()) {
      router.push('/login');
      return;
    }
    loadDashboardData();
  }, [router]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [menuResponse, widgetsResponse] = await Promise.all([
        apiClient.getMenuItems(),
        apiClient.getDashboardLayout(),
      ]);

      setMenuItems(menuResponse);
      setWidgets(widgetsResponse);

      // Load data for each widget
      const widgetDataPromises = widgetsResponse.map(async (widget) => {
        try {
          const data = await apiClient.getWidgetData(widget.id);
          return { widgetId: widget.id, data };
        } catch (error) {
          console.error(`Error loading data for widget ${widget.id}:`, error);
          return { widgetId: widget.id, data: null };
        }
      });

      const widgetDataResults = await Promise.all(widgetDataPromises);
      const widgetDataMap: Record<number, QueryResult> = {};

      widgetDataResults.forEach((result) => {
        if (result.data && result.data.success) {
          widgetDataMap[result.widgetId] = result.data;
        }
      });

      setWidgetData(widgetDataMap);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.type === 'dashboard') {
      window.scrollTo(0, 0);
    } else if (item.type === 'report') {
      router.push(`/reports?menu=${item.id}`);
    }
  };

  // Calculate KPIs from actual widget data
  const calculateKPIs = () => {
    const kpis: any[] = [];
    
    // Get metrics from actual widget data
    const widgetDataValues = Object.values(widgetData);
    
    // Calculate total records from all chart widgets
    let totalRecords = 0;
    let totalCharts = 0;
    let totalTables = 0;
    let avgExecutionTime = 0;
    let executionTimeCount = 0;
    
    widgetDataValues.forEach((data) => {
      if (data && data.success) {
        // Count execution times for average
        if (data.execution_time) {
          avgExecutionTime += data.execution_time;
          executionTimeCount++;
        }
        
        if (data.chart_type && data.data && 'labels' in data.data) {
          totalCharts++;
          // Sum up data values from chart datasets
          const chartData = data.data as ChartData;
          chartData.datasets.forEach(dataset => {
            if (Array.isArray(dataset.data)) {
              dataset.data.forEach(value => {
                if (typeof value === 'number') {
                  totalRecords += value;
                }
              });
            }
          });
        } else if (data.data && 'columns' in data.data) {
          totalTables++;
          const tableData = data.data as TableData;
          totalRecords += tableData.total_count || tableData.data.length;
        }
      }
    });

    // Calculate average execution time
    avgExecutionTime = executionTimeCount > 0 ? avgExecutionTime / executionTimeCount : 0;

    kpis.push({
      id: 'totalRecords',
      title: 'Total Records',
      value: totalRecords.toLocaleString(),
      change: { value: 0, type: 'neutral' as const, period: 'from all data sources' },
      icon: <CurrencyIcon />,
      color: 'green' as const
    });

    kpis.push({
      id: 'activeCharts',
      title: 'Active Charts',
      value: totalCharts.toString(),
      change: { value: 0, type: 'neutral' as const, period: 'dashboard widgets' },
      icon: <UsersIcon />,
      color: 'blue' as const
    });

    kpis.push({
      id: 'dataTables',
      title: 'Data Tables',
      value: totalTables.toString(),
      change: { value: 0, type: 'neutral' as const, period: 'active tables' },
      icon: <TrendingIcon />,
      color: 'purple' as const
    });

    kpis.push({
      id: 'avgQueryTime',
      title: 'Avg Query Time',
      value: avgExecutionTime > 0 ? `${(avgExecutionTime * 1000).toFixed(1)}ms` : 'N/A',
      change: { value: 0, type: 'neutral' as const, period: 'execution performance' },
      icon: <ClockIcon />,
      color: 'indigo' as const
    });

    return kpis;
  };

  const renderWidget = (widget: DashboardWidget) => {
    const data = widgetData[widget.id];

    if (!data || !data.success) {
      return (
        <ChartComponent
          data={{ labels: [], datasets: [] }}
          type="bar"
          loading={true}
          title={widget.title}
          height={350}
        />
      );
    }

    const isChartData = data.chart_type && data.data && 'labels' in data.data;

    if (isChartData) {
      return (
        <ChartComponent
          data={data.data as ChartData}
          type={data.chart_type as any}
          config={data.chart_config}
          title={widget.title}
          description={`Executed in ${(data.execution_time! * 1000).toFixed(2)}ms`}
          height={350}
          onDataPointClick={(datasetIndex, index, value) => {
            console.log('Data point clicked:', { datasetIndex, index, value });
          }}
        />
      );
    } else {
      return (
        <DataTable
          data={data.data as TableData}
          onSort={(column, direction) => {
            console.log('Sort:', column, direction);
          }}
          onExport={(format) => {
            console.log('Export:', format);
          }}
        />
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-lg text-gray-700 font-medium">Loading your dashboard...</p>
          <p className="text-sm text-gray-500 mt-2">Preparing the latest analytics</p>
        </div>
      </div>
    );
  }

  const kpis = calculateKPIs();

  // Component for KPI configuration modal
  const KpiConfigModal = () => {
    if (!showKpiConfig) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
        <div className="bg-white rounded-xl shadow-lg p-6 w-80">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Customize Summary Widgets</h3>
          <div className="space-y-3">
            {Object.entries(kpiPrefs).map(([key, value]) => (
              <label key={key} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600"
                  checked={value}
                  onChange={() =>
                    setKpiPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                />
                <span className="capitalize text-sm text-gray-700">
                  {key.replace(/([A-Z])/g, ' $1')}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowKpiConfig(false)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex">
      {/* Sidebar */}
      <Sidebar
        menuItems={menuItems}
        currentPath="/dashboard"
        onMenuClick={handleMenuClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Enhanced Header */}
        <header className="bg-white shadow-lg border-b border-gray-100 relative overflow-hidden">
          {/* Background decorative element */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/30 via-transparent to-indigo-50/30"></div>
          
          <div className="relative px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-blue-700 to-indigo-600 bg-clip-text text-transparent">
                    Financial Analytics
                  </h1>
                  <p className="text-sm text-gray-500 -mt-0.5">Real-time insights & reporting</p>
                </div>
                
                {/* Compact status indicators */}
                <div className="flex items-center space-x-4 ml-6">
                  <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Live</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>{widgets.length} widgets</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {/* Compact View Toggle */}
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  {[
                    { key: 'overview', label: 'Overview', icon: EyeIcon },
                    { key: 'charts', label: 'Charts', icon: ChartIcon },
                    { key: 'tables', label: 'Tables', icon: UsersIcon }
                  ].map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setSelectedView(key as any)}
                      className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all duration-200 text-xs font-medium ${
                        selectedView === key
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      <Icon />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Compact Action buttons */}
                <button
                  onClick={loadDashboardData}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center space-x-1.5 shadow-md hover:shadow-lg text-sm font-medium"
                >
                  <TrendingIcon />
                  <span className="hidden sm:inline">Refresh</span>
                </button>

                <button
                  onClick={() => setShowKpiConfig(true)}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200 flex items-center space-x-1.5 shadow-sm text-sm font-medium"
                >
                  <ClockIcon />
                  <span className="hidden sm:inline">Customize</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-8 space-y-8">
          {/* KPI Cards - Only show if we have actual data */}
          {selectedView === 'overview' && Object.keys(widgetData).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {kpis
                .filter((kpi) => kpiPrefs[kpi.id])
                .map((kpi, index) => (
                <KPICard
                  key={index}
                  title={kpi.title}
                  value={kpi.value}
                  change={kpi.change}
                  icon={kpi.icon}
                  color={kpi.color}
                />
              ))}
            </div>
          )}

          {/* Widgets Grid */}
          {widgets.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
              {widgets
                .filter(widget => {
                  const data = widgetData[widget.id];
                  if (selectedView === 'charts') {
                    return data?.chart_type && data.data && 'labels' in data.data;
                  } else if (selectedView === 'tables') {
                    return data?.data && 'columns' in data.data;
                  }
                  return true; // overview shows all
                })
                .map((widget) => (
                  <div
                    key={widget.id}
                    className={`
                      transition-all duration-300 hover:scale-105
                      ${widget.width >= 12 ? 'lg:col-span-2 xl:col-span-3' : ''}
                      ${widget.width >= 8 ? 'lg:col-span-2' : ''}
                    `}
                  >
                    {renderWidget(widget)}
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="mx-auto h-24 w-24 text-gray-300 mb-6">
                <ChartIcon />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No widgets configured</h3>
              <p className="text-gray-500">
                Contact your administrator to set up dashboard widgets.
              </p>
            </div>
          )}

          {/* Footer Info - Show real data metrics */}
          <div className="text-center py-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Last updated: {new Date().toLocaleString()} | 
              Total widgets: {widgets.length} | 
              Active data sources: {Object.keys(widgetData).length}
            </p>
          </div>
          {/* Modal Render */}
          <KpiConfigModal />
        </main>
      </div>
    </div>
  );
};

export default Dashboard; 