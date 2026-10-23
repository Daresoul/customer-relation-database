import React from 'react';
import type { PatientDetail } from '../../../types/patient';

interface PatientBannerProps {
  patient: PatientDetail;
  onDelete: () => void;
}

export const PatientBanner: React.FC<PatientBannerProps> = () => null;
