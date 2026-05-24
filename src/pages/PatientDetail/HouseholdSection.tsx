import React, { useState } from 'react';
import { Card, Typography, Descriptions, Tag, Space, Button, Select, App } from 'antd';
import { HomeOutlined, UserOutlined, PhoneOutlined, MailOutlined, PlusOutlined, SwapOutlined, DisconnectOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HouseholdSummary } from '../../types/patient';
import { PatientService } from '../../services/patientService';
import { invoke } from '@/services/invoke';
import { CreateHouseholdInline, type CreatedHousehold } from '../../components/forms/CreateHouseholdInline';
import styles from './PatientDetail.module.css';

const { Title, Text } = Typography;
const { Option } = Select;

// The empty-state UI has only two modes:
//   - 'pick'    — the default. Shows the household dropdown plus an
//                 inline "Create new" escape hatch. There's nothing to
//                 cancel from here (the user hasn't started anything),
//                 so the previous "Cancel" button has been removed.
//   - 'create'  — shows the inline create-household form. Its own
//                 Cancel returns to 'pick'.
type AssignMode = 'pick' | 'create';

interface HouseholdSectionProps {
  household?: HouseholdSummary;
  patientId?: number;
  onHouseholdChanged?: () => void;
}

export const HouseholdSection: React.FC<HouseholdSectionProps> = ({ household, patientId, onHouseholdChanged }) => {
  const { t } = useTranslation('patients');
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AssignMode>('pick');
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch all households for the select dropdown. Enabled whenever we
  // might show the dropdown — which is the default 'pick' mode for an
  // unassigned patient. (Once a household IS assigned, the section
  // renders the read-only summary instead and we never reach here.)
  const { data: allHouseholds = [], isLoading: isLoadingHouseholds } = useQuery({
    queryKey: ['all-households'],
    queryFn: () => invoke<any[]>('get_all_households', { limit: 1000 }),
    enabled: !household && mode === 'pick',
  });

  const resetForm = () => {
    setMode('pick');
    setSelectedHouseholdId(null);
  };

  const assignPatientToHousehold = async (householdId: number) => {
    if (!patientId) return;
    await PatientService.updatePatientHousehold(patientId, householdId);
    notification.success({
      message: t('detail.householdInfo.assignSuccess'),
      placement: 'bottomRight',
      duration: 3,
    });
    resetForm();
    queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
    queryClient.invalidateQueries({ queryKey: ['all-households'] });
    onHouseholdChanged?.();
  };

  const handleAssignHousehold = async () => {
    if (!selectedHouseholdId || !patientId) return;

    setIsLoading(true);
    try {
      await assignPatientToHousehold(selectedHouseholdId);
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

  // CreateHouseholdInline already calls create_household and surfaces
  // creation errors via notification. After it succeeds we just chain
  // the assign step so the new household lands on the current patient.
  const handleHouseholdCreated = async (newHousehold: CreatedHousehold) => {
    if (!patientId) {
      // Edge case: no patient context — just close the form. Shouldn't
      // happen in practice because the section only renders the create
      // button when patientId is defined.
      resetForm();
      return;
    }
    setIsLoading(true);
    try {
      await assignPatientToHousehold(newHousehold.id);
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
        {mode === 'pick' && patientId && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">
              {t('detail.householdInfo.noHousehold')}
            </Text>
            <Select
              placeholder={t('detail.householdInfo.selectHousehold')}
              style={{ width: '100%' }}
              loading={isLoadingHouseholds}
              showSearch
              optionFilterProp="children"
              onChange={(value) => setSelectedHouseholdId(value)}
              value={selectedHouseholdId}
              allowClear
            >
              {allHouseholds.map((h: any) => (
                <Option key={h.household?.id || h.id} value={h.household?.id || h.id}>
                  {h.household?.householdName || h.householdName || h.household?.household_name || 'Unknown'}
                </Option>
              ))}
            </Select>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAssignHousehold}
                loading={isLoading}
                disabled={!selectedHouseholdId}
              >
                {t('detail.householdInfo.assign')}
              </Button>
              <Button
                icon={<HomeOutlined />}
                onClick={() => setMode('create')}
                disabled={isLoading}
              >
                {t('detail.householdInfo.createNew', 'Create new')}
              </Button>
            </Space>
          </Space>
        )}

        {mode === 'create' && (
          <CreateHouseholdInline
            onCreated={handleHouseholdCreated}
            onCancel={resetForm}
            disabled={isLoading}
            submitLabel={t('detail.householdInfo.createAndAssign', 'Create and assign')}
          />
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