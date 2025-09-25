import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Spin, Alert, Button, Space, Breadcrumb } from 'antd';
import { ArrowLeftOutlined, HomeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useHouseholdDetail, useHouseholdPatients } from '../../hooks/useHousehold';
import { HouseholdInfo } from './HouseholdInfo';
import { PeopleSection } from './PeopleSection';
import { AnimalsSection } from './AnimalsSection';
import { Link } from 'react-router-dom';

const { Content } = Layout;

export const HouseholdDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('households');
  const householdId = parseInt(id || '0', 10);

  const { data, isLoading, error } = useHouseholdDetail(householdId);
  const { data: patients = [], isLoading: patientsLoading, error: patientsError } = useHouseholdPatients(householdId);

  console.log(`HouseholdDetail: Loading patients for household ${householdId}:`, { patients, patientsLoading, patientsError });

  if (!id || isNaN(householdId)) {
    return (
      <Content style={{ padding: 24, background: '#141414' }}>
        <Alert
          message={t('detail.invalidId')}
          description={t('detail.invalidIdDescription')}
          type="error"
          showIcon
          action={
            <Button onClick={() => navigate('/')}>
              {t('detail.backToDashboard')}
            </Button>
          }
        />
      </Content>
    );
  }

  if (isLoading) {
    return (
      <Content style={{ padding: 24, textAlign: 'center', background: '#141414' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>{t('detail.loading')}</div>
      </Content>
    );
  }

  if (error) {
    return (
      <Content style={{ padding: 24, background: '#141414' }}>
        <Alert
          message={t('detail.errorLoading')}
          description={error instanceof Error ? error.message : t('detail.failedToLoad')}
          type="error"
          showIcon
          action={
            <Space>
              <Button onClick={() => window.location.reload()}>
                {t('detail.retry')}
              </Button>
              <Button onClick={() => navigate('/')}>
                {t('detail.backToDashboard')}
              </Button>
            </Space>
          }
        />
      </Content>
    );
  }

  if (!data) {
    return (
      <Content style={{ padding: 24, background: '#141414' }}>
        <Alert
          message={t('detail.notFound')}
          description={t('detail.notFoundDescription')}
          type="warning"
          showIcon
          action={
            <Button onClick={() => navigate('/')}>
              {t('detail.backToDashboard')}
            </Button>
          }
        />
      </Content>
    );
  }

  return (
    <Content style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            {
              title: <Link to="/"><HomeOutlined /> {t('detail.breadcrumb.home')}</Link>,
            },
            {
              title: <Link to="/">{t('detail.breadcrumb.dashboard')}</Link>,
            },
            {
              title: data.household.householdName || `Household ${householdId}`,
            },
          ]}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          {t('detail.backToHouseholds')}
        </Button>
      </div>

      <div style={{ background: '#1f1f1f', padding: 24, borderRadius: 8 }}>
        <HouseholdInfo household={data.household} />

        <PeopleSection
          people={data.people}
          householdId={householdId}
        />

        <AnimalsSection
          patients={patients}
          householdId={householdId}
        />
      </div>
    </Content>
  );
};