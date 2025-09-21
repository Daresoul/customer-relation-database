import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Spin, Alert, Button, Space, Breadcrumb } from 'antd';
import { ArrowLeftOutlined, HomeOutlined, DeleteOutlined } from '@ant-design/icons';
import { usePatientDetail, useDeleteConfirmation } from '../../hooks/usePatient';
import { PatientInfo } from './PatientInfo';
import { MedicalSection } from './MedicalSection';
import { HouseholdSection } from './HouseholdSection';
import { Link } from 'react-router-dom';

const { Content } = Layout;

export const PatientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const patientId = parseInt(id || '0', 10);

  const { data: patient, isLoading, error } = usePatientDetail(patientId);
  const { showDeleteConfirm, isDeleting } = useDeleteConfirmation();

  // Invalid ID check
  if (!id || isNaN(patientId)) {
    return (
      <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
        <Alert
          message="Invalid Patient ID"
          description="The patient ID provided is not valid."
          type="error"
          showIcon
          action={
            <Button onClick={() => navigate('/')}>
              Back to Dashboard
            </Button>
          }
        />
      </Content>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Content style={{ padding: 24, textAlign: 'center', background: '#141414', minHeight: '100vh' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#E6E6E6' }}>Loading patient details...</div>
      </Content>
    );
  }

  // Error state
  if (error) {
    return (
      <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
        <Alert
          message="Error Loading Patient"
          description={error instanceof Error ? error.message : 'Failed to load patient details'}
          type="error"
          showIcon
          action={
            <Space>
              <Button onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button onClick={() => navigate('/')}>
                Back to Dashboard
              </Button>
            </Space>
          }
        />
      </Content>
    );
  }

  // Patient not found
  if (!patient) {
    return (
      <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
        <Alert
          message="Patient Not Found"
          description="The requested patient could not be found."
          type="warning"
          showIcon
          action={
            <Button onClick={() => navigate('/')}>
              Back to Dashboard
            </Button>
          }
        />
      </Content>
    );
  }

  const handleDelete = () => {
    showDeleteConfirm(patient.id, patient.name);
  };

  return (
    <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            {
              title: <Link to="/" style={{ color: '#4A90E2' }}><HomeOutlined /> Home</Link>,
            },
            {
              title: <Link to="/" style={{ color: '#4A90E2' }}>Dashboard</Link>,
            },
            {
              title: <span style={{ color: '#E6E6E6' }}>{patient.name}</span>,
            },
          ]}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ marginRight: 8 }}
        >
          Back
        </Button>
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={handleDelete}
          loading={isDeleting}
          style={{ float: 'right' }}
        >
          Delete Patient
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <PatientInfo patient={patient} />
        <MedicalSection patient={patient} />
        <HouseholdSection household={patient.household} />
      </div>
    </Content>
  );
};