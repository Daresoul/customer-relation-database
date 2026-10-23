import React from 'react';
import type { DuplicateCheckInput, HouseholdDuplicate } from '../../services/householdService';

export interface DuplicateHouseholdWarningProps {
  check: DuplicateCheckInput;
  onUseExisting?: (match: HouseholdDuplicate) => void;
  onMatchesChange?: (count: number) => void;
  debounceMs?: number;
}

export const DuplicateHouseholdWarning: React.FC<DuplicateHouseholdWarningProps> = () => null;

export default DuplicateHouseholdWarning;
