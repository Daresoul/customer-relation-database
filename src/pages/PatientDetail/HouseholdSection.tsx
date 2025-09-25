import React from 'react';
import { Card, Typography, Empty, Descriptions, Tag, Space } from 'antd';
import { HomeOutlined, UserOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HouseholdSummary } from '../../types/patient';

const { Title, Text } = Typography;

interface HouseholdSectionProps {
  household?: HouseholdSummary;
}

export const HouseholdSection: React.FC<HouseholdSectionProps> = ({ household }) => {
  const { t } = useTranslation('patients');
  if (!household) {
    return (
      <Card
        style={{
          background: '#1f1f1f',
          borderColor: '#303030',
        }}
        title={
          <Title level={4} style={{ color: '#E6E6E6', margin: 0 }}>
            <HomeOutlined style={{ marginRight: 8 }} />
            {t('detail.householdInfo.title')}
          </Title>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary">
              {t('detail.householdInfo.noHousehold')}
            </Text>
          }
          style={{ padding: '40px 0' }}
        />
      </Card>
    );
  }

  const fullAddress = [
    household.address,
    household.city,
    household.postalCode
  ].filter(Boolean).join(', ');

  return (
    <Card
      style={{
        background: '#1f1f1f',
        borderColor: '#303030',
      }}
      title={
        <Title level={4} style={{ color: '#E6E6E6', margin: 0 }}>
          <HomeOutlined style={{ marginRight: 8 }} />
          {t('detail.householdInfo.title')}
        </Title>
      }
    >
      <Descriptions
        column={{ xs: 1, sm: 1, md: 1, lg: 2, xl: 2 }}
        styles={{
          label: {
            background: '#262626',
            color: '#A6A6A6',
            width: '140px',
            minWidth: '120px',
            maxWidth: '160px'
          },
          content: { background: '#1f1f1f', color: '#E6E6E6' }
        }}
        bordered
      >
        <Descriptions.Item label={t('detail.householdInfo.householdName')}>
          <Link to={`/households/${household.id}`} style={{ color: '#4A90E2' }}>
            {household.householdName}
          </Link>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.householdInfo.address')}>
          <Text style={{ color: '#E6E6E6' }}>{fullAddress || '-'}</Text>
        </Descriptions.Item>

        {household.primaryContact && (
          <>
            <Descriptions.Item label={t('detail.householdInfo.primaryContact')}>
              <Space>
                <UserOutlined />
                <Text style={{ color: '#E6E6E6' }}>
                  {household.primaryContact.firstName} {household.primaryContact.lastName}
                </Text>
                <Tag color="blue">{t('detail.householdInfo.primary')}</Tag>
              </Space>
            </Descriptions.Item>

            {household.primaryContact.contacts && household.primaryContact.contacts.length > 0 && (
              <Descriptions.Item label={t('detail.householdInfo.contactInfo')}>
                <Space direction="vertical" size="small">
                  {household.primaryContact.contacts.map((contact) => (
                    <Space key={contact.id}>
                      {contact.type === 'phone' || contact.type === 'mobile' ? (
                        <PhoneOutlined style={{ color: '#A6A6A6' }} />
                      ) : (
                        <MailOutlined style={{ color: '#A6A6A6' }} />
                      )}
                      <Text style={{ color: '#E6E6E6' }}>
                        {contact.value}
                      </Text>
                      {contact.isPrimary && (
                        <Tag color="green" style={{ marginLeft: 8 }}>{t('detail.householdInfo.primary')}</Tag>
                      )}
                    </Space>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
          </>
        )}

        {household.people && household.people.length > 1 && (
          <Descriptions.Item label={t('detail.householdInfo.otherMembers')}>
            <Space wrap>
              {household.people
                .filter(person => !person.isPrimary)
                .map(person => (
                  <Tag key={person.id} style={{ background: '#262626', borderColor: '#303030', color: '#E6E6E6' }}>
                    {person.firstName} {person.lastName}
                  </Tag>
                ))}
            </Space>
          </Descriptions.Item>
        )}
      </Descriptions>

      <div style={{ marginTop: 16 }}>
        <Link to={`/households/${household.id}`}>
          <Text style={{ color: '#4A90E2' }}>
            {t('detail.householdInfo.viewDetails')}
          </Text>
        </Link>
      </div>
    </Card>
  );
};