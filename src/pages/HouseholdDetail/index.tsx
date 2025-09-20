import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Spin, Alert, Button, Space, Breadcrumb } from 'antd';
import { ArrowLeftOutlined, HomeOutlined } from '@ant-design/icons';
import { useHouseholdDetail, useHouseholdPatients } from '../../hooks/useHousehold';
import { HouseholdInfo } from './HouseholdInfo';
import { PeopleSection } from './PeopleSection';
import { AnimalsSection } from './AnimalsSection';
import { Link } from 'react-router-dom';

const { Content } = Layout;

export const HouseholdDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const householdId = parseInt(id || '0', 10);

  const { data, isLoading, error } = useHouseholdDetail(householdId);
  const { data: patients = [], isLoading: patientsLoading, error: patientsError } = useHouseholdPatients(householdId);

  console.log(`HouseholdDetail: Loading patients for household ${householdId}:`, { patients, patientsLoading, patientsError });

  if (!id || isNaN(householdId)) {
    return (
      <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
        <Alert
          message="Invalid Household ID"
          description="The household ID provided is not valid."
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

  if (isLoading) {
    return (
      <Content style={{ padding: 24, textAlign: 'center', background: '#141414', minHeight: '100vh' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>Loading household details...</div>
      </Content>
    );
  }

  if (error) {
    return (
      <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
        <Alert
          message="Error Loading Household"
          description={error instanceof Error ? error.message : 'Failed to load household details'}
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

  if (!data) {
    return (
      <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
        <Alert
          message="Household Not Found"
          description="The requested household could not be found."
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

  return (
    <Content style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            {
              title: <Link to="/"><HomeOutlined /> Home</Link>,
            },
            {
              title: <Link to="/">Dashboard</Link>,
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
          Back to Households
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