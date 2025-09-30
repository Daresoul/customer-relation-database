import React, { useState } from 'react';
import { Card, Typography, Input, Space, Spin, App } from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { PatientDetail, PATIENT_FIELD_RULES } from '../../types/patient';
import { useUpdatePatient } from '../../hooks/usePatient';
import styles from './PatientDetail.module.css';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface MedicalSectionProps {
  patient: PatientDetail;
}

export const MedicalSection: React.FC<MedicalSectionProps> = ({ patient }) => {
  const { message } = App.useApp();
  const updatePatient = useUpdatePatient();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(patient.notes || '');
  const [error, setError] = useState<string>('');

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(patient.notes || '');
    setError('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(patient.notes || '');
    setError('');
  };

  const handleSave = async () => {
    // Validate
    if (editValue.length > PATIENT_FIELD_RULES.medicalNotes.max) {
      setError(PATIENT_FIELD_RULES.medicalNotes.message);
      return;
    }

    try {
      await updatePatient.mutateAsync({
        patientId: patient.id,
        updates: { notes: editValue || null }
      });
      setIsEditing(false);
      setError('');
    } catch (error) {
      console.error('Failed to save medical notes:', error);
    }
  };

  const characterCount = editValue.length;
  const maxCharacters = PATIENT_FIELD_RULES.medicalNotes.max;

  return (
    <Card
      className={styles.medicalCard}
      title={
        <Title level={4} className={styles.medicalTitle}>
          Medical Notes
        </Title>
      }
      extra={
        !isEditing ? (
          <EditOutlined
            onClick={handleEdit}
            className={`${styles.iconButton} ${styles.editIcon}`}
          />
        ) : (
          <Space>
            <SaveOutlined
              onClick={handleSave}
              className={`${styles.iconButton} ${styles.saveIcon}`}
            />
            <CloseOutlined
              onClick={handleCancel}
              className={`${styles.iconButton} ${styles.cancelIcon}`}
            />
          </Space>
        )
      }
    >
      {updatePatient.isPending ? (
        <div className={styles.loadingContainer}>
          <Spin />
        </div>
      ) : isEditing ? (
        <div>
          <TextArea
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              if (e.target.value.length > maxCharacters) {
                setError(PATIENT_FIELD_RULES.medicalNotes.message);
              } else {
                setError('');
              }
            }}
            placeholder="Enter medical notes, conditions, and observations..."
            autoSize={{ minRows: 6, maxRows: 15 }}
            className={`${styles.medicalTextArea} ${error ? styles.textAreaError : styles.textAreaNormal}`}
          />
          <div className={styles.characterCountRow}>
            <div>
              {error && <Text type="danger" className={styles.smallText}>{error}</Text>}
            </div>
            <Text
              type={characterCount > maxCharacters ? 'danger' : 'secondary'}
              className={styles.smallText}
            >
              {characterCount} / {maxCharacters} characters
            </Text>
          </div>
          <div className={styles.helpText}>
            <Text type="secondary" className={styles.smallText}>
              Double-click or press the edit icon to edit. Changes auto-save on blur.
            </Text>
          </div>
        </div>
      ) : (
        <div
          onDoubleClick={handleEdit}
          className={`${styles.notesDisplay} ${!patient.notes ? styles.notesDisplayEmpty : ''}`}
        >
          {patient.notes ? (
            <Text className={styles.notesText}>{patient.notes}</Text>
          ) : (
            <Text type="secondary" className={styles.emptyNotesText}>
              No medical notes recorded. Double-click to add notes.
            </Text>
          )}
        </div>
      )}
    </Card>
  );
};