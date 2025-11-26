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
import { DeviceStatusInline } from '../../components/DeviceStatusBar';
import styles from './PatientDetail.module.css';

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
      <Content className={styles.container}>
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
      <Content className={`${styles.container} ${styles.loadingContainer}`}>
        <Spin size="large" />
        <div className={styles.loadingText}>{t('patients:loadingPatient')}</div>
      </Content>
    );
  }

  // Error state
  if (error) {
    return (
      <Content className={styles.container}>
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
      <Content className={styles.container}>
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
        <div className={styles.tabContent}>
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
      className={styles.container}
    >
      <div className={styles.section}>
        <div className={styles.breadcrumbRow}>
          <Breadcrumb
            items={[
              {
                title: <Link to="/" className={styles.breadcrumbLink}><HomeOutlined /> {t('navigation:home')}</Link>,
              },
              {
                title: <span className={styles.breadcrumbCurrent}>{patient.name}</span>,
              },
            ]}
          />
          <DeviceStatusInline />
        </div>
      </div>

      <div className={styles.header}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
          className={styles.backButton}
        >
          {t('common:back')}
        </Button>
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={handleDelete}
          loading={isDeleting}
          className={styles.deleteButton}
        >
          {t('patients:deletePatient')}
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        className={styles.tabs}
      />
    </Content>
  );
};