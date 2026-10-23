import React, { useState } from 'react';
import { Button, Card, Input, Space, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useUpdatePatient } from '../../../hooks/usePatient';
import { PATIENT_FIELD_RULES } from '../../../types/patient';
import styles from './PatientChart.module.css';

const { Text } = Typography;

interface Props {
  patientId: number;
  notes?: string | null;
}

/** Overview card: the patient's standing medical notes, editable in place. */
export const PatientNotesCard: React.FC<Props> = ({ patientId, notes }) => {
  const { t } = useTranslation(['patients', 'common']);
  const updatePatient = useUpdatePatient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(notes ?? '');
    setEditing(true);
  };

  const save = async () => {
    try {
      await updatePatient.mutateAsync({ patientId, updates: { notes: draft.trim() } });
      setEditing(false);
    } catch {
      // useUpdatePatient showed the error; the text stays for another try.
    }
  };

  return (
    <Card
      size="small"
      className={styles.overviewCard}
      title={t('patients:overview.notes.title')}
      extra={
        !editing && (
          <Button size="small" icon={<EditOutlined />} onClick={startEdit}>
            {t('patients:overview.notes.edit')}
          </Button>
        )
      }
    >
      {editing ? (
        <Space direction="vertical" className={styles.fullWidth}>
          <Input.TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoSize={{ minRows: 3, maxRows: 12 }}
            maxLength={PATIENT_FIELD_RULES.medicalNotes.max}
            showCount
            autoFocus
          />
          <Space>
            <Button type="primary" loading={updatePatient.isPending} onClick={save}>
              {t('common:save')}
            </Button>
            <Button onClick={() => setEditing(false)} disabled={updatePatient.isPending}>
              {t('common:cancel')}
            </Button>
          </Space>
        </Space>
      ) : notes ? (
        <Text className={styles.notesText}>{notes}</Text>
      ) : (
        <Text type="secondary">{t('patients:overview.notes.empty')}</Text>
      )}
    </Card>
  );
};

export default PatientNotesCard;
