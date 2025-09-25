import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

// Get date format from localStorage or use default
export const getUserDateFormat = (): string => {
  const settings = localStorage.getItem('veterinary-clinic-settings');
  if (settings) {
    try {
      const parsed = JSON.parse(settings);
      return parsed.dateFormat || 'MM/DD/YYYY';
    } catch {
      return 'MM/DD/YYYY';
    }
  }
  return 'MM/DD/YYYY';
};

// Format a date string or Date object according to user preference
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '';
  const format = getUserDateFormat();
  return dayjs(date).format(format);
};

// Format a date with time
export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return '';
  const format = getUserDateFormat();
  return dayjs(date).format(`${format} HH:mm`);
};

// Format a dayjs object
export const formatDayjs = (date: Dayjs | null | undefined): string => {
  if (!date) return '';
  const format = getUserDateFormat();
  return date.format(format);
};

// Get the dayjs format string for DatePicker components
export const getDatePickerFormat = (): string => {
  const format = getUserDateFormat();
  // Convert to format that DatePicker understands
  return format.replace('MM', 'MM')
    .replace('DD', 'DD')
    .replace('YYYY', 'YYYY');
};

// Store settings in localStorage when they change
export const updateDateFormatInStorage = (dateFormat: string) => {
  const existing = localStorage.getItem('veterinary-clinic-settings');
  let settings = { dateFormat };
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      settings = { ...parsed, dateFormat };
    } catch {
      // Use new settings if parse fails
    }
  }
  localStorage.setItem('veterinary-clinic-settings', JSON.stringify(settings));
};