import React from 'react';
import type { LabMoveOutcome } from '@/types/labInbox';

interface MoveLabResultModalProps {
  open: boolean;
  attachmentId?: number;
  fileName?: string;
  currentPatientId?: number;
  onClose: () => void;
  onMoved?: (outcome: LabMoveOutcome) => void;
}

const MoveLabResultModal: React.FC<MoveLabResultModalProps> = () => null;

export default MoveLabResultModal;
