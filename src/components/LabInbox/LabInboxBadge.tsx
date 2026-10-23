import React from 'react';
import { Badge, Button } from 'antd';
import { ExperimentOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLabInboxCount } from '@/hooks/useLabInbox';

/**
 * "N lab results waiting": opens the lab inbox. Hidden when nothing waits;
 * when the count can't be read it says so instead of showing zero.
 */
const LabInboxBadge: React.FC = () => {
  const { t } = useTranslation('devices');
  const navigate = useNavigate();
  const { data: count, isError } = useLabInboxCount();
  const open = () => navigate('/lab-inbox');

  if (isError) {
    return (
      <Button size="small" icon={<WarningOutlined />} onClick={open}>
        {t('devices:inbox.badgeUnknown')}
      </Button>
    );
  }
  if (!count) return null;
  return (
    <Badge count={count} size="small">
      <Button size="small" icon={<ExperimentOutlined />} onClick={open}>
        {t('devices:inbox.badge', { count })}
      </Button>
    </Badge>
  );
};

export default LabInboxBadge;
