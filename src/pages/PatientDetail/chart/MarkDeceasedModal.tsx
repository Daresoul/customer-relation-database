import React from 'react';

interface MarkDeceasedModalProps {
  open: boolean;
  patient: { id: number; name: string };
  onClose: () => void;
}

export const MarkDeceasedModal: React.FC<MarkDeceasedModalProps> = () => null;
