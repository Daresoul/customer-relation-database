import React, { useEffect, useState } from 'react';
import { Form, Input, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useMarkInactive } from '../../../hooks/usePatientChart';

interface MarkInactiveModalProps {
  open: boolean;
  patient: { id: number; name: string };
  onClose: () => void;
}

export const MarkInactiveModal: React.FC<MarkInactiveModalProps> = ({ open, patient, onClose }) => {
  const { t } = useTranslation(['patients', 'common']);
  const markInactive = useMarkInactive();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const confirm = async () => {
    try {
      await markInactive.mutateAsync({ id: patient.id, name: patient.name, reason: reason.trim() || null });
      onClose();
    } catch {
      // the hook explains the failure
    }
  };

  return (
    <Modal
      open={open}
      title={t('patients:chart.inactive.title', { name: patient.name })}
      okText={t('patients:chart.inactive.confirm')}
      cancelText={t('common:cancel')}
      confirmLoading={markInactive.isPending}
      onOk={confirm}
      onCancel={onClose}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{t('patients:chart.inactive.hint')}</Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label={t('patients:chart.inactive.reason')}>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('patients:chart.inactive.reasonPlaceholder')}
            maxLength={200}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default MarkInactiveModal;
