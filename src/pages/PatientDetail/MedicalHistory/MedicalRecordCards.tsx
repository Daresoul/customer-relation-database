import React, { useState } from 'react';
import { Card, Typography, Tag, Button, Space, Dropdown, Modal, message, Row, Col, Descriptions } from 'antd';
import {
  DeleteOutlined,
  MoreOutlined,
  CalendarOutlined,
  DollarOutlined,
  FileTextOutlined,
  MedicineBoxOutlined,
  PaperClipOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MedicalRecord } from '@/types/medical';
import { useArchiveMedicalRecord, useDownloadAttachment, useCurrencies } from '@/hooks/useMedicalRecords';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '@/utils/dateFormatter';
import MedicalRecordDetailDrawer from '@/components/MedicalRecordDetail/MedicalRecordDetailDrawer';

const { Text, Title, Paragraph } = Typography;

interface MedicalRecordCardsProps {
  records: MedicalRecord[];
  onRefresh: () => void;
  patientId: number;
  onNavigateToRecord?: (recordId: number) => void;
}

const MedicalRecordCards: React.FC<MedicalRecordCardsProps> = ({
  records,
  onRefresh,
  onNavigateToRecord,
}) => {
  const { t } = useTranslation('medical');
  const [archiveModalVisible, setArchiveModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const archiveMutation = useArchiveMedicalRecord();
  const downloadMutation = useDownloadAttachment();
  const [detailId, setDetailId] = useState<number | null>(null);
  const navigate = useNavigate();
  const { data: currencies } = useCurrencies();

  const handleArchiveClick = (record: MedicalRecord) => {
    setSelectedRecord(record);
    setArchiveModalVisible(true);
  };

  const handleArchiveConfirm = async () => {
    if (!selectedRecord) return;

    try {
      await archiveMutation.mutateAsync({
        recordId: selectedRecord.id,
        archive: !selectedRecord.isArchived,
      });
      setArchiveModalVisible(false);
      setSelectedRecord(null);
      onRefresh();
    } catch (error) {
      message.error(selectedRecord.isArchived ? t('messages.restoreFailed') : t('messages.archiveFailed'));
    }
  };

  const handleDownloadAttachment = async (attachmentId: number, fileName: string) => {
    try {
      await downloadMutation.mutateAsync({
        attachmentId,
        fileName,
      });
    } catch (error) {
      message.error(t('messages.downloadFailed'));
    }
  };

  const getCurrencySymbol = (currencyId?: number) => {
    if (!currencyId || !currencies) return '';
    const currency = currencies.find(c => c.id === currencyId);
    return currency?.symbol || currency?.code || '';
  };

  const renderRecordCard = (record: MedicalRecord) => {
    const isProcedure = record.recordType === 'procedure';

    const menuItems = [
      {
        key: 'archive',
        label: record.isArchived ? t('actions.restore') : t('actions.archive'),
        icon: <DeleteOutlined />,
        onClick: () => handleArchiveClick(record),
      },
    ];

    return (
      <Card
        key={record.id}
        className="medical-record-card"
        style={{ marginBottom: 16 }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              {isProcedure ? (
                <MedicineBoxOutlined style={{ fontSize: 18, color: '#1890ff' }} />
              ) : (
                <FileTextOutlined style={{ fontSize: 18, color: '#52c41a' }} />
              )}
              <Title level={5} style={{ margin: 0 }}>
                <Link
                  to={`/medical-records/${record.id}`}
                  style={{ color: 'inherit' }}
                  onClick={(e) => {
                    if (onNavigateToRecord) {
                      e.preventDefault();
                      onNavigateToRecord(record.id);
                    }
                  }}
                >
                  {record.name}
                </Link>
              </Title>
            </Space>
            <Space>
              <Tag color={isProcedure ? 'blue' : 'green'}>
                {isProcedure ? t('recordTypes.procedure') : t('recordTypes.note')}
              </Tag>
              {record.isArchived && <Tag color="orange">{t('status.archived')}</Tag>}
              <Dropdown
                menu={{ items: menuItems }}
                trigger={['click']}
              >
                <Button type="text" icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          </div>
        }
        extra={
          <Text type="secondary">
            <CalendarOutlined /> {formatDate(record.createdAt)}
          </Text>
        }
      >
        <Descriptions column={1} size="small">
          {isProcedure && (
            <>
              <Descriptions.Item label={t('fields.procedureName')}>
                <Link
                  to={`/medical-records/${record.id}`}
                  style={{ color: 'inherit' }}
                  onClick={(e) => {
                    if (onNavigateToRecord) {
                      e.preventDefault();
                      onNavigateToRecord(record.id);
                    }
                  }}
                >
                  {record.name}
                </Link>
              </Descriptions.Item>
              {record.price && (
                <Descriptions.Item label={
                  <Space>
                    <DollarOutlined />
                    <span>{t('fields.price')}</span>
                  </Space>
                }>
                  <Text strong>
                    {getCurrencySymbol(record.currencyId)} {record.price.toFixed(2)}
                  </Text>
                </Descriptions.Item>
              )}
            </>
          )}

          <Descriptions.Item label={t('fields.description')}>
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }} ellipsis={{ rows: 4, expandable: true }}>
              {record.description}
            </Paragraph>
          </Descriptions.Item>

          <Descriptions.Item label={t('fields.createdAt')}>
            <Text type="secondary">{new Date(record.createdAt).toLocaleString()}</Text>
            {record.createdBy && (
              <Text type="secondary"> by {record.createdBy}</Text>
            )}
          </Descriptions.Item>

          {record.attachments && record.attachments.length > 0 && (
            <Descriptions.Item label={
              <Space>
                <PaperClipOutlined />
                <span>{t('fields.attachments')}</span>
              </Space>
            }>
              <Space wrap>
                {record.attachments.map(attachment => {
                  const isPdf = attachment.mimeType?.toLowerCase() === 'application/pdf' ||
                                attachment.originalName?.toLowerCase().endsWith('.pdf');

                  return (
                    <Button
                      key={attachment.id}
                      type="link"
                      size="small"
                      icon={isPdf ? <FileTextOutlined /> : <DownloadOutlined />}
                      onClick={() => {
                        if (isPdf) {
                          // Navigate to detail page with attachment ID to auto-expand
                          if (onNavigateToRecord) {
                            onNavigateToRecord(record.id);
                            // Add a small delay to ensure navigation happens before query params are set
                            setTimeout(() => {
                              navigate(`/medical-records/${record.id}?attachmentId=${attachment.id}`);
                            }, 50);
                          } else {
                            navigate(`/medical-records/${record.id}?attachmentId=${attachment.id}`);
                          }
                        } else {
                          handleDownloadAttachment(attachment.id, attachment.originalName);
                        }
                      }}
                      style={{ padding: '4px 8px' }}
                    >
                      {attachment.originalName}
                      {attachment.fileSize && (
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          ({(attachment.fileSize / 1024).toFixed(1)} KB)
                        </Text>
                      )}
                    </Button>
                  );
                })}
              </Space>
            </Descriptions.Item>
          )}

          <Descriptions.Item label={t('fields.updatedAt')}>
            <Text type="secondary">{new Date(record.updatedAt).toLocaleString()}</Text>
            {record.updatedBy && (
              <Text type="secondary"> by {record.updatedBy}</Text>
            )}
          </Descriptions.Item>

          {record.version > 1 && (
            <Descriptions.Item label={t('fields.version')}>
              <Text type="secondary">{t('versionLabel', { version: record.version })}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    );
  };

  return (
    <>
      <div style={{ width: '100%' }}>
        {records.map(renderRecordCard)}
      </div>

      <Modal
        title={selectedRecord?.isArchived ? t('modal.restoreTitle') : t('modal.archiveTitle')}
        open={archiveModalVisible}
        onOk={handleArchiveConfirm}
        onCancel={() => {
          setArchiveModalVisible(false);
          setSelectedRecord(null);
        }}
        okText={selectedRecord?.isArchived ? t('actions.restore') : t('actions.archive')}
        okType={selectedRecord?.isArchived ? 'primary' : 'danger'}
      >
        <p>
          {selectedRecord?.isArchived ? t('messages.confirmRestore') : t('messages.confirmArchive')}
        </p>
        <p>
          <strong>{selectedRecord?.name}</strong>
        </p>
        {!selectedRecord?.isArchived && (
          <p>{t('messages.archiveInfo')}</p>
        )}
      </Modal>

      {detailId && (
        <MedicalRecordDetailDrawer
          recordId={detailId}
          open={!!detailId}
          onClose={() => setDetailId(null)}
          onChanged={onRefresh}
        />
      )}
    </>
  );
};

export default MedicalRecordCards;
