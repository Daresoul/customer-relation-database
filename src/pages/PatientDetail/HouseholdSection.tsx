import React from 'react';
import { Card, Typography, Empty, Descriptions, Tag, Space } from 'antd';
import { HomeOutlined, UserOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HouseholdSummary } from '../../types/patient';
import styles from './PatientDetail.module.css';

const { Title, Text } = Typography;

interface HouseholdSectionProps {
  household?: HouseholdSummary;
}

export const HouseholdSection: React.FC<HouseholdSectionProps> = ({ household }) => {
  const { t } = useTranslation('patients');
  if (!household) {
    return (
      <Card
        className={styles.householdCard}
        title={
          <Title level={4} className={styles.householdTitle}>
            <HomeOutlined className={styles.householdIcon} />
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
          className={styles.emptyHousehold}
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
      className={styles.householdCard}
      title={
        <Title level={4} className={styles.householdTitle}>
          <HomeOutlined className={styles.householdIcon} />
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
          <Link to={`/households/${household.id}`} className={styles.householdLink}>
            {household.householdName}
          </Link>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.householdInfo.address')}>
          <Text className={styles.householdText}>{fullAddress || '-'}</Text>
        </Descriptions.Item>

        {household.primaryContact && (
          <>
            <Descriptions.Item label={t('detail.householdInfo.primaryContact')}>
              <Space>
                <UserOutlined />
                <Text className={styles.householdText}>
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
                        <PhoneOutlined className={styles.contactIcon} />
                      ) : (
                        <MailOutlined className={styles.contactIcon} />
                      )}
                      <Text className={styles.householdText}>
                        {contact.value}
                      </Text>
                      {contact.isPrimary && (
                        <Tag color="green" className={styles.primaryTag}>{t('detail.householdInfo.primary')}</Tag>
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
                  <Tag key={person.id} className={styles.memberTag}>
                    {person.firstName} {person.lastName}
                  </Tag>
                ))}
            </Space>
          </Descriptions.Item>
        )}
      </Descriptions>

      <div className={styles.householdFooter}>
        <Link to={`/households/${household.id}`}>
          <Text className={styles.householdLink}>
            {t('detail.householdInfo.viewDetails')}
          </Text>
        </Link>
      </div>
    </Card>
  );
};