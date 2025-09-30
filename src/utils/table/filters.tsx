/**
 * T024: Table filters and sorters for Ant Design tables
 */

import React from 'react';
import dayjs from 'dayjs';
import type { TableProps } from 'antd/es/table';
import type { Patient } from '../../types';
import type { PatientTableRecord, HouseholdTableRecord, TableFilters } from '../../types/ui.types';
import styles from './TableUtils.module.css';

/**
 * Filter functions for patient table
 */
export const patientFilters = {
  // Filter by species
  filterBySpecies: (species: string[], data: PatientTableRecord[]): PatientTableRecord[] => {
    if (!species.length) return data;
    return data.filter(patient => species.includes(patient.species));
  },

  // Filter by status
  filterByStatus: (status: string[], data: PatientTableRecord[]): PatientTableRecord[] => {
    if (!status.length) return data;
    return data.filter(patient => status.includes(patient.status));
  },

  // Filter by age range
  filterByAgeRange: (minAge: number, maxAge: number, data: Patient[]): Patient[] => {
    return data.filter(patient => {
      if (!patient.dateOfBirth) return false;
      const age = dayjs().diff(dayjs(patient.dateOfBirth), 'year');
      return age >= minAge && age <= maxAge;
    });
  },

  // Filter by weight range
  filterByWeightRange: (minWeight: number, maxWeight: number, data: Patient[]): Patient[] => {
    return data.filter(patient => {
      if (!patient.weight) return false;
      return patient.weight >= minWeight && patient.weight <= maxWeight;
    });
  },

  // Filter by has microchip
  filterByMicrochip: (hasMicrochip: boolean, data: Patient[]): Patient[] => {
    return data.filter(patient =>
      hasMicrochip ? !!patient.microchipId : !patient.microchipId
    );
  },

  // Filter by gender
  filterByGender: (genders: string[], data: Patient[]): Patient[] => {
    if (!genders.length) return data;
    return data.filter(patient => patient.gender && genders.includes(patient.gender));
  },
};

/**
 * Filter functions for household table
 */
export const householdFilters = {
  // Filter by pet count
  filterByPetCount: (min: number, max: number, data: HouseholdTableRecord[]): HouseholdTableRecord[] => {
    return data.filter(household => {
      const count = household.petCount || 0;
      return count >= min && count <= max;
    });
  },

  // Filter by activity status
  filterByActivity: (daysInactive: number, data: HouseholdTableRecord[]): HouseholdTableRecord[] => {
    const cutoffDate = dayjs().subtract(daysInactive, 'day');
    return data.filter(household => {
      if (!household.lastActivity) return daysInactive === 0;
      return dayjs(household.lastActivity).isAfter(cutoffDate);
    });
  },

  // Filter by has contact info
  filterByContactInfo: (requirePhone: boolean, requireEmail: boolean, data: HouseholdTableRecord[]): HouseholdTableRecord[] => {
    return data.filter(household => {
      if (requirePhone && !household.phone) return false;
      if (requireEmail && !household.email) return false;
      return true;
    });
  },
};

/**
 * Sorter functions
 */
export const tableSorters = {
  // Date sorter
  dateSort: (field: string) => (a: any, b: any) => {
    const dateA = a[field] ? dayjs(a[field]).unix() : 0;
    const dateB = b[field] ? dayjs(b[field]).unix() : 0;
    return dateA - dateB;
  },

  // String sorter (case insensitive)
  stringSort: (field: string) => (a: any, b: any) => {
    const valA = (a[field] || '').toLowerCase();
    const valB = (b[field] || '').toLowerCase();
    return valA.localeCompare(valB);
  },

  // Number sorter
  numberSort: (field: string) => (a: any, b: any) => {
    return (a[field] || 0) - (b[field] || 0);
  },

  // Age sorter (for patients)
  ageSort: (a: Patient, b: Patient) => {
    const ageA = a.dateOfBirth ? dayjs().diff(dayjs(a.dateOfBirth), 'day') : Infinity;
    const ageB = b.dateOfBirth ? dayjs().diff(dayjs(b.dateOfBirth), 'day') : Infinity;
    return ageA - ageB;
  },
};

/**
 * Search filter for table data
 */
export const searchTableData = <T extends Record<string, any>>(
  data: T[],
  searchText: string,
  searchFields: (keyof T)[]
): T[] => {
  if (!searchText) return data;

  const searchLower = searchText.toLowerCase();
  return data.filter(item => {
    return searchFields.some(field => {
      const value = item[field];
      if (value == null) return false;
      return String(value).toLowerCase().includes(searchLower);
    });
  });
};

/**
 * Apply multiple filters to data
 */
export const applyTableFilters = <T extends any>(
  data: T[],
  filters: Array<(data: T[]) => T[]>
): T[] => {
  return filters.reduce((filtered, filter) => filter(filtered), data);
};

/**
 * Get filter dropdown props for Ant Design table
 */
export const getFilterDropdownProps = (
  dataIndex: string,
  placeholder: string = 'Search'
): TableProps<any>['columns'][0] => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
    <div className={styles.filterDropdown}>
      <input
        placeholder={placeholder}
        value={selectedKeys[0]}
        onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
        onPressEnter={() => confirm()}
        className={styles.filterInput}
      />
      <button onClick={() => confirm()} className={styles.filterButtonInline}>
        Search
      </button>
      <button onClick={() => clearFilters && clearFilters()}>
        Reset
      </button>
    </div>
  ),
  filterIcon: filtered => <span className={filtered ? styles.filterIcon : styles.filterIconDefault}>🔍</span>,
  onFilter: (value, record) =>
    record[dataIndex]
      ? record[dataIndex].toString().toLowerCase().includes(value.toLowerCase())
      : false,
});

/**
 * Export preset filter configurations
 */
export const filterPresets = {
  patient: {
    active: (data: Patient[]) => data.filter(p => p.isActive !== false),
    hasOwner: (data: Patient[]) => data.filter(p => !!p.ownerId),
    noOwner: (data: Patient[]) => data.filter(p => !p.ownerId),
    puppiesKittens: (data: Patient[]) => patientFilters.filterByAgeRange(0, 1, data),
    senior: (data: Patient[]) => patientFilters.filterByAgeRange(7, 100, data),
    chipped: (data: Patient[]) => patientFilters.filterByMicrochip(true, data),
  },
  household: {
    active: (data: HouseholdTableRecord[]) => householdFilters.filterByActivity(30, data),
    inactive: (data: HouseholdTableRecord[]) =>
      data.filter(h => !h.lastActivity || dayjs().diff(dayjs(h.lastActivity), 'day') > 90),
    withPets: (data: HouseholdTableRecord[]) => data.filter(h => (h.petCount || 0) > 0),
    noPets: (data: HouseholdTableRecord[]) => data.filter(h => (h.petCount || 0) === 0),
    completeInfo: (data: HouseholdTableRecord[]) =>
      householdFilters.filterByContactInfo(true, true, data),
  },
};

/**
 * Column search configuration helper
 */
export const getColumnSearchProps = (dataIndex: string): TableProps<any>['columns'][0] => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
    <div className={styles.filterDropdown}>
      <input
        placeholder={`Search ${dataIndex}`}
        value={selectedKeys[0]}
        onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
        onPressEnter={() => confirm()}
        className={styles.filterInput}
      />
      <button
        onClick={() => confirm()}
        className={styles.filterButton}
      >
        Search
      </button>
      <button onClick={() => clearFilters && clearFilters()} className={styles.filterButtonReset}>
        Reset
      </button>
    </div>
  ),
  onFilter: (value, record) =>
    record[dataIndex]
      .toString()
      .toLowerCase()
      .includes((value as string).toLowerCase()),
});