import React, { useState } from 'react';
import { Card, Typography, Input, Space, Spin, App } from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { PatientDetail, PATIENT_FIELD_RULES } from '../../types/patient';
import { useUpdatePatient } from '../../hooks/usePatient';

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
      style={{
        background: '#1f1f1f',
        borderColor: '#303030',
      }}
      title={
        <Title level={4} style={{ color: '#E6E6E6', margin: 0 }}>
          Medical Notes
        </Title>
      }
      extra={
        !isEditing ? (
          <EditOutlined
            onClick={handleEdit}
            style={{ color: '#4A90E2', cursor: 'pointer', fontSize: 16 }}
          />
        ) : (
          <Space>
            <SaveOutlined
              onClick={handleSave}
              style={{ color: '#52c41a', cursor: 'pointer', fontSize: 16 }}
            />
            <CloseOutlined
              onClick={handleCancel}
              style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 16 }}
            />
          </Space>
        )
      }
    >
      {updatePatient.isPending ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
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
            style={{
              background: '#262626',
              borderColor: error ? '#ff4d4f' : '#303030',
              color: '#E6E6E6',
            }}
          />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <div>
              {error && <Text type="danger" style={{ fontSize: 12 }}>{error}</Text>}
            </div>
            <Text
              type={characterCount > maxCharacters ? 'danger' : 'secondary'}
              style={{ fontSize: 12 }}
            >
              {characterCount} / {maxCharacters} characters
            </Text>
          </div>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Double-click or press the edit icon to edit. Changes auto-save on blur.
            </Text>
          </div>
        </div>
      ) : (
        <div
          onDoubleClick={handleEdit}
          style={{
            minHeight: 100,
            padding: patient.notes ? 0 : 16,
            cursor: 'text',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {patient.notes ? (
            <Text style={{ color: '#E6E6E6' }}>{patient.notes}</Text>
          ) : (
            <Text type="secondary" style={{ fontStyle: 'italic' }}>
              No medical notes recorded. Double-click to add notes.
            </Text>
          )}
        </div>
      )}
    </Card>
  );
};