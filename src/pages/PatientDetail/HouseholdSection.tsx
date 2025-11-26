import React, { useState } from 'react';
import { Card, Typography, Empty, Descriptions, Tag, Space, Button, Select, App } from 'antd';
import { HomeOutlined, UserOutlined, PhoneOutlined, MailOutlined, PlusOutlined, SwapOutlined, DisconnectOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HouseholdSummary } from '../../types/patient';
import { PatientService } from '../../services/patientService';
import { invoke } from '@tauri-apps/api/tauri';
import styles from './PatientDetail.module.css';

const { Title, Text } = Typography;
const { Option } = Select;

interface HouseholdSectionProps {
  household?: HouseholdSummary;
  patientId?: number;
  onHouseholdChanged?: () => void;
}

export const HouseholdSection: React.FC<HouseholdSectionProps> = ({ household, patientId, onHouseholdChanged }) => {
  const { t } = useTranslation('patients');
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch all households for the select dropdown
  const { data: allHouseholds = [], isLoading: isLoadingHouseholds } = useQuery({
    queryKey: ['all-households'],
    queryFn: () => invoke<any[]>('get_all_households', { limit: 1000 }),
    enabled: isAssigning,
  });

  const handleAssignHousehold = async () => {
    if (!selectedHouseholdId || !patientId) return;

    setIsLoading(true);
    try {
      await PatientService.updatePatientHousehold(patientId, selectedHouseholdId);
      notification.success({
        message: t('detail.householdInfo.assignSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      setIsAssigning(false);
      setSelectedHouseholdId(null);
      // Invalidate patient query to refresh
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      onHouseholdChanged?.();
    } catch (error) {
      notification.error({
        message: t('detail.householdInfo.assignFailed'),
        description: String(error),
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlinkHousehold = async () => {
    if (!patientId) return;

    setIsLoading(true);
    try {
      await PatientService.updatePatientHousehold(patientId, null);
      notification.success({
        message: t('detail.householdInfo.unlinkSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      onHouseholdChanged?.();
    } catch (error) {
      notification.error({
        message: t('detail.householdInfo.unlinkFailed'),
        description: String(error),
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setIsLoading(false);
    }
  };

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
        {isAssigning ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              placeholder={t('detail.householdInfo.selectHousehold')}
              style={{ width: '100%' }}
              loading={isLoadingHouseholds}
              showSearch
              optionFilterProp="children"
              onChange={(value) => setSelectedHouseholdId(value)}
              value={selectedHouseholdId}
            >
              {allHouseholds.map((h: any) => (
                <Option key={h.household?.id || h.id} value={h.household?.id || h.id}>
                  {h.household?.householdName || h.householdName || h.household?.household_name || 'Unknown'}
                </Option>
              ))}
            </Select>
            <Space>
              <Button
                type="primary"
                onClick={handleAssignHousehold}
                loading={isLoading}
                disabled={!selectedHouseholdId}
              >
                {t('detail.householdInfo.assign')}
              </Button>
              <Button onClick={() => { setIsAssigning(false); setSelectedHouseholdId(null); }}>
                {t('common:cancel')}
              </Button>
            </Space>
          </Space>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary">
                {t('detail.householdInfo.noHousehold')}
              </Text>
            }
            className={styles.emptyHousehold}
          >
            {patientId && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsAssigning(true)}>
                {t('detail.householdInfo.assignHousehold')}
              </Button>
            )}
          </Empty>
        )}
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