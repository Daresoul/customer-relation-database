import React, { useCallback, useState } from 'react';
import { Alert, App, Form, Modal, Select, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { usePatients } from '@/hooks/usePatients';
import { useMoveLabResult } from '@/hooks/useLabInbox';
import { MedicalService } from '@/services/medicalService';
import type { LabMoveOutcome } from '@/types/labInbox';
import PatientRecordSelect, { NEW_RECORD } from './PatientRecordSelect';

interface MoveLabResultModalProps {
  open: boolean;
  attachmentId?: number;
  fileName?: string;
  currentPatientId?: number;
  onClose: () => void;
  onMoved?: (outcome: LabMoveOutcome) => void;
}

/**
 * Move a lab result that went to the wrong patient: it leaves its record
 * (soft-deleted with that record's lab report), goes onto the chosen
 * patient's record, and the lab report is rebuilt there.
 */
const MoveLabResultModal: React.FC<MoveLabResultModalProps> = ({
  open,
  attachmentId,
  fileName,
  currentPatientId,
  onClose,
  onMoved,
}) => {
  const { t } = useTranslation(['devices', 'common']);
  const { notification } = App.useApp();
  const { patients, loading: patientsLoading } = usePatients();
  const move = useMoveLabResult();
  const [patientId, setPatientId] = useState<number | undefined>();
  const [recordId, setRecordId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const onRecordChange = useCallback((id?: number) => setRecordId(id), []);

  const samePatient = patientId !== undefined && patientId === currentPatientId;
  const canMove = !!attachmentId && !!patientId && recordId !== undefined && !samePatient;

  const close = () => {
    setPatientId(undefined);
    setRecordId(undefined);
    setError(null);
    onClose();
  };

  const handleMove = async () => {
    if (!canMove || !attachmentId || !patientId || recordId === undefined) return;
    setSaving(true);
    setError(null);
    try {
      let target = recordId;
      if (target === NEW_RECORD) {
        const created = await MedicalService.createMedicalRecord({
          patientId,
          recordType: 'test_result',
          name: t('devices:inbox.movedRecordTitle'),
          description: t('devices:inbox.movedRecordDescription', { file: fileName ?? '' }),
        });
        target = created.id;
      }
      const outcome = await move.mutateAsync({ attachmentId, targetRecordId: target });
      const pdfFailed = outcome.pdfs.some((p) => !p.ok);
      if (pdfFailed) {
        notification.warning({ message: t('devices:inbox.moved'), description: t('devices:inbox.movedPdfFailed'), duration: 0 });
      } else {
        notification.success({ message: t('devices:inbox.moved') });
      }
      onMoved?.(outcome);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('devices:inbox.moveTitle')}
      okText={t('devices:inbox.moveConfirm')}
      cancelText={t('common:buttons.cancel')}
      onOk={handleMove}
      onCancel={close}
      okButtonProps={{ disabled: !canMove, loading: saving }}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">{t('devices:inbox.moveHelp', { file: fileName ?? '' })}</Typography.Text>
        <Form layout="vertical">
          <Form.Item label={t('devices:inbox.movePatient')}>
            <Select
              data-testid="move-patient-select"
              showSearch
              optionFilterProp="label"
              loading={patientsLoading}
              value={patientId}
              onChange={(id: number) => {
                setPatientId(id);
                setRecordId(undefined);
              }}
              placeholder={t('devices:inbox.pickPatient')}
              options={patients.map((p) => ({
                value: p.id,
                label: [p.name, p.species, p.microchipId ? `…${String(p.microchipId).slice(-4)}` : null]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
          </Form.Item>
          {samePatient && <Alert type="info" showIcon message={t('devices:inbox.samePatient')} />}
          {patientId && !samePatient && (
            <Form.Item label={t('devices:inbox.moveRecord')}>
              <PatientRecordSelect key={patientId} patientId={patientId} value={recordId} onChange={onRecordChange} allowNew />
            </Form.Item>
          )}
        </Form>
        {error && <Alert type="error" showIcon message={t('devices:inbox.moveFailed')} description={error} />}
      </Space>
    </Modal>
  );
};

export default MoveLabResultModal;
