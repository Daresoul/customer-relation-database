import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Spin, Alert, Button, Space, Breadcrumb, Dropdown, Modal, App, Typography } from 'antd';
import { ArrowLeftOutlined, HomeOutlined, DownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useHouseholdDetail, useHouseholdPatients } from '../../hooks/useHousehold';
import { useDeleteHouseholdById } from '../../hooks/useHouseholdActions';
import { knownErrorMessage } from '@/utils/errors';
import { HouseholdInfo } from './HouseholdInfo';
import { PeopleSection } from './PeopleSection';
import { AnimalsSection } from './AnimalsSection';
import { MergeHouseholdModal } from './MergeHouseholdModal';
import { Link } from 'react-router-dom';
import styles from './HouseholdDetail.module.css';

const { Content } = Layout;

export const HouseholdDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('households');
  const householdId = parseInt(id || '0', 10);

  const { data, isLoading, error, refetch } = useHouseholdDetail(householdId);
  const {
    data: patients = [],
    isLoading: patientsLoading,
    error: patientsError,
    refetch: refetchPatients,
    isFetching: patientsFetching,
  } = useHouseholdPatients(householdId);
  const { notification } = App.useApp();
  const deleteHousehold = useDeleteHouseholdById();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);

  // A merged-away household id loads the household it was merged into.
  const resolvedId = data?.household?.id;
  useEffect(() => {
    if (resolvedId && resolvedId !== householdId) {
      navigate(`/households/${resolvedId}`, { replace: true });
    }
  }, [resolvedId, householdId, navigate]);

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteFailure(null);
  };

  const handleDelete = async () => {
    setDeleteFailure(null);
    try {
      await deleteHousehold.mutateAsync(householdId);
    } catch (err) {
      setDeleteFailure(knownErrorMessage(err, t) || String(err instanceof Error ? err.message : err));
      return;
    }
    notification.success({ message: t('detail.delete.success'), placement: 'bottomRight', duration: 3 });
    navigate('/');
  };


  if (!id || isNaN(householdId)) {
    return (
      <Content className={styles.contentPadding}>
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
      <Content className={styles.contentCenter}>
        <Spin size="large" />
        <div className={styles.marginTop16}>{t('detail.loading')}</div>
      </Content>
    );
  }

  if (error) {
    return (
      <Content className={styles.contentPadding}>
        <Alert
          message={t('detail.errorLoading')}
          description={t('detail.failedToLoad')}
          type="error"
          showIcon
          action={
            <Space>
              <Button onClick={() => refetch()}>
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
      <Content className={styles.contentPadding}>
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
    <Content className={styles.contentPadding}>
      <div className={styles.marginBottom16}>
        <div className={styles.breadcrumbRow}>
          <Breadcrumb
            items={[
              {
                title: <Link to="/"><HomeOutlined /> {t('detail.breadcrumb.home')}</Link>,
              },
              {
                title: data.household.householdName || t('detail.unnamedTitle', { id: householdId }),
              },
            ]}
          />
        </div>
      </div>

      <div className={`${styles.marginBottom16} ${styles.breadcrumbRow}`}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          {t('detail.backToHouseholds')}
        </Button>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'merge', label: t('detail.actions.merge') },
              { key: 'delete', label: t('detail.actions.delete'), danger: true },
            ],
            onClick: ({ key }) => (key === 'merge' ? setMergeOpen(true) : setDeleteOpen(true)),
          }}
        >
          <Button>
            <Space>
              {t('detail.actions.more')}
              <DownOutlined />
            </Space>
          </Button>
        </Dropdown>
      </div>

      <MergeHouseholdModal open={mergeOpen} householdId={householdId} onClose={() => setMergeOpen(false)} />

      {patients.length > 0 ? (
        <Modal
          open={deleteOpen}
          title={t('detail.delete.blockedTitle')}
          onCancel={closeDelete}
          footer={[
            <Button key="cancel" onClick={closeDelete}>
              {t('common:cancel')}
            </Button>,
            <Button
              key="merge"
              type="primary"
              onClick={() => {
                closeDelete();
                setMergeOpen(true);
              }}
            >
              {t('detail.delete.mergeInstead')}
            </Button>,
          ]}
        >
          <Typography.Paragraph>{t('detail.delete.blockedText')}</Typography.Paragraph>
        </Modal>
      ) : (
        <Modal
          open={deleteOpen}
          title={t('detail.delete.title')}
          onCancel={closeDelete}
          onOk={handleDelete}
          okText={t('detail.delete.ok')}
          okButtonProps={{ danger: true }}
          cancelText={t('common:cancel')}
          confirmLoading={deleteHousehold.isPending}
        >
          <Typography.Paragraph>
            {t('detail.delete.confirmText', {
              name: data.household.householdName || t('detail.unnamedTitle', { id: householdId }),
            })}
          </Typography.Paragraph>
          {deleteFailure !== null && (
            <Alert type="error" showIcon message={t('detail.delete.failed')} description={deleteFailure} />
          )}
        </Modal>
      )}

      <div className={styles.mainContainer}>
        <HouseholdInfo household={data.household} />

        <PeopleSection
          people={data.people}
          householdId={householdId}
        />

        <AnimalsSection
          patients={patients}
          householdId={householdId}
          loading={patientsLoading}
          loadFailed={!!patientsError}
          retrying={patientsFetching}
          onRetry={() => refetchPatients()}
        />
      </div>
    </Content>
  );
};