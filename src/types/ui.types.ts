import type { Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import type {
  FormInstance,
  TableColumnsType,
  TableProps,
  MenuProps,
  TabsProps,
} from 'antd';
import type { Rule } from 'antd/es/form';

/**
 * UI Component Type Definitions for Ant Design Integration
 */

// Navigation Types
export type ViewType = 'patients' | 'households';

export interface NavigationState {
  activeView: ViewType;
  breadcrumbs: BreadcrumbItem[];
  isCollapsed: boolean;
}

export interface BreadcrumbItem {
  title: string;
  path?: string;
  icon?: ReactNode;
}

// Theme Types
export interface UIPreferences {
  theme: 'light' | 'dark';
  compactMode: boolean;
  tablePageSize: number;
  dateFormat: string;
  sidebarCollapsed: boolean;
}

// Layout Component Props
export interface AppLayoutProps {
  children: ReactNode;
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  userInfo?: UserInfo;
}

export interface AppHeaderProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  userInfo?: UserInfo;
  onMenuClick?: MenuProps['onClick'];
}

export interface AppToolbarProps {
  activeView: ViewType;
  actions?: ToolbarAction[];
}

export interface ToolbarAction {
  key: string;
  label: string;
  icon?: ReactNode;
  type?: 'primary' | 'default' | 'text' | 'link' | 'dashed';
  danger?: boolean;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

// User Types
export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

// Form Types
export interface BaseFormProps<T = any> {
  form?: FormInstance<T>;
  initialValues?: Partial<T>;
  onSubmit: (values: T) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  mode?: 'create' | 'edit' | 'view';
}

export interface PatientFormValues {
  id?: number;
  name: string;
  species: string;
  breed?: string;
  dateOfBirth: Dayjs | null;
  weight?: number;
  microchipId?: string;
  ownerId?: number;
  notes?: string;
  sex?: 'male' | 'female' | 'unknown';
  neutered?: boolean;
  color?: string;
}

export interface HouseholdFormValues {
  id?: number;
  lastName: string;
  contacts: ContactFormValues[];
  address?: AddressFormValues;
  notes?: string;
}

export interface ContactFormValues {
  id?: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  isPrimary: boolean;
  relationship?: string;
}

export interface AddressFormValues {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

// Table Types
export interface BaseTableProps<T = any> {
  data: T[];
  columns: TableColumnsType<T>;
  loading?: boolean;
  pagination?: TableProps<T>['pagination'];
  onRow?: TableProps<T>['onRow'];
  rowSelection?: TableProps<T>['rowSelection'];
  expandable?: TableProps<T>['expandable'];
  onTableChange?: TableProps<T>['onChange'];
  searchValue?: string;
  onSearch?: (value: string) => void;
}

export interface PatientTableRecord {
  id: number;
  name: string;
  species: string;
  breed?: string;
  age: string;
  owner?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  lastVisit?: string;
  status: 'active' | 'inactive' | 'deceased';
  microchipId?: string;
}

export interface HouseholdTableRecord {
  id: number;
  lastName: string;
  primaryContact: string;
  phone: string;
  email?: string;
  petCount: number;
  address?: string;
  lastActivity?: string;
}

// Search Types
export interface SearchProps {
  placeholder?: string;
  onSearch: (value: string) => void;
  onSelect?: (value: any, option: any) => void;
  loading?: boolean;
  style?: React.CSSProperties;
  size?: 'small' | 'middle' | 'large';
}

// Modal Types
export interface BaseModalProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onOk?: () => void | Promise<void>;
  loading?: boolean;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

// Notification Types
export interface NotificationItem {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  description?: string;
  duration?: number;
}

// Validation Rules
export interface ValidationRules {
  required: Rule;
  email: Rule;
  phone: Rule;
  name: Rule;
  weight: Rule;
  microchip: Rule;
  date: Rule;
}

// Common Component Props
export interface LoadingProps {
  spinning?: boolean;
  size?: 'small' | 'default' | 'large';
  tip?: string;
}

export interface EmptyStateProps {
  description?: string;
  image?: ReactNode;
  children?: ReactNode;
}

// Filter and Sorter Types
export interface TableFilters {
  species?: string[];
  status?: string[];
  dateRange?: [Dayjs, Dayjs];
}

export interface TableSorter {
  field: string;
  order: 'ascend' | 'descend' | null;
}

// API Response Types (for table data)
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Status Types
export type PatientStatus = 'active' | 'inactive' | 'deceased';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';

// Action Types for State Management
export interface UIAction {
  type: string;
  payload?: any;
}

// Tab Configuration
export interface TabConfig {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  closable?: boolean;
  children?: ReactNode;
}

// Export all types
export type {
  FormInstance,
  TableColumnsType,
  TableProps as AntTableProps,
  MenuProps as AntMenuProps,
  TabsProps as AntTabsProps,
  Rule,
};