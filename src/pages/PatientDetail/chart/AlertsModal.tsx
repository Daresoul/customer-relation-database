import React, { useEffect, useState } from 'react';
import { Button, Empty, Form, Input, List, Modal, Popconfirm, Radio, Space } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { PatientAlert } from '../../../types';
import { AlertChips } from '../../../components/patient/AlertChips';
import { useDeleteAlert, useSaveAlert } from '../../../hooks/usePatientChart';

const ALERT_TYPES = ['allergy', 'aggressive', 'chronic', 'other'] as const;
const NOTE_MAX = 200;

interface AlertsModalProps {
  open: boolean;
  patient: { id: number; name: string; alerts?: PatientAlert[] | null };
  onClose: () => void;
}

/** A short, typed list kept by staff: allergy, aggressive, chronic condition, other. */
export const AlertsModal: React.FC<AlertsModalProps> = ({ open, patient, onClose }) => {
  const { t } = useTranslation(['patients', 'common']);
  const saveAlert = useSaveAlert();
  const deleteAlert = useDeleteAlert();
  const [editing, setEditing] = useState<number | undefined>();
  const [alertType, setAlertType] = useState<string>('allergy');
  const [note, setNote] = useState('');
  const alerts = patient.alerts ?? [];

  const reset = () => {
    setEditing(undefined);
    setAlertType('allergy');
    setNote('');
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  const save = async () => {
    try {
      await saveAlert.mutateAsync({
        patientId: patient.id,
        alertId: editing,
        alertType,
        note: note.trim() || null,
      });
      reset();
    } catch {
      // the hook explains the failure; the form keeps what was typed
    }
  };

  const edit = (alert: PatientAlert) => {
    setEditing(alert.id);
    setAlertType(alert.alertType);
    setNote(alert.note ?? '');
  };

  return (
    <Modal
      open={open}
      title={t('patients:chart.alerts.title', { name: patient.name })}
      footer={<Button onClick={onClose}>{t('common:buttons.close')}</Button>}
      onCancel={onClose}
      destroyOnHidden
    >
      {alerts.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('patients:chart.alerts.none')} />
      ) : (
        <List
          size="small"
          dataSource={alerts}
          rowKey="id"
          renderItem={(alert) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label={t('patients:chart.alerts.edit')}
                  onClick={() => edit(alert)}
                />,
                <Popconfirm
                  key="remove"
                  title={t('patients:chart.alerts.removeConfirm')}
                  okText={t('common:delete')}
                  cancelText={t('common:cancel')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => deleteAlert.mutateAsync({ id: alert.id }).then(() => {
                    if (editing === alert.id) reset();
                  }).catch(() => {})}
                >
                  <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={t('patients:chart.alerts.remove')} />
                </Popconfirm>,
              ]}
            >
              <AlertChips alerts={[alert]} />
            </List.Item>
          )}
        />
      )}

      <Form layout="vertical" style={{ marginTop: 16 }} onFinish={save}>
        <Form.Item label={t('patients:chart.alerts.type')}>
          <Radio.Group value={alertType} onChange={(e) => setAlertType(e.target.value)}>
            <Space direction="vertical">
              {ALERT_TYPES.map((type) => (
                <Radio key={type} value={type}>
                  {t(`patients:chart.alerts.types.${type}`)}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t('patients:chart.alerts.note')}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('patients:chart.alerts.notePlaceholder')}
            maxLength={NOTE_MAX}
            showCount
          />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={saveAlert.isPending}>
            {editing ? t('patients:chart.alerts.save') : t('patients:chart.alerts.add')}
          </Button>
          {editing && <Button onClick={reset}>{t('common:cancel')}</Button>}
        </Space>
      </Form>
    </Modal>
  );
};

export default AlertsModal;
