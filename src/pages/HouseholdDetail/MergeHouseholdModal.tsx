import React, { useState } from 'react';
import { Alert, App, Card, Col, Form, List, Modal, Radio, Row, Space, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { HouseholdService, type MergeSide } from '../../services/householdService';
import { useMergeHouseholds } from '../../hooks/useHouseholdActions';
import { knownErrorMessage } from '@/utils/errors';
import { HouseholdPicker } from './HouseholdPicker';

const { Text, Paragraph } = Typography;

export interface MergeHouseholdModalProps {
  open: boolean;
  /** The household being kept: the one whose page the user is on. */
  householdId: number;
  onClose: () => void;
  onMerged?: () => void;
}

const SideCard: React.FC<{ side: MergeSide }> = ({ side }) => {
  const { t } = useTranslation('households');
  const h = side.household;
  return (
    <Card size="small" title={h.householdName || t('unnamedHousehold')}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {(h.address || h.city) && <Text type="secondary">{[h.address, h.city].filter(Boolean).join(', ')}</Text>}
        <div>
          <Text strong>{t('detail.merge.people')}</Text>
          <List
            size="small"
            dataSource={side.people}
            locale={{ emptyText: t('detail.merge.none') }}
            renderItem={(p) => (
              <List.Item>
                <Space direction="vertical" size={0}>
                  <Text>{`${p.firstName} ${p.lastName}`}</Text>
                  {p.contacts.map((c) => (
                    <Text key={c.id} type="secondary">{c.contactValue}</Text>
                  ))}
                </Space>
              </List.Item>
            )}
          />
        </div>
        <div>
          <Text strong>{t('detail.merge.pets')}</Text>
          <List
            size="small"
            dataSource={side.pets}
            locale={{ emptyText: t('detail.merge.none') }}
            renderItem={(pet) => <List.Item>{pet.name}</List.Item>}
          />
        </div>
        <Text>{`${t('detail.merge.records')}: ${side.recordCount}`}</Text>
        <Text>{`${t('detail.merge.appointments')}: ${side.appointmentCount}`}</Text>
      </Space>
    </Card>
  );
};

/**
 * Merges another household into this one: pick it, check both side by side,
 * choose whose name and address stay, confirm. One backend transaction.
 */
export const MergeHouseholdModal: React.FC<MergeHouseholdModalProps> = ({ open, householdId, onClose, onMerged }) => {
  const { t } = useTranslation('households');
  const { notification } = App.useApp();
  const merge = useMergeHouseholds();
  const [mergeId, setMergeId] = useState<number | undefined>();
  const [detailsFrom, setDetailsFrom] = useState<number>(householdId);
  const [failure, setFailure] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['household-merge-preview', householdId, mergeId],
    queryFn: () => HouseholdService.getMergePreview(householdId, mergeId!),
    enabled: open && !!mergeId,
    staleTime: 0,
    retry: false,
  });

  const close = () => {
    setMergeId(undefined);
    setDetailsFrom(householdId);
    setFailure(null);
    onClose();
  };

  const handleMerge = async () => {
    if (!mergeId) return;
    setFailure(null);
    try {
      await merge.mutateAsync({ keepId: householdId, mergeId, detailsFrom });
    } catch (error) {
      setFailure(knownErrorMessage(error, t) || String(error instanceof Error ? error.message : error));
      return;
    }
    notification.success({ message: t('detail.merge.success'), placement: 'bottomRight', duration: 3 });
    onMerged?.();
    close();
  };

  return (
    <Modal
      open={open}
      title={t('detail.merge.title')}
      onCancel={close}
      onOk={handleMerge}
      okText={t('detail.merge.confirm')}
      okButtonProps={{ disabled: !preview.data, danger: true }}
      confirmLoading={merge.isPending}
      width={860}
      destroyOnHidden
    >
      <Paragraph type="secondary">{t('detail.merge.explain')}</Paragraph>
      <Form layout="vertical">
        <Form.Item label={t('detail.merge.pickLabel')}>
          <HouseholdPicker
            excludeId={householdId}
            autoFocus
            onChange={(h) => {
              setMergeId(h?.id);
              setDetailsFrom(householdId);
              setFailure(null);
            }}
          />
        </Form.Item>
      </Form>

      {preview.isFetching && <Spin />}
      {preview.isError && <Alert type="error" showIcon message={t('detail.merge.previewFailed')} />}
      {preview.data && mergeId && (
        <>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <SideCard side={preview.data.keep} />
            </Col>
            <Col xs={24} md={12}>
              <SideCard side={preview.data.merge} />
            </Col>
          </Row>
          <Paragraph type="secondary" style={{ marginTop: 12 }}>{t('detail.merge.sharedContacts')}</Paragraph>
          <Space direction="vertical">
            <Text strong>{t('detail.merge.keepDetails')}</Text>
            <Radio.Group value={detailsFrom} onChange={(e) => setDetailsFrom(e.target.value)}>
              <Radio value={householdId}>{t('detail.merge.thisHousehold')}</Radio>
              <Radio value={mergeId}>{t('detail.merge.otherHousehold')}</Radio>
            </Radio.Group>
          </Space>
        </>
      )}
      {failure !== null && (
        <Alert type="error" showIcon style={{ marginTop: 16 }} message={t('detail.merge.failed')} description={failure} />
      )}
    </Modal>
  );
};
