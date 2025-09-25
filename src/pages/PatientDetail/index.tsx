import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Spin, Alert, Button, Space, Breadcrumb, Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
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
import { useThemeColors } from '../../utils/themeStyles';

const { Content } = Layout;

export const PatientDetail: React.FC = () => {
  const { t } = useTranslation(['patients', 'common', 'navigation']);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const patientId = parseInt(id || '0', 10);
  const themeColors = useThemeColors();

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
      <Content style={{ padding: 24, background: themeColors.background }}>
        <Alert
          message={t('patients:errors.invalidId')}
          description={t('patients:errors.invalidIdDescription')}
          type="error"
          showIcon
          action={
            <Button onClick={() => navigate('/')}>
              {t('navigation:backToDashboard')}
            </Button>
          }
        />
      </Content>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Content style={{ padding: 24, textAlign: 'center', background: themeColors.background, minHeight: '100vh' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: themeColors.text }}>{t('patients:loadingPatient')}</div>
      </Content>
    );
  }

  // Error state
  if (error) {
    return (
      <Content style={{ padding: 24, background: themeColors.background }}>
        <Alert
          message={t('patients:errors.loadingError')}
          description={error instanceof Error ? error.message : t('patients:errors.loadingErrorDescription')}
          type="error"
          showIcon
          action={
            <Space>
              <Button onClick={() => window.location.reload()}>
                {t('common:retry')}
              </Button>
              <Button onClick={() => navigate('/')}>
                {t('navigation:backToDashboard')}
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
      <Content style={{ padding: 24, background: themeColors.background }}>
        <Alert
          message={t('patients:errors.notFound')}
          description={t('patients:errors.notFoundDescription')}
          type="warning"
          showIcon
          action={
            <Button onClick={() => navigate('/')}>
              {t('navigation:backToDashboard')}
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
          {t('navigation:overview')}
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
          {t('navigation:medicalHistory')}
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
      style={{ padding: 24, background: themeColors.background, minHeight: '100vh' }}
    >
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            {
              title: <Link to="/" style={{ color: '#4A90E2' }}><HomeOutlined /> {t('navigation:home')}</Link>,
            },
            {
              title: <Link to="/" style={{ color: '#4A90E2' }}>{t('navigation:dashboard')}</Link>,
            },
            {
              title: <span style={{ color: themeColors.text }}>{patient.name}</span>,
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
          {t('common:back')}
        </Button>
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={handleDelete}
          loading={isDeleting}
          style={{ float: 'right' }}
        >
          {t('patients:deletePatient')}
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