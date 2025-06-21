// User and Authentication Types
export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user: User;
}

// Menu Types
export interface MenuItem {
  id: number;
  name: string;
  type: 'dashboard' | 'report';
  icon?: string;
  parent_id?: number;
  sort_order: number;
  is_active: boolean;
  children: MenuItem[];
}

// Query Types
export interface Query {
  id: number;
  name: string;
  description?: string;
  sql_query: string;
  chart_type?: string;
  chart_config?: Record<string, any>;
  menu_item_id?: number;
  is_active: boolean;
  created_at: string;
}

export interface QueryExecuteRequest {
  query_id?: number;
  sql_query?: string;
  limit?: number;
  offset?: number;
}

// Chart Types
export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label?: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
}

export interface ChartConfig {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  indexAxis?: 'x' | 'y';
  scales?: Record<string, any>;
  plugins?: Record<string, any>;
}

// Table Types
export interface TableData {
  columns: string[];
  data: any[][];
  total_count: number;
}

// API Response Types
export interface QueryResult {
  success: boolean;
  data?: ChartData | TableData;
  chart_type?: string;
  chart_config?: Record<string, any>;
  error?: string;
  execution_time?: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

// Dashboard Types
export interface DashboardWidget {
  id: number;
  title: string;
  query_id: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  is_active: boolean;
  query?: Query;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
}

// Filter Types
export interface FilterCondition {
  column: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'in';
  value: string | number | string[] | number[];
}

export interface TableFilter {
  conditions: FilterCondition[];
  logic: 'AND' | 'OR';
}

export interface FilteredQueryRequest {
  query_id?: number;
  sql_query?: string;
  filters?: TableFilter;
  limit?: number;
  offset?: number;
  sort_column?: string;
  sort_direction?: 'ASC' | 'DESC';
}

// Export Types
export interface ExportRequest {
  query_id?: number;
  sql_query?: string;
  format: 'excel' | 'csv' | 'pdf';
  filename?: string;
}

// Component Props Types
export interface ChartComponentProps {
  data: ChartData;
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'bubble' | 'polarArea' | 'radar';
  config?: ChartConfig;
  height?: number;
  className?: string;
}

export interface TableComponentProps {
  data: TableData;
  loading?: boolean;
  onSort?: (column: string, direction: 'ASC' | 'DESC') => void;
  onFilter?: (filters: TableFilter) => void;
  onExport?: (format: 'excel' | 'csv') => void;
  className?: string;
}

export interface SidebarProps {
  menuItems: MenuItem[];
  currentPath: string;
  onMenuClick: (item: MenuItem) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Form Types
export interface LoginFormData {
  username: string;
  password: string;
}

export interface QueryFormData {
  name: string;
  description?: string;
  sql_query: string;
  chart_type?: string;
  chart_config?: Record<string, any>;
  menu_item_id?: number;
}

// Grid Layout Types (for dashboard)
export interface GridLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
}

// Pagination Types
export interface PaginationInfo {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Error Types
export interface ErrorInfo {
  message: string;
  code?: string;
  details?: Record<string, any>;
}

// Theme Types
export interface ThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

// Report Types
export interface ReportMetadata {
  id: number;
  name: string;
  description?: string;
  chart_type?: string;
  created_at: string;
  updated_at?: string;
}

export interface ReportSection {
  id: number;
  name: string;
  reports: ReportMetadata[];
}

// Widget configuration for dashboard
export interface WidgetConfig {
  id: string;
  title: string;
  type: 'chart' | 'table' | 'metric' | 'text';
  query_id?: number;
  custom_query?: string;
  chart_type?: string;
  refresh_interval?: number; // in seconds
  config?: Record<string, any>;
} 