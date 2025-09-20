/**
 * T023: Table column configurations for Ant Design tables
 */

import type { ColumnsType } from 'antd/es/table';
import type { Patient } from '../types';
import type { PatientTableRecord, HouseholdTableRecord } from '../types/ui.types';

export const patientTableColumns: ColumnsType<PatientTableRecord> = [
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
    width: 150,
    fixed: 'left',
    sorter: true,
    filterSearch: true,
  },
  {
    title: 'Species',
    dataIndex: 'species',
    key: 'species',
    width: 100,
    filters: [
      { text: 'Dog', value: 'Dog' },
      { text: 'Cat', value: 'Cat' },
      { text: 'Bird', value: 'Bird' },
      { text: 'Rabbit', value: 'Rabbit' },
      { text: 'Other', value: 'Other' },
    ],
    filterMultiple: true,
  },
  {
    title: 'Breed',
    dataIndex: 'breed',
    key: 'breed',
    width: 120,
    ellipsis: true,
  },
  {
    title: 'Age',
    key: 'age',
    width: 100,
    sorter: true,
  },
  {
    title: 'Owner',
    key: 'owner',
    width: 150,
    ellipsis: true,
  },
  {
    title: 'Status',
    key: 'status',
    width: 100,
    filters: [
      { text: 'Active', value: 'active' },
      { text: 'Inactive', value: 'inactive' },
      { text: 'Deceased', value: 'deceased' },
    ],
  },
  {
    title: 'Last Visit',
    dataIndex: 'lastVisit',
    key: 'lastVisit',
    width: 120,
    sorter: true,
  },
  {
    title: 'Actions',
    key: 'actions',
    fixed: 'right',
    width: 120,
  },
];

export const householdTableColumns: ColumnsType<HouseholdTableRecord> = [
  {
    title: 'Household',
    dataIndex: 'lastName',
    key: 'lastName',
    width: 200,
    fixed: 'left',
    sorter: true,
  },
  {
    title: 'Primary Contact',
    dataIndex: 'primaryContact',
    key: 'primaryContact',
    width: 180,
    sorter: true,
  },
  {
    title: 'Phone',
    dataIndex: 'phone',
    key: 'phone',
    width: 140,
  },
  {
    title: 'Email',
    dataIndex: 'email',
    key: 'email',
    width: 200,
    ellipsis: true,
  },
  {
    title: 'Pets',
    dataIndex: 'petCount',
    key: 'petCount',
    width: 80,
    align: 'center',
    sorter: true,
  },
  {
    title: 'Address',
    dataIndex: 'address',
    key: 'address',
    width: 250,
    ellipsis: true,
  },
  {
    title: 'Last Activity',
    dataIndex: 'lastActivity',
    key: 'lastActivity',
    width: 120,
    sorter: true,
  },
  {
    title: 'Actions',
    key: 'actions',
    fixed: 'right',
    width: 150,
  },
];

// Column visibility presets
export const columnPresets = {
  patient: {
    minimal: ['name', 'species', 'owner', 'actions'],
    standard: ['name', 'species', 'breed', 'age', 'owner', 'status', 'actions'],
    detailed: ['name', 'species', 'breed', 'age', 'owner', 'status', 'lastVisit', 'microchipId', 'actions'],
  },
  household: {
    minimal: ['lastName', 'primaryContact', 'petCount', 'actions'],
    standard: ['lastName', 'primaryContact', 'phone', 'petCount', 'lastActivity', 'actions'],
    detailed: ['lastName', 'primaryContact', 'phone', 'email', 'petCount', 'address', 'lastActivity', 'actions'],
  },
};

// Export functions to get columns based on preset
export const getPatientColumns = (preset: keyof typeof columnPresets.patient = 'standard'): ColumnsType<PatientTableRecord> => {
  const visibleKeys = columnPresets.patient[preset];
  return patientTableColumns.filter(col => visibleKeys.includes(col.key as string));
};

export const getHouseholdColumns = (preset: keyof typeof columnPresets.household = 'standard'): ColumnsType<HouseholdTableRecord> => {
  const visibleKeys = columnPresets.household[preset];
  return householdTableColumns.filter(col => visibleKeys.includes(col.key as string));
};