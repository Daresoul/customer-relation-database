import React from 'react';
import { Breadcrumb, Card, Layout, Typography } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LabInboxList from '@/components/LabInbox/LabInboxList';

/** The lab inbox as its own page (`/lab-inbox`), for the header badge and nav. */
const LabInboxPage: React.FC = () => {
  const { t } = useTranslation(['devices', 'navigation']);
  return (
    <Layout.Content style={{ padding: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/"><HomeOutlined /> {t('navigation:home')}</Link> },
          { title: t('devices:inbox.title') },
        ]}
      />
      <Card title={<Typography.Title level={4} style={{ margin: 0 }}>{t('devices:inbox.title')}</Typography.Title>}>
        <Typography.Paragraph type="secondary">{t('devices:inbox.description')}</Typography.Paragraph>
        <LabInboxList />
      </Card>
    </Layout.Content>
  );
};

export default LabInboxPage;
