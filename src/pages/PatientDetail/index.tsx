import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Spin, Alert, Button, Space, Breadcrumb, Tabs } from 'antd';
import {
  ArrowLeftOutlined,
  HomeOutlined,
  DeleteOutlined,
  UserOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { usePatientDetail, useDeleteConfirmation } from '../../hooks/usePatient';
import { PatientInfo } from './PatientInfo';
import { MedicalSection } from './MedicalSection';
import { HouseholdSection } from './HouseholdSection';
import MedicalHistorySection from './MedicalHistory/MedicalHistorySection';
import { Link } from 'react-router-dom';

const { Content } = Layout;

export const PatientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const patientId = parseInt(id || '0', 10);

  // Restore the active tab if returning from medical record detail
  const savedActiveTab = sessionStorage.getItem(`patient-detail-active-tab-${patientId}`);
  const [activeTab, setActiveTab] = useState(savedActiveTab || 'overview');

  // Clear the saved tab after using it
  useEffect(() => {
    if (savedActiveTab) {
      sessionStorage.removeItem(`patient-detail-active-tab-${patientId}`);
    }
  }, [savedActiveTab, patientId]);

  const { data: patient, isLoading, error } = usePatientDetail(patientId);
  const { showDeleteConfirm, isDeleting } = useDeleteConfirmation();

  // Restore scroll position when returning from medical record detail
  useEffect(() => {
    // Only restore scroll if we have patient data
    if (!patient) return;

    const savedScrollPosition = sessionStorage.getItem(`patient-detail-scroll-${patientId}`);
    if (savedScrollPosition) {
      const scrollTop = parseInt(savedScrollPosition, 10);
      // Small delay to ensure content is fully rendered
      setTimeout(() => {
        window.scrollTo(0, scrollTop);
        // Clear the saved position after restoring
        sessionStorage.removeItem(`patient-detail-scroll-${patientId}`);
      }, 100);
    }
  }, [patientId, patient]);

  // Invalid ID check
  if (!id || isNaN(patientId)) {
    return (
      <Content style={{ padding: 24, background: '#141414' }}>
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
      <Content style={{ padding: 24, background: '#141414' }}>
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
      <Content style={{ padding: 24, background: '#141414' }}>
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

  // Save scroll position before navigating away
  const handleNavigateToMedicalRecord = (recordId: number) => {
    // Save window scroll position
    sessionStorage.setItem(
      `patient-detail-scroll-${patientId}`,
      window.scrollY.toString()
    );
    // Save the current tab state
    sessionStorage.setItem(
      `patient-detail-active-tab-${patientId}`,
      activeTab
    );
    navigate(`/medical-records/${recordId}`);
  };

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span>
          <UserOutlined />
          Overview
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <PatientInfo patient={patient} />
          <HouseholdSection household={patient.household} />
        </div>
      ),
    },
    {
      key: 'medical-history',
      label: (
        <span>
          <MedicineBoxOutlined />
          Medical History
        </span>
      ),
      children: (
        <MedicalHistorySection
          patientId={patient.id}
          patientName={patient.name}
          onNavigateToRecord={handleNavigateToMedicalRecord}
        />
      ),
    },
  ];

  return (
    <Content
      style={{ padding: 24, background: '#141414', minHeight: '100vh' }}
    >
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

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        style={{
          background: 'transparent',
        }}
        tabBarStyle={{
          marginBottom: 24,
          borderBottom: '1px solid #303030',
        }}
      />
    </Content>
  );
};