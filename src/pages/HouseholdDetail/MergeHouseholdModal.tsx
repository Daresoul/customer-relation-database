import React from 'react';

export interface MergeHouseholdModalProps {
  open: boolean;
  householdId: number;
  onClose: () => void;
  onMerged?: () => void;
}

export const MergeHouseholdModal: React.FC<MergeHouseholdModalProps> = () => null;
